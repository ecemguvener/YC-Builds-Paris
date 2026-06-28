# Demo Video Pitch Script

Goal: make the judges feel the jump from "AI that replies" to "AI that follows through."

<!-- The message we are trying to give is: -->

AI agents already have brains. What they are missing is a real-world identity.

Our identity layer gives any agent a phone number, email address, payment capability, calendar, permissions, audit logs, and a kill switch. OpenClaw stays the brain. The identity layer is the passport and the hands.

The wow: the hard part is not prompting the agent. The hard part is linking real-world infrastructure: phone providers, email providers, credit cards, authorization, approvals, logs, and revocation. We turn that painful integration work into one identity initialization call, so any agent can start sending emails, making calls, using payment permissions, managing calendar steps, waiting for replies, coordinating with other agents, and coming back days later with a better answer than a one-shot chat response.

Problem we solve: every hackathon team, startup, and agent builder wants agents that can act, but they get blocked by real-world integrations. Voice providers, email providers, payment cards, authorization, linking accounts, approvals, limits, logs, and revocation are high-friction work. We become the identity and automation layer that can sit under any agent, in any product, anywhere.

<!-- Script -->

### 0:00-0:35 - Hook

Ecem, to camera:

"Today, every team here can build an AI agent. But making that agent work in the real world is still painfully hard."

Maxence:

"The model is not the hard part anymore. The hard part is everything around it: voice integrations, phone calls, emails, credit cards, account linking, authorization, approvals, logs, and making sure the agent cannot do something dangerous."

Ecem:

"So we built the missing layer: agentic identity."

Maxence:

"With one line of integration, any OpenClaw agent gets a phone number, email, payment access, a calendar, permissions, logs, and a kill switch."

Ecem:

"This is not another chatbot. This is infrastructure for agentic workers."

Screen: show the dashboard/chatbox or terminal ready to create an agent identity.

### 0:35-1:30 - Create the Agent

Maxence:

"Let's create a new agent."

Screen: initialize identity. Show the agent name, runtime `openclaw`, and tools: phone, email, calendar, payment.

Ecem:

"Here we choose the runtime, so in our case OpenClaw. Then we choose what this agent is allowed to use: phone, email, calendar, and payments."

Maxence:

"This is the integration pain we remove. Normally you would have to connect voice providers like ElevenLabs, phone providers, email providers, payment cards, authorization, secrets, approvals, webhooks, and audit logs."

Ecem:

"With us, the agent gets one scoped identity token. OpenClaw never needs raw provider keys, card details, calendar secrets, or email credentials."

Screen: show the returned `identity_live_...` token, partially hidden, plus `IDENTITY_LAYER_API_URL` and `AGENT_IDENTITY_TOKEN`.

Maxence:

"Now the agent has an identity. It has a phone number. It has an email. It has payment access. It has a calendar. And every action is permissioned and audited."

Ecem:

"The mental model is simple: OpenClaw is the brain. Our layer is the passport, the wallet, the inbox, the phone, and the memory of what happened."

Screen: show cards or JSON response for phone, email, calendar URL, payment, permissions.

### 1:30-2:35 - Live Demo Moment

Ecem:

"Let's test the thing that makes it feel real. I am going to ask the agent to handle a small real-world workflow: reach out, follow up, and book something."

Prompt on screen:

```text
Find a hairdresser in Paris near Le Marais.
Send an email asking for availability.
If there is no answer, call them and ask for an appointment this afternoon.
For this demo, route the call to my phone.
```

Maxence:

"OpenClaw decides the steps. Our identity layer executes them: send the email, make the call, create the calendar step, and record every action."

Ecem:

"The call is the most visual part, so for the demo we route it to our phone. But the real product is the whole automation layer."

Screen: show phone tool call or chat response. Then show the teammate's phone ringing.

Teammate, acting as hairdresser:

"Bonjour, yes, we have one appointment at 4:30."

Ecem, reacting naturally:

"Wait, that's the moment. The agent did not just answer. It reached out."

Maxence:

"And now we can see the audit log: the email, the call, the permission checks, and what identity token was used."

Screen: show email result, call result, and audit log entries: `email.send allowed`, `phone.call allowed`.

Ecem:

"For the hackathon demo the call is routed to us, but the architecture is the same for every real-world action: identity token, permission check, provider action, audit trail, revocation."

Screen: show the revoke endpoint or kill switch.

Maxence:

"And if something goes wrong, we revoke the identity. The agent loses its real-world power immediately."

### 2:35-3:35 - Why This Is Infrastructure

Ecem:

"The reason we focused on infrastructure is that every serious agent builder hits the same wall."

Maxence:

"They start with an amazing model. Then immediately they need phone numbers, email inboxes, credit cards, authorization flows, payment limits, approval flows, webhooks, logs, and revocation."

Ecem:

"So instead of every team rebuilding this from scratch, we make it one initialization step. One line of code to give an agent an identity it can act through."

Screen: show the OpenClaw skill folder: `openclaw-skills/identity-layer/`, then show `POST /api/identity/init`, tool endpoints, audit log, revoke.

Maxence:

"The agent uses the skill. The skill initializes identity. The backend returns the scoped token. Every real-world tool call goes through the identity layer."

Ecem:

"That means this is not tied to one demo. The brain can be OpenClaw, Hermes, or another agent framework. The interface stays the same: initialize identity, act with permissions, audit everything."

Maxence:

"This is why everyone building agents is our customer. This infrastructure can be layered into anything, anywhere."

### 3:35-4:28 - The Bigger Vision

Maxence:

"Now imagine the same thing, but not for one call. Imagine a research task that runs for a week."

Screen: show a mock or real task queue with multiple agents: calling, emailing, waiting, following up, booking calls, summarizing results.

Ecem:

"One agent calls suppliers. Another emails customers. Another finds investors. Another books interviews. Another waits for replies. They can talk to each other and keep going until the job is actually done."

Maxence:

"ChatGPT gives you an answer from what it already knows. Our agents can go find out. They can ask real people, wait for real responses, and come back with a report built from the real world."

Ecem:

"That is why identity matters. A long-running agent cannot just be a prompt. It needs a stable identity, a way to contact people, a way for people to contact it back, and a record of everything it did."

Maxence:

"That is the difference between a conversation and a workforce."

### 4:28-4:52 - Why This Wins

Ecem:

"The wow factor is not that an agent can write a better paragraph. The wow factor is that every agent can become a worker with identity, permissions, tools, and memory."

Maxence:

"Developers should not spend days wiring high-friction integrations before their agent can do one useful thing. They should initialize identity once, give the token to the agent, and let the agent act safely."

Ecem:

"This is the missing layer between AI reasoning and real-world execution."

### 4:52-5:05 - Close

Maxence:

"AI agents should not be trapped in a textbox."

Ecem:

"We give them identity, permissions, tools, and time."

Both:

"So they can finally get things done."

Final memory line, optional if you have 5 extra seconds:

"Every builder here needs agents that can stay alive, find customers, find investors, follow up, book meetings, and keep working. We make those agents real workers, with one line of integration."

## Backup 60-Second Version

"AI can think, but it still cannot live in the real world. It cannot pick up the phone, send the email, pay for something, or wait three days for a reply.

We built the missing identity layer for agents. In under a minute, an OpenClaw agent gets a phone number, email address, payment access, calendar, permissions, audit logs, and a kill switch.

Here is the agent identity being created. OpenClaw only receives a scoped token, not our provider secrets. Now we ask it to call a hairdresser in Paris. The identity layer checks permission, places the call, and records the audit log. For the demo, the call routes to our phone. The point is simple: the agent did not just answer. It reached out.

Now imagine that running for a week. Agents calling suppliers, emailing customers, waiting for replies, booking interviews, and sharing results with each other. ChatGPT gives an answer from what it already knows. Our agents can go find out.

This is the difference between a conversation and a workforce. We give agents identity, permissions, and time, so they can finally get things done."

## Shot List

1. Camera hook with both founders.
2. Screen capture: create agent identity.
3. Screen capture: show phone, email, calendar, payment, permissions.
4. Screen capture: show scoped token and OpenClaw env vars.
5. Chatbox prompt: "call a hairdresser in Paris."
6. Phone rings; teammate answers as the hairdresser.
7. Screen capture: call result and audit log.
8. Screen capture: revoke/kill switch.
9. Vision visual: several agents running long-horizon tasks.
10. Final camera close.

## Lines to Emphasize

- "AI agents already have brains. What they are missing is a real-world identity."
- "The agent did not just answer. It reached out."
- "ChatGPT gives you an answer from what it already knows. Our agents can go find out."
- "This is the difference between a conversation and a workforce."
- "We give agents identity, permissions, and time."

## Do Not Say

- Do not use the old product name in the pitch.
- Do not say the hackathon demo already runs week-long research unless you show it as the vision or a designed capability.
- Do not overexplain Twilio, Gmail, or payment provider internals. Judges need to understand the value, not every integration detail.
- Do not pitch "customer finding" as the main product. The product is infrastructure: identity for agents. Customer discovery is just one killer demo.

## Architecture Proof Points for Judges

- `POST /api/identity/init` creates the agent identity and returns a scoped token.
- OpenClaw receives `IDENTITY_LAYER_API_URL` and `AGENT_IDENTITY_TOKEN`.
- Tool calls use bearer-token authorization.
- Phone, email, calendar, and payment actions are permission-gated.
- Every action writes to the audit log.
- The identity can be revoked, so the agent loses real-world power immediately.
- The OpenClaw skill tells the agent when to initialize identity and how to call tools safely.
