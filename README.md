# Agentic Identity Layer

> One line of integration to give any AI agent a real-world identity.

AI agents can reason, plan, and write. But most of them still cannot operate in the real world without a team wiring together voice providers, email providers, payment cards, account linking, authorization, approvals, webhooks, logs, and revocation.

This project gives an agent the missing layer: a real-world identity with a phone number, email address, payment capability, calendar, permissions, audit logs, and a kill switch.

OpenClaw stays the brain. The identity layer becomes the agent's passport, wallet, inbox, phone, and memory.

## Why We Are Building This

The next wave is not just AI that talks. It is AI that operates.

In the next months and years, more work will move from humans using software to agents operating software and services for humans. For that to happen, agents need infrastructure before they need more prompts:

- identity
- permissions
- communication rails
- payment rails
- account linking
- auditability
- revocation

We are building that infrastructure now, before the trend becomes obvious.

Everyone building agents is our customer. Everyone in the room is our customer. Hackathon teams and startups need agents that can stay alive, find customers, find investors, follow up, book meetings, collect answers, and keep moving while the founders sleep.

## The Problem

The model is not the hard part anymore.

The hard part is everything around it:

- connecting voice providers like ElevenLabs
- connecting phone and email providers
- linking payment cards
- authorizing sensitive actions
- setting approval limits
- protecting raw provider credentials
- recording what the agent did
- turning the agent off immediately if something goes wrong

Every serious agent builder hits this wall. We turn that high-friction integration work into one identity initialization call.

## What It Does

An agent identity can be provisioned with:

- phone calls
- email sending
- calendar booking
- payment requests
- scoped identity tokens
- permission checks
- audit logs
- revocation / kill switch

The agent never receives raw provider secrets. It receives a scoped `identity_live_...` token and calls the identity layer for real-world actions.

## Demo Flow

1. Create a new agent identity.
2. Choose a runtime, such as OpenClaw, or deploy a managed agent.
3. Select the tools the agent is allowed to use: phone, email, calendar, payment.
4. Copy the returned identity token into the agent runtime.
5. Ask the agent to perform a real-world workflow.
6. The agent sends email, makes a phone call, creates a calendar step, or requests payment through the identity layer.
7. Show the audit log.
8. Revoke the identity to prove the agent loses real-world power immediately.

The phone call is the most visual demo moment, but the product is not a phone-call tool. The product is the automation infrastructure layer behind every real-world agent action.

## Architecture

```text
Agent runtime
  OpenClaw / Hermes / custom agent
        |
        | AGENT_IDENTITY_TOKEN
        v
Identity Layer API
  permissions
  audit logs
  revocation
        |
        +--> Email tool
        +--> Phone tool
        +--> Calendar tool
        +--> Payment tool
```

Core principle:

> Agents should never receive raw Gmail, Twilio, ElevenLabs, calendar, or payment credentials. They should receive a scoped identity token.

## Key Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/identity/init` | Create an agent identity and scoped token |
| `POST /api/tools/email/send` | Send email as the agent identity |
| `POST /api/tools/phone/call` | Make a permissioned phone call |
| `POST /api/tools/calendar/book` | Book a calendar event |
| `POST /api/tools/payments/request-purchase` | Request a payment action |
| `GET /api/identity/:agentId/audit-log` | View all audited actions |
| `POST /api/identity/revoke` | Revoke the identity token |

## OpenClaw Skill

This repo includes a portable OpenClaw skill:

```text
openclaw-skills/identity-layer/
  SKILL.md
  client.js
```

The skill teaches OpenClaw to:

- initialize identity before real-world actions
- store `AGENT_IDENTITY_TOKEN`
- call email, phone, calendar, payment, audit, and revoke endpoints
- avoid raw provider credentials

## Hackathon Pitch

The sticky line:

> Everyone in this room is our customer. Because every team here needs agents that can stay alive, find customers, find investors, follow up, book meetings, and keep working.

The one-sentence summary:

> We give agents identity, permissions, tools, and time, so they can finally get things done.

The full demo script is in:

```text
docs/demo-video-pitch-script.md
```

## Runtime

- Web dashboard: React + Vite in `apps/web`
- Node API: Fastify + MongoDB in `apps/api`
- Embeddable widget package: bundled browser script in `packages/widget`
- CLI package: local agent and setup helpers in `packages/cli`

## Prerequisites

- Node.js 18+
- MongoDB
- API keys for ElevenLabs and OpenAI for real provider-backed voice/documentation features

## Web Setup

Install dependencies:

```powershell
npm install
```

Create `.env` from `.env.example` and set:

```text
PUBLIC_APP_URL=http://localhost:4888
PUBLIC_API_URL=http://localhost:4001
MONGODB_URI=mongodb://127.0.0.1:27017/barkan
SESSION_SECRET=replace-with-a-long-random-secret
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_AGENT_PHONE_NUMBER_ID=
ELEVENLABS_VOICE_ID=kPzsL2i3teMYv0FxEYQ6
OPENAI_API_KEY=
OPENAI_WIDGET_MODEL=gpt-5.4-2026-03-05
OPENAI_ACTION_MODEL=gpt-5.4-mini-2026-03-17
OPENAI_ATLAS_MODEL=gpt-5.4-2026-03-05
OPENAI_DASHBOARD_CHAT_MODEL=gpt-5.4-2026-03-05
```

The dashboard chat simulates an OpenClaw runtime with a phone-call tool. Calls run in mock mode until `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `ELEVENLABS_AGENT_PHONE_NUMBER_ID` are all set, then it uses the ElevenLabs outbound-call path.

Run locally:

```powershell
npm run dev
```

The dashboard runs on `http://localhost:4888` and the API runs on `http://localhost:4001`.

On macOS, `/bin/bash` may be too old for `scripts/dev.sh` because it uses `wait -n`. If so, run the same processes from `zsh` or install a newer Bash.

## Static Prototype

This repository also contains a static sandbox at the root:

- `index.html`
- `app.js`
- `styles.css`

Open `index.html` directly in a browser to use that standalone prototype.

## Production Deploy

Normal builds are verification-only and do not update production:

```powershell
npm run build
```

Initialize or reload the production API process in PM2:

```powershell
npm run pm2:start-prod-api
```

Production updates are explicit:

```powershell
npm run deploy:barkan-web
```

Widget production updates build the API and widget, restart `prod-barkan-api`, and check `/widget.js`:

```powershell
npm run deploy:barkan-widget
```

## Payment Tool

The payment tool gives an agent identity a real-world spending capability alongside email, phone, and calendar. It follows the same pattern as the other tools: bearer identity-token auth, policy checks, and audit logs.

The agent never sees card details. It can only request a purchase, and the policy engine decides:

- `approved`
- `rejected`
- `requires_approval`

When an identity is initialized with the `payment` tool, the backend provisions a mock virtual card and a default spending policy:

- auto-approve <= £25
- human approval above the limit
- blocked categories such as `CryptoExchange`

Agent-facing endpoints use:

```text
Authorization: Bearer <identity_token>
```

Payment endpoints:

| Method & path | Purpose |
|---|---|
| `POST /api/tools/payments/request-purchase` | Request a purchase (`merchant_name`, `amount`, `currency`, `purpose`) |
| `POST /api/tools/payments/request-purchase-from-text` | Natural language purchase request |
| `POST /api/tools/payments/:requestId/approve` | Human approval |
| `POST /api/tools/payments/:requestId/reject` | Human rejection |
| `POST /api/tools/payments/:requestId/execute` | Execute an approved purchase |
| `PATCH /api/tools/payments/policy` | Update the spending policy |
| `GET /api/identity/:agentId/payment-activity` | Policy, purchase requests, and transactions |

## Project Structure

```text
apps/
  api/                     Fastify + MongoDB backend
  web/                     React + Vite dashboard
packages/
  cli/                     CLI and local agent helpers
  widget/                  Embeddable browser script
openclaw-skills/
  identity-layer/          Portable OpenClaw skill
barkan-injection/          Browser extension wrapper
docs/
  demo-video-pitch-script.md
  openclaw-identity-layer.md
_bmad/                     BMAD configuration
.agents/                   BMAD agent skills
AGENTS.md                  Repo architecture and agent instructions
```
