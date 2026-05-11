
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




// #region deleting