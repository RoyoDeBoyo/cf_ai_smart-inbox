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
    output += `- ⏱️ ${r.prep_time} mins | 💪 ${r.protein}g protein\n`;
    output += `- 🛒 Ingredients: ${ingredients}\n`;
    output += `- 📝 Instructions: ${r.instructions}\n\n---\n\n`;
  }

  // Just return the raw data for the UI to render
  return output;
}

export async function saveRecipeExec(agent: any, rawInput: any) {
  const recipe = sanitizeAIPayload(rawInput);
  const timestamp = new Date().toISOString();
  const ingredientsArray = recipe.ingredients.split(',').map((i: string) => i.trim());
  
  const existing = agent.ctx.storage.sql.exec(
    `SELECT id FROM recipes WHERE name = ? COLLATE NOCASE`, recipe.name
  ).toArray();

  if (existing.length > 0) {
    agent.ctx.storage.sql.exec(
      `UPDATE recipes SET rating=?, difficulty=?, prep_time=?, calories=?, protein=?, ingredients_json=?, instructions=?, last_updated=? WHERE id=?`,
      recipe.rating, recipe.difficulty, recipe.prep_time, recipe.calories, recipe.protein, JSON.stringify(ingredientsArray), recipe.instructions, timestamp, existing[0].id
    );
    return `Updated '${recipe.name}'.`;
  } else {
    agent.ctx.storage.sql.exec(
      `INSERT INTO recipes (id, name, difficulty, prep_time, rating, calories, protein, ingredients_json, instructions, last_updated) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), recipe.name, recipe.difficulty, recipe.prep_time, recipe.rating, recipe.calories, recipe.protein, JSON.stringify(ingredientsArray), recipe.instructions, timestamp
    );
    return `Saved new recipe '${recipe.name}'.`;
  }
}