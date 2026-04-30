import { sanitizeAIPayload } from "./utils";
import { sendDiscordReminder } from "./discord";

export async function viewShoppingListExec(agent: any) {
  const list = agent.ctx.storage.sql.exec(`SELECT item FROM shopping_list`).toArray();
  if (list.length === 0) return "The shopping list is empty.";
  return "Current Shopping List: " + list.map((l: any) => l.item).join(", ");
}

export async function updateShoppingListExec(agent: any, rawInput: any) {
  const { action, items } = sanitizeAIPayload(rawInput);
  
  if (action === "clear") {
    agent.ctx.storage.sql.exec(`DELETE FROM shopping_list`);
    return "Shopping list completely cleared.";
  }

  if (!items || items.trim() === "") return "No items provided.";
  
  // Split the comma-separated string back into an array
  const itemsArray = items.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

  if (action === "add") {
    let count = 0;
    for (const item of itemsArray) {
      // ON CONFLICT DO NOTHING ensures we don't get duplicates if you add "Eggs" twice
      agent.ctx.storage.sql.exec(`INSERT INTO shopping_list (item) VALUES (?) ON CONFLICT(item) DO NOTHING`, item);
      count++;
    }
    return `Successfully added ${count} items to the shopping list.`;
  }

  if (action === "remove") {
    let count = 0;
    for (const item of itemsArray) {
      agent.ctx.storage.sql.exec(`DELETE FROM shopping_list WHERE item = ? COLLATE NOCASE`, item);
      count++;
    }
    return `Successfully removed the specified items from the shopping list.`;
  }

  return "Invalid action.";
}

export async function sendShoppingListExec(agent: any) {
  const list = agent.ctx.storage.sql.exec(`SELECT item FROM shopping_list`).toArray();
  if (list.length === 0) return "Cannot send: Shopping list is empty.";
  
  try {
    // 1. Send directly to Discord
    await sendDiscordReminder(agent.env.DISCORD_WEBHOOK_URL, {
      summary: "🛒 Your Shopping List",
      discord_message: "Here are the items currently on your list:",
      shopping_list: list.map((l: any) => l.item)
    });
    
    // 2. THE NEW AUTO-STOCK FEATURE
    // Loop through the shopping list and add everything to the inventory
    for (const row of list) {
      // We assume a default of 1 'unit' in the 'pantry'. 
      // If it already exists, we just add 1 to the current quantity.
      agent.ctx.storage.sql.exec(
        `INSERT INTO inventory (item, quantity, unit, category) VALUES (?, 1, 'unit', 'pantry')
         ON CONFLICT(item) DO UPDATE SET quantity = inventory.quantity + 1`,
        row.item
      );
    }
    
    // 3. Wipe the active list
    agent.ctx.storage.sql.exec(`DELETE FROM shopping_list`);
    
    return "Successfully sent the shopping list to Discord, automatically added the items to the inventory, and cleared the list.";
  } catch (error) {
    return "Error sending to Discord.";
  }
}

/* This is a smart function that will trigger two different ways
if the user asks for recomendations, it'll see whats in the inventory
if the inventory is full it'll return the top 3 recipes to make.
If the inventory is near empty, it'll pick some more recipes
to make and then output the names of those recipes.
It'll then ask the user if they want to add those ingredients
to their shopping list so that they can buy them later. */
export async function suggestMealsByInventoryExec(agent: any) {
  // 1. Get current inventory
  const inventoryDb = agent.ctx.storage.sql.exec(`SELECT item FROM inventory`).toArray();
  const invItems = inventoryDb.map((i: any) => i.item.toLowerCase());

  // 2. Get recipes (now including the rating!)
  const recipes = agent.ctx.storage.sql.exec(`SELECT name, rating, ingredients_json FROM recipes`).toArray();
  if (recipes.length === 0) return "Recipe bank is empty. Please save some recipes first.";

  let scoredRecipes = [];

  // 3. Score every recipe based on what you have
  for (const r of recipes) {
    const ingredients = JSON.parse(r.ingredients_json);
    let haveCount = 0;
    let missing: string[] = [];

    for (const ing of ingredients) {
      const ingLower = ing.toLowerCase();
      const hasIngredient = invItems.some((invItem: string) => ingLower.includes(invItem));
      
      if (hasIngredient) {
        haveCount++;
      } else {
        missing.push(ing);
      }
    }

    const matchScore = ingredients.length > 0 ? (haveCount / ingredients.length) : 0;
    scoredRecipes.push({ name: r.name, rating: r.rating, matchScore, missing });
  }

  // 4. Sort by match score (what you can cook now), THEN by rating (what you love)
  scoredRecipes.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.rating - a.rating;
  });

  // 5. Split into buckets: "Ready to Cook" vs "Highly Rated for Later"
  // Let's say you need at least 50% of the ingredients, or are only missing 1-2 things to be "ready"
  const readyOrClose = scoredRecipes.filter(r => r.matchScore >= 0.5 || r.missing.length <= 2);
  const topReady = readyOrClose.slice(0, 2); 
  
  const readyNames = topReady.map(r => r.name);
  
  // Grab 3 highly-rated recipes that aren't already in the "ready" list
  const futureSuggestions = scoredRecipes
    .filter(r => !readyNames.includes(r.name))
    .sort((a, b) => b.rating - a.rating) // Sort strictly by your favorite meals
    .slice(0, 3);

  // 6. Build the formatted output
  let output = "";

  if (topReady.length > 0) {
    output += "### 🍳 What you can make right now (or very soon):\n";
    for (const match of topReady) {
      if (match.missing.length === 0) {
        output += `- **${match.name}** (${match.rating}/5 ⭐): You have 100% of the ingredients ready!\n`;
      } else {
        output += `- **${match.name}** (${match.rating}/5 ⭐): You are only missing: ${match.missing.join(', ')}\n`;
      }
    }
    output += "\n";
  } else {
    output += "Your inventory is running quite low, so there aren't any full meals you can make immediately.\n\n";
  }

  if (futureSuggestions.length > 0) {
    output += "### 💡 Highly-rated favorites to plan for:\n";
    for (const match of futureSuggestions) {
      // We slice the missing array so we don't overwhelm the UI if a recipe has 15 ingredients
      const missingPreview = match.missing.slice(0, 3).join(', ');
      const plusMore = match.missing.length > 3 ? `, plus ${match.missing.length - 3} more` : '';
      output += `- **${match.name}** (${match.rating}/5 ⭐): Missing ${match.missing.length} items (${missingPreview}${plusMore})\n`;
    }
  }

  // 7. Give the AI its script
  output += "\n**System Instruction for AI:** Present this information to the user. Ask if they want to proceed with a 'ready' meal, or if they would like you to automatically add the missing ingredients for one of the 'future' meals to their shopping list.";

  return output;
}