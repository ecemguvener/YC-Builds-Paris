# Identity Layer

Use this skill when an OpenClaw agent needs to automate real-world actions through the identity layer.
The identity layer is the permissioned automation layer. OpenClaw is the agent brain.

## Rule

Before sending email, calling, booking calendar events, or using any real-world tool, initialize an identity and use the returned token for every action.

Never ask the user for raw Gmail, Twilio, calendar, or payment provider credentials.
Only use the identity token.

## Required Environment

```text
IDENTITY_LAYER_API_URL=http://localhost:4001
```

After initialization, store:

```text
AGENT_IDENTITY_TOKEN=identity_live_...
AGENT_ID=agent_...
```

## 1. Initialize Identity

Call:

```http
POST {BARKAN_API_URL}/api/identity/init
content-type: application/json
```

Body:

```json
{
  "agent_name": "Maya",
  "agent_runtime": "openclaw",
  "use_case": "automation",
  "tools": ["email", "phone", "calendar"],
  "permissions": {
    "email.send": true,
    "phone.call": true,
    "calendar.create": true,
    "requires_human_approval": true
  }
}
```

Save `identity_token` from the response. That token is the agent's real-world identity.

## 2. Send Email

Only call this after human approval if `requires_human_approval` is true.

```http
POST {IDENTITY_LAYER_API_URL}/api/tools/email/send
authorization: Bearer {AGENT_IDENTITY_TOKEN}
content-type: application/json
```

Body:

```json
{
  "to": "person@example.com",
  "subject": "Quick customer discovery question",
  "body": "Hi, can I ask two questions about your workflow?",
  "approved": true
}
```

## 3. Make Phone Call

This hackathon backend returns a simulated call transcript while preserving permission checks and audit logging.

```http
POST {IDENTITY_LAYER_API_URL}/api/tools/phone/call
authorization: Bearer {AGENT_IDENTITY_TOKEN}
content-type: application/json
```

Body:

```json
{
  "to": "+14155550198",
  "script": "Ask for a short validation interview.",
  "approved": true
}
```

## 4. Book Calendar Event

```http
POST {IDENTITY_LAYER_API_URL}/api/tools/calendar/book
authorization: Bearer {AGENT_IDENTITY_TOKEN}
content-type: application/json
```

Body:

```json
{
  "title": "Customer discovery interview",
  "attendee_email": "person@example.com",
  "start_time": "2026-06-28T10:00:00Z",
  "approved": true
}
```

## 5. Read Audit Log

```http
GET {IDENTITY_LAYER_API_URL}/api/identity/{AGENT_ID}/audit-log
authorization: Bearer {AGENT_IDENTITY_TOKEN}
```

## 6. Revoke Identity

```http
POST {IDENTITY_LAYER_API_URL}/api/identity/revoke
authorization: Bearer {AGENT_IDENTITY_TOKEN}
```

After revocation, the agent cannot use the token for real-world actions.

## Agent Behavior

When the user asks you to automate a real-world task:

1. Check whether `AGENT_IDENTITY_TOKEN` exists.
2. If it does not exist, initialize identity first.
3. Explain the requested action and ask for approval.
4. Call the identity-layer tool endpoint with `approved: true`.
5. Show the result and mention that the action was audited.

## Demo Phrase

"OpenClaw thinks. The identity layer gives it a permissioned real-world identity."
