# cf_ai_smart-inbox

A Cloudflare Workers AI agent that intelligently manages reminders, recipes, shopping lists, and investment portfolios through natural language conversation.

## Overview

This is an AI agent built on Cloudflare's Workers and Agents platform that can understand context from your messages and perform a wide variety of tasks. It maintains persistent state in a SQLite database and integrates with external services like Discord and Trading 212.

## Features

- **Smart Reminders**: Schedule reminders with contextual details delivered via Discord webhook
- **Recipe & Meal Management**: Add recipes with nutritional info, get meal suggestions based on your pantry
- **Pantry Management**: Track ingredients and automatically update inventory when meals are made or groceries purchased
- **Shopping Lists**: Build shopping lists over time, then sync purchases back to your pantry with substitution support
- **Intelligent Suggestions**: Recommends easy-to-cook meals when you've been busy; adapts recommendations based on how much you like each meal
- **Portfolio Tracking**: Check your Trading 212 stock holdings and combined dividend yields
- **Natural Language**: Understands complex requests and maintains context across conversations

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Agents SDK with Durable Objects
- **Database**: SQLite (built-in to Durable Objects)
- **AI Model**: Google Gemma 4 (26B) via Workers AI
- **Frontend**: React + Vite with TypeScript
- **Styling**: Tailwind CSS

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18.0 or higher
- **npm**: v9.0 or higher (comes with Node.js)
- **A Cloudflare Account**: Free tier is sufficient for development

You can check your Node.js and npm versions with:
```bash
node --version
npm --version
```

## Installation

### 1. Clone the Repository

```bash
cd gentle-river-8064
npm install
```

### 2. Set Up Wrangler

Wrangler is the CLI tool for Cloudflare Workers. It's included in `devDependencies`, so it's installed with `npm install`.

To verify:
```bash
npx wrangler --version
```

### 3. Authenticate with Cloudflare

Log in to your Cloudflare account:

```bash
npx wrangler login
```

This will open your browser to authorize the Wrangler CLI with your Cloudflare account.

### 4. Configure Environment Variables

Create a `.dev.vars` file in the `gentle-river-8064` directory with your API keys:

```bash
cd gentle-river-8064
cp .dev.vars.example .dev.vars  # If example exists, or create it manually
```

Edit `.dev.vars` and add:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
T212_API_KEY=your_trading_212_api_key
T212_API_SECRET=your_trading_212_api_secret
```

#### Getting Your API Keys

**Discord Webhook URL:**
1. Go to your Discord server settings
2. Navigate to Integrations → Webhooks
3. Create a new webhook and copy the URL

**Trading 212 API Credentials:**
1. Log in to your Trading 212 account
2. Go to Account Settings
3. Create API credentials under Developer Settings
4. Copy your API Key and API Secret

### 5. Generate TypeScript Types

After setting up environment variables, generate the TypeScript types for your Wrangler configuration:

```bash
npm run types
```

This generates `env.d.ts` with proper types for your environment variables and Cloudflare bindings.

### 6. Start Development Server

```bash
npm run dev
```

The application will start on `http://localhost:5173` (or another available port if 5173 is in use).

## Usage

Once the server is running, you can interact with the AI agent through the web interface or by sending messages that include natural language instructions.

### Available Commands

- `npm run dev` - Start development server with hot reload
- `npm run deploy` - Build and deploy to Cloudflare Workers
- `npm run types` - Update TypeScript environment types
- `npm run lint` - Run code linting with oxlint
- `npm run format` - Format code with oxfmt
- `npm run check` - Run format check, lint, and TypeScript check

## Example Prompts

### Reminders
```
I just booked a flight for paris which leaves on Friday at 8am. Can you remind me to bring my passport, boarding pass and luggage with me.
```

### Recipe Management
```
Add egg fried rice to my recipes. I currently really like it so it's going to get a 5/5 for enjoyment. It's a simple meal to make so 1/5 for difficulty. It takes about 15 mins to make. I need 2 eggs, 75g of jasmine/long grain rice, 1 spring onion, 2 tablespoons of soy sauce and 1 teaspoon of lao gan ma. To make it you cook the rice. Once the rice is done, start scrambling the eggs, add the rice and lao gan ma. After 30 seconds add the soy sauce and turn off the heat. Mix the rice well and then it's ready to serve.
```

### Portfolio Queries
```
How is my portfolio doing?
```

### Pantry Management
```
What is currently in my pantry?
```

### Meal Suggestions
```
Can you suggest me a meal to have today?
```

### Shopping Lists
```
Add 500g of beef mince, 1kg carrots, 1 cucumber, 5kg of potatoes, some veg stock, a loaf of white bread, peanut butter, unsalted butter, 1kg of plain flour and 1kg of self raising flour to my shopping list.
```

```
What's on my shopping list right now?
```

### Shopping Trip
```
I'm going shopping now.
```

```
They didn't have any carrots or veg stock at the store.
```

```
I got beef stock instead of veg stock.
```

## Project Structure

```
gentle-river-8064/
├── src/
│   ├── app.tsx              # Frontend React app
│   ├── client.tsx           # Client-side agent interaction
│   ├── server.ts            # Main agent implementation
│   ├── styles.css           # Global styles
│   └── tools/               # Agent tools
│       ├── discord.ts       # Discord webhook integration
│       ├── inventory.ts     # Pantry management
│       ├── recipes.ts       # Recipe management
│       ├── reminders.ts     # Reminder scheduling
│       ├── shopping.ts      # Shopping list management
│       ├── t212.ts          # Trading 212 integration
│       └── utils.ts         # Utility functions
├── public/                  # Static assets
├── wrangler.jsonc           # Cloudflare Workers config
├── vite.config.ts           # Vite build config
├── tsconfig.json            # TypeScript config
└── package.json             # Dependencies and scripts
```

## Deployment

To deploy to Cloudflare Workers:

```bash
npm run deploy
```

This will build the project and deploy it to your Cloudflare account. You'll need to ensure your environment variables are set up in your Cloudflare dashboard for production.

## Architecture

This project uses Cloudflare's **Agents** framework, which provides:

- **Durable Objects**: Stateful compute for the agent instance with built-in SQLite database
- **Workers AI**: Serverless GPU-powered inference for the Google Gemma 4 model
- **WebSocket Communication**: Real-time bidirectional communication between client and agent
- **Persistent State**: SQLite database within each Durable Object instance

For more information on Cloudflare Agents, visit: https://developers.cloudflare.com/agents/

## License

MIT