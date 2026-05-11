import { sanitizeAIPayload } from "./utils";

export async function getRecipeBankExec(agent: any) {
  const recipes = agent.ctx.storage.sql.exec(`SELECT * FROM recipes`).toArray();
  if (recipes.length === 0) return "The recipe bank is empty.";
  return JSON.stringify(recipes);
}

// Only gets the names of the recipes
export async function getRecipeNamesExec(agent: any) {
  const recipes = agent.ctx.storage.sql.exec(`SELECT name FROM recipes`).toArray();
  if (recipes.length === 0) return "No recipes saved yet.";
  //@ts-ignore
  return "Saved Recipes: " + recipes.map(r => r.name).join(", ");
}

// gets the details for a specific recipe
export async function getRecipeInfoExec(agent: any, name: string) {
  const recipe = agent.ctx.storage.sql.exec(
    `SELECT * FROM recipes WHERE name = ? COLLATE NOCASE`, 
    name.trim()
  ).toArray();

  if (recipe.length === 0) return `Recipe '${name}' not found.`;
  
  // Format the ingredients back into a list for the AI
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

// Pre-formatted list of all items in the recipe db so the llm doesn't have to do anything to it
export async function getCompleteRecipeListExec(agent: any) {
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

  // Just return the raw data for the UI to render
  return output;
}

// updates an already existing entry, keeping the db only as large as it has to be
export async function updateRecipeExec(agent: any, input: any) {
  const { name, rating, difficulty, prep_time, calories, protein, meal_type, ingredients, instructions } = input;
  
  // 1. Check if the recipe exists
  const existing = agent.ctx.storage.sql.exec(
    `SELECT * FROM recipes WHERE name = ? COLLATE NOCASE`, 
    name.trim()
  ).toArray();

  if (existing.length === 0) return `Recipe '${name}' not found in the database.`;

  // 2. Dynamically build the SQL update query based on what was provided
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

  if (updates.length === 0) return "No fields were provided to update.";

  // 3. Execute the dynamic query
  params.push(name.trim()); // The WHERE clause parameter
  const query = `UPDATE recipes SET ${updates.join(", ")} WHERE name = ? COLLATE NOCASE`;
  
  try {
    agent.ctx.storage.sql.exec(query, ...params);
    return `Successfully updated the following fields for ${name}: ${updates.map(u => u.split(' =')[0]).join(', ')}.`;
  } catch (error) {
    return `Failed to update recipe: ${error}`;
  }
}