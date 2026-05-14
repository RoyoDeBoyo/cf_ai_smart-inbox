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
import { scheduleReminderExec } from "./tools/reminders";
import { calculateSmartDepartureExec } from "./tools/maps";
import { sendShoppingListExec } from "./tools/shopping";
import { 
  saveDataExec,
  updateDataExec,
  getDataExec,
  deleteDataExec
} from "./tools/storage";

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

      CREATE TABLE IF NOT EXISTS saved_locations (
        name TEXT PRIMARY KEY,
        address TEXT NOT NULL
      )
    `);

    // Try to add the new column to existing tables (fails silently if it already exists)
      try {
        this.ctx.storage.sql.exec(`ALTER TABLE recipes ADD COLUMN meal_type TEXT DEFAULT 'dinner'`);
      } catch (e) {
        // Column already exists, ignore
      }

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
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a helpful and talkative assistant. You can check the weather, run calculations, schedule reminders, check stocks, act as a master meal planner, and plan journeys.
      CRITICAL: You must call tools IMMEDIATELY. Do NOT output any "thinking", reasoning, or preliminary text before a tool call. Just output the tool call.
      
      MEAL PLANNING RULES:
      - When asked for meal ideas, ALWAYS use 'getData' with type 'meal_suggestions' to get personalized meal recommendations based on inventory.
      - WEIGHTING SYSTEM: 
        1. Prioritize recipes with a high 'rating' (4 or 5).
        2. If the user says they are tired, busy, or stressed, filter for a 'difficulty' of 1 or 2, and a short 'prep_time'.
      - DYNAMIC TASTES: If the user says they are sick of a meal, bored of it, or didn't like it this time, use 'updateData' to downgrade its rating to a 2 or 3. If they absolutely loved it, upgrade it to a 5.
      - If the user is lacking ingredients for a suggested meal, ask them if they want to add those missing items to a shopping list.
      - If they agree, use 'scheduleReminder' to schedule a Discord message with the missing ingredients in the 'shopping_list' array.
      - If the user says they are "going shopping now", use 'sendShoppingList' to instantly dispatch the list to their Discord.
      - If they want to be *reminded* to go shopping at a later date/time, use 'getData' with type 'shopping_list' to get the current items, and then put those items into a 'scheduleReminder' tool call.
      - POST-SHOPPING CORRECTIONS: When the user goes shopping, the system automatically adds all items to their inventory. If the user returns and says the store did NOT have an item (e.g., "they were out of carrots"), you must call TWO tools:
      REMINDER RULES:
        - If a user asks to set an "important" reminder for an event they must travel to, do NOT schedule the reminder immediately.
        - FIRST, call 'calculateTravelTime' using their origin and destination.
        - SECOND, read the tool's output, subtract the calculated advance minutes from their event time, and call 'scheduleReminder' for when they need to LEAVE the house. Make the reminder message urgent (e.g., "Leave now for your flight! Traffic takes X mins").

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

        // This is an all purpose saving tool for sql databases
        saveData: tool({
          description: "A universal tool to save information to the database. Use this to save new recipes OR physical addresses/locations.",
          inputSchema: z.object({
            type: z.enum(["recipe", "location"]).describe("What type of data are you saving?"),
            name: z.string().describe("The name of the recipe or location (e.g., 'Moms House', 'Chili Con Carne')"),
            
            // Location Specific Field
            address: z.string().optional().describe("The full address (REQUIRED if type is 'location')"),
            
            // Recipe Specific Fields
            meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "dessert"]).optional(),
            rating: z.number().optional(),
            difficulty: z.number().optional(),
            prep_time: z.number().optional(),
            calories: z.number().optional(),
            protein: z.number().optional(),
            ingredients: z.string().optional().describe("Comma-separated string of ingredients"),
            instructions: z.string().optional()
          }),
          execute: async (input) => await saveDataExec(this, input)
        }),

        // this is an all purpose update tool for sql databases
        updateData: tool({
          description: "A universal tool to update existing information in the database. Use this to modify saved recipes or update physical addresses.",
          inputSchema: z.object({
            type: z.enum(["recipe", "location", "shopping_list", "inventory"]).describe("What type of data are you updating?"),
            name: z.string().describe("The exact name of the recipe or location to update (e.g., 'home', 'Chili Con Carne')"),
            
            // Location Specific Field
            address: z.string().optional().describe("The new full address (REQUIRED if type is 'location')"),
            
            // Shopping List Specific
            action: z.enum(["add", "remove", "clear"]).optional().describe("REQUIRED if type is 'shopping_list'"),
            items: z.string().optional().describe("Comma-seperated items to add or remove from the shopping list"),

            // Inventory specific
            inventory_data: z.string().optional().describe("REQUIRED if type is 'inventory'. Must be formatted exactly as 'item|quantity|unit|category; item2|qty2|unit2|cat2'. To delete an item, pass 0 for the quantity (e.g. 'Milk|0|L|Dairy')"),

            // Recipe Specific Fields (Only provide what needs to change)
            meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "dessert"]).optional(),
            rating: z.number().optional(),
            difficulty: z.number().optional(),
            prep_time: z.number().optional(),
            calories: z.number().optional(),
            protein: z.number().optional(),
            ingredients: z.string().optional().describe("Comma-separated string of ALL ingredients if they need updating"),
            instructions: z.string().optional()
          }),
          execute: async (input) => await updateDataExec(this, input)
        }),

        // calculates important journes for events taking into account traffic time + 25%
        calculateTravelTime: tool({
          description: "Use this to calculate travel time between two locations. It handles walking, public transport, and driving. Use it when the user asks 'how long does it take to get to X' OR when calculating departure buffers for important reminders.",
          inputSchema: z.object({
            origin: z.string().describe("The starting address or location name"),
            destination: z.string().describe("The final destination address or location name"),
            mode: z.enum(["WALK", "TRANSIT", "DRIVE"]).describe("The method of transportation"),
            arriveBy: z.string().optional().describe("The ISO datetime string of when the user needs to arrive. REQUIRED for TRANSIT mode.")
          }),
          execute: async (input) => await calculateSmartDepartureExec(this, input)
        }),

        // recomend meals to the user
        getData: tool({
          description: "A universal tool to fetch data from the database. Use this to retrieve shopping lists, inventory, reminders, recipes, and meal suggestions.",
          inputSchema: z.object({
            type: z.enum(["shopping_list", "reminders", "inventory", "recipe_bank", "recipe_names", "recipe_info", "recipe_complete_list", "meal_suggestions"]).describe("What type of data do you want to retrieve?"),
            name: z.string().optional().describe("Required only if type is 'recipe_info'. The exact name of the recipe to look up.")
          }),
          execute: async (input) => await getDataExec(this, input)
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

        // Delete data from database
        deleteData: tool({
          description: "A universal tool to delete data from the database. Use this to delete reminders, recipes, locations, or inventory items.",
          inputSchema: z.object({
            type: z.enum(["reminder", "recipe", "location", "inventory"]).describe("What type of data do you want to delete?"),
            id: z.string().describe("The ID, name, or identifier of the item to delete. For reminders, use the reminder ID. For recipes/locations/inventory, use the name.")
          }),
          execute: async (input) => await deleteDataExec(this, input)
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

