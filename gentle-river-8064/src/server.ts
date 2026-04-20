import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage
} from "ai";
import { z } from "zod";

import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from "cloudflare:workers";

/**
 * The AI SDK's downloadAssets step runs `new URL(data)` on every file
 * part's string data. Data URIs parse as valid URLs, so it tries to
 * HTTP-fetch them and fails. Decode to Uint8Array so the SDK treats
 * them as inline data instead.
 */
function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || typeof msg.content === "string") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") return part;
        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      })
    };
  });
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/google/gemma-4-26b-a4b-it", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a helpful and talkative assistant. You can check the weather, get the user's timezone, run calculations, schedule tasks, and check stock portfolios on Trading 212. 
      Do not explain your reasoning. 
      Do not narrate the chat history or acknowledge previous messages.
      When the user asks to schedule a task or reminder, use the scheduleReminder tool.
      Do not call the scheduleReminder tool multiple times for items belonging to the same event. Group related items into an array and a single tool call, this array should be passed into 'shopping_list'. Do not use characters like '<|"|' in the array.
      The chat history should only be used for context. Any tool calls have already happened and should not be repeated. Only call tools for the most recent message.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // check a t212 stocks and shares isa portfolio
        analyzePortfolio: tool({
          description: 'Fetches the users live Trading 212 portfolio, calculates their combined dividend yield, and returns the sanitized data.',
          inputSchema: z.object({}),
          execute: async () => {
            console.log("AI fetching live t212 data...");

            try {
              // 1. Fetch EUR/GBP Exchange Rate
              let eurGbpRate = 0.85; // Fallback
              try {
                const fxRes = await fetch("https://api.exchangerate-api.com/v4/latest/EUR");
                if (fxRes.ok) {
                  const fxData = (await fxRes.json()) as { rates: { GBP: number } };
                  eurGbpRate = fxData.rates.GBP;
                }
              } catch (e) {
                console.warn("Using fallback EUR/GBP rate.");
              }

              // 2. Fetch T212 Portfolio
              // Note: Python's auth=(key, secret) compiles to a Basic Auth header
              const authString = btoa(`${this.env.T212_API_KEY}:${this.env.T212_API_SECRET}`);
              const t212Res = await fetch("https://live.trading212.com/api/v0/equity/portfolio", {
                headers: { "Authorization": `Basic ${authString}` }
              });

              if (!t212Res.ok) throw new Error(`T212 API Error: ${t212Res.statusText}`);
              const data: any[] = await t212Res.json();

              // 3. Map and Sanitize Data
              const tickerMap: Record<string, { name: string, currency: string }> = {
                "VHYLl_EQ": { name: "VHYL", currency: "GBP" },
                "BNPp_EQ":  { name: "BNP",  currency: "EUR" },
                "CABKe_EQ": { name: "CABK", currency: "EUR" },
                "ENGIp_EQ": { name: "ENGI", currency: "EUR" },
                "HSBAl_EQ": { name: "HSBA", currency: "GBX" },
                "IBEe_EQ":  { name: "IBE",  currency: "EUR" },
                "INGAa_EQ": { name: "INGA", currency: "EUR" },
                "IESd_EQ":  { name: "ISP",  currency: "EUR" }, 
                "LGENl_EQ": { name: "LGEN", currency: "GBX" },
                "LLOYl_EQ": { name: "LLOY", currency: "GBX" },
                "NGl_EQ":   { name: "NG.",  currency: "GBX" },
                "RBSl_EQ":  { name: "NWG",  currency: "GBX" }, 
                "PNNl_EQ":  { name: "PNN",  currency: "GBX" },
                "UUl_EQ":   { name: "UU.",  currency: "GBX" }
              };

              const sanitizedPortfolio: Record<string, number> = {};
              let totalPortfolioValue = 0.0;

              for (const position of data) {
                const rawTicker = position.ticker;
                if (!tickerMap[rawTicker]) continue;

                const clean = tickerMap[rawTicker];
                const quantity = position.quantity || 0;
                const currentPrice = position.currentPrice || 0;
                const rawValue = quantity * currentPrice;

                let gbpValue = rawValue;
                if (clean.currency === "GBX") gbpValue = rawValue / 100;
                if (clean.currency === "EUR") gbpValue = rawValue * eurGbpRate;

                sanitizedPortfolio[clean.name] = Number(gbpValue.toFixed(2));
                totalPortfolioValue += gbpValue;
              }

              // 4. Calculate Weighted Yield
              const yieldMap: Record<string, number> = {
                "VHYL": 0.0324, "BNP":  0.0816, "CABK": 0.0469,
                "ENGI": 0.0523, "HSBA": 0.0416, "IBE":  0.0336,
                "INGA": 0.0768, "ISP":  0.0622, "LGEN": 0.0802,
                "LLOY": 0.0355, "NG.":  0.0367, "NWG":  0.0527,
                "PNN":  0.0701, "UU.":  0.0387
              };

              let weightedYield = 0.0;
              if (totalPortfolioValue > 0) {
                for (const [ticker, gbpValue] of Object.entries(sanitizedPortfolio)) {
                  const weight = gbpValue / totalPortfolioValue;
                  const stockYield = yieldMap[ticker] || 0.0;
                  weightedYield += (weight * stockYield);
                }
              }

              const finalYield = Number((weightedYield * 100).toFixed(2));
              const finalTotal = Number(totalPortfolioValue.toFixed(2));

              // 5. Return context to the AI
              return `Success! Portfolio Total: £${finalTotal}. Combined Dividend Yield: ${finalYield}%. 
              Breakdown: ${JSON.stringify(sanitizedPortfolio)}`;

            } catch (error) {
              console.error("Portfolio fetch failed:", error);
              return "Error: Could not fetch portfolio data. Check API keys.";
            }
          }
        }),

        // schedule a new discord message
        scheduleReminder: tool({
          description: "Schedule a reminder for a future date and time.",
          inputSchema: z.object({
            summary: z.string().describe('A short summary of the task or reminder'),
            timestamp: z.string().describe('ISO 8601 formatted date and time for when the reminder should trigger'),
            is_important: z.boolean().describe('True if this is a critical or time-sensitive task'),
            discord_message: z.string().describe('A short description of the task to be sent to the user on Discord at the reminder time'),
            shopping_list: z.array(z.string()).optional().describe('An optinal array of specific items the user specifices')
          }),
          execute: async({summary, timestamp, is_important, discord_message, shopping_list}) => {
            console.log(`AI called the scheduling tool for ${summary} at ${timestamp}.`);

            try {
              // @ts-ignore
              await this.env.REMINDER_WORKFLOW.create({
                params: {
                  type: "reminder",
                  summary,
                  timestamp,
                  is_important,
                  discord_message,
                  shopping_list,
                }
              });

              return `Successfully scheduled the workflow for ${timestamp}`;
            } catch (error){
              console.error("Failed to create workflow:", error);
              return `Error: failed to schedule the workflow.`;
            }
          }
        }),

        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}


async function sendToDiscord(message: string, webhookUrl: string) {
  // #region Discord webhook

  await fetch(webhookUrl, {
    method: "POST",
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({content: message})
  });
}


export class ReminderWorkflow extends WorkflowEntrypoint<any, any> {
  async run(event: WorkflowEvent<any>, step: WorkflowStep) {
    const task = event.payload;

    if (!task.timestamp) return;

    const targetTime = new Date(task.timestamp);

    await step.sleepUntil('wait-for-reminder', targetTime);

    await step.do('send-discord-message', async () => {
      let finalMessage = task.discord_message;

      console.log(task.shopping_list);

      if(task.shopping_list && task.shopping_list.length > 0) {
        const listText = task.shopping_list.map((item: string) => `- ${item}`).join('\n');

        finalMessage += `\`\`\`text\n${listText}\n\`\`\``;
        console.log(finalMessage);
      }

      await sendToDiscord(finalMessage, this.env.DISCORD_WEBHOOK_URL);
    })
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
