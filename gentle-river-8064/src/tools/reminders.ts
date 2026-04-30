import { sanitizeAIPayload } from "./utils";

export async function listRemindersExec(agent: any) {
  const tasks = agent.getSchedules(); 
  if (tasks.length === 0) return "No active reminders.";
  return JSON.stringify(tasks, null, 2);
}

export async function cancelReminderExec(agent: any, id: string) {
  try {
    agent.cancelSchedule(id); 
    return `Successfully cancelled the reminder with ID: ${id}.`;
  } catch (error) {
    return `Error: Could not cancel reminder ${id}.`;
  }
}

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