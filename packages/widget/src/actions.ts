export interface WidgetActionChoice {
  label: string;
  recommended?: boolean;
  value: unknown;
}

export interface WidgetActionQuestion {
  message: string;
  choices?: WidgetActionChoice[];
}

export interface WidgetHttpCallResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: unknown;
  error?: string;
}

export interface WidgetGoalConversationEntry {
  role: "user" | "assistant" | "tool";
  text: string;
}

export interface WidgetHttpCall {
  callId?: string;
  taskId?: string;
  itemKey?: string;
  method: string;
  documentedPath: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export interface WidgetExecutedHttpCall {
  httpCall: WidgetHttpCall;
  result: WidgetHttpCallResult;
}

export interface WidgetActionProgress {
  label: string;
}

export interface WidgetActionRunSummary {
  title: string;
  positiveCount: number;
  negativeCount: number;
  hasIssues: boolean;
}

export function buildHttpBatchResultPayload(
  httpBatchResults: WidgetExecutedHttpCall[]
): WidgetHttpCallResult {
  const [firstResult] = httpBatchResults;
  const singleResult = httpBatchResults.length === 1 ? firstResult?.result : null;
  return {
    ok: httpBatchResults.every(({ result }) => result.ok),
    ...(singleResult?.status !== undefined ? { status: singleResult.status } : {}),
    ...(singleResult?.contentType !== undefined ? { contentType: singleResult.contentType } : {}),
    ...(singleResult?.error ? { error: singleResult.error } : {}),
    body: httpBatchResults.map(({ httpCall, result }) => ({
      httpCall: summarizeExecutedHttpCall(httpCall),
      result
    }))
  };
}

export function createGoalRunStateForUserMessage(userMessage: string): Record<string, unknown> {
  return {
    version: 1,
    httpCallCount: 0,
    failedHttpCallCount: 0,
    loadedEndpointDocKeys: []
  };
}

export function buildResultHoldProgressLabel(previousLabel: string | undefined): string {
  const dynamicLabel = previousLabel?.trim().replace(/\.+$/, "").trim();
  if (!dynamicLabel || isFixedActionProgressLabel(dynamicLabel)) {
    return "Running action...";
  }

  return formatActionProgressLabelForDisplay(dynamicLabel) ?? "Running action...";
}

export function formatActionProgressLabelForDisplay(label: string | undefined): string | null {
  const cleaned = label?.trim().replace(/\.+$/, "").trim();
  if (!cleaned) {
    return null;
  }

  return `${cleaned}...`;
}

export function buildActionRunSummary(goalRunState: unknown, finalMessage: string, summaryTitle?: string): WidgetActionRunSummary {
  const counts = inferActionMutationCounts(goalRunState);
  return {
    title: buildActionSummaryTitle(goalRunState, finalMessage, summaryTitle),
    positiveCount: counts.positiveCount,
    negativeCount: counts.negativeCount,
    hasIssues: hasActionRunIssues(goalRunState)
  };
}

export function inferActionMutationCounts(goalRunState: unknown): Pick<WidgetActionRunSummary, "positiveCount" | "negativeCount"> {
  const completedCalls = readCompletedHttpCalls(goalRunState);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const item of completedCalls) {
    if (!readHttpCallResultOk(item)) {
      continue;
    }

    const method = readHttpCallMethod(item).toUpperCase();
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      positiveCount += 1;
    } else if (method === "DELETE") {
      negativeCount += 1;
    }
  }

  return { positiveCount, negativeCount };
}

function isFixedActionProgressLabel(label: string): boolean {
  return new Set(["Thinking", "Creating plan", "Searching documentation", "Finishing up"]).has(label);
}

export type WidgetActionApiResponse =
  | { type: "progress"; goalRunState: unknown; progress: WidgetActionProgress }
  | { type: "ask_user"; message: string; goalRunState: unknown; choices?: WidgetActionChoice[]; questions?: WidgetActionQuestion[]; progress?: WidgetActionProgress }
  | {
      type: "execute";
      goalRunState: unknown;
      httpCall?: WidgetHttpCall;
      httpCalls?: WidgetHttpCall[];
      progress?: WidgetActionProgress;
    }
  | { type: "final"; message: string; summaryTitle?: string; progress?: WidgetActionProgress }
  | { type: "unavailable"; message: string; progress?: WidgetActionProgress };

export async function executeBrowserHttpCall(
  httpCall: WidgetHttpCall,
  fetchImpl: typeof fetch = fetch,
  origin = window.location.origin,
  doc: Document = document
): Promise<WidgetHttpCallResult> {
  let url: string;
  try {
    url = buildActionRequestUrl(httpCall.path, httpCall.query, origin);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  try {
    const hasBody = httpCall.body !== undefined && Object.keys(httpCall.body).length > 0;
    const response = await fetchImpl(url, {
      method: httpCall.method,
      credentials: "include",
      headers: buildActionRequestHeaders(hasBody, doc),
      ...(hasBody ? { body: JSON.stringify(httpCall.body) } : {})
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      body: parseActionResponseBody(text, contentType)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function executeBrowserHttpCallBatch(
  httpCalls: WidgetHttpCall[],
  fetchImpl: typeof fetch = fetch,
  origin = window.location.origin,
  doc: Document = document
): Promise<WidgetExecutedHttpCall[]> {
  return Promise.all(
    httpCalls.map(async (httpCall) => ({
      httpCall,
      result: await executeBrowserHttpCall(httpCall, fetchImpl, origin, doc)
    }))
  );
}

export function appendGoalConversationEntry(
  entries: WidgetGoalConversationEntry[],
  entry: WidgetGoalConversationEntry,
  limit = 30
): WidgetGoalConversationEntry[] {
  const text = redactActionContextText(entry.text).slice(0, 1000).trim();
  if (!text) {
    return entries.slice(-limit);
  }

  return [...entries, { role: entry.role, text }].slice(-limit);
}

export function summarizeActionChoice(choice: WidgetActionChoice): string {
  return `selected: ${choice.label}${choice.value === undefined ? "" : ` (${summarizeUnknown(choice.value)})`}`;
}

export function summarizeHttpCallResult(
  httpCall: WidgetHttpCall,
  result: WidgetHttpCallResult
): string {
  const status = result.status ? ` ${result.status}` : "";
  const detail = result.ok ? summarizeUnknown(result.body) : result.error || summarizeUnknown(result.body);
  return `${httpCall.method.toUpperCase()} ${httpCall.documentedPath} -> ${result.ok ? "ok" : "failed"}${status}${
    detail ? `: ${detail}` : ""
  }`;
}

export function readHttpCallsFromActionResponse(
  response: Extract<WidgetActionApiResponse, { type: "execute" }>
): WidgetHttpCall[] {
  if (Array.isArray(response.httpCalls) && response.httpCalls.length > 0) {
    return response.httpCalls;
  }

  return response.httpCall ? [response.httpCall] : [];
}

function summarizeExecutedHttpCall(httpCall: WidgetHttpCall): WidgetHttpCall {
  return {
    ...(httpCall.callId ? { callId: httpCall.callId } : {}),
    ...(httpCall.taskId ? { taskId: httpCall.taskId } : {}),
    ...(httpCall.itemKey ? { itemKey: httpCall.itemKey } : {}),
    method: httpCall.method,
    documentedPath: httpCall.documentedPath,
    path: httpCall.path,
    ...(httpCall.query ? { query: httpCall.query } : {}),
    ...(httpCall.body ? { body: httpCall.body } : {})
  };
}

export function buildActionRequestUrl(
  path: string,
  query: Record<string, unknown> | undefined,
  origin = window.location.origin
): string {
  if (!isSafeSameOriginPath(path)) {
    throw new Error("Action request path is not allowed.");
  }

  const url = new URL(path, origin);
  if (url.origin !== origin) {
    throw new Error("Action request must stay on the current origin.");
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    appendQueryValue(url, key, value);
  }

  return url.toString();
}

export function buildActionRequestHeaders(hasBody: boolean, doc: Document = document): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };

  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  const csrfToken = readCommonCsrfToken(doc);
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
    headers["x-xsrf-token"] = csrfToken;
  }

  return headers;
}

function appendQueryValue(url: URL, key: string, value: unknown) {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }

  if (typeof value === "object") {
    url.searchParams.append(key, JSON.stringify(value));
    return;
  }

  url.searchParams.append(key, String(value));
}

function isSafeSameOriginPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(path)
  );
}

function parseActionResponseBody(text: string, contentType: string): unknown {
  if (!text) {
    return null;
  }

  if (contentType.toLowerCase().includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

function readCompletedHttpCalls(goalRunState: unknown): unknown[] {
  if (!isRecord(goalRunState) || !Array.isArray(goalRunState.completedHttpCalls)) {
    return [];
  }

  return goalRunState.completedHttpCalls;
}

function readHttpCallMethod(item: unknown): string {
  if (!isRecord(item) || !isRecord(item.httpCall) || typeof item.httpCall.method !== "string") {
    return "";
  }

  return item.httpCall.method;
}

function readHttpCallPath(item: unknown): string {
  if (!isRecord(item) || !isRecord(item.httpCall)) {
    return "";
  }

  return typeof item.httpCall.documentedPath === "string"
    ? item.httpCall.documentedPath
    : typeof item.httpCall.path === "string"
      ? item.httpCall.path
      : "";
}

function readHttpCallResultOk(item: unknown): boolean {
  if (!isRecord(item) || !isRecord(item.result)) {
    return false;
  }

  return item.result.ok === true;
}

function hasActionRunIssues(goalRunState: unknown): boolean {
  if (!isRecord(goalRunState)) {
    return false;
  }

  if (readNumber(goalRunState.failedHttpCallCount) > 0) {
    return true;
  }

  if (Array.isArray(goalRunState.failedHttpCalls) && goalRunState.failedHttpCalls.length > 0) {
    return true;
  }

  return readGoalTasks(goalRunState).some((task) => {
    const status = readRecordString(task, "status");
    return status === "failed" || status === "blocked" || status === "partial";
  });
}

function buildActionSummaryTitle(goalRunState: unknown, finalMessage: string, summaryTitle?: string): string {
  const cardTitle = sanitizeActionSummaryTitle(summaryTitle);
  if (cardTitle) {
    return cardTitle;
  }

  const mutationTitle = buildFallbackMutationSummaryTitle(goalRunState);
  if (mutationTitle) {
    return mutationTitle;
  }

  const tasks = readGoalTasks(goalRunState);
  const completedTask = tasks.find((task) => readRecordString(task, "status") === "completed");
  const taskTitle = sanitizeActionSummaryTitle(readRecordString(completedTask, "label"));
  if (taskTitle) {
    return taskTitle;
  }

  const goalPlan = isRecord(goalRunState) && isRecord(goalRunState.goalPlan) ? goalRunState.goalPlan : null;
  const originalUserMessage = sanitizeActionSummaryTitle(readRecordString(goalPlan, "originalUserMessage"));
  return originalUserMessage || sanitizeActionSummaryTitle(finalMessage) || "Completed action";
}

function buildFallbackMutationSummaryTitle(goalRunState: unknown): string {
  const completedCalls = readCompletedHttpCalls(goalRunState).filter(readHttpCallResultOk);
  const mutationGroups = new Map<string, number>();
  const methods = new Set<string>();

  for (const item of completedCalls) {
    const method = readHttpCallMethod(item).toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      continue;
    }
    methods.add(method);
    const resourceName = inferActionResourceName(readHttpCallPath(item));
    mutationGroups.set(resourceName, (mutationGroups.get(resourceName) ?? 0) + 1);
  }

  const resources = [...mutationGroups.entries()]
    .slice(0, 3)
    .map(([resource, count]) => `${count} ${count === 1 ? singularizeResourceName(resource) : resource}`);

  return resources.length > 0 ? `${getFallbackSummaryVerb(methods)} ${resources.join(", ")}` : "";
}

function getFallbackSummaryVerb(methods: Set<string>): string {
  if (methods.size === 1 && methods.has("POST")) {
    return "Created";
  }
  if (methods.size === 1 && methods.has("DELETE")) {
    return "Deleted";
  }
  return "Edited";
}

function inferActionResourceName(path: string): string {
  const segment = path
    .split("?")[0]!
    .split("/")
    .filter((part) => part && !part.startsWith(":") && !part.startsWith("{") && !part.startsWith("["))
    .reverse()
    .find((part) => !/^(api|v\d+|id)$/i.test(part) && !/^\d+$/.test(part) && !/^[a-f0-9]{12,}$/i.test(part));
  return normalizeResourceName(segment || "items");
}

function normalizeResourceName(value: string): string {
  const cleaned = value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return cleaned.endsWith("s") ? cleaned : `${cleaned}s`;
}

function singularizeResourceName(value: string): string {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function sanitizeActionSummaryTitle(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const cleaned = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/^(?:done|all set|completed)[.!,:;-]?\s*/i, "")
    .replace(/^i\s+(?:created|added|edited|updated|renamed|deleted|removed)\b\s*/i, (match) =>
      match.replace(/^i\s+/i, "").replace(/\b\w/, (letter) => letter.toUpperCase())
    )
    .replace(/^i completed:?\s*/i, "")
    .replace(/^i(?:'|’)ve completed:?\s*/i, "")
    .trim();
  if (!cleaned || /^(?:done|all set|completed)$/i.test(cleaned)) {
    return "";
  }

  const firstSentence = takeFirstSentence(cleaned).replace(/[.!?]+$/g, "").trim();
  return firstSentence.length > 96 ? `${firstSentence.slice(0, 93).trimEnd()}...` : firstSentence;
}

function takeFirstSentence(value: string): string {
  const punctuationIndex = [...".!?"]
    .map((punctuation) => value.indexOf(punctuation))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return punctuationIndex === undefined ? value : value.slice(0, punctuationIndex + 1);
}

function readGoalTasks(goalRunState: unknown): Record<string, unknown>[] {
  if (!isRecord(goalRunState) || !isRecord(goalRunState.goalPlan) || !Array.isArray(goalRunState.goalPlan.tasks)) {
    return [];
  }

  return goalRunState.goalPlan.tasks.filter(isRecord);
}

function readRecordString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return "";
  }

  const item = value[key];
  return typeof item === "string" ? item : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readCommonCsrfToken(doc: Document): string {
  const metaToken = [
    "csrf-token",
    "csrf",
    "_csrf",
    "xsrf-token"
  ]
    .map((name) => doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim())
    .find(Boolean);
  if (metaToken) {
    return metaToken;
  }

  const csrfCookie = doc.cookie
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      return separatorIndex >= 0
        ? [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)] as const
        : [part, ""] as const;
    })
    .find(([name]) => /^(xsrf-token|csrf-token|csrftoken|csrf_token|csrf)$/i.test(name));

  return csrfCookie ? decodeURIComponent(csrfCookie[1]) : "";
}

function summarizeUnknown(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = typeof value === "string" ? value : JSON.stringify(redactSecretValues(value));
  return redactActionContextText(text).replace(/\s+/g, " ").slice(0, 240);
}

function redactSecretValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 8).map(redactSecretValues);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isSecretKey(key) ? "[redacted]" : redactSecretValues(item)
    ])
  );
}

function redactActionContextText(text: string): string {
  return text
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[redacted]")
    .replace(/\b([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g, "[redacted]")
    .replace(
      /\b(password|token|api[_-]?key|authorization|cookie)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
      "$1: [redacted]"
    );
}

function isSecretKey(key: string): boolean {
  return /password|token|api_?key|apikey|authorization|cookie/i.test(key);
}
