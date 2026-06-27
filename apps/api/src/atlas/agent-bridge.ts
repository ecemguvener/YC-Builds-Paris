import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import type { AppConfig } from "../config.js";
import type { ApiKeyDocument, AtlasProjectDocument, Collections, UserDocument } from "../db.js";
import { hashApiKey } from "../security.js";
import type { AtlasBackendInventoryDocument } from "./backend-inventory.js";
import { createEmptyAtlasBackendInventory, isAtlasBackendInventoryDocument } from "./backend-inventory.js";
import type { AtlasRouteMapDocument } from "./route-map.js";
import { isAtlasRouteMapDocument } from "./route-map.js";

type DocumentationBridgeEvent =
  | { type: "step_started"; step: DocumentationGenerationStep; total?: number }
  | { type: "step_progress"; step: DocumentationGenerationStep; current: number; total: number; label?: string }
  | { type: "step_completed"; step: DocumentationGenerationStep; current?: number; total?: number };

export type DocumentationGenerationStep = "files_selection" | "frontend_documentation" | "backend_documentation";
export type DocumentationProgressStep = "connection" | DocumentationGenerationStep;

export interface AtlasDocumentationGenerationStatus {
  projectId: string;
  status: "running";
  activeStep: DocumentationProgressStep | null;
  completedSteps: DocumentationProgressStep[];
  stepProgress: Partial<Record<DocumentationProgressStep, { current: number; total: number; label?: string }>>;
  startedAt: string;
  updatedAt: string;
}

interface MutableDocumentationGenerationStatus {
  projectId: string;
  status: "running";
  activeStep: DocumentationProgressStep | null;
  completedSteps: Set<DocumentationProgressStep>;
  stepProgress: Partial<Record<DocumentationProgressStep, { current: number; total: number; label?: string }>>;
  startedAt: Date;
  updatedAt: Date;
}

interface ApiKeyAgentContext {
  apiKey: ApiKeyDocument;
  user: UserDocument;
  project: AtlasProjectDocument;
}

interface ConnectedAgent {
  projectId: string;
  ownerUserId: string;
  connectedAt: Date;
  socket: WebSocket;
  pendingRequest: PendingDocumentationRequest | null;
  isAlive: boolean;
  heartbeatInterval: NodeJS.Timeout | null;
}

interface PendingDocumentationRequest {
  id: string;
  onEvent: (event: DocumentationBridgeEvent) => void;
  resolve: (documentation: AtlasDocumentationBundle) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface AtlasDocumentationBundle {
  routeMap: AtlasRouteMapDocument;
  backendInventory: AtlasBackendInventoryDocument;
}

const agentsByProjectId = new Map<string, ConnectedAgent>();
const documentationGenerationsByProjectId = new Map<string, MutableDocumentationGenerationStatus>();
const testAgentsByProjectId = new Map<
  string,
  (onEvent: (event: DocumentationBridgeEvent) => void) => Promise<AtlasDocumentationBundle>
>();
const agentHeartbeatIntervalMs = 25_000;

export function registerAtlasAgentBridge(
  app: FastifyInstance,
  collections: Collections,
  config: AppConfig
) {
  const websocketServer = new WebSocketServer({ noServer: true });

  app.server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    void handleAgentUpgrade(request, socket, head, websocketServer, collections, config);
  });

  app.addHook("onClose", (_instance, done) => {
    for (const agent of agentsByProjectId.values()) {
      clearAgentHeartbeat(agent);
      agent.socket.close();
    }
    agentsByProjectId.clear();
    websocketServer.close(() => done());
  });
}

export function getAtlasAgentStatus(projectId: string): { connected: boolean; connectedAt: string | null } {
  if (testAgentsByProjectId.has(projectId)) {
    return { connected: true, connectedAt: new Date(0).toISOString() };
  }

  const agent = agentsByProjectId.get(projectId);
  if (!agent || agent.socket.readyState !== WebSocket.OPEN) {
    return { connected: false, connectedAt: null };
  }

  return {
    connected: true,
    connectedAt: agent.connectedAt.toISOString()
  };
}

export function getAtlasDocumentationGenerationStatus(projectId: string): AtlasDocumentationGenerationStatus | null {
  const generation = documentationGenerationsByProjectId.get(projectId);
  if (!generation) {
    return null;
  }

  return {
    projectId: generation.projectId,
    status: generation.status,
    activeStep: generation.activeStep,
    completedSteps: [...generation.completedSteps],
    stepProgress: generation.stepProgress,
    startedAt: generation.startedAt.toISOString(),
    updatedAt: generation.updatedAt.toISOString()
  };
}

export async function generateDocumentationWithAgent({
  projectId,
  onEvent
}: {
  projectId: string;
  onEvent: (event: DocumentationBridgeEvent) => void;
}): Promise<AtlasDocumentationBundle> {
  const testAgent = testAgentsByProjectId.get(projectId);
  if (testAgent) {
    startDocumentationGeneration(projectId);
    try {
      const documentation = await testAgent((event) => {
        updateDocumentationGeneration(projectId, event);
        onEvent(event);
      });
      finishDocumentationGeneration(projectId);
      return documentation;
    } catch (error) {
      failDocumentationGeneration(projectId);
      throw error;
    }
  }

  const agent = agentsByProjectId.get(projectId);
  if (!agent || agent.socket.readyState !== WebSocket.OPEN) {
    throw new AgentUnavailableError("Run npx barkan connect from the client codebase before generating documentation.");
  }

  if (agent.pendingRequest) {
    throw new AgentBusyError("Documentation generation is already running for this codebase.");
  }

  const requestId = createRequestId();
  startDocumentationGeneration(projectId);
  return await new Promise<AtlasDocumentationBundle>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const currentAgent = agentsByProjectId.get(projectId);
      if (currentAgent?.pendingRequest?.id === requestId) {
        currentAgent.pendingRequest = null;
      }
      failDocumentationGeneration(projectId);
      reject(new Error("Documentation generation timed out."));
    }, 10 * 60 * 1000);

    agent.pendingRequest = {
      id: requestId,
      onEvent: (event) => {
        updateDocumentationGeneration(projectId, event);
        onEvent(event);
      },
      resolve: (documentation) => {
        clearTimeout(timeout);
        finishDocumentationGeneration(projectId);
        resolve(documentation);
      },
      reject: (error) => {
        clearTimeout(timeout);
        failDocumentationGeneration(projectId);
        reject(error);
      },
      timeout
    };

    sendAgentMessage(agent.socket, {
      type: "generate_documentation",
      request_id: requestId
    });
  });
}

export class AgentUnavailableError extends Error {}

export class AgentBusyError extends Error {}

export function registerAtlasAgentForTest(
  projectId: string,
  handler: (onEvent: (event: DocumentationBridgeEvent) => void) => Promise<AtlasDocumentationBundle>
): () => void {
  testAgentsByProjectId.set(projectId, handler);
  return () => {
    testAgentsByProjectId.delete(projectId);
  };
}

async function handleAgentUpgrade(
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
  websocketServer: WebSocketServer,
  collections: Collections,
  config: AppConfig
) {
  const pathname = readRequestPathname(request);
  if (pathname !== "/api/atlas/agent/connect") {
    socket.destroy();
    return;
  }

  const authContext = await resolveAgentAuthContext(request, collections, config);
  if (!authContext) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    registerConnectedAgent(websocket, authContext);
  });
}

async function resolveAgentAuthContext(
  request: IncomingMessage,
  collections: Collections,
  _config: AppConfig
): Promise<ApiKeyAgentContext | null> {
  const apiKey = extractBearerApiKey(request);
  if (!apiKey) {
    return null;
  }

  const apiKeyDocument = await collections.apiKeys.findOne({ keyHash: hashApiKey(apiKey) });
  if (!apiKeyDocument?.projectId) {
    return null;
  }

  const user = await collections.users.findOne({ _id: apiKeyDocument.userId });
  if (!user) {
    return null;
  }

  const project = await collections.atlasProjects.findOne({
    ownerUserId: user._id,
    projectId: apiKeyDocument.projectId
  });
  if (!project) {
    return null;
  }

  await collections.apiKeys.updateOne(
    { _id: apiKeyDocument._id },
    { $set: { lastUsedAt: new Date() } }
  );

  return { apiKey: apiKeyDocument, user, project };
}

function registerConnectedAgent(socket: WebSocket, authContext: ApiKeyAgentContext) {
  const projectId = authContext.project.projectId;
  const previousAgent = agentsByProjectId.get(projectId);
  const pendingRequest = previousAgent?.pendingRequest ?? null;
  if (previousAgent && previousAgent.socket !== socket) {
    previousAgent.pendingRequest = null;
    previousAgent.socket.close(4000, "replaced");
  }

  const connectedAgent: ConnectedAgent = {
    projectId,
    ownerUserId: String(authContext.user._id),
    connectedAt: new Date(),
    socket,
    pendingRequest,
    isAlive: true,
    heartbeatInterval: null
  };
  agentsByProjectId.set(projectId, connectedAgent);

  connectedAgent.heartbeatInterval = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      clearAgentHeartbeat(connectedAgent);
      return;
    }

    if (!connectedAgent.isAlive) {
      socket.terminate();
      return;
    }

    connectedAgent.isAlive = false;
    socket.ping();
  }, agentHeartbeatIntervalMs);
  connectedAgent.heartbeatInterval.unref?.();

  socket.on("pong", () => {
    connectedAgent.isAlive = true;
  });

  socket.on("message", (message) => {
    handleAgentMessage(connectedAgent, message.toString());
  });

  socket.on("close", () => {
    clearAgentHeartbeat(connectedAgent);
    if (agentsByProjectId.get(projectId) === connectedAgent) {
      connectedAgent.pendingRequest?.reject(new AgentUnavailableError("The Barkan local agent disconnected."));
      agentsByProjectId.delete(projectId);
    }
  });

  socket.on("error", () => {
    clearAgentHeartbeat(connectedAgent);
    if (agentsByProjectId.get(projectId) === connectedAgent) {
      connectedAgent.pendingRequest?.reject(new AgentUnavailableError("The Barkan local agent connection failed."));
      agentsByProjectId.delete(projectId);
    }
  });

  sendAgentMessage(socket, {
    type: "connected",
    project_id: projectId
  });

  if (pendingRequest) {
    sendAgentMessage(socket, {
      type: "generate_documentation",
      request_id: pendingRequest.id
    });
  }
}

function startDocumentationGeneration(projectId: string) {
  const now = new Date();
  documentationGenerationsByProjectId.set(projectId, {
    projectId,
    status: "running",
    activeStep: "connection",
    completedSteps: new Set(["connection"]),
    stepProgress: {
      connection: { current: 1, total: 1, label: "Connected" }
    },
    startedAt: now,
    updatedAt: now
  });
}

function updateDocumentationGeneration(projectId: string, event: DocumentationBridgeEvent) {
  const generation = documentationGenerationsByProjectId.get(projectId);
  if (!generation) {
    return;
  }

  generation.updatedAt = new Date();
  if (event.type === "step_started") {
    generation.activeStep = event.step;
    if (typeof event.total === "number") {
      generation.stepProgress = {
        ...generation.stepProgress,
        [event.step]: { current: 0, total: event.total }
      };
    }
    return;
  }

  if (event.type === "step_progress") {
    generation.activeStep = event.step;
    generation.stepProgress = {
      ...generation.stepProgress,
      [event.step]: { current: event.current, total: event.total, label: event.label }
    };
    return;
  }

  generation.completedSteps.add(event.step);
  if (typeof event.current === "number" && typeof event.total === "number") {
    generation.stepProgress = {
      ...generation.stepProgress,
      [event.step]: { current: event.current, total: event.total }
    };
  }
}

function finishDocumentationGeneration(projectId: string) {
  documentationGenerationsByProjectId.delete(projectId);
}

function failDocumentationGeneration(projectId: string) {
  documentationGenerationsByProjectId.delete(projectId);
}

function handleAgentMessage(agent: ConnectedAgent, rawMessage: string) {
  const message = parseJsonObject(rawMessage);
  if (!message) {
    return;
  }

  const requestId = typeof message.request_id === "string" ? message.request_id : "";
  const pendingRequest = agent.pendingRequest;
  if (!pendingRequest || pendingRequest.id !== requestId) {
    return;
  }

  if (message.type === "documentation_event") {
    const event = readDocumentationBridgeEvent(message.event);
    if (event) {
      pendingRequest.onEvent(event);
    }
    return;
  }

  if (message.type === "documentation_completed") {
    agent.pendingRequest = null;
    const documentation = readAtlasDocumentationBundle(message.documentation);
    if (documentation) {
      pendingRequest.resolve(documentation);
    } else {
      pendingRequest.reject(new Error("The Barkan local agent returned invalid documentation."));
    }
    return;
  }

  if (message.type === "documentation_error") {
    agent.pendingRequest = null;
    pendingRequest.reject(new Error(readErrorMessage(message.error)));
  }
}

function readAtlasDocumentationBundle(value: unknown): AtlasDocumentationBundle | null {
  if (isAtlasRouteMapDocument(value)) {
    return {
      routeMap: value,
      backendInventory: createEmptyAtlasBackendInventory(value.project_id)
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const bundle = value as Partial<AtlasDocumentationBundle>;
  if (!isAtlasRouteMapDocument(bundle.routeMap) || !isAtlasBackendInventoryDocument(bundle.backendInventory)) {
    return null;
  }

  return {
    routeMap: bundle.routeMap,
    backendInventory: bundle.backendInventory
  };
}

function readDocumentationBridgeEvent(value: unknown): DocumentationBridgeEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const event = value as Partial<DocumentationBridgeEvent>;
  if (!isDocumentationStep(event.step)) {
    return null;
  }

  if (event.type === "step_started") {
    return typeof event.total === "number" ? { type: event.type, step: event.step, total: event.total } : { type: event.type, step: event.step };
  }

  if (event.type === "step_progress" && typeof event.current === "number" && typeof event.total === "number") {
    return {
      type: event.type,
      step: event.step,
      current: event.current,
      total: event.total,
      ...(typeof event.label === "string" ? { label: event.label } : {})
    };
  }

  if (event.type === "step_completed") {
    return {
      type: event.type,
      step: event.step,
      ...(typeof event.current === "number" ? { current: event.current } : {}),
      ...(typeof event.total === "number" ? { total: event.total } : {})
    };
  }

  return null;
}

function isDocumentationStep(value: unknown): value is DocumentationGenerationStep {
  return value === "files_selection" || value === "frontend_documentation" || value === "backend_documentation";
}

function extractBearerApiKey(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith("ck_")) {
    return null;
  }

  return token.trim();
}

function readRequestPathname(request: IncomingMessage): string {
  try {
    return new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function sendAgentMessage(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function clearAgentHeartbeat(agent: ConnectedAgent) {
  if (agent.heartbeatInterval) {
    clearInterval(agent.heartbeatInterval);
    agent.heartbeatInterval = null;
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readErrorMessage(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "Documentation generation failed.";
}

function createRequestId(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
