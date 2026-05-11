import { sendDiscordReminder } from "./discord";

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