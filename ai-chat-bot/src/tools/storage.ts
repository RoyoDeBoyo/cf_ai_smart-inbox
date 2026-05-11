
//#region Saving

export async function saveDataExec(agent: any, input: any) {
  const { type, name } = input;

  // ==========================================
  // ROUTE 1: SAVE A LOCATION
  // ==========================================
  if (type === "location") {
    const { address } = input;
    if (!address) return "Error: You must provide an address to save a location.";

    // Upsert (Insert or Update if it already exists)
    try {
      agent.ctx.storage.sql.exec(
        `INSERT INTO saved_locations (name, address) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET address = excluded.address`,
        name.toLowerCase().trim(), // Lowercase helps the AI find 'home' or 'Home' easily
        address.trim()
      );
      return `Successfully saved location: '${name}' as '${address}'.`;
    } catch (e) {
      return `Database error saving location: ${e}`;
    }
  }

  // ==========================================
  // ROUTE 2: SAVE A RECIPE
  // ==========================================
  if (type === "recipe") {
    const recipe = input;
    const timestamp = new Date().toISOString();
    
    // Safety check in case the LLM forgot ingredients
    const ingredientsArray = recipe.ingredients ? recipe.ingredients.split(',').map((i: string) => i.trim()) : [];

    const existing = agent.ctx.storage.sql.exec(
      `SELECT id FROM recipes WHERE name = ? COLLATE NOCASE`, recipe.name
    ).toArray();

    if (existing.length > 0) {
      agent.ctx.storage.sql.exec(
        `UPDATE recipes SET rating=?, difficulty=?, prep_time=?, calories=?, protein=?, ingredients_json=?, instructions=?, last_updated=?, meal_type=? WHERE id=?`,
        recipe.rating, recipe.difficulty, recipe.prep_time, recipe.calories, recipe.protein, JSON.stringify(ingredientsArray), recipe.instructions, timestamp, recipe.meal_type, existing[0].id
      );
      return `Updated existing recipe '${recipe.name}'.`;
    } else {
      agent.ctx.storage.sql.exec(
        `INSERT INTO recipes (id, name, difficulty, prep_time, rating, calories, protein, ingredients_json, instructions, last_updated, meal_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(), recipe.name, recipe.difficulty, recipe.prep_time, recipe.rating, recipe.calories, recipe.protein, JSON.stringify(ingredientsArray), recipe.instructions, timestamp, recipe.meal_type
      );
      return `Saved new recipe '${recipe.name}'.`;
    }
  }

  return `Error: Unknown save type '${type}'.`;
}

//#region updating

export async function updateDataExec(agent: any, input: any) {
  const { type, name } = input;

  // ==========================================
  // ROUTE 1: UPDATE A LOCATION
  // ==========================================
  if (type === "location") {
    const { address } = input;
    
    if (!address) return "Error: You must provide a new address to update the location.";

    // Check if location exists
    const existing = agent.ctx.storage.sql.exec(
      `SELECT * FROM saved_locations WHERE name = ? COLLATE NOCASE`, 
      name.trim().toLowerCase()
    ).toArray();

    if (existing.length === 0) return `Location '${name}' not found in your saved addresses.`;

    try {
      agent.ctx.storage.sql.exec(
        `UPDATE saved_locations SET address = ? WHERE name = ? COLLATE NOCASE`,
        address.trim(), name.trim().toLowerCase()
      );
      return `Successfully updated the address for '${name}' to: ${address}`;
    } catch (error) {
      return `Failed to update location: ${error}`;
    }
  }

  // ==========================================
  // ROUTE 2: UPDATE A RECIPE
  // ==========================================
  if (type === "recipe") {
    const { rating, difficulty, prep_time, calories, protein, meal_type, ingredients, instructions } = input;
    
    // Check if the recipe exists
    const existing = agent.ctx.storage.sql.exec(
      `SELECT * FROM recipes WHERE name = ? COLLATE NOCASE`, 
      name.trim()
    ).toArray();

    if (existing.length === 0) return `Recipe '${name}' not found in the database.`;

    // Dynamically build the SQL update query based on what was provided
    const updates = [];
    const params = [];

    if (rating !== undefined) { updates.push("rating = ?"); params.push(rating); }
    if (difficulty !== undefined) { updates.push("difficulty = ?"); params.push(difficulty); }
    if (prep_time !== undefined) { updates.push("prep_time = ?"); params.push(prep_time); }
    if (calories !== undefined) { updates.push("calories = ?"); params.push(calories); }
    if (protein !== undefined) { updates.push("protein = ?"); params.push(protein); }
    if (meal_type !== undefined) { updates.push("meal_type = ?"); params.push(meal_type.toLowerCase()); }
    if (ingredients !== undefined) { 
      updates.push("ingredients_json = ?"); 
      params.push(JSON.stringify(ingredients.split(',').map((s: string) => s.trim()))); 
    }
    if (instructions !== undefined) { updates.push("instructions = ?"); params.push(instructions); }

    if (updates.length === 0) return "No fields were provided to update for this recipe.";

    // Execute the dynamic query
    params.push(name.trim()); // The WHERE clause parameter
    const query = `UPDATE recipes SET ${updates.join(", ")} WHERE name = ? COLLATE NOCASE`;
    
    try {
      agent.ctx.storage.sql.exec(query, ...params);
      return `Successfully updated the following fields for recipe '${name}': ${updates.map(u => u.split(' =')[0]).join(', ')}.`;
    } catch (error) {
      return `Failed to update recipe: ${error}`;
    }
  }


    // ==========================================
    // ROUTE 3: UPDATE SHOPPING LIST
    // ==========================================
    if (type === "shopping_list") {
        const { action, items } = input;
        
        if (action === "clear") {
        agent.ctx.storage.sql.exec(`DELETE FROM shopping_list`);
        return "Shopping list completely cleared.";
        }

        if (!items || items.trim() === "") return "No items provided to update.";
        
        const itemsArray = items.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

        if (action === "add") {
        let count = 0;
        for (const item of itemsArray) {
            agent.ctx.storage.sql.exec(`INSERT INTO shopping_list (item) VALUES (?) ON CONFLICT(item) DO NOTHING`, item);
            count++;
        }
        return `Successfully added ${count} items to the shopping list.`;
        }

        if (action === "remove") {
        for (const item of itemsArray) {
            agent.ctx.storage.sql.exec(`DELETE FROM shopping_list WHERE item = ? COLLATE NOCASE`, item);
        }
        return `Successfully removed the specified items from the shopping list.`;
        }

        return "Invalid shopping list action.";
    }



    // ========================================
    // ROUTE 4: UPDATE INVENTORY
    // ========================================
    if (type === "inventory") {
        const { inventory_data } = input;
        if (!inventory_data || inventory_data.trim() === "") return "No inventory data provided";

        const itemsToUpdate = inventory_data.split(";").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        let updatedCount = 0;

        for (const itemStr of itemsToUpdate) {
            const parts = itemStr.split("|").map((p: string) => p.trim());

            if (parts.length === 4) {
                const [item, qtyStr, unit, category] = parts;
                const quantity = parseFloat(qtyStr);

                if (quantity <= 0) {
                    agent.ct.storage.sql.exec(`DELETE FROM inventory WHERE item = ? COLLATE NOCASE`, item);
                } else {
                    agent.ctx.storage.sql.exec(
                        `INSERT INTO inventory (item, quantity, unit, category) VALUES (?, ?, ?, ?)
                        ON CONFLICT(item) DO UPDATE SET quantity=excluded.quantity, unit=excluded.unit, category=excluded.category`,
                        item, quantity, unit, category
                    );
                }
                updatedCount++;
            }
        }
        return `Successfully updated ${updatedCount} inventory items.`;
    }
  

  return `Error: Unknown update type '${type}'.`;
}

// #region searching

export async function getDataExec(agent: any, input: any) {
  const { type, name } = input;

  // ==========================================
  // ROUTE 1: VIEW SHOPPING LIST
  // ==========================================
  if (type === "shopping_list") {
    const list = agent.ctx.storage.sql.exec(`SELECT item FROM shopping_list`).toArray();
    if (list.length === 0) return "The shopping list is empty.";
    return "Current Shopping List: " + list.map((l: any) => l.item).join(", ");
  }

  // ==========================================
  // ROUTE 2: LIST REMINDERS
  // ==========================================
  if (type === "reminders") {
    try {
      const tasks = agent.getSchedules();
      if (tasks.length === 0) return "No active reminders.";
      return JSON.stringify(tasks, null, 2);
    } catch (error) {
      return `Error retrieving reminders: ${error}`;
    }
  }

  // ==========================================
  // ROUTE 3: CHECK INVENTORY
  // ==========================================
  if (type === "inventory") {
    const items = agent.ctx.storage.sql.exec(`SELECT * FROM inventory`).toArray();
    if (items.length === 0) return "The inventory is completely empty.";
    return JSON.stringify(items);
  }

  // ==========================================
  // ROUTE 4: GET RECIPE BANK (all recipes)
  // ==========================================
  if (type === "recipe_bank") {
    const recipes = agent.ctx.storage.sql.exec(`SELECT * FROM recipes`).toArray();
    if (recipes.length === 0) return "The recipe bank is empty.";
    return JSON.stringify(recipes);
  }

  // ==========================================
  // ROUTE 5: GET RECIPE NAMES ONLY
  // ==========================================
  if (type === "recipe_names") {
    const recipes = agent.ctx.storage.sql.exec(`SELECT name FROM recipes`).toArray();
    if (recipes.length === 0) return "No recipes saved yet.";
    //@ts-ignore
    return "Saved Recipes: " + recipes.map(r => r.name).join(", ");
  }

  // ==========================================
  // ROUTE 6: GET SPECIFIC RECIPE INFO
  // ==========================================
  if (type === "recipe_info") {
    if (!name) return "Error: Recipe name required for recipe_info type.";
    
    const recipe = agent.ctx.storage.sql.exec(
      `SELECT * FROM recipes WHERE name = ? COLLATE NOCASE`,
      name.trim()
    ).toArray();

    if (recipe.length === 0) return `Recipe '${name}' not found.`;

    const data = recipe[0];
    const ingredients = JSON.parse(data.ingredients_json).join(", ");

    return `Details for ${data.name}:
  - Rating: ${data.rating}/5
  - Meal type: ${data.meal_type}
  - Difficulty: ${data.difficulty}
  - Prep Time: ${data.prep_time} mins
  - Calories: ${data.calories} | Protein: ${data.protein}g
  - Ingredients: ${ingredients}
  - Instructions: ${data.instructions}`;
  }

  // ==========================================
  // ROUTE 7: GET COMPLETE RECIPE LIST (formatted)
  // ==========================================
  if (type === "recipe_complete_list") {
    const recipes = agent.ctx.storage.sql.exec(`SELECT * FROM recipes ORDER BY rating DESC`).toArray();
    if (recipes.length === 0) return "Your recipe bank is empty.";

    let output = "### 📖 Your Complete Recipe Bank\n\n";
    for (const r of recipes) {
      const ingredients = JSON.parse(r.ingredients_json).join(", ");
      output += `**${r.name}** (${r.rating}/5 stars)\n`;
      output += `- 🍽️ Meal type: ${r.meal_type}\n`;
      output += `- ⏱️ ${r.prep_time} mins | 💪 ${r.protein}g protein\n`;
      output += `- 🛒 Ingredients: ${ingredients}\n`;
      output += `- 📝 Instructions: ${r.instructions}\n\n---\n\n`;
    }

    return output;
  }

  // ==========================================
  // ROUTE 8: SUGGEST MEALS BASED ON INVENTORY
  // ==========================================
  if (type === "meal_suggestions") {
    const inventoryDb = agent.ctx.storage.sql.exec(`SELECT item FROM inventory`).toArray();
    const invItems = inventoryDb.map((i: any) => i.item.toLowerCase());

    const recipes = agent.ctx.storage.sql.exec(`SELECT name, rating, ingredients_json FROM recipes`).toArray();
    if (recipes.length === 0) return "Recipe bank is empty. Please save some recipes first.";

    let scoredRecipes = [];

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

    scoredRecipes.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return b.rating - a.rating;
    });

    const readyOrClose = scoredRecipes.filter(r => r.matchScore >= 0.5 || r.missing.length <= 2);
    const topReady = readyOrClose.slice(0, 2);

    const readyNames = topReady.map(r => r.name);

    const futureSuggestions = scoredRecipes
      .filter(r => !readyNames.includes(r.name))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);

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
        const missingPreview = match.missing.slice(0, 3).join(', ');
        const plusMore = match.missing.length > 3 ? `, plus ${match.missing.length - 3} more` : '';
        output += `- **${match.name}** (${match.rating}/5 ⭐): Missing ${match.missing.length} items (${missingPreview}${plusMore})\n`;
      }
    }

    output += "\n**System Instruction for AI:** Present this information to the user. Ask if they want to proceed with a 'ready' meal, or if they would like you to automatically add the missing ingredients for one of the 'future' meals to their shopping list.";

    return output;
  }

  return `Error: Unknown data type '${type}'.`;
}

// #region deleting

export async function deleteDataExec(agent: any, input: any) {
  const { type, id } = input;

  // ==========================================
  // ROUTE 1: CANCEL/DELETE A REMINDER
  // ==========================================
  if (type === "reminder") {
    if (!id) return "Error: Reminder ID required to delete a reminder.";

    try {
      agent.cancelSchedule(id);
      return `Successfully cancelled the reminder with ID: ${id}.`;
    } catch (error) {
      return `Error: Could not cancel reminder ${id}.`;
    }
  }

  // ==========================================
  // ROUTE 2: DELETE A RECIPE
  // ==========================================
  if (type === "recipe") {
    if (!id) return "Error: Recipe name required to delete a recipe.";

    try {
      const existing = agent.ctx.storage.sql.exec(
        `SELECT id FROM recipes WHERE name = ? COLLATE NOCASE`,
        id.trim()
      ).toArray();

      if (existing.length === 0) return `Recipe '${id}' not found in the database.`;

      agent.ctx.storage.sql.exec(
        `DELETE FROM recipes WHERE name = ? COLLATE NOCASE`,
        id.trim()
      );
      return `Successfully deleted recipe '${id}'.`;
    } catch (error) {
      return `Failed to delete recipe: ${error}`;
    }
  }

  // ==========================================
  // ROUTE 3: DELETE A SAVED LOCATION
  // ==========================================
  if (type === "location") {
    if (!id) return "Error: Location name required to delete a location.";

    try {
      const existing = agent.ctx.storage.sql.exec(
        `SELECT * FROM saved_locations WHERE name = ? COLLATE NOCASE`,
        id.trim().toLowerCase()
      ).toArray();

      if (existing.length === 0) return `Location '${id}' not found in your saved addresses.`;

      agent.ctx.storage.sql.exec(
        `DELETE FROM saved_locations WHERE name = ? COLLATE NOCASE`,
        id.trim().toLowerCase()
      );
      return `Successfully deleted the saved location '${id}'.`;
    } catch (error) {
      return `Failed to delete location: ${error}`;
    }
  }

  // ==========================================
  // ROUTE 4: DELETE AN INVENTORY ITEM
  // ==========================================
  if (type === "inventory") {
    if (!id) return "Error: Item name required to delete from inventory.";

    try {
      const existing = agent.ctx.storage.sql.exec(
        `SELECT * FROM inventory WHERE item = ? COLLATE NOCASE`,
        id.trim()
      ).toArray();

      if (existing.length === 0) return `Item '${id}' not found in inventory.`;

      agent.ctx.storage.sql.exec(
        `DELETE FROM inventory WHERE item = ? COLLATE NOCASE`,
        id.trim()
      );
      return `Successfully removed '${id}' from inventory.`;
    } catch (error) {
      return `Failed to delete inventory item: ${error}`;
    }
  }

  return `Error: Unknown delete type '${type}'.`;
}