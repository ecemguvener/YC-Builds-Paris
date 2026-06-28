# Demo Video Pitch Script — Refined v2

**USP:** Agentic identity. Not a tool, not a wrapper — an identity an agent can live through.

---

### 0:00–0:25 — Hook

**Ecem**, to camera:

"Every person in this room has an identity. A phone number. A bank account. An email. A name that shows up when you call someone. That identity is what lets you act in the world."

**Maxence:**

"AI agents have none of that. They can reason. They can plan. But when it's time to actually do something — call, pay, book — they hit a wall. 

**Ecem:**

"So we built the missing layer: We give agents a real-world identity."

*Screen: dashboard — a row of named agentic identities, each with a phone, email, and status.*

---

### 0:25–1:10 — What an Agentic Identity Is
--- GAB EDIT: LOT OF THINGS DELETED
**Ecem:**

"We give agents exactly that. One API call. Your agent goes from a brain with no hands to a worker with a real presence — its own phone, its own inbox, its own payment access, its own permissions, and a full audit trail."


*Screen: `POST /api/identity/init` fires → identity card appears: phone number, email, payment status, permissions, audit log.*

**Maxence:**

"The agent never touches your credentials. It gets one scoped token. That token is its identity. Everything it does flows through that identity — permissioned, logged, and revocable."

**Ecem:**

"You set the boundaries. The agent acts within them. And if you need to stop it — one call and the identity is gone."

*Screen: token + kill switch side by side.*

---

### 1:10–2:10 — Live Demo

**Ecem:**

"Let me show you what an agent with an identity can do."

*Prompt on screen:*

```
Find a hairdresser in Paris near Le Marais.
Call them and ask if they have an appointment available this afternoon.
Route the call to my phone for this demo.
```

**Maxence:**

"It is not writing a plan. It is executing one."

*Screen: phone tool call fires. Phone rings.*

**Teammate**, as hairdresser:

"Bonjour, yes, we have one appointment at 4:30."

**Ecem**, reacting:

"The agent did not just answer. It reached out."

*Beat. Let it land.*

**Maxence:**

"Here is the audit log. The identity, the action, the permission check — all recorded."

*Screen: `phone.call — identity: agent_paris_01 — allowed`.*

---

### 2:10–2:50 — The Real Vision

**Ecem:**

"Now imagine not one call — a whole task running over days. One agent with its own identity calls suppliers. Another emails investors. Another books interviews. They wait for real replies. They coordinate. They keep going while you sleep."

*Screen: task queue — multiple named agent identities, each active on a different step.*

**Maxence:**

"ChatGPT gives you an answer from what it already knows. Our agents go find out."

**Ecem:**

"That is the difference between a conversation and a workforce."

---

### 2:50–3:10 — Close

**Maxence:**

"Every team building agents hits the same wall: the model is ready, but it has no identity to act through. We remove that wall."

**Ecem:**

"One initialization. One token. Your agent becomes a real worker."

**Both:**

"AI agents should not be trapped in a text box. We give them an identity — so they can finally get things done."

---

## Backup 60-Second Version

"Every person has an identity — a phone, a bank account, an inbox. That's what lets you act in the world. AI agents have none of that. They can think, but they're ghosts.

We give agents an identity. One API call and your agent has its own phone number, its own email, payment access, permissions, and a full audit trail. It never touches your credentials — it acts through a scoped token you control.

Watch: we ask it to call a hairdresser in Paris. It doesn't write a plan. It picks up the phone. [call happens] The agent didn't just answer — it reached out.

Now imagine that at scale. A whole workforce of agents, each with its own identity, calling, paying, booking, coordinating — running for days while you sleep.

ChatGPT gives you an answer from what it knows. Our agents go find out. That's the difference between a conversation and a workforce."

---

## Shot List

1. Camera: both founders — hook.
2. Screen: dashboard of named agent identities.
3. Screen: `POST /api/identity/init` → identity card appears.
4. Screen: scoped token + kill switch.
5. Screen: prompt + phone tool call firing.
6. Phone rings; teammate answers as the hairdresser.
7. Screen: audit log entry.
8. Screen: multiple agent identities running parallel tasks.
9. Camera: final close — both founders.

---

## Key Lines

- "We give agents an identity."
- "Your agent goes from a brain with no hands to a worker with a real presence."
- "The agent did not just answer. It reached out."
- "ChatGPT gives you an answer from what it already knows. Our agents go find out."
- "The difference between a conversation and a workforce."

---

## Do Not Say

- Do not list capabilities more than once — let "identity" carry the meaning.
- Do not use the old product name.
- Do not claim week-long autonomous research is live — frame it as vision.
- Do not go deep on Twilio, Gmail, or payment internals.
- Do not pitch customer discovery as the core product — infrastructure is the product.
