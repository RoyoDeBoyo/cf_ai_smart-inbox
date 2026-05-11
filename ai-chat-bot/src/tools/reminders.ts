import { sanitizeAIPayload } from "./utils";

export async function scheduleReminderExec(agent: any, rawInput: any) {
  const cleanInput = sanitizeAIPayload(rawInput);
  const { summary, timestamp, discord_message, shopping_list } = cleanInput;

  const cleanedList = shopping_list && shopping_list.trim() !== "" 
    ? shopping_list.split(',').map((item: string) => item.trim())
    : [];

  try {
    agent.schedule(new Date(timestamp), "executeDiscordTask", {
      summary,
      discord_message,
      shopping_list: cleanedList
    });
    return `Successfully scheduled the reminder for ${timestamp}.`;
  } catch (error) {
    return `Error: failed to schedule.`;
  }
}