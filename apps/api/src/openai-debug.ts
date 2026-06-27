import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { OpenAIWidgetRequest } from "./openai.js";
import type { OpenAIPricingBreakdown, OpenAITokenUsage } from "./openai-pricing.js";

const OPENAI_PROMPT_LOG_FILE = ".barkan/debug/openai-prompts.json";
const OPENAI_TIMINGS_LOG_FILE = ".barkan/debug/openai-timings.json";

export interface OpenAITimingDebugEntry {
  requestId: string;
  siteKey: string;
  route: string | null;
  model: string;
  status: "completed" | "upstream_error" | "stream_error";
  promptProcessing: {
    contextCaptureMs: number | null;
    candidateCollectionMs?: number | null;
    scrollSurfacesMs?: number | null;
    activeSurfacesMs?: number | null;
    layoutSettleMs: number | null;
    creatingUiFactsMs: number | null;
    cleanDomTreeMs?: number | null;
    pageMetaMs?: number | null;
    contentBlocksMs?: number | null;
    formsMs?: number | null;
    relationshipsMs?: number | null;
    domSnapshotBuildMs: number | null;
    optionalContextSkipped?: number | null;
    staleRetryCount: number | null;
    gettingRelatedDocumentationMs: number | null;
    pipelineBuildMs?: number | null;
    creatingPromptMs: number;
  };
  aiThinkingMs: number | null;
  returningAnswerMs: number | null;
  requestSetupMs: number;
  upstreamHeadersMs: number | null;
  totalServerMs: number;
  textChunkCount: number;
  tokenUsage?: OpenAITokenUsage;
  pricing?: OpenAIPricingBreakdown | null;
  error?: string;
}

export async function writeOpenAIPromptDebugLog(
  config: AppConfig,
  payload: OpenAIWidgetRequest,
  openAIRequestBody: Record<string, unknown>
): Promise<boolean> {
  if (config.NODE_ENV === "production") {
    return false;
  }

  const filePath = path.resolve(process.cwd(), OPENAI_PROMPT_LOG_FILE);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(buildOpenAIPromptDebugEntry(config, payload, openAIRequestBody), null, 2)}\n`, "utf8");

  return true;
}

export async function writeOpenAITimingDebugLog(
  config: AppConfig,
  entry: OpenAITimingDebugEntry
): Promise<boolean> {
  if (config.NODE_ENV === "production") {
    return false;
  }

  const filePath = path.resolve(process.cwd(), OPENAI_TIMINGS_LOG_FILE);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({
    loggedAt: new Date().toISOString(),
    ...entry
  }, null, 2)}\n`, "utf8");

  return true;
}

function buildOpenAIPromptDebugEntry(
  config: AppConfig,
  payload: OpenAIWidgetRequest,
  openAIRequestBody: Record<string, unknown>
) {
  return {
    loggedAt: new Date().toISOString(),
    model: config.OPENAI_WIDGET_MODEL,
    siteKey: payload.siteKey,
    route: payload.domSnapshot?.route ?? null,
    hasRouteMap: Boolean(payload.siteRouteMap),
    routeCount: payload.siteRouteMap?.routes.length ?? 0,
    requestBody: makePromptTextReadable(openAIRequestBody)
  };
}

function makePromptTextReadable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(makePromptTextReadable);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    output[key] = key === "text" && typeof childValue === "string"
      ? childValue.split("\n")
      : makePromptTextReadable(childValue);
  }

  return output;
}
