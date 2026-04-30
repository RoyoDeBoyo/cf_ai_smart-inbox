import { sanitizeAIPayload } from "./utils";

export async function checkInventoryExec(agent: any) {
  const items = agent.ctx.storage.sql.exec(`SELECT * FROM inventory`).toArray();
  if (items.length === 0) return "The inventory is completely empty.";
  return JSON.stringify(items);
}

export async function updateInventoryExec(agent: any, rawInput: any) {
  const { inventory_data } = sanitizeAIPayload(rawInput);
  if (!inventory_data) return "No data provided.";

  const itemsToUpdate = inventory_data.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
  let updatedCount = 0;

  for (const itemStr of itemsToUpdate) {
    const parts = itemStr.split('|').map((p: string) => p.trim());
    if (parts.length === 4) {
      const [item, qtyStr, unit, category] = parts;
      const quantity = parseFloat(qtyStr);

      if (quantity <= 0) {
        agent.ctx.storage.sql.exec(`DELETE FROM inventory WHERE item = ?`, item);
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
  return `Successfully updated ${updatedCount} items.`;
}