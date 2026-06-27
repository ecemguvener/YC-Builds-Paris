import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import {
  generateAtlasBackendBatch,
  generateAtlasRouteBatch,
  selectAtlasFiles,
  type AtlasBackendInventoryDocument,
  type AtlasRouteMapDocument,
  type AtlasSourceFileChunk
} from "./api.js";
import { barkanDirectoryName, readExistingBarkanConfig } from "./config.js";
import { readConnection } from "./connection.js";
import { scanProjectFiles } from "./atlas/scanner.js";
import { readSelectedSourceFiles } from "./atlas/source-reader.js";

type DocumentationGenerationStep = "files_selection" | "frontend_documentation" | "backend_documentation";

interface AgentEvent {
  type: "step_started" | "step_progress" | "step_completed";
  step: DocumentationGenerationStep;
  current?: number;
  total?: number;
  label?: string;
}

interface AtlasDocumentationBundle {
  routeMap: AtlasRouteMapDocument;
  backendInventory: AtlasBackendInventoryDocument;
}

const fileSelectionBatchSize = 300;
const frontendDocumentationConcurrency = 10;
const backendDocumentationBatchSize = 30;
const reconnectDelayMs = 2000;

export async function startLocalAgent(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (env.BARKAN_DISABLE_AGENT === "1") {
    await appendAgentLog(cwd, env, "agent start skipped because BARKAN_DISABLE_AGENT=1");
    return;
  }

  await stopLocalAgent(cwd, env);

  const entrypoint = process.argv[1];
  if (!entrypoint) {
    await appendAgentLog(cwd, env, "agent start skipped because the CLI entrypoint could not be resolved");
    return;
  }

  const child = spawn(process.execPath, [entrypoint, "__agent", "--cwd", cwd], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...env,
      BARKAN_AGENT: "1"
    }
  });
  child.unref();
  if (child.pid) {
    await writeAgentPid(cwd, env, child.pid);
    await appendAgentLog(cwd, env, `started local agent process pid=${child.pid}`);
  }
}

export async function stopLocalAgent(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const pid = await readAgentPid(cwd, env);
  if (!pid) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    await appendAgentLog(cwd, env, `sent SIGTERM to local agent process pid=${pid}`);
  } catch {
    // The process may already be gone; removing the stale pid file is enough.
    await appendAgentLog(cwd, env, `removed stale local agent pid=${pid}`);
  }

  await rm(getAgentPidPath(cwd, env), { force: true });
}

export async function runLocalAgent(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  await appendAgentLog(cwd, env, "local agent started");
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopped) {
    try {
      await connectAgentOnce(cwd, env, () => stopped);
    } catch (error) {
      // Keep the local link alive without surfacing transient network failures to the user's shell.
      await appendAgentLog(cwd, env, `agent connection loop failed: ${getErrorMessage(error)}`);
    }

    if (!stopped) {
      await sleep(reconnectDelayMs);
    }
  }

  await appendAgentLog(cwd, env, "local agent stopped");
  return 0;
}

async function connectAgentOnce(
  cwd: string,
  env: NodeJS.ProcessEnv,
  isStopped: () => boolean
): Promise<void> {
  const connection = await readConnection(cwd, env);
  if (!connection?.project) {
    await appendAgentLog(cwd, env, "agent has no saved project credentials");
    return;
  }

  await appendAgentLog(cwd, env, `connecting to Barkan API for project ${connection.project.id}`);
  const websocket = new WebSocket(buildAgentWebSocketUrl(connection.apiBaseUrl), {
    headers: {
      authorization: `Bearer ${connection.apiKey}`
    }
  });

  await new Promise<void>((resolve) => {
    const handleOpen = () => {
      websocket.off("error", handleError);
      resolve();
    };
    const handleError = (error: Error) => {
      websocket.off("open", handleOpen);
      void appendAgentLog(cwd, env, `websocket connection failed: ${getErrorMessage(error)}`);
      resolve();
    };

    websocket.once("open", handleOpen);
    websocket.once("error", handleError);
  });

  if (websocket.readyState !== WebSocket.OPEN) {
    await appendAgentLog(cwd, env, "websocket was not open after connection attempt");
    websocket.close();
    return;
  }

  await appendAgentLog(cwd, env, "websocket connected");
  await new Promise<void>((resolve) => {
    websocket.on("message", (message) => {
      void handleAgentCommand({
        cwd,
        websocket,
        rawMessage: message.toString()
      });
    });

    websocket.once("close", (code, reason) => {
      void appendAgentLog(cwd, env, `websocket closed code=${code} reason=${reason.toString() || "none"}`);
      resolve();
    });
    websocket.once("error", (error) => {
      void appendAgentLog(cwd, env, `websocket error: ${getErrorMessage(error)}`);
      resolve();
    });

    const interval = setInterval(() => {
      if (isStopped()) {
        clearInterval(interval);
        websocket.close();
        resolve();
      }
    }, 250);
  });
}

async function handleAgentCommand({
  cwd,
  websocket,
  rawMessage
}: {
  cwd: string;
  websocket: WebSocket;
  rawMessage: string;
}) {
  const message = parseJsonObject(rawMessage);
  if (!message || message.type !== "generate_documentation" || typeof message.request_id !== "string") {
    return;
  }

  try {
    const documentation = await generateDocumentationLocally({
      cwd,
      requestId: message.request_id,
      websocket
    });
    sendAgentMessage(websocket, {
      type: "documentation_completed",
      request_id: message.request_id,
      documentation
    });
  } catch (error) {
    sendAgentMessage(websocket, {
      type: "documentation_error",
      request_id: message.request_id,
      error: getErrorMessage(error)
    });
  }
}

async function generateDocumentationLocally({
  cwd,
  requestId,
  websocket
}: {
  cwd: string;
  requestId: string;
  websocket: WebSocket;
}): Promise<AtlasDocumentationBundle> {
  const connection = await readConnection(cwd);
  if (!connection?.project) {
    throw new Error("Barkan is not connected.");
  }

  const config = await readExistingBarkanConfig(cwd);
  if (!config) {
    throw new Error("Missing barkan.config.json. Run npx barkan connect from the client codebase.");
  }

  const root = path.resolve(cwd, config.atlas.root);
  sendDocumentationEvent(websocket, requestId, { type: "step_started", step: "files_selection" });
  const scanResult = await scanProjectFiles(root, config.atlas.ignore);
  const filePathBatches = chunkArray(scanResult.files, fileSelectionBatchSize);
  const selectedFiles = new Set<string>();
  const contextFiles = new Set<string>();
  const backendSelectedFiles = new Set<string>();
  const backendContextFiles = new Set<string>();
  let selectedBatchCount = 0;

  sendDocumentationEvent(websocket, requestId, {
    type: "step_progress",
    step: "files_selection",
    current: 0,
    total: filePathBatches.length,
    label: "0 batches"
  });

  await runWithConcurrency(filePathBatches, frontendDocumentationConcurrency, async (filePathBatch) => {
    const selection = await selectAtlasFiles({
      apiKey: connection.apiKey,
      apiBaseUrl: connection.apiBaseUrl,
      projectId: connection.project!.id,
      filePaths: filePathBatch
    });
    for (const filePath of selection.selected_files) {
      selectedFiles.add(filePath);
    }
    for (const filePath of selection.context_files) {
      contextFiles.add(filePath);
    }
    for (const filePath of selection.backend_selected_files) {
      backendSelectedFiles.add(filePath);
    }
    for (const filePath of selection.backend_context_files) {
      backendContextFiles.add(filePath);
    }
    selectedBatchCount += 1;
    sendDocumentationEvent(websocket, requestId, {
      type: "step_progress",
      step: "files_selection",
      current: selectedBatchCount,
      total: filePathBatches.length,
      label: `${selectedBatchCount}/${filePathBatches.length} batches`
    });
  });

  const selectedFrontendFilePaths = [...new Set([...selectedFiles, ...contextFiles])].filter((filePath) => scanResult.files.includes(filePath));
  const selectedBackendFilePaths = [...new Set([...backendSelectedFiles, ...backendContextFiles])].filter((filePath) => scanResult.files.includes(filePath));
  if (selectedFrontendFilePaths.length === 0) {
    throw new Error("No frontend route files were selected.");
  }

  sendDocumentationEvent(websocket, requestId, {
    type: "step_completed",
    step: "files_selection",
    current: filePathBatches.length,
    total: filePathBatches.length
  });

  sendDocumentationEvent(websocket, requestId, {
    type: "step_started",
    step: "frontend_documentation",
    total: selectedFrontendFilePaths.length
  });

  const readResult = await readSelectedSourceFiles({
    root,
    selectedFilePaths: selectedFrontendFilePaths,
    allowedFilePaths: scanResult.files
  });
  const filesByPath = new Map(readResult.files.map((file) => [file.path, toAtlasSourceFileChunks(file.chunks)]));
  const routeMaps: AtlasRouteMapDocument[] = [];
  let documentedFileCount = 0;

  sendDocumentationEvent(websocket, requestId, {
    type: "step_progress",
    step: "frontend_documentation",
    current: 0,
    total: selectedFrontendFilePaths.length,
    label: "0 files"
  });

  await runWithConcurrency(selectedFrontendFilePaths, frontendDocumentationConcurrency, async (filePath) => {
    const chunks = filesByPath.get(filePath);
    if (!chunks?.length) {
      documentedFileCount += 1;
      return;
    }

    const routeMap = await generateRouteMapForFile({
      apiKey: connection.apiKey,
      apiBaseUrl: connection.apiBaseUrl,
      projectId: connection.project!.id,
      chunks
    });
    routeMaps.push(routeMap);
    documentedFileCount += 1;
    sendDocumentationEvent(websocket, requestId, {
      type: "step_progress",
      step: "frontend_documentation",
      current: documentedFileCount,
      total: selectedFrontendFilePaths.length,
      label: `${documentedFileCount}/${selectedFrontendFilePaths.length} files`
    });
  });

  sendDocumentationEvent(websocket, requestId, {
    type: "step_completed",
    step: "frontend_documentation",
    current: selectedFrontendFilePaths.length,
    total: selectedFrontendFilePaths.length
  });

  const routeMap = mergeRouteMaps(connection.project.id, routeMaps);
  const backendInventory = await generateBackendInventoryLocally({
    apiKey: connection.apiKey,
    apiBaseUrl: connection.apiBaseUrl,
    projectId: connection.project.id,
    root,
    allowedFilePaths: scanResult.files,
    selectedFilePaths: selectedBackendFilePaths,
    requestId,
    websocket
  });

  return {
    routeMap,
    backendInventory
  };
}

async function generateRouteMapForFile({
  apiKey,
  apiBaseUrl,
  projectId,
  chunks
}: {
  apiKey: string;
  apiBaseUrl: string;
  projectId: string;
  chunks: AtlasSourceFileChunk[];
}): Promise<AtlasRouteMapDocument> {
  try {
    const response = await generateAtlasRouteBatch({
      apiKey,
      apiBaseUrl,
      projectId,
      files: chunks
    });
    return response.documentation;
  } catch (error) {
    if (!isContextWindowError(error) || chunks.length <= 1) {
      throw error;
    }

    const routeMaps: AtlasRouteMapDocument[] = [];
    for (const chunk of chunks) {
      const response = await generateAtlasRouteBatch({
        apiKey,
        apiBaseUrl,
        projectId,
        files: [chunk]
      });
      routeMaps.push(response.documentation);
    }
    return mergeRouteMaps(projectId, routeMaps);
  }
}

async function generateBackendInventoryLocally({
  apiKey,
  apiBaseUrl,
  projectId,
  root,
  allowedFilePaths,
  selectedFilePaths,
  requestId,
  websocket
}: {
  apiKey: string;
  apiBaseUrl: string;
  projectId: string;
  root: string;
  allowedFilePaths: string[];
  selectedFilePaths: string[];
  requestId: string;
  websocket: WebSocket;
}): Promise<AtlasBackendInventoryDocument> {
  sendDocumentationEvent(websocket, requestId, {
    type: "step_started",
    step: "backend_documentation",
    total: selectedFilePaths.length
  });

  if (selectedFilePaths.length === 0) {
    sendDocumentationEvent(websocket, requestId, {
      type: "step_completed",
      step: "backend_documentation",
      current: 0,
      total: 0
    });
    return createEmptyBackendInventory(projectId);
  }

  const readResult = await readSelectedSourceFiles({
    root,
    selectedFilePaths,
    allowedFilePaths
  });
  const chunkBatches = chunkArray(toAtlasSourceFileChunks(readResult.chunks), backendDocumentationBatchSize);
  const inventories: AtlasBackendInventoryDocument[] = [];
  let documentedBatchCount = 0;

  sendDocumentationEvent(websocket, requestId, {
    type: "step_progress",
    step: "backend_documentation",
    current: 0,
    total: chunkBatches.length,
    label: "0 batches"
  });

  await runWithConcurrency(chunkBatches, frontendDocumentationConcurrency, async (chunks) => {
    const inventory = await generateBackendInventoryForBatch({
      apiKey,
      apiBaseUrl,
      projectId,
      chunks
    });
    inventories.push(inventory);
    documentedBatchCount += 1;
    sendDocumentationEvent(websocket, requestId, {
      type: "step_progress",
      step: "backend_documentation",
      current: documentedBatchCount,
      total: chunkBatches.length,
      label: `${documentedBatchCount}/${chunkBatches.length} batches`
    });
  });

  sendDocumentationEvent(websocket, requestId, {
    type: "step_completed",
    step: "backend_documentation",
    current: chunkBatches.length,
    total: chunkBatches.length
  });

  return mergeBackendInventories(projectId, inventories);
}

async function generateBackendInventoryForBatch({
  apiKey,
  apiBaseUrl,
  projectId,
  chunks
}: {
  apiKey: string;
  apiBaseUrl: string;
  projectId: string;
  chunks: AtlasSourceFileChunk[];
}): Promise<AtlasBackendInventoryDocument> {
  try {
    const response = await generateAtlasBackendBatch({
      apiKey,
      apiBaseUrl,
      projectId,
      files: chunks
    });
    return response.documentation;
  } catch (error) {
    if (!isContextWindowError(error) || chunks.length <= 1) {
      throw error;
    }

    const inventories: AtlasBackendInventoryDocument[] = [];
    for (const chunk of chunks) {
      const response = await generateAtlasBackendBatch({
        apiKey,
        apiBaseUrl,
        projectId,
        files: [chunk]
      });
      inventories.push(response.documentation);
    }
    return mergeBackendInventories(projectId, inventories);
  }
}

function mergeRouteMaps(projectId: string, routeMaps: AtlasRouteMapDocument[]): AtlasRouteMapDocument {
  const sourceFiles = new Set<string>();
  const routesByPath = new Map<string, { path: string; summary: string }>();

  for (const routeMap of routeMaps) {
    for (const sourceFile of routeMap.source_files) {
      sourceFiles.add(sourceFile);
    }

    for (const route of routeMap.routes) {
      const path = normalizeRoutePath(route.path);
      if (!path || routesByPath.has(path)) {
        continue;
      }

      routesByPath.set(path, {
        path,
        summary: route.summary.replace(/\s+/g, " ").trim()
      });
    }
  }

  return {
    version: 1,
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source_files: [...sourceFiles].sort((left, right) => left.localeCompare(right)),
    routes: [...routesByPath.values()].sort((left, right) => left.path.localeCompare(right.path))
  };
}

function mergeBackendInventories(projectId: string, inventories: AtlasBackendInventoryDocument[]): AtlasBackendInventoryDocument {
  const sourceFiles = new Set<string>();
  const endpointsByMethodAndPath = new Map<string, AtlasBackendInventoryDocument["endpoints"][number]>();

  for (const inventory of inventories) {
    for (const sourceFile of inventory.source_files) {
      sourceFiles.add(sourceFile);
    }

    for (const endpoint of inventory.endpoints) {
      const method = endpoint.method.trim().toUpperCase();
      const path = normalizeRoutePath(endpoint.path);
      const key = `${method} ${path}`;
      if (!method || !path || endpointsByMethodAndPath.has(key)) {
        continue;
      }

      endpointsByMethodAndPath.set(key, {
        ...endpoint,
        method,
        path,
        summary: endpoint.summary.replace(/\s+/g, " ").trim(),
        auth: endpoint.auth.replace(/\s+/g, " ").trim(),
        response: {
          success: endpoint.response.success.replace(/\s+/g, " ").trim(),
          errors: [...new Set(endpoint.response.errors.map((error) => error.replace(/\s+/g, " ").trim()).filter(Boolean))]
        }
      });
    }
  }

  return {
    version: 1,
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source_files: [...sourceFiles].sort((left, right) => left.localeCompare(right)),
    endpoints: [...endpointsByMethodAndPath.values()].sort((left, right) =>
      left.path === right.path ? left.method.localeCompare(right.method) : left.path.localeCompare(right.path)
    )
  };
}

function createEmptyBackendInventory(projectId: string): AtlasBackendInventoryDocument {
  return {
    version: 1,
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source_files: [],
    endpoints: []
  };
}

function toAtlasSourceFileChunks(chunks: Array<{ path: string; chunkIndex: number; chunkCount: number; content: string }>): AtlasSourceFileChunk[] {
  return chunks.map((chunk) => ({
    path: chunk.path,
    chunk_index: chunk.chunkIndex,
    chunk_count: chunk.chunkCount,
    content: chunk.content
  }));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(workers);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sendDocumentationEvent(websocket: WebSocket, requestId: string, event: AgentEvent) {
  sendAgentMessage(websocket, {
    type: "documentation_event",
    request_id: requestId,
    event
  });
}

function sendAgentMessage(websocket: WebSocket, payload: Record<string, unknown>) {
  if (websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(payload));
  }
}

function buildAgentWebSocketUrl(apiBaseUrl: string): string {
  const url = new URL(apiBaseUrl.replace(/\/$/, ""));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/atlas/agent/connect";
  url.search = "";
  return url.toString();
}

async function writeAgentPid(cwd: string, env: NodeJS.ProcessEnv, pid: number): Promise<void> {
  const pidPath = getAgentPidPath(cwd, env);
  await mkdir(path.dirname(pidPath), { recursive: true });
  await writeFile(pidPath, `${pid}\n`, "utf8");
}

async function readAgentPid(cwd: string, env: NodeJS.ProcessEnv): Promise<number | null> {
  try {
    const value = await readFile(getAgentPidPath(cwd, env), "utf8");
    const pid = Number.parseInt(value, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function getAgentPidPath(cwd: string, env: NodeJS.ProcessEnv): string {
  if (env.BARKAN_HOME) {
    return path.join(env.BARKAN_HOME, "agent.pid");
  }

  return path.join(cwd, barkanDirectoryName, "agent.pid");
}

function getAgentLogPath(cwd: string, env: NodeJS.ProcessEnv): string {
  if (env.BARKAN_HOME) {
    return path.join(env.BARKAN_HOME, "agent.log");
  }

  return path.join(cwd, barkanDirectoryName, "agent.log");
}

async function appendAgentLog(cwd: string, env: NodeJS.ProcessEnv, message: string): Promise<void> {
  try {
    const logPath = getAgentLogPath(cwd, env);
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Agent logging must never break connect/status flows.
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

function normalizeRoutePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isContextWindowError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("context window") || message.includes("input exceeds") || message.includes("maximum context");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
