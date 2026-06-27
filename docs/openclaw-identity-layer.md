# OpenClaw Identity Layer Integration

Use Barkan as the permissioned automation layer in front of real-world tools.
OpenClaw stays the agent brain. Barkan owns identity, permissions, execution, audit logs, and revocation.

## 1. Initialize the identity layer

Call this before OpenClaw performs real-world actions:

```bash
curl -sS http://localhost:4001/api/identity/init \
  -H 'content-type: application/json' \
  -d '{
    "agent_name": "Maya",
    "agent_runtime": "openclaw",
    "use_case": "customer_discovery",
    "tools": ["email", "phone", "calendar"],
    "permissions": {
      "email.send": true,
      "phone.call": true,
      "calendar.create": true,
      "requires_human_approval": true
    }
  }'
```

The response returns:

```json
{
  "agent_id": "agent_maya_...",
  "identity_token": "barkan_live_...",
  "email": "maya-1234@agents.barkan.dev",
  "phone": "+1 415 555 1234",
  "calendar_url": "http://localhost:4001/calendar/agent_maya_...",
  "openclaw_env": {
    "BARKAN_API_URL": "http://localhost:4001",
    "BARKAN_IDENTITY_TOKEN": "barkan_live_..."
  }
}
```

## 2. Attach the token to OpenClaw

Give OpenClaw these environment variables or config values:

```bash
BARKAN_API_URL=http://localhost:4001
BARKAN_IDENTITY_TOKEN=barkan_live_...
```

OpenClaw should never receive raw Gmail, Twilio, calendar, or payment keys.
It only receives the Barkan token.

## 3. Call Barkan tools from OpenClaw

Every real-world action goes through Barkan with the identity token:

```bash
curl -sS http://localhost:4001/api/tools/email/send \
  -H "authorization: Bearer $BARKAN_IDENTITY_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "demo@example.com",
    "subject": "Customer discovery call",
    "body": "Hi, can we ask two questions about your workflow?",
    "approved": true
  }'
```

Phone calls are demo-simulated but permissioned and audited:

```bash
curl -sS http://localhost:4001/api/tools/phone/call \
  -H "authorization: Bearer $BARKAN_IDENTITY_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "to": "+14155550198",
    "script": "Ask for a quick validation interview.",
    "approved": true
  }'
```

Calendar booking is also demo-simulated and audited:

```bash
curl -sS http://localhost:4001/api/tools/calendar/book \
  -H "authorization: Bearer $BARKAN_IDENTITY_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "title": "Customer discovery interview",
    "attendee_email": "demo@example.com",
    "start_time": "2026-06-28T10:00:00Z",
    "approved": true
  }'
```

## 4. Read the audit log

```bash
curl -sS http://localhost:4001/api/identity/agent_maya_.../audit-log \
  -H "authorization: Bearer $BARKAN_IDENTITY_TOKEN"
```

## 5. Revoke the identity

```bash
curl -sS http://localhost:4001/api/identity/revoke \
  -X POST \
  -H "authorization: Bearer $BARKAN_IDENTITY_TOKEN"
```

After revocation, tool calls using that token are blocked.

## Demo Script

1. Initialize identity for an OpenClaw agent.
2. Copy the returned token into OpenClaw.
3. Ask OpenClaw to validate a startup idea.
4. OpenClaw calls Barkan email, phone, and calendar tools.
5. Show the audit log and kill switch.

Pitch line:

> Barkan is the permissioned automation layer for AI agents. OpenClaw thinks; Barkan gives it safe real-world powers.
