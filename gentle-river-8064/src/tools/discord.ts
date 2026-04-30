export async function sendDiscordReminder(
  webhookUrl: string,
  payload: {
    summary: string;
    discord_message: string;
    shopping_list?: string[];
  }
) {
  console.log(`Executing scheduled Discord reminder: ${payload.summary}`);

  let finalMessage = payload.discord_message;

  // Reconstruct the bulleted list if the AI provided one
  if (payload.shopping_list && payload.shopping_list.length > 0) {
    const listText = payload.shopping_list.map((item) => `- ${item}`).join('\n');
    finalMessage += `\n\`\`\`text\n${listText}\n\`\`\``;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: finalMessage })
    });

    if (!response.ok) {
      console.error(`Discord API returned status ${response.status}`);
    }
  } catch (e) {
    console.error("Failed to send Discord webhook", e);
  }
}