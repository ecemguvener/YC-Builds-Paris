import type { AppConfig } from "./config.js";

const callConversationGuidance =
  "Call naturally and keep the conversation moving. Do not repeatedly ask for confirmation; only confirm final details that affect the outcome, like time, price, address, availability, or cancellation policy.";

export interface PhoneCallRequest {
  toNumber: string;
  task: string;
  callerName: string;
  agentIdentityName: string;
  recipientName?: string | null;
  context?: string | null;
  sourceUrl?: string | null;
}

export interface PhoneCallResult {
  ok: boolean;
  provider: "elevenlabs" | "mock-elevenlabs";
  simulated: boolean;
  callId: string;
  toNumber: string;
  agentIdentityName: string;
  task: string;
  status: string;
  detail: string;
}

export class PhoneCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneCallError";
  }
}

export async function placeAgentPhoneCall(request: PhoneCallRequest, config: AppConfig): Promise<PhoneCallResult> {
  const toNumber = normalizePhoneNumber(request.toNumber);
  if (!toNumber) {
    throw new PhoneCallError("The phone number must be an E.164-style number, for example +14155550198.");
  }

  const task = request.task.trim();
  if (!task) {
    throw new PhoneCallError("The call task cannot be empty.");
  }

  if (!config.ELEVENLABS_API_KEY || !config.ELEVENLABS_AGENT_ID || !config.ELEVENLABS_AGENT_PHONE_NUMBER_ID) {
    return {
      ok: true,
      provider: "mock-elevenlabs",
      simulated: true,
      callId: `mock_call_${Date.now().toString(36)}`,
      toNumber,
      agentIdentityName: request.agentIdentityName,
      task,
      status: "queued",
      detail:
        "Mock call queued. Set ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_AGENT_PHONE_NUMBER_ID to place a real outbound ElevenLabs call."
    };
  }

  const callBrief = buildPersonalAssistantCallBrief(request, task);
  const upstreamResponse = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": config.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      agent_id: config.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: config.ELEVENLABS_AGENT_PHONE_NUMBER_ID,
      to_number: toNumber,
      conversation_initiation_client_data: {
        type: "conversation_initiation_client_data",
        dynamic_variables: {
          agent_identity_name: request.agentIdentityName,
          recipient_name: request.recipientName?.trim() || "the person who answers",
          task,
          call_opening: callBrief.firstMessage,
          call_guidance: callConversationGuidance,
          context: buildCallContext(request.context),
          source_url: request.sourceUrl?.trim() || ""
        }
      }
    })
  });

  const responseText = await upstreamResponse.text();
  let responseJson: Record<string, unknown> = {};
  try {
    responseJson = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
  } catch {
    responseJson = {};
  }

  if (!upstreamResponse.ok) {
    const detail = typeof responseJson.detail === "string"
      ? responseJson.detail
      : typeof responseJson.message === "string"
        ? responseJson.message
        : responseText.slice(0, 500) || "ElevenLabs outbound call failed.";
    throw new PhoneCallError(detail);
  }

  return {
    ok: true,
    provider: "elevenlabs",
    simulated: false,
    callId: readString(responseJson.conversation_id) || readString(responseJson.call_id) || `call_${Date.now().toString(36)}`,
    toNumber,
    agentIdentityName: request.agentIdentityName,
    task,
    status: readString(responseJson.status) || "started",
    detail: "ElevenLabs outbound call started."
  };
}

function buildCallContext(context: string | null | undefined): string {
  const trimmedContext = context?.trim();
  return [trimmedContext, callConversationGuidance].filter(Boolean).join("\n\n");
}

function buildPersonalAssistantCallBrief(
  request: PhoneCallRequest,
  task: string
): { firstMessage: string } {
  const callerName = request.callerName.trim() || request.agentIdentityName.trim() || "the account owner";
  const firstMessage = `Hi, I'm calling on behalf of ${callerName}. ${buildNaturalRequest(task, request.recipientName)}`;

  return { firstMessage };
}

function buildNaturalRequest(task: string, recipientName: string | null | undefined): string {
  const trimmed = task.trim().replace(/[.!?]+$/g, "");
  const withoutPlease = trimmed.replace(/^please\s+/i, "");
  const directCallPhrase = withoutPlease.match(/^(?:i\s+need\s+to|i\s+want\s+to|the\s+goal\s+is\s+to)\s+(.+)$/i);
  const request = stripOutboundCallWrapper(directCallPhrase?.[1] ?? withoutPlease, recipientName);
  const firstWord = request.split(/\s+/, 1)[0] ?? "";

  if (/^(?:i\s+am|i'm)\s+calling\b/i.test(request)) {
    return punctuate(capitalizeFirst(request));
  }

  if (/^(can|could|would|is|are|do|does|did|will|has|have)\b/i.test(firstWord)) {
    return punctuate(`I'm calling to ask if ${questionToStatement(request)}`);
  }

  if (/^(ask|book|cancel|change|check|confirm|contact|find|get|invite|move|order|propose|request|reserve|schedule|see|tell|try|update)\b/i.test(firstWord)) {
    return punctuate(`I'm calling to ${lowercaseFirst(request)}`);
  }

  return punctuate(`I'm calling about ${lowercaseFirst(request)}`);
}

function stripOutboundCallWrapper(value: string, recipientName: string | null | undefined): string {
  const callWrapperMatch = value.match(/^(?:call|phone|ring|contact|reach\s+out\s+to)\s+(.+?)(?:\s+(?:and|to)\s+(.+))$/i);
  if (callWrapperMatch?.[2]) {
    return callWrapperMatch[2].trim();
  }

  if (/^(?:call|phone|ring|contact|reach\s+out\s+to)\b/i.test(value)) {
    const recipient = recipientName?.trim() || "the recipient";
    return `speak with ${recipient} about the user's request`;
  }

  return value;
}

function lowercaseFirst(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

function capitalizeFirst(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function questionToStatement(value: string): string {
  const words = value.split(/\s+/);
  const auxiliary = words[0]?.toLowerCase() ?? "";
  const subject = words[1]?.toLowerCase() ?? "";
  const rest = words.slice(2).join(" ");

  if (!subject || !rest) {
    return lowercaseFirst(value);
  }

  if (/^(can|could|would|will|has|have)$/.test(auxiliary)) {
    return `${subject} ${auxiliary} ${rest}`;
  }

  if (/^(is|are)$/.test(auxiliary)) {
    return `${subject} ${auxiliary} ${rest}`;
  }

  if (/^(do|did)$/.test(auxiliary)) {
    return `${subject} ${rest}`;
  }

  if (auxiliary === "does") {
    const normalizedRest = rest.replace(/^have\b/i, "has");
    return `${subject} ${normalizedRest}`;
  }

  return lowercaseFirst(value);
}

function punctuate(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function normalizePhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^00/, "+")
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");

  if (/^\+\d{7,15}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{7,15}$/.test(normalized)) {
    return `+${normalized}`;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
