import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
import { getSchedulePrompt } from "agents/schedule";
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

// Tool imports from src/tools
import { fetchT212Portfolio } from "./tools/t212";
import { sendDiscordReminder } from "./tools/discord";
import { listRemindersExec, cancelReminderExec, scheduleReminderExec } from "./tools/reminders";
import { updateInventoryExec, checkInventoryExec } from "./tools/inventory";
import { saveRecipeExec, getRecipeBankExec, getCompleteRecipeListExec, getRecipeInfoExec, getRecipeNamesExec } from "./tools/recipes";
import { 
  viewShoppingListExec, 
  updateShoppingListExec, 
  sendShoppingListExec,
  suggestMealsByInventoryExec
} from "./tools/shopping";

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
    // load SQL tables for context
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS shopping_list (
        item TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        summary TEXT,
        timestamp TEXT,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS inventory (
        item TEXT PRIMARY KEY,
        quantity REAL,
        unit TEXT,
        category TEXT
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        difficulty INTEGER,
        prep_time INTEGER,
        rating INTEGER,
        calories REAL,
        protein REAL,
        ingredients_json TEXT,
        instructions TEXT,
        last_updated TEXT
      );
    `);

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
      system: `You are a helpful and talkative assistant. You can check the weather, run calculations, schedule reminders, check stocks, and act as a master meal planner.
      CRITICAL: You must call tools IMMEDIATELY. Do NOT output any "thinking", reasoning, or preliminary text before a tool call. Just output the tool call.
      
      MEAL PLANNING RULES:
      - When asked for meal ideas, ALWAYS use 'checkInventory' to see what the user has, and 'getRecipeBank' to see their recipes.
      - WEIGHTING SYSTEM: 
        1. Prioritize recipes with a high 'rating' (4 or 5).
        2. If the user says they are tired, busy, or stressed, filter for a 'difficulty' of 1 or 2, and a short 'prep_time'.
      - DYNAMIC TASTES: If the user says they are sick of a meal, bored of it, or didn't like it this time, use 'saveRecipe' to downgrade its rating to a 2 or 3. If they absolutely loved it, upgrade it to a 5.
      - If the user is lacking ingredients for a suggested meal, ask them if they want to add those missing items to a shopping list.
      - If they agree, use 'scheduleReminder' to schedule a Discord message with the missing ingredients in the 'shopping_list' array.
      - SHOPPING LIST: You manage a persistent shopping list. Use 'updateShoppingList' to add/remove/clear items. 
      - If the user says they are "going shopping now", use 'sendShoppingList' to instantly dispatch the list to their Discord.
      - If they want to be *reminded* to go shopping at a later date/time, use 'viewShoppingList' to get the current items, and then put those items into a 'scheduleReminder' tool call.
      - POST-SHOPPING CORRECTIONS: When the user goes shopping, the system automatically adds all items to their inventory. If the user returns and says the store did NOT have an item (e.g., "they were out of carrots"), you must call TWO tools:
        1. Use 'updateInventory' with a quantity of 0 to remove that item from their inventory.
        2. Use 'updateShoppingList' to add that item back onto the shopping list for next time.

      ${getSchedulePrompt({ date: new Date() })}`,
      
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      
      //@ts-ignore
      maxTokens: 1024,
      maxRetries: 2,
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // recomend meals to the user
        suggestMealsBasedOnInventory: tool({
          description: "Use this FIRST when the user asks 'what should I eat', 'pick a recipe', or wants meal suggestions. It automatically cross-references their inventory with their recipes and returns the best matches. DO NOT call checkInventory and getRecipeBank manually for this.",
          inputSchema: z.object({}),
          execute: async () => await suggestMealsByInventoryExec(this)
        }),

        // view what is currently on the shopping list
        viewShoppingList: tool({
          description: "See what is currently on the user's persistent shopping list.",
          inputSchema: z.object({}),
          execute: async () => await viewShoppingListExec(this)
        }),

        // update the shopping list
        updateShoppingList: tool({
          description: "Add, remove, or clear items from the user's persistent shopping list.",
          inputSchema: z.object({
            action: z.enum(["add", "remove", "clear"]).describe("What to do with the list"),
            items: z.string().optional().describe("A comma-separated list of items (e.g., 'milk, eggs, bread'). Leave empty if action is 'clear'.")
          }),
          execute: async (input) => await updateShoppingListExec(this, input)
        }),

        // send that shopping list through a scheduled reminder
        sendShoppingList: tool({
          description: "Immediately send the current shopping list to the user's Discord and clear the list. Use this when they are going shopping NOW. CRITICAL: After calling this tool, do not overthink or check the list again. Just reply to the user confirming that the list has been sent to Discord and cleared.",
          inputSchema: z.object({}),
          execute: async () => await sendShoppingListExec(this)
        }),

        // check a t212 stocks and shares isa portfolio
        analyzePortfolio: tool({
          description: 'Fetches Trading 212 data.',
          inputSchema: z.object({}),
          execute: async () => await fetchT212Portfolio(this.env.T212_API_KEY, this.env.T212_API_SECRET)
        }),

        // View all active reminders
        listReminders: tool({
          description: "List active reminders.",
          inputSchema: z.object({}),
          execute: async () => await listRemindersExec(this)
        }),

        // Cancel a specific reminder
        cancelReminder: tool({
          description: "Cancel a reminder by ID.",
          inputSchema: z.object({ id: z.string() }),
          execute: async ({ id }) => await cancelReminderExec(this, id)
        }),

        // Schedule a new discord message
        scheduleReminder: tool({
          description: "Schedule a Discord reminder.",
          inputSchema: z.object({ 
            summary: z.string(), timestamp: z.string(), 
            discord_message: z.string(), shopping_list: z.string().optional() 
          }),
          execute: async (input) => await scheduleReminderExec(this, input)
        }),

        // update inventory
        updateInventory: tool({
          description: "Update pantry/fridge.",
          inputSchema: z.object({ inventory_data: z.string() }),
          execute: async (input) => await updateInventoryExec(this, input)
        }),

        // check inventory
        checkInventory: tool({
          description: "Check available ingredients.",
          inputSchema: z.object({}),
          execute: async () => await checkInventoryExec(this)
        }),

        // save a new recipe. Determines if it's my favorite or in rotation at the current point in time.
        saveRecipe: tool({
          description: "Save or update a recipe.",
          inputSchema: z.object({
            name: z.string(), rating: z.number(), difficulty: z.number(),
            prep_time: z.number(), calories: z.number(), protein: z.number(),
            ingredients: z.string(), instructions: z.string()
          }),
          execute: async (input) => await saveRecipeExec(this, input)
        }),

        // query the recipe database
        getRecipeBank: tool({
          description: "Fetch saved recipes. WARNING: High token cost. Do not use this to search for meal ideas, only use this if the user explicity asks to.",
          inputSchema: z.object({}),
          execute: async () => await getRecipeBankExec(this)
        }),

        // only gets names
        getRecipeNames: tool({
          description: "Get a simple list of all saved recipe names.",
          inputSchema: z.object({}),
          execute: async () => await getRecipeNamesExec(this)
        }),

        // gets info about ONE recipe
        getRecipeInfo: tool({
          description: "Get full ingredients and instructions for a specific recipe by name.",
          inputSchema: z.object({ 
            name: z.string().describe("The exact name of the recipe to look up") 
          }),
          execute: async ({ name }) => await getRecipeInfoExec(this, name)
        }),

        // returns the complete db
        getCompleteRecipeList: tool({
          description: "Retrieve a formatted master list of every recipe. CRITICAL: After calling this tool, the data will be shown to the user automatically. You MUST reply to the user with ONLY the word 'Done.' Do not add any other text, reasoning, or formatting.",
          inputSchema: z.object({}),
          execute: async () => await getCompleteRecipeListExec(this)
        }),

        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition: conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description: "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description: "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z.enum(["+", "-", "*", "/", "%"]).describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) => Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y, "-": (x, y) => x - y, "*": (x, y) => x * y, "/": (x, y) => x / y, "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) return { error: "Division by zero" };
            return { expression: `${a} ${operator} ${b}`, result: ops[operator](a, b) };
          }
        }),
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  // THIS IS THE MISSING METHOD! 
  // The DO scheduler wakes up and calls this method on the class.
  // This method then passes the data to your separate Discord tool file.
  async executeDiscordTask(payload: any, _task: any) {
    await sendDiscordReminder(this.env.DISCORD_WEBHOOK_URL, payload);
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