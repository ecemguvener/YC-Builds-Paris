# Barkan - Agent Instructions

<!-- This is the single source of truth for repo-level agent guidance. -->

## Overview

This repo contains the web-based Barkan product.

- **Web dashboard**: React + Vite + shadcn-style UI in `apps/web`
- **Node API**: Fastify + MongoDB backend in `apps/api`
- **Atlas CLI**: npm `barkan` package in `packages/cli`
- **Embeddable widget**: browser script bundle in `packages/widget`

The web product lets a user sign up, connect a codebase during site onboarding, generate route documentation, then create the site and copy a public-key script snippet. When installed on a customer site, the widget uses `Alt+C` to start or stop a call, streams microphone audio to ElevenLabs realtime Scribe with backend-issued short-lived tokens, captures an enriched DOM snapshot, sends the visitor request plus the site's global route map to OpenAI through the Node API, shows a Barkan agent pointer for `[POINTELEMENT:...]` targets, and speaks through ElevenLabs `stream-input` TTS. If OpenAI emits a same-origin `[NAVIGATE:/route:reason]` directive, the API turns it into a typed SSE event and the widget waits until speech finishes before navigating once, recapturing the DOM, and answering from the destination page.

## Architecture

### Web app

- **Dashboard**: React + Vite + TypeScript in `apps/web`
- **UI**: Tailwind with shadcn-style local components
- **Auth**: classic email/password, bcrypt password hashes, HTTP-only cookie sessions
- **Database**: MongoDB collections for `users`, `sessions`, `sites`, `apiKeys`, `atlasProjects`, `atlasDocuments`, and optional `interactionLogs`
- **Widget script**: `GET /widget.js`, bundled from `packages/widget`
- **Site key model**: publishable `publicSiteKey` in the script snippet; domain mismatch warns but does not block in v1
- **Atlas API keys**: CLI API keys are bound to one Atlas project and the CLI stores project credentials locally in `.barkan/credentials.json`
- **Atlas docs**: `barkan connect` links the client codebase and starts a local Barkan agent; documentation is generated through the local agent during new-site onboarding and can be regenerated from the Documentation tab. Frontend route maps and backend action endpoint inventories are saved together in one `atlasDocuments` record with `type: "documentation"`.
- **Widget runtime**: normal assistant turns use `user request -> enriched DOM -> OpenAI -> reply`; Action Mode is a separate chat-only engine that uses backend endpoint inventory docs and executes documented same-origin API requests from the user's browser. The enriched DOM includes UI facts, safe allowlisted metadata/data attributes, page meta, form summaries, label/control relationships, visible content blocks, active surfaces, and scroll state.

### Node API

The Node API exposes:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `PATCH /api/auth/me/notifications`
- `POST /api/auth/me/password`
- `GET /api/sites`
- `POST /api/sites` (guarded legacy route; new onboarding uses site setup completion)
- `POST /api/site-setups`
- `GET /api/site-setups/:projectId`
- `POST /api/site-setups/:projectId/documentation/generate`
- `POST /api/site-setups/:projectId/complete`
- `GET /api/sites/:siteId`
- `PATCH /api/sites/:siteId`
- `POST /api/sites/:siteId/documentation/generate`
- `POST /api/sites/:siteId/api-keys`
- `DELETE /api/sites/:siteId/api-keys/:apiKeyId`
- `POST /api/atlas/connect`
- `WS /api/atlas/agent/connect`
- `POST /api/atlas/agent/select-files`
- `POST /api/atlas/agent/generate-route-batch`
- `POST /api/atlas/agent/generate-backend-batch`
- `GET /api/widget/config?siteKey=...`
- `POST /api/widget/transcribe-realtime-token`
- `POST /api/widget/tts-websocket-token`
- `POST /api/widget/openai-stream`
- `POST /api/widget/action`
- `GET /widget.js`

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/App.tsx` | Minimal dashboard for auth, site creation, and snippets |
| `apps/api/src/app.ts` | Fastify app wiring for auth, site, and widget routes |
| `apps/api/src/atlas/agent-bridge.ts` | WebSocket bridge for the local Barkan agent and streamed documentation generation |
| `apps/api/src/atlas/routes.ts` | Atlas API-key auth, project initialization, and agent AI batch routes |
| `apps/api/src/atlas/openai.ts` | Atlas AI source-file selection, frontend route-map generation, and backend endpoint-inventory prompts |
| `apps/api/src/atlas/route-map.ts` | Route-map validation and site route-map loading for widget turns |
| `apps/api/src/atlas/backend-inventory.ts` | Backend endpoint-inventory validation for action-mode documentation |
| `apps/api/src/widget.ts` | Public widget config, ElevenLabs token routes, OpenAI SSE stream, and typed navigation events |
| `apps/api/src/action-agent.ts` | Separate Barkan Action Agent prompt and endpoint validation for browser-executed backend actions |
| `apps/api/src/openai.ts` | DOM-first OpenAI Responses request body and directive prompt |
| `packages/cli/src/cli.ts` | CLI connect/disconnect/status flow |
| `packages/cli/src/agent.ts` | Local Barkan agent WebSocket lifecycle plus frontend route-doc and backend endpoint-inventory generation worker |
| `packages/cli/src/atlas/scanner.ts` | Atlas v1 ignored file-tree scanner |
| `packages/cli/src/atlas/source-reader.ts` | Progressive bounded reader for Atlas source files |
| `packages/widget/src/index.ts` | Embeddable browser widget runtime |
| `packages/widget/src/actions.ts` | Browser action-mode bridge for same-origin JSON requests and CSRF headers |
| `packages/widget/src/point-tags.ts` | Browser point/directive parsing and viewport coordinate mapping |

## Build & Run

### Local PM2 deployment

This repo is deployed on this server through the local PM2 daemon:

```powershell
pm2 list
```

Use the local PM2 deployment for dev services:

```powershell
pm2 restart dev-barkan-api dev-barkan-web dev-barkan-widget barkan-extension-widget-sync --update-env
pm2 save
```

Barkan runs with hot reload on:

- API: `http://100.81.152.74:4001`
- Web: `http://100.81.152.74:4888`
- Widget watcher: `dev-barkan-widget`

```powershell
npm install
npm run build
npm test
```

Development:

```powershell
copy .env.example .env
npm run dev
```

The root dev command starts the API, web dashboard, widget build watcher, and extension widget sync without PM2.

Node API only:

```powershell
npm --workspace @barkan/api run dev
```

Web dashboard only:

```powershell
npm --workspace @barkan/web run dev
```

Widget bundle only:

```powershell
npm --workspace @barkan/widget run dev
npm --workspace @barkan/widget run build
```

Production deploy:

```powershell
npm run pm2:start-prod-api
npm run deploy:barkan-web
npm run deploy:barkan-widget
```

Atlas CLI:

```powershell
npm --workspace barkan run dev -- connect
npm --workspace barkan run dev -- disconnect
npm --workspace barkan run dev -- status
npm --workspace barkan run build
npx barkan connect
npx barkan disconnect
npx barkan status
```

## Code Style & Conventions

### Naming

- Prefer explicit, descriptive names over short names
- Keep argument names aligned with the variables passed into them

### Code clarity

- Clear is better than clever
- Add comments only when they explain non-obvious intent or tradeoffs
- Avoid unnecessary indirection

## Do Not

- Do not add features beyond the request
- Do not reintroduce desktop companion code or routes
- Do not revert user changes outside the current task
- Do not use destructive git commands like `git reset --hard`

## Self-Update Instructions

Update this file when architecture, routes, key files, or build instructions materially change.
