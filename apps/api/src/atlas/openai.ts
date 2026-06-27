import type { AppConfig } from "../config.js";
import type { AtlasRouteMapDocument } from "./route-map.js";
import { calculateOpenAIPricing, type OpenAIPricingBreakdown } from "../openai-pricing.js";
import type {
  AtlasBackendEndpoint,
  AtlasBackendEndpointField,
  AtlasBackendEndpointFieldMap,
  AtlasBackendEndpointRequest,
  AtlasBackendInventoryDocument
} from "./backend-inventory.js";

export interface AtlasTokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  pricing: OpenAIPricingBreakdown | null;
}

export interface AtlasSourceFileChunk {
  path: string;
  chunk_index: number;
  chunk_count: number;
  content: string;
}

export interface AtlasFileSelectionResult {
  selectedFiles: string[];
  contextFiles: string[];
  backendSelectedFiles: string[];
  backendContextFiles: string[];
  tokenUsage: AtlasTokenUsage;
}

export interface AtlasRouteMapRequest {
  projectId: string;
  files: AtlasSourceFileChunk[];
}

export interface AtlasRouteMapResult {
  documentation: AtlasRouteMapDocument;
  token_usage: AtlasTokenUsage;
}

export interface AtlasBackendInventoryRequest {
  projectId: string;
  files: AtlasSourceFileChunk[];
}

export interface AtlasBackendInventoryResult {
  documentation: AtlasBackendInventoryDocument;
  token_usage: AtlasTokenUsage;
}

const atlasDocumentationFileSelectionPrompt = `
you are barkan atlas, a documentation source-file explorer for web apps.

select the smallest useful set of files for two separate documentation jobs:
1. frontend route documentation
2. backend endpoint inventory for future action mode

frontend route documentation:
- selected_files should contain files that prove real user-visible frontend routes
- context_files should contain only page, layout, or view files directly tied to proven frontend routes and useful for summarizing those pages
- client router declarations, route arrays, route objects, createBrowserRouter/createRouter configs, React Router routes, Vue/Svelte/Angular route configs
- framework route/page files such as Next.js app/page files, pages directory files, Remix routes, TanStack route files, SvelteKit pages, Nuxt pages, or Astro pages
- frontend app shells, layouts, redirects, and navigation definitions only when they help identify real browser routes
- server files only when they clearly render or serve frontend HTML pages for the web app
- do not infer "/notifications" from a Notifications component unless a frontend router/page convention proves that URL exists

backend endpoint inventory:
- backend_selected_files should contain backend route/controller/handler files, route registration files, request validation schemas, model/schema/type files that define params/query/body objects, database model/schema files, service files that define endpoint behavior, and server-side API modules
- backend_context_files should contain frontend API clients, fetch wrappers, SDK wrappers, generated route clients, shared request/response types, validation schemas, database schema/model definitions, and enum/constant files that clarify app-facing endpoint usage
- include app-facing APIs Barkan could call for user actions, including useful GET/list/search/read endpoints needed to understand or perform actions
- include auth/session endpoints only when they are app-facing and used by the frontend
- exclude health, diagnostics, token issuance, speech/widget infrastructure, streaming, webhook, local-agent bridge, debug, static asset, and internal-only endpoints

hard exclusions:
- do not select generic frontend components, widgets, cards, tabs, dialogs, panels, visual-only UI, hooks, stores, tests, mocks, or utilities unless they are frontend API clients or shared endpoint schemas
- do not select seed files, reference-data files, build outputs, generated files, tests, lockfiles, binary assets, fonts, images, or videos

when uncertain whether a file is useful for either documentation job, omit it.

return only strict json:
{"selected_files":["path/from/root.tsx"],"context_files":[],"backend_selected_files":["api/tasks.ts"],"backend_context_files":["src/api/tasks.ts"]}
`.trim();

const atlasRouteMapPrompt = `
you are barkan atlas, a frontend route documentation generator for web apps.

create a short global map of real user-visible frontend routes only. it is not a component inventory, but each route summary must say what a visitor can access or do there.

a route qualifies only when the source shows that the browser can navigate to that path and render a frontend page, screen, layout, or routed view. valid evidence includes client router declarations, framework page/route files, app-router layouts/pages, frontend redirects, or server-side HTML/page rendering for the frontend app.

hard exclusions:
- do not document backend endpoints, API routes, RPC routes, mutation/action paths, webhooks, token routes, websocket/SSE routes, data loaders, or server handlers
- do not document paths used only in fetch calls, form actions, SDK calls, backend clients, or worker/server code
- do not turn component names, folders, filenames, nav labels, tabs, dialogs, panels, cards, or dashboard widgets into routes
- if a component like notifications appears inside /dashboard, document it only as part of the /dashboard summary unless a frontend router explicitly defines /notifications
- endpoint-like paths such as "/:application/:wall/move" are not frontend routes unless the source clearly proves they render a user-facing frontend page
- do not invent routes from filenames alone unless the framework convention makes the route obvious
- if uncertain, omit the route

rules:
- return an empty routes array when the provided source does not prove any real frontend route
- one entry per actual browser route pattern, such as "/", "/dashboard", "/settings/:id"
- path must be the actual frontend route pattern
- summary must be one concise sentence explaining what the visitor can see, access, create, edit, configure, or manage there
- mention major page-level workflows when they define why a visitor would go to that route
- keep nested widgets, sections, tabs, and modals in the parent route summary rather than creating separate routes
- do not document every individual button, card, component, internal function, or backend API endpoint
- keep the map synthetic and small

return only strict json:
{
  "routes": [
    { "path": "/", "summary": "Landing page with product explanation and sign in or sign up entry points." }
  ]
}
`.trim();

const atlasBackendInventoryPrompt = `
you are barkan atlas, a backend endpoint inventory generator for web apps.

create a simple inventory of app-facing backend endpoints that Barkan could use for future action mode. include useful GET/list/search/read endpoints because they can provide lookup context for actions.

include only endpoints that are part of the customer app's backend API and are relevant to frontend app behavior. app-facing auth/session endpoints are allowed when the frontend uses them.

hard exclusions:
- do not document health checks, diagnostics, token issuance, speech/widget infrastructure, OpenAI proxy routes, TTS/STT routes, streaming routes, webhooks, static assets, local-agent bridges, debug routes, or internal-only plumbing
- do not document backend helper functions, database methods, services, frontend-only routes, or files with no endpoint definition
- do not invent endpoints from fetch calls unless the backend source or route registration proves the endpoint exists
- if the source does not prove any app-facing backend endpoint, return an empty endpoints array

rules:
- one entry per real backend HTTP endpoint
- method must be uppercase, such as "GET", "POST", "PATCH", "PUT", or "DELETE"
- path must be the actual backend path pattern, such as "/api/tasks", "/api/tasks/:taskId", or "/api/projects/:projectId/tasks"
- summary must explicitly define what the endpoint does for the app user in one to three sentences; include the main action, important scope/filtering behavior, and notable returned or changed resource when proven by source
- auth must be a short phrase such as "requires user session cookie", "requires bearer API key", or "public"
- request may include params, query, and body only when those sections have fields
- every request field must include type and required, such as { "type": "string", "required": true }
- type must be specific when the source proves it, such as "string", "number", "boolean", "ObjectId string", "ISO date string", "array of strings", or an object shape summary
- for params, query, and body, use model/schema/type files when available so field types describe the clear request model
- for simple nested objects, keep the field as one entry and describe the object shape in type, including nested enum values when they are proven
- when validation schemas, TypeScript unions/enums, database schema enum constraints, or constants prove a closed set of possible values, add enum with those exact values
- infer enum from database model/schema files as well as request validators, shared types, constants, and frontend API clients; omit enum when the set is not closed or not proven by source
- do not use seed/reference data as proof for enum values
- response.success must describe the success status and returned shape
- response.errors must list likely status/error cases visible from the source

return only strict json:
{
  "endpoints": [
    {
      "method": "POST",
      "path": "/api/tasks",
      "summary": "Creates a task for the signed-in user. The task is saved with the provided title, optional due date, project, and category. It returns the created task object.",
      "auth": "requires user session cookie",
      "request": {
        "body": {
          "title": { "type": "string", "required": true },
          "dueDate": { "type": "YYYY-MM-DD", "required": false },
          "projectId": { "type": "string", "required": false },
          "category": { "type": "string", "required": true, "enum": ["bug", "feature", "chore"] }
        }
      },
      "response": {
        "success": "201 with created task object",
        "errors": ["400 invalid body", "401 unauthenticated"]
      }
    }
  ]
}
`.trim();

const atlasFileSelectionSchema = {
  type: "object",
  properties: {
    selected_files: {
      type: "array",
      items: { type: "string" }
    },
    context_files: {
      type: "array",
      items: { type: "string" }
    },
    backend_selected_files: {
      type: "array",
      items: { type: "string" }
    },
    backend_context_files: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["selected_files", "context_files", "backend_selected_files", "backend_context_files"],
  additionalProperties: false
};

const atlasRouteMapSchema = {
  type: "object",
  properties: {
    routes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          summary: { type: "string" }
        },
        required: ["path", "summary"],
        additionalProperties: false
      }
    }
  },
  required: ["routes"],
  additionalProperties: false
};

const atlasBackendEndpointFieldSchema = {
  type: "object",
  properties: {
    type: { type: "string" },
    required: { type: "boolean" },
    enum: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["type", "required"],
  additionalProperties: false
};

const atlasBackendEndpointFieldMapSchema = {
  type: "object",
  additionalProperties: atlasBackendEndpointFieldSchema
};

const atlasBackendEndpointRequestSchema = {
  type: "object",
  properties: {
    params: atlasBackendEndpointFieldMapSchema,
    query: atlasBackendEndpointFieldMapSchema,
    body: atlasBackendEndpointFieldMapSchema
  },
  additionalProperties: false
};

const atlasBackendInventorySchema = {
  type: "object",
  properties: {
    endpoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          method: { type: "string" },
          path: { type: "string" },
          summary: { type: "string" },
          auth: { type: "string" },
          request: atlasBackendEndpointRequestSchema,
          response: {
            type: "object",
            properties: {
              success: { type: "string" },
              errors: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["success", "errors"],
            additionalProperties: false
          }
        },
        required: ["method", "path", "summary", "auth", "request", "response"],
        additionalProperties: false
      }
    }
  },
  required: ["endpoints"],
  additionalProperties: false
};

export function buildAtlasFileSelectionRequestBody(
  config: AppConfig,
  filePaths: string[]
): Record<string, unknown> {
  return buildOpenAIJsonRequest({
    model: config.OPENAI_ATLAS_MODEL,
    instructions: atlasDocumentationFileSelectionPrompt,
    name: "atlas_route_file_selection",
    schema: atlasFileSelectionSchema,
    maxOutputTokens: 8192,
    inputText: `select frontend route-map and backend endpoint-inventory source files from this project file path list.

file_paths:
${JSON.stringify(filePaths)}`
  });
}

export async function selectAtlasDocumentationFiles(
  config: AppConfig,
  filePaths: string[],
  fetchImplementation: typeof fetch = fetch
): Promise<AtlasFileSelectionResult> {
  if (!config.OPENAI_API_KEY) {
    throw new Error("Atlas AI explorer is not configured");
  }

  const response = await fetchImplementation(buildOpenAIGenerateEndpointUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: JSON.stringify(buildAtlasFileSelectionRequestBody(config, filePaths))
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(readOpenAIError(responseText, response.status));
  }

  const selection = parseAtlasFileSelectionResponse(responseText, filePaths);
  return {
    selectedFiles: selection.selectedFiles,
    contextFiles: selection.contextFiles,
    backendSelectedFiles: selection.backendSelectedFiles,
    backendContextFiles: selection.backendContextFiles,
    tokenUsage: parseAtlasTokenUsage(responseText, config.OPENAI_ATLAS_MODEL)
  };
}

export function buildAtlasRouteMapRequestBody(
  config: AppConfig,
  request: AtlasRouteMapRequest
): Record<string, unknown> {
  return buildOpenAIJsonRequest({
    model: config.OPENAI_ATLAS_MODEL,
    instructions: atlasRouteMapPrompt,
    name: "atlas_route_map",
    schema: atlasRouteMapSchema,
    maxOutputTokens: 12000,
    inputText: `generate the Barkan route map.

project_id:
${request.projectId}

source_file_chunks:
${JSON.stringify(request.files)}`
  });
}

export async function generateAtlasRouteMap(
  config: AppConfig,
  request: AtlasRouteMapRequest,
  fetchImplementation: typeof fetch = fetch
): Promise<AtlasRouteMapResult> {
  if (!config.OPENAI_API_KEY) {
    throw new Error("Atlas AI route map generation is not configured");
  }

  const response = await fetchImplementation(buildOpenAIGenerateEndpointUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: JSON.stringify(buildAtlasRouteMapRequestBody(config, request))
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(readOpenAIError(responseText, response.status));
  }

  const parsed = parseAtlasRouteMapResponse(responseText);
  return {
    documentation: {
      version: 1,
      project_id: request.projectId,
      generated_at: new Date().toISOString(),
      source_files: uniqueStrings(request.files.map((file) => file.path)),
      routes: parsed.routes
    },
    token_usage: parseAtlasTokenUsage(responseText, config.OPENAI_ATLAS_MODEL)
  };
}

export function buildAtlasBackendInventoryRequestBody(
  config: AppConfig,
  request: AtlasBackendInventoryRequest
): Record<string, unknown> {
  return buildOpenAIJsonRequest({
    model: config.OPENAI_ATLAS_MODEL,
    instructions: atlasBackendInventoryPrompt,
    name: "atlas_backend_inventory",
    schema: atlasBackendInventorySchema,
    maxOutputTokens: 12000,
    strictSchema: false,
    inputText: `generate the Barkan backend endpoint inventory.

project_id:
${request.projectId}

source_file_chunks:
${JSON.stringify(request.files)}`
  });
}

export async function generateAtlasBackendInventory(
  config: AppConfig,
  request: AtlasBackendInventoryRequest,
  fetchImplementation: typeof fetch = fetch
): Promise<AtlasBackendInventoryResult> {
  if (!config.OPENAI_API_KEY) {
    throw new Error("Atlas AI backend inventory generation is not configured");
  }

  const response = await fetchImplementation(buildOpenAIGenerateEndpointUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: JSON.stringify(buildAtlasBackendInventoryRequestBody(config, request))
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(readOpenAIError(responseText, response.status));
  }

  const parsed = parseAtlasBackendInventoryResponse(responseText);
  return {
    documentation: {
      version: 1,
      project_id: request.projectId,
      generated_at: new Date().toISOString(),
      source_files: uniqueStrings(request.files.map((file) => file.path)),
      endpoints: parsed.endpoints
    },
    token_usage: parseAtlasTokenUsage(responseText, config.OPENAI_ATLAS_MODEL)
  };
}

export function parseAtlasFileSelectionResponse(
  responseText: string,
  allowedFilePaths: string[]
): Pick<AtlasFileSelectionResult, "selectedFiles" | "contextFiles" | "backendSelectedFiles" | "backendContextFiles"> {
  const text = readOpenAIOutputText(responseText);
  if (!text) {
    return { selectedFiles: [], contextFiles: [], backendSelectedFiles: [], backendContextFiles: [] };
  }

  const parsed = JSON.parse(text) as {
    selected_files?: unknown;
    context_files?: unknown;
    backend_selected_files?: unknown;
    backend_context_files?: unknown;
  };
  const allowed = new Set(allowedFilePaths);
  return {
    selectedFiles: filterAllowedUniquePaths(parsed.selected_files, allowed),
    contextFiles: filterAllowedUniquePaths(parsed.context_files, allowed),
    backendSelectedFiles: filterAllowedUniquePaths(parsed.backend_selected_files, allowed),
    backendContextFiles: filterAllowedUniquePaths(parsed.backend_context_files, allowed)
  };
}

export function parseAtlasRouteMapResponse(responseText: string): Pick<AtlasRouteMapDocument, "routes"> {
  const text = readOpenAICandidateText(responseText);
  const parsed = parseStrictJsonObject(text);
  const routes = Array.isArray(parsed.routes)
    ? parsed.routes
        .filter(isRecord)
        .map((route) => ({
          path: readNonEmptyString(route.path),
          summary: readNonEmptyString(route.summary)
        }))
        .filter((route) => route.path && route.summary)
    : [];

  return { routes: dedupeRoutes(routes) };
}

export function parseAtlasBackendInventoryResponse(responseText: string): Pick<AtlasBackendInventoryDocument, "endpoints"> {
  const text = readOpenAICandidateText(responseText, "OpenAI returned no Atlas backend inventory");
  const parsed = parseStrictJsonObject(text, "OpenAI returned invalid Atlas backend inventory");
  const endpoints = Array.isArray(parsed.endpoints)
    ? parsed.endpoints
        .filter(isRecord)
        .map(readBackendEndpoint)
        .filter((endpoint): endpoint is AtlasBackendEndpoint => Boolean(endpoint))
    : [];

  return { endpoints: dedupeBackendEndpoints(endpoints) };
}

export function parseAtlasTokenUsage(responseText: string, model: string): AtlasTokenUsage {
  try {
    const parsed = JSON.parse(responseText) as {
      usage?: {
        input_tokens?: unknown;
        input_tokens_details?: {
          cached_tokens?: unknown;
        };
        cached_tokens?: unknown;
        output_tokens?: unknown;
        total_tokens?: unknown;
      };
    };
    const inputTokens = readTokenCount(parsed.usage?.input_tokens);
    const cachedInputTokens = readTokenCount(
      parsed.usage?.input_tokens_details?.cached_tokens ?? parsed.usage?.cached_tokens
    );
    const outputTokens = readTokenCount(parsed.usage?.output_tokens);
    const usage = {
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
      total_tokens: readTokenCount(parsed.usage?.total_tokens) || inputTokens + outputTokens
    };

    return {
      ...usage,
      pricing: calculateOpenAIPricing(model, usage)
    };
  } catch {
    const emptyUsage = {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    };

    return {
      ...emptyUsage,
      pricing: calculateOpenAIPricing(model, emptyUsage)
    };
  }
}

function filterAllowedUniquePaths(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.filter((filePath): filePath is string => typeof filePath === "string" && allowed.has(filePath)));
}

function dedupeRoutes(routes: Array<{ path: string; summary: string }>): Array<{ path: string; summary: string }> {
  const byPath = new Map<string, { path: string; summary: string }>();
  for (const route of routes) {
    const path = normalizeRoutePath(route.path);
    if (!path || byPath.has(path)) {
      continue;
    }

    byPath.set(path, {
      path,
      summary: route.summary.replace(/\s+/g, " ").trim().slice(0, 280)
    });
  }

  return [...byPath.values()];
}

function readBackendEndpoint(value: Record<string, unknown>): AtlasBackendEndpoint | null {
  const method = readNonEmptyString(value.method).toUpperCase();
  const path = normalizeRoutePath(readNonEmptyString(value.path));
  const summary = readNonEmptyString(value.summary);
  if (!method || !path || !summary) {
    return null;
  }

  return {
    method,
    path,
    summary: summary.slice(0, 300),
    auth: readNonEmptyString(value.auth) || "unknown",
    request: readBackendEndpointRequest(value.request),
    response: readBackendEndpointResponse(value.response)
  };
}

function readBackendEndpointRequest(value: unknown): AtlasBackendEndpointRequest {
  if (!isRecord(value)) {
    return {};
  }

  return omitEmptyRequestSections({
    params: readBackendEndpointFieldMap(value.params),
    query: readBackendEndpointFieldMap(value.query),
    body: readBackendEndpointFieldMap(value.body)
  });
}

function readBackendEndpointFieldMap(value: unknown): AtlasBackendEndpointFieldMap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const fields = Object.entries(value)
    .map(([name, field]) => [name.trim(), readBackendEndpointField(field)] as const)
    .filter((entry): entry is readonly [string, AtlasBackendEndpointField] =>
      entry[0].length > 0 && Boolean(entry[1])
    );
  if (fields.length === 0) {
    return undefined;
  }

  return Object.fromEntries(fields.sort(([left], [right]) => left.localeCompare(right)));
}

function readBackendEndpointField(value: unknown): AtlasBackendEndpointField | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readNonEmptyString(value.type);
  if (!type) {
    return null;
  }

  return {
    type,
    required: value.required === true,
    ...readEnumValues(value.enum ?? value.allowedValues)
  };
}

function readEnumValues(value: unknown): Pick<AtlasBackendEndpointField, "enum"> {
  if (!Array.isArray(value)) {
    return {};
  }

  const enumValues = uniqueStrings(value.map(readNonEmptyString))
    .map((enumValue) => enumValue.slice(0, 120))
    .slice(0, 100);
  return enumValues.length > 0 ? { enum: enumValues } : {};
}

function omitEmptyRequestSections(request: {
  params?: AtlasBackendEndpointFieldMap;
  query?: AtlasBackendEndpointFieldMap;
  body?: AtlasBackendEndpointFieldMap;
}): AtlasBackendEndpointRequest {
  const cleaned: AtlasBackendEndpointRequest = {};
  if (request.params && Object.keys(request.params).length > 0) {
    cleaned.params = request.params;
  }
  if (request.query && Object.keys(request.query).length > 0) {
    cleaned.query = request.query;
  }
  if (request.body && Object.keys(request.body).length > 0) {
    cleaned.body = request.body;
  }
  return cleaned;
}

function readBackendEndpointResponse(value: unknown): AtlasBackendEndpoint["response"] {
  if (!isRecord(value)) {
    return {
      success: "success response",
      errors: []
    };
  }

  return {
    success: readNonEmptyString(value.success) || "success response",
    errors: Array.isArray(value.errors)
      ? value.errors.map(readNonEmptyString).filter(Boolean).slice(0, 12)
      : []
  };
}

function dedupeBackendEndpoints(endpoints: AtlasBackendEndpoint[]): AtlasBackendEndpoint[] {
  const byMethodAndPath = new Map<string, AtlasBackendEndpoint>();
  for (const endpoint of endpoints) {
    const method = endpoint.method.toUpperCase();
    const path = normalizeRoutePath(endpoint.path);
    const key = `${method} ${path}`;
    if (!method || !path || byMethodAndPath.has(key)) {
      continue;
    }

    byMethodAndPath.set(key, {
      ...endpoint,
      method,
      path,
      summary: endpoint.summary.replace(/\s+/g, " ").trim().slice(0, 300),
      auth: endpoint.auth.replace(/\s+/g, " ").trim().slice(0, 160),
      response: {
        success: endpoint.response.success.replace(/\s+/g, " ").trim().slice(0, 220),
        errors: uniqueStrings(endpoint.response.errors.map((error) => error.replace(/\s+/g, " ").trim())).slice(0, 12)
      }
    });
  }

  return [...byMethodAndPath.values()].sort((left, right) =>
    left.path === right.path ? left.method.localeCompare(right.method) : left.path.localeCompare(right.path)
  );
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/${trimmed}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function readOpenAICandidateText(responseText: string, emptyMessage = "OpenAI returned no Atlas route map"): string {
  const text = readOpenAIOutputText(responseText);
  if (!text) {
    throw new Error(emptyMessage);
  }

  return text;
}

function readOpenAIOutputText(responseText: string): string {
  const response = JSON.parse(responseText) as {
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content): content is { type: string; text: string } =>
        content.type === "output_text" && typeof content.text === "string"
      )
      .map((content) => content.text)
      .join("") ?? ""
  );
}

function buildOpenAIJsonRequest({
  model,
  instructions,
  inputText,
  name,
  schema,
  maxOutputTokens,
  strictSchema = true
}: {
  model: string;
  instructions: string;
  inputText: string;
  name: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  strictSchema?: boolean;
}): Record<string, unknown> {
  return {
    model,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: inputText
          }
        ]
      }
    ],
    temperature: 0,
    max_output_tokens: maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name,
        schema,
        strict: strictSchema
      }
    }
  };
}

function buildOpenAIGenerateEndpointUrl(): string {
  return "https://api.openai.com/v1/responses";
}

function parseStrictJsonObject(text: string, invalidMessage = "OpenAI returned invalid Atlas route map"): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(invalidMessage);
  }

  return parsed as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function readOpenAIError(responseText: string, status: number): string {
  try {
    const parsed = JSON.parse(responseText) as { error?: { message?: string } };
    return parsed.error?.message || `OpenAI request failed with status ${status}`;
  } catch {
    return responseText || `OpenAI request failed with status ${status}`;
  }
}
