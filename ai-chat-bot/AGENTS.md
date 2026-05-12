# cf_ai_smart-inbox — agents reference

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (localhost:5173) |
| `npm run deploy` | `vite build && wrangler deploy` |
| `npm run types` | `wrangler types env.d.ts --include-runtime false` |
| `npm run format` | `oxfmt --write .` |
| `npm run lint` | `oxlint src/` |
| `npm run check` | `oxfmt --check . && oxlint src/ && tsc` |

Run `check` before committing (runs format check → lint → typecheck in that order). CI on main/PR runs `npm install && npm run check`.

## Env vars

Copy `.dev.vars.example` to `.dev.vars` (or check `.dev.vars` for required keys):
- `DISCORD_WEBHOOK_URL` — Discord webhook for reminders/shopping lists
- `T212_API_KEY` / `T212_API_SECRET` — Trading 212
- `GOOGLE_MAPS_API_KEY` — Google Routes API

After changing bindings in `wrangler.jsonc`, run `npm run types` to regenerate `env.d.ts`.

## Architecture

- **Single Durable Object** `ChatAgent` (`src/server.ts:50`) extends `AIChatAgent` with SQLite storage.
- **Entrypoints**: `src/server.ts` (worker), `src/client.tsx` → `src/app.tsx` (React SPA via Vite).
- **Tools** live in `src/tools/` — all DB reads go through `getData` in `storage.ts`. Tool functions receive the agent instance as first arg.
- **Frontend**: React 19 + Tailwind CSS v4 + Kumo UI components + Streamdown (markdown rendering).
- **Dev server** uses `@cloudflare/vite-plugin` — workers + frontend served together.

## Quirks

- **No test setup exists** — no test scripts, no test framework in dependencies.
- **Formatter**: `oxfmt` (not prettier). Trailing commas disabled, printWidth 80.
- **Linter**: `oxlint` (not eslint). `no-explicit-any` is error. `no-unused-vars` ignores `_`-prefixed identifiers.
- **TypeScript**: config extends `agents/tsconfig` — do not modify base config.
- **oxlint ignores `env.d.ts`** — add new ignore patterns to `.oxlintrc.json`.
- **Data URIs in messages**: `server.ts:34-48` converts base64 data URIs to `Uint8Array` to bypass AI SDK fetch attempts.
- **Wrangler config** is `wrangler.jsonc` (not `wrangler.toml`). VSCode associates `.json` with `jsonc` via `.vscode/settings.json`.

## Strict Rules

- **Never delete or alter config files without asking first**
- When generating markdown files, never write actual API keys, only refer to the environment variable names (e.g. GOOGLE_API_KEY)
- When using tools, you MUST wrap your JSON output in <tool_call> and </tool_call> tags, and you must strictly use the exact tool schemas provided