export interface ConnectRequest {
  apiKey: string;
  apiBaseUrl: string;
  fetchImplementation?: typeof fetch;
}

export interface AtlasSourceFileChunk {
  path: string;
  chunk_index: number;
  chunk_count: number;
  content: string;
}

export interface AtlasFileSelectionResponse {
  ok: true;
  selected_files: string[];
  context_files: string[];
  backend_selected_files: string[];
  backend_context_files: string[];
  token_usage: AtlasTokenUsage;
}

export interface AtlasRouteMapDocument {
  version: 1;
  project_id: string;
  generated_at: string;
  source_files: string[];
  routes: Array<{
    path: string;
    summary: string;
  }>;
}

export interface AtlasBackendEndpointField {
  type: string;
  required: boolean;
  enum?: string[];
  allowedValues?: string[];
}

export type AtlasBackendEndpointFieldMap = Record<string, AtlasBackendEndpointField>;

export interface AtlasBackendEndpointRequest {
  params?: AtlasBackendEndpointFieldMap;
  query?: AtlasBackendEndpointFieldMap;
  body?: AtlasBackendEndpointFieldMap;
}

export interface AtlasBackendInventoryDocument {
  version: 1;
  project_id: string;
  generated_at: string;
  source_files: string[];
  endpoints: Array<{
    method: string;
    path: string;
    summary: string;
    auth: string;
    request: AtlasBackendEndpointRequest;
    response: {
      success: string;
      errors: string[];
    };
  }>;
}

export interface AtlasTokenUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
  total_tokens: number;
  pricing?: {
    model: string;
    input_usd: number;
    cached_input_usd: number;
    output_usd: number;
    total_usd: number;
  } | null;
}

export interface AtlasRouteBatchResponse {
  ok: true;
  documentation: AtlasRouteMapDocument;
  token_usage: AtlasTokenUsage;
}

export interface AtlasBackendBatchResponse {
  ok: true;
  documentation: AtlasBackendInventoryDocument;
  token_usage: AtlasTokenUsage;
}

export interface ConnectResponse {
  ok: true;
  user: {
    id: string;
    email: string;
  };
  site: {
    id: string;
    name: string;
    domain: string;
  } | null;
  project: {
    id: string;
    name: string;
  };
}

export interface AgentStatusResponse {
  ok: true;
  project: {
    id: string;
    name: string;
  };
  agent: {
    connected: boolean;
    connectedAt: string | null;
  };
}

export async function connectToBarkan({
  apiKey,
  apiBaseUrl,
  fetchImplementation = fetch
}: ConnectRequest): Promise<ConnectResponse> {
  const response = await fetchImplementation(`${stripTrailingSlash(apiBaseUrl)}/api/atlas/connect`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }

  if (!isConnectResponse(payload)) {
    throw new Error("Barkan API returned an invalid connect response");
  }

  return payload;
}

export async function getBarkanAgentStatus({
  apiKey,
  apiBaseUrl,
  fetchImplementation = fetch
}: ConnectRequest): Promise<AgentStatusResponse> {
  const response = await fetchImplementation(`${stripTrailingSlash(apiBaseUrl)}/api/atlas/agent/status`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey}`
    }
  });

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }

  if (!isAgentStatusResponse(payload)) {
    throw new Error("Barkan API returned an invalid agent status response");
  }

  return payload;
}

export async function selectAtlasFiles({
  apiKey,
  apiBaseUrl,
  projectId,
  filePaths,
  fetchImplementation = fetch
}: {
  apiKey: string;
  apiBaseUrl: string;
  projectId: string;
  filePaths: string[];
  fetchImplementation?: typeof fetch;
}): Promise<AtlasFileSelectionResponse> {
  const response = await fetchImplementation(`${stripTrailingSlash(apiBaseUrl)}/api/atlas/agent/select-files`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      project_id: projectId,
      file_paths: filePaths
    })
  });

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }

  if (!isAtlasFileSelectionResponse(payload)) {
    throw new Error("Barkan API returned an invalid atlas file selection response");
  }

  return payload;
}

export async function generateAtlasRouteBatch({
  apiKey,
  apiBaseUrl,
  projectId,
  files,
  fetchImplementation = fetch
}: {
  apiKey: string;
  apiBaseUrl: string;
  projectId: string;
  files: AtlasSourceFileChunk[];
  fetchImplementation?: typeof fetch;
}): Promise<AtlasRouteBatchResponse> {
  const response = await fetchImplementation(`${stripTrailingSlash(apiBaseUrl)}/api/atlas/agent/generate-route-batch`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      project_id: projectId,
      files
    })
  });

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }

  if (!isAtlasRouteBatchResponse(payload)) {
    throw new Error("Barkan API returned an invalid atlas route batch response");
  }

  return payload;
}

export async function generateAtlasBackendBatch({
  apiKey,
  apiBaseUrl,
  projectId,
  files,
  fetchImplementation = fetch
}: {
  apiKey: string;
  apiBaseUrl: string;
  projectId: string;
  files: AtlasSourceFileChunk[];
  fetchImplementation?: typeof fetch;
}): Promise<AtlasBackendBatchResponse> {
  const response = await fetchImplementation(`${stripTrailingSlash(apiBaseUrl)}/api/atlas/agent/generate-backend-batch`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      project_id: projectId,
      files
    })
  });

  const responseText = await response.text();
  const payload = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status));
  }

  if (!isAtlasBackendBatchResponse(payload)) {
    throw new Error("Barkan API returned an invalid atlas backend batch response");
  }

  return payload;
}

function isConnectResponse(value: unknown): value is ConnectResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as ConnectResponse;
  return (
    response.ok === true &&
    Boolean(response.user) &&
    typeof response.user.id === "string" &&
    typeof response.user.email === "string" &&
    Boolean(response.project) &&
    typeof response.project.id === "string" &&
    typeof response.project.name === "string" &&
    (response.site === null ||
      (Boolean(response.site) &&
        typeof response.site.id === "string" &&
        typeof response.site.name === "string" &&
        typeof response.site.domain === "string"))
  );
}

function isAgentStatusResponse(value: unknown): value is AgentStatusResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as AgentStatusResponse;
  return (
    response.ok === true &&
    Boolean(response.project) &&
    typeof response.project.id === "string" &&
    typeof response.project.name === "string" &&
    Boolean(response.agent) &&
    typeof response.agent.connected === "boolean" &&
    (response.agent.connectedAt === null || typeof response.agent.connectedAt === "string")
  );
}

function isAtlasFileSelectionResponse(value: unknown): value is AtlasFileSelectionResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as AtlasFileSelectionResponse;
  return (
    response.ok === true &&
    Array.isArray(response.selected_files) &&
    response.selected_files.every((filePath) => typeof filePath === "string") &&
    Array.isArray(response.context_files) &&
    response.context_files.every((filePath) => typeof filePath === "string") &&
    Array.isArray(response.backend_selected_files) &&
    response.backend_selected_files.every((filePath) => typeof filePath === "string") &&
    Array.isArray(response.backend_context_files) &&
    response.backend_context_files.every((filePath) => typeof filePath === "string") &&
    isAtlasTokenUsage(response.token_usage)
  );
}

function isAtlasRouteBatchResponse(value: unknown): value is AtlasRouteBatchResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as AtlasRouteBatchResponse;
  return response.ok === true && isAtlasRouteMapDocument(response.documentation) && isAtlasTokenUsage(response.token_usage);
}

function isAtlasBackendBatchResponse(value: unknown): value is AtlasBackendBatchResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as AtlasBackendBatchResponse;
  return response.ok === true && isAtlasBackendInventoryDocument(response.documentation) && isAtlasTokenUsage(response.token_usage);
}

function isAtlasRouteMapDocument(value: unknown): value is AtlasRouteMapDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const document = value as AtlasRouteMapDocument;
  return (
    document.version === 1 &&
    typeof document.project_id === "string" &&
    typeof document.generated_at === "string" &&
    Array.isArray(document.source_files) &&
    document.source_files.every((filePath) => typeof filePath === "string") &&
    Array.isArray(document.routes) &&
    document.routes.every((route) => (
      route &&
      typeof route === "object" &&
      typeof route.path === "string" &&
      typeof route.summary === "string"
    ))
  );
}

function isAtlasBackendInventoryDocument(value: unknown): value is AtlasBackendInventoryDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const document = value as AtlasBackendInventoryDocument;
  return (
    document.version === 1 &&
    typeof document.project_id === "string" &&
    typeof document.generated_at === "string" &&
    Array.isArray(document.source_files) &&
    document.source_files.every((filePath) => typeof filePath === "string") &&
    Array.isArray(document.endpoints) &&
    document.endpoints.every(isAtlasBackendEndpoint)
  );
}

function isAtlasBackendEndpoint(value: unknown): value is AtlasBackendInventoryDocument["endpoints"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const endpoint = value as AtlasBackendInventoryDocument["endpoints"][number];
  return (
    typeof endpoint.method === "string" &&
    typeof endpoint.path === "string" &&
    typeof endpoint.summary === "string" &&
    typeof endpoint.auth === "string" &&
    isAtlasBackendEndpointRequest(endpoint.request) &&
    Boolean(endpoint.response) &&
    typeof endpoint.response === "object" &&
    typeof endpoint.response.success === "string" &&
    Array.isArray(endpoint.response.errors) &&
    endpoint.response.errors.every((error) => typeof error === "string")
  );
}

function isAtlasBackendEndpointRequest(value: unknown): value is AtlasBackendEndpointRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as AtlasBackendEndpointRequest;
  return (
    isOptionalBackendFieldMap(request.params) &&
    isOptionalBackendFieldMap(request.query) &&
    isOptionalBackendFieldMap(request.body)
  );
}

function isOptionalBackendFieldMap(value: unknown): value is AtlasBackendEndpointFieldMap | undefined {
  if (value === undefined) {
    return true;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((field) => (
    Boolean(field) &&
    typeof field === "object" &&
    !Array.isArray(field) &&
    typeof (field as AtlasBackendEndpointField).type === "string" &&
    typeof (field as AtlasBackendEndpointField).required === "boolean" &&
    ((field as AtlasBackendEndpointField).enum === undefined ||
      (Array.isArray((field as AtlasBackendEndpointField).enum) &&
        (field as AtlasBackendEndpointField).enum?.every((enumValue) => typeof enumValue === "string"))) &&
    ((field as AtlasBackendEndpointField).allowedValues === undefined ||
      (Array.isArray((field as AtlasBackendEndpointField).allowedValues) &&
        (field as AtlasBackendEndpointField).allowedValues?.every((allowedValue) => typeof allowedValue === "string")))
  ));
}

function isAtlasTokenUsage(value: unknown): value is AtlasTokenUsage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const usage = value as AtlasTokenUsage;
  return (
    typeof usage.input_tokens === "number" &&
    (usage.cached_input_tokens === undefined || typeof usage.cached_input_tokens === "number") &&
    typeof usage.output_tokens === "number" &&
    typeof usage.total_tokens === "number" &&
    (usage.pricing === undefined || usage.pricing === null || isAtlasTokenPricing(usage.pricing))
  );
}

function isAtlasTokenPricing(value: unknown): value is NonNullable<AtlasTokenUsage["pricing"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pricing = value as NonNullable<AtlasTokenUsage["pricing"]>;
  return (
    typeof pricing.model === "string" &&
    typeof pricing.input_usd === "number" &&
    typeof pricing.cached_input_usd === "number" &&
    typeof pricing.output_usd === "number" &&
    typeof pricing.total_usd === "number"
  );
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function parseJsonResponse(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readApiError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return `Barkan API request failed with status ${status}`;
}
