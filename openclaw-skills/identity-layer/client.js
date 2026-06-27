const DEFAULT_API_URL = "http://localhost:4001";

export async function initializeIdentityLayer({
  apiUrl = process.env.IDENTITY_LAYER_API_URL || DEFAULT_API_URL,
  agentName,
  useCase = "automation",
  tools = ["email", "phone", "calendar"],
  requiresHumanApproval = true
}) {
  const response = await fetch(`${apiUrl}/api/identity/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent_name: agentName,
      agent_runtime: "openclaw",
      use_case: useCase,
      tools,
      permissions: {
        "email.send": tools.includes("email"),
        "phone.call": tools.includes("phone"),
        "calendar.create": tools.includes("calendar"),
        requires_human_approval: requiresHumanApproval
      }
    })
  });

  return readJsonResponse(response);
}

export async function sendIdentityEmail({
  apiUrl = process.env.IDENTITY_LAYER_API_URL || DEFAULT_API_URL,
  token = process.env.AGENT_IDENTITY_TOKEN,
  to,
  subject,
  body,
  approved = true
}) {
  return barkanToolRequest(apiUrl, token, "/api/tools/email/send", {
    to,
    subject,
    body,
    approved
  });
}

export async function callIdentityPhone({
  apiUrl = process.env.IDENTITY_LAYER_API_URL || DEFAULT_API_URL,
  token = process.env.AGENT_IDENTITY_TOKEN,
  to,
  script,
  approved = true
}) {
  return barkanToolRequest(apiUrl, token, "/api/tools/phone/call", {
    to,
    script,
    approved
  });
}

export async function bookIdentityCalendar({
  apiUrl = process.env.IDENTITY_LAYER_API_URL || DEFAULT_API_URL,
  token = process.env.AGENT_IDENTITY_TOKEN,
  title,
  attendeeEmail,
  startTime,
  approved = true
}) {
  return barkanToolRequest(apiUrl, token, "/api/tools/calendar/book", {
    title,
    attendee_email: attendeeEmail,
    start_time: startTime,
    approved
  });
}

export async function getIdentityAuditLog({
  apiUrl = process.env.IDENTITY_LAYER_API_URL || DEFAULT_API_URL,
  token = process.env.AGENT_IDENTITY_TOKEN,
  agentId = process.env.AGENT_ID
}) {
  if (!agentId) {
    throw new Error("AGENT_ID is required");
  }

  const response = await fetch(`${apiUrl}/api/identity/${agentId}/audit-log`, {
    headers: { authorization: `Bearer ${requireToken(token)}` }
  });

  return readJsonResponse(response);
}

export async function revokeIdentityLayer({
  apiUrl = process.env.IDENTITY_LAYER_API_URL || DEFAULT_API_URL,
  token = process.env.AGENT_IDENTITY_TOKEN
} = {}) {
  const response = await fetch(`${apiUrl}/api/identity/revoke`, {
    method: "POST",
    headers: { authorization: `Bearer ${requireToken(token)}` }
  });

  return readJsonResponse(response);
}

async function barkanToolRequest(apiUrl, token, path, payload) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireToken(token)}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || json.error || `Identity layer request failed with ${response.status}`);
  }

  return json;
}

function requireToken(token) {
  if (!token) {
    throw new Error("AGENT_IDENTITY_TOKEN is required");
  }

  return token;
}
