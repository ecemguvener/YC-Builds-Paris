import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Collections, SiteDocument } from "./db.js";
import { buildPublicCorsHeaders } from "./cors.js";
import { buildOpenAIEndpointUrl, buildOpenAIRequestBody, type OpenAIWidgetRequest } from "./openai.js";
import { writeOpenAIPromptDebugLog, writeOpenAITimingDebugLog } from "./openai-debug.js";
import { calculateOpenAIPricing, type OpenAITokenUsage } from "./openai-pricing.js";
import { loadSiteRouteMap } from "./atlas/route-map.js";
import { loadSiteBackendInventory } from "./atlas/backend-inventory.js";
import { generateWidgetActionResponse } from "./action-agent.js";

const tokenRequestSchema = z.object({
  siteKey: z.string().min(1)
});

const domRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0)
});

const domElementSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(40),
    tag: z.string().min(1).max(40),
    role: z.string().max(60).optional(),
    label: z.string().max(220).optional(),
    text: z.string().max(320).optional(),
    attributes: z.record(z.string().max(240)).refine((value) => Object.keys(value).length <= 24).optional(),
    state: z
      .object({
        disabled: z.boolean().optional(),
        selected: z.boolean().optional(),
        expanded: z.boolean().optional(),
        checked: z.union([z.boolean(), z.literal("mixed")]).optional(),
        required: z.boolean().optional(),
        focused: z.boolean().optional(),
        hidden: z.boolean().optional(),
        ancestorHidden: z.boolean().optional()
      })
      .optional(),
    rect: domRectSchema,
    visibility: z.enum(["visible", "partially_visible", "above", "below", "outside"]),
    interactive: z.boolean(),
    children: z.array(domElementSchema).max(72).optional()
  })
);

const scrollSurfaceSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["page", "container"]),
  label: z.string().max(180),
  rect: domRectSchema,
  scrollTop: z.number(),
  scrollHeight: z.number().positive(),
  clientHeight: z.number().positive(),
  canScrollUp: z.boolean(),
  canScrollDown: z.boolean()
});

const uiFactMetadataSchema = z
  .object({
    tagName: z.string().min(1).max(40),
    domId: z.string().max(120).optional(),
    name: z.string().max(120).optional(),
    type: z.string().max(60).optional(),
    value: z.string().max(180).optional(),
    testId: z.string().max(120).optional(),
    iconName: z.string().max(80).optional(),
    classTokens: z.array(z.string().max(60)).max(16).optional(),
    data: z.record(z.string().max(140)).refine((value) => Object.keys(value).length <= 16).optional(),
    container: z
      .object({
        kind: z.enum(["row", "card", "listitem", "section", "form", "group"]),
        label: z.string().max(220).optional(),
        role: z.string().max(80).optional(),
        index: z.number().int().min(1).max(10_000).optional()
      })
      .optional(),
    aria: z
      .object({
        controls: z.string().max(120).optional(),
        describedBy: z.string().max(120).optional(),
        current: z.string().max(60).optional(),
        hasPopup: z.string().max(60).optional(),
        live: z.string().max(60).optional(),
        pressed: z.boolean().optional(),
        checked: z.union([z.boolean(), z.literal("mixed")]).optional(),
        invalid: z.boolean().optional()
      })
      .optional()
  })
  .passthrough();

const uiFactSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["button", "link", "input", "heading", "modal", "menu", "table", "text"]),
  role: z.string().max(60).optional(),
  label: z.string().min(1).max(220),
  text: z.string().max(320).optional(),
  href: z.string().max(260).nullable().optional(),
  context: z.string().max(320).optional(),
  metadata: uiFactMetadataSchema.optional(),
  state: z.object({
    visible: z.boolean(),
    disabled: z.boolean(),
    selected: z.boolean(),
    expanded: z.boolean(),
    required: z.boolean()
  }),
  rect: domRectSchema,
  surface: z
    .object({
      id: z.string().min(1).max(40),
      relation: z.enum(["self", "descendant"])
    })
    .optional()
});

const activeSurfaceSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(220).optional(),
  role: z.string().max(60).optional(),
  tagName: z.string().min(1).max(40),
  rect: domRectSchema,
  layout: z.object({
    horizontalBand: z.enum(["left", "center", "right", "full", "spans"]),
    verticalBand: z.enum(["top", "middle", "bottom", "full", "spans"]),
    widthRatio: z.number().min(0).max(1),
    heightRatio: z.number().min(0).max(1),
    viewportAreaRatio: z.number().min(0).max(1)
  }),
  stacking: z.object({
    cssPosition: z.string().max(40),
    zIndex: z.number().nullable(),
    hasBackdrop: z.boolean(),
    containsFocus: z.boolean(),
    pointerEvents: z.string().max(40)
  }),
  factIds: z.array(z.string().min(1).max(40)).max(80),
  sampleLabels: z.array(z.string().max(220)).max(20)
});

const domMarkersSchema = z.object({
  selectedLabels: z.array(z.string().max(220)).max(32),
  visibleHeadings: z.array(z.string().max(220)).max(32),
  primaryActions: z.array(z.string().max(220)).max(32),
  collectionHints: z.array(z.string().max(220)).max(32),
  activeSurfaceLabels: z.array(z.string().max(220)).max(32),
  transientLabels: z.array(z.string().max(220)).max(32)
});

const contentBlockSchema = z.object({
  id: z.string().min(1).max(40),
  heading: z.string().max(220).optional(),
  text: z.string().min(1).max(900),
  rect: domRectSchema,
  nearbyFactIds: z.array(z.string().min(1).max(40)).max(40)
});

const formSummarySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(220),
  rect: domRectSchema,
  fieldIds: z.array(z.string().min(1).max(40)).max(100),
  submitIds: z.array(z.string().min(1).max(40)).max(40),
  validationMessages: z.array(z.string().max(220)).max(12)
});

const domRelationshipSchema = z.object({
  kind: z.enum(["label_for", "described_by", "controls", "form_field", "form_submit", "owns"]),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  label: z.string().max(220).optional()
});

const pageMetaSchema = z.object({
  title: z.string().max(180).optional(),
  route: z.string().min(1).max(240),
  headings: z.array(z.string().min(1).max(180)).max(24),
  landmarks: z.array(z.string().min(1).max(180)).max(24),
  selectedNav: z.array(z.string().min(1).max(180)).max(24),
  activeDialog: z.string().max(180).optional(),
  focusedFactId: z.string().min(1).max(40).optional()
});

const debugTimingsSchema = z.object({
  contextCaptureMs: z.number().min(0).max(3_600_000).optional(),
  candidateCollectionMs: z.number().min(0).max(3_600_000).optional(),
  scrollSurfacesMs: z.number().min(0).max(3_600_000).optional(),
  activeSurfacesMs: z.number().min(0).max(3_600_000).optional(),
  uiFactsCreationMs: z.number().min(0).max(3_600_000).optional(),
  cleanDomTreeMs: z.number().min(0).max(3_600_000).optional(),
  pageMetaMs: z.number().min(0).max(3_600_000).optional(),
  contentBlocksMs: z.number().min(0).max(3_600_000).optional(),
  formsMs: z.number().min(0).max(3_600_000).optional(),
  relationshipsMs: z.number().min(0).max(3_600_000).optional(),
  layoutSettleMs: z.number().min(0).max(3_600_000).optional(),
  domSnapshotBuildMs: z.number().min(0).max(3_600_000).optional(),
  optionalContextSkipped: z.number().int().min(0).max(1).optional(),
  staleRetryCount: z.number().int().min(0).max(10).optional()
});

type PaidWidgetRoute =
  | "realtime_scribe_token"
  | "tts_websocket_token"
  | "openai_stream"
  | "action";

const widgetRouteRateLimits: Record<PaidWidgetRoute, number> = {
  realtime_scribe_token: 60,
  tts_websocket_token: 60,
  openai_stream: 30,
  action: 30
};

const widgetRateLimitWindowMs = 60_000;
const widgetRateLimitBuckets = new Map<string, { windowStartedAt: number; count: number }>();

const openAIRequestSchema = z.object({
  siteKey: z.string().min(1),
  userPrompt: z.string().min(1).max(3000),
  previousResponseId: z.string().min(1).max(200).optional(),
  questionToolCallId: z.string().min(1).max(200).optional(),
  suppressFurtherQuestions: z.boolean().optional(),
  domSnapshot: z.object({
    captureVersion: z.string().max(80).optional(),
    route: z.string().min(1).max(240),
    viewportWidth: z.number().int().positive(),
    viewportHeight: z.number().int().positive(),
    title: z.string().max(180).optional(),
    elements: z.array(domElementSchema).max(140),
    uiFacts: z.array(uiFactSchema).max(220).optional(),
    offscreenUiFacts: z.array(uiFactSchema).max(40).optional(),
    scrollSurfaces: z.array(scrollSurfaceSchema).max(8),
    activeSurfaces: z.array(activeSurfaceSchema).max(12).optional(),
    markers: domMarkersSchema.optional(),
    contentBlocks: z.array(contentBlockSchema).max(30).optional(),
    forms: z.array(formSummarySchema).max(16).optional(),
    relationships: z.array(domRelationshipSchema).max(180).optional(),
    pageMeta: pageMetaSchema.optional()
  }),
  navigationContext: z
    .object({
      originalPrompt: z.string().min(1).max(1200),
      targetRoute: z.string().min(1).max(240),
      previousRoute: z.string().min(1).max(240),
      navigationCount: z.number().int().min(0).max(1)
    })
    .optional(),
  guidanceContext: z
    .object({
      originalPrompt: z.string().min(1).max(1200),
      step: z.number().int().min(1).max(12),
      previousElementId: z.string().min(1).max(40).optional(),
      previousElementLabel: z.string().max(180).optional(),
      previousInstruction: z.string().max(320).optional()
    })
    .optional(),
  debugTimings: debugTimingsSchema.optional()
});

const actionChoiceSchema = z.object({
  label: z.string().min(1).max(240),
  value: z.unknown()
});

const httpBatchResultSchema = z.object({
  ok: z.boolean(),
  status: z.number().int().min(100).max(599).optional(),
  contentType: z.string().max(200).optional(),
  body: z.unknown().optional(),
  error: z.string().max(4000).optional()
});

const goalConversationEntrySchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  text: z.string().min(1).max(1000)
});

const widgetActionRequestSchema = z.object({
  siteKey: z.string().min(1),
  userMessage: z.string().min(1).max(1200).optional(),
  currentPage: z
    .object({
      pathname: z.string().min(1).max(500),
      search: z.string().max(500).optional(),
      hash: z.string().max(300).optional()
    })
    .optional(),
  goalRunState: z.unknown().optional(),
  goalConversationContext: z.array(goalConversationEntrySchema).max(30).optional(),
  selectedChoice: actionChoiceSchema.optional(),
  httpBatchResult: httpBatchResultSchema.optional()
}).strict();

export async function registerWidgetRoutes(
  app: FastifyInstance,
  collections: Collections,
  config: AppConfig
) {
  await registerWidgetStatic(app);

  app.get("/api/widget/config", async (request, reply) => {
    const siteKey = String((request.query as { siteKey?: string }).siteKey ?? "");
    const site = await findSiteByKey(collections, siteKey);
    if (!site) {
      return reply.code(404).send({ error: "site not found" });
    }

    const origin = request.headers.origin ?? null;
    const domainMismatch = origin ? isDomainMismatch(origin, site.domain) : false;

    return {
      site: {
        name: site.name,
        publicSiteKey: site.publicSiteKey,
        domain: site.domain,
        chatTheme: site.chatTheme === "light" || site.chatTheme === "dark" ? site.chatTheme : "system"
      },
      apiBaseUrl: config.PUBLIC_API_URL,
      shortcuts: {
        callToggle: "Alt+C",
        chatToggle: "Alt+V"
      },
      domainWarning: domainMismatch
    };
  });

  app.get("/api/widget/diagnostics", async (request, reply) => {
    const siteKey = String((request.query as { siteKey?: string }).siteKey ?? "");
    const site = await findSiteByKey(collections, siteKey);

    return {
      ok: Boolean(site && config.ELEVENLABS_API_KEY && config.OPENAI_API_KEY),
      siteFound: Boolean(site),
      elevenLabsConfigured: Boolean(config.ELEVENLABS_API_KEY),
      openAiConfigured: Boolean(config.OPENAI_API_KEY),
      voiceIdConfigured: Boolean(config.ELEVENLABS_VOICE_ID),
      apiBaseUrl: config.PUBLIC_API_URL,
      model: config.OPENAI_WIDGET_MODEL
    };
  });

  app.post("/api/widget/transcribe-realtime-token", async (request, reply) => {
    const payload = tokenRequestSchema.parse(request.body);
    const site = await findSiteByKey(collections, payload.siteKey);
    if (!site) {
      return reply.code(404).send({ error: "site not found" });
    }
    if (!enforcePaidWidgetRequest(request, reply, site, "realtime_scribe_token")) {
      return;
    }

    return issueElevenLabsToken(reply, config, "realtime_scribe");
  });

  app.post("/api/widget/tts-websocket-token", async (request, reply) => {
    const payload = tokenRequestSchema.parse(request.body);
    const site = await findSiteByKey(collections, payload.siteKey);
    if (!site) {
      return reply.code(404).send({ error: "site not found" });
    }
    if (!enforcePaidWidgetRequest(request, reply, site, "tts_websocket_token")) {
      return;
    }

    const tokenResponse = await issueElevenLabsToken(reply, config, "tts_websocket");
    if (!tokenResponse) {
      return;
    }

    return {
      ...tokenResponse,
      voiceId: config.ELEVENLABS_VOICE_ID,
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128"
    };
  });

  app.post("/api/widget/openai-stream", async (request, reply) => {
    const requestStartedAt = performance.now();
    const requestId = randomUUID();
    const payload = openAIRequestSchema.parse(request.body);
    console.info(`[widget-openai-latency:${requestId}] request-received`, {
      route: payload.domSnapshot.route,
      userPromptChars: payload.userPrompt.length,
      clientContextCaptureMs: payload.debugTimings?.contextCaptureMs ?? null,
      clientLayoutSettleMs: payload.debugTimings?.layoutSettleMs ?? null,
      clientDomSnapshotBuildMs: payload.debugTimings?.domSnapshotBuildMs ?? null
    });
    const setupStartedAt = performance.now();
    const site = await findSiteByKey(collections, payload.siteKey);
    if (!site) {
      return reply.code(404).send({ error: "site not found" });
    }
    if (!enforcePaidWidgetRequest(request, reply, site, "openai_stream")) {
      return;
    }

    const routeDocStartedAt = performance.now();
    const siteRouteMap = await loadSiteRouteMap(collections, site);
    const routeDocMs = roundDuration(performance.now() - routeDocStartedAt);
    const preparedPayload: OpenAIWidgetRequest = {
      ...payload,
      siteRouteMap
    };
    const timingContext: OpenAIStreamTimingContext = {
      requestId,
      requestStartedAt,
      requestSetupMs: roundDuration(performance.now() - setupStartedAt),
      routeDocMs,
      pipelineBuildMs: null
    };
    logOpenAIStreamLatency(timingContext, "request-setup-complete", {
      routeDocMs,
      hasRouteMap: Boolean(siteRouteMap),
      routeCount: siteRouteMap?.routes.length ?? 0
    });

    return streamOpenAIResponse(reply, config, preparedPayload, timingContext);
  });

  app.post("/api/widget/action", async (request, reply) => {
    if (hasLegacyActionProtocolFields(request.body)) {
      return reply.code(400).send({ error: "invalid request" });
    }
    const payload = widgetActionRequestSchema.parse(request.body);
    const site = await findSiteByKey(collections, payload.siteKey);
    if (!site) {
      return reply.code(404).send({ error: "site not found" });
    }
    if (!enforcePaidWidgetRequest(request, reply, site, "action")) {
      return;
    }

    const backendInventory = await loadSiteBackendInventory(collections, site);
    if (!backendInventory || backendInventory.endpoints.length === 0) {
      return reply.send({
        type: "unavailable",
        message: "Action mode needs backend documentation before I can take actions here."
      });
    }

    if (!config.OPENAI_API_KEY) {
      return reply.code(503).send({ error: "OpenAI is not configured" });
    }

    return reply.send(
      await generateWidgetActionResponse(config, {
        userMessage: payload.userMessage,
        selectedChoice: payload.selectedChoice
          ? { label: payload.selectedChoice.label, value: payload.selectedChoice.value }
          : undefined,
        httpBatchResult: payload.httpBatchResult,
        goalRunState: payload.goalRunState,
        goalConversationContext: payload.goalConversationContext,
        currentPage: payload.currentPage,
        backendInventory
      })
    );
  });
}

function hasLegacyActionProtocolFields(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  if ("actionState" in payload || "executionResult" in payload) {
    return true;
  }
  const httpBatchResult = payload.httpBatchResult;
  if (!httpBatchResult || typeof httpBatchResult !== "object" || Array.isArray(httpBatchResult)) {
    return false;
  }
  const body = (httpBatchResult as { body?: unknown }).body;
  return Array.isArray(body) && body.some((item) =>
    Boolean(item && typeof item === "object" && !Array.isArray(item) && "request" in item)
  );
}

async function registerWidgetStatic(app: FastifyInstance) {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const widgetDistDirectory = path.resolve(currentDirectory, "../../../packages/widget/dist");

  if (!fs.existsSync(widgetDistDirectory)) {
    app.get("/widget.js", async (_request, reply) => {
      reply
        .code(503)
        .type("text/javascript")
        .send("console.warn('Barkan widget has not been built yet. Run npm --workspace @barkan/widget run build.');");
    });
    return;
  }

  await app.register(fastifyStatic, {
    root: widgetDistDirectory,
    prefix: "/",
    decorateReply: false
  });
}

async function findSiteByKey(collections: Collections, siteKey: string): Promise<SiteDocument | null> {
  if (!siteKey.trim()) {
    return null;
  }

  return collections.sites.findOne({ publicSiteKey: siteKey.trim() });
}

function getHeaderToken(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  const token = header?.split(",")[0]?.trim();
  return token || null;
}

function enforcePaidWidgetRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  site: SiteDocument,
  route: PaidWidgetRoute
): boolean {
  const origin = getHeaderToken(request.headers.origin);
  // Domain mismatches are reported by /api/widget/config as domainWarning.
  // In v1 the public site key remains the authorization boundary for widget calls.
  if (!consumeWidgetRateLimit(request, reply, site, route, origin)) {
    return false;
  }

  return true;
}

function consumeWidgetRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  site: SiteDocument,
  route: PaidWidgetRoute,
  origin: string | null
): boolean {
  const limit = widgetRouteRateLimits[route];
  const now = Date.now();
  const clientKey = origin ?? request.ip ?? "unknown";
  const bucketKey = `${route}:${site.publicSiteKey}:${clientKey}`;
  const bucket = widgetRateLimitBuckets.get(bucketKey);

  if (!bucket || now - bucket.windowStartedAt >= widgetRateLimitWindowMs) {
    widgetRateLimitBuckets.set(bucketKey, { windowStartedAt: now, count: 1 });
    pruneExpiredWidgetRateLimitBuckets(now);
    return true;
  }

  bucket.count++;
  if (bucket.count <= limit) {
    return true;
  }

  reply
    .code(429)
    .header("retry-after", String(Math.ceil((widgetRateLimitWindowMs - (now - bucket.windowStartedAt)) / 1000)))
    .send({ error: "widget rate limit exceeded" });
  return false;
}

function pruneExpiredWidgetRateLimitBuckets(now: number) {
  if (widgetRateLimitBuckets.size < 5000) {
    return;
  }

  for (const [key, bucket] of widgetRateLimitBuckets.entries()) {
    if (now - bucket.windowStartedAt >= widgetRateLimitWindowMs) {
      widgetRateLimitBuckets.delete(key);
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roundDuration(durationMs: number): number {
  return Math.max(0, Math.round(durationMs));
}

function logOpenAIStreamLatency(
  timingContext: OpenAIStreamTimingContext,
  label: string,
  details: Record<string, unknown> = {}
) {
  console.info(`[widget-openai-latency:${timingContext.requestId}] ${label}`, {
    elapsedMs: roundDuration(performance.now() - timingContext.requestStartedAt),
    ...details
  });
}

function countOpenAIDomElements(elements: Array<{ children?: unknown }> | undefined): number {
  if (!Array.isArray(elements)) {
    return 0;
  }

  return elements.reduce(
    (count, element) =>
      count + 1 + countOpenAIDomElements(Array.isArray(element.children) ? element.children as Array<{ children?: unknown }> : []),
    0
  );
}

function getOpenAIStreamEventType(eventData: string): string {
  try {
    const parsed = JSON.parse(eventData) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : "unknown";
  } catch {
    return "unparseable";
  }
}

async function issueElevenLabsToken(
  reply: FastifyReply,
  config: AppConfig,
  tokenType: "realtime_scribe" | "tts_websocket"
) {
  if (!config.ELEVENLABS_API_KEY) {
    reply.code(503).send({ error: "ElevenLabs is not configured" });
    return null;
  }

  const upstreamResponse = await fetch(
    `https://api.elevenlabs.io/v1/single-use-token/${tokenType}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.ELEVENLABS_API_KEY
      }
    }
  );
  const responseText = await upstreamResponse.text();

  if (!upstreamResponse.ok) {
    console.error(
      `[elevenlabs-token:${tokenType}] ${upstreamResponse.status} ${responseText.slice(0, 500)}`
    );
    reply
      .code(upstreamResponse.status)
      .header("content-type", upstreamResponse.headers.get("content-type") || "application/json")
      .send(responseText);
    return null;
  }

  const responseJson = JSON.parse(responseText) as { token?: string };
  return {
    token: responseJson.token ?? "",
    expiresInSeconds: 15 * 60
  };
}

interface OpenAIStreamTimingContext {
  requestId: string;
  requestStartedAt: number;
  requestSetupMs: number;
  routeDocMs: number | null;
  pipelineBuildMs: number | null;
}

async function streamOpenAIResponse(
  reply: FastifyReply,
  config: AppConfig,
  payload: OpenAIWidgetRequest,
  timingContext: OpenAIStreamTimingContext
) {
  if (!config.OPENAI_API_KEY) {
    return reply.code(503).send({ error: "OpenAI is not configured" });
  }

  const promptStartedAt = performance.now();
  const openAIRequestBody = buildOpenAIRequestBody(config, payload);
  const creatingPromptMs = roundDuration(performance.now() - promptStartedAt);
  timingContext.pipelineBuildMs = creatingPromptMs;
  const requestBodyJson = JSON.stringify(openAIRequestBody);
  const requestBodyBytes = Buffer.byteLength(requestBodyJson, "utf8");
  logOpenAIStreamLatency(timingContext, "request-built", {
    route: payload.domSnapshot.route,
    userPromptChars: payload.userPrompt.length,
    requestBodyBytes,
    domElements: countOpenAIDomElements(payload.domSnapshot.elements),
    uiFacts: payload.domSnapshot.uiFacts?.length ?? 0,
    offscreenUiFacts: payload.domSnapshot.offscreenUiFacts?.length ?? 0,
    contentBlocks: payload.domSnapshot.contentBlocks?.length ?? 0,
    forms: payload.domSnapshot.forms?.length ?? 0,
    relationships: payload.domSnapshot.relationships?.length ?? 0,
    hasRouteMap: Boolean(payload.siteRouteMap),
    routeDocMs: timingContext.routeDocMs,
    requestSetupMs: timingContext.requestSetupMs,
    creatingPromptMs,
    clientTimings: payload.debugTimings ?? {}
  });
  let promptDebugLogScheduled = false;
  const schedulePromptDebugLog = () => {
    if (promptDebugLogScheduled) {
      return;
    }
    promptDebugLogScheduled = true;
    setTimeout(() => {
      void writeOpenAIPromptDebugLog(config, payload, openAIRequestBody).catch((error) => {
        console.warn(`[openai-debug] failed to write prompt log: ${getErrorMessage(error)}`);
      });
    }, 0);
  };

  const upstreamStartedAt = performance.now();
  let upstreamResponse: Response;
  try {
    logOpenAIStreamLatency(timingContext, "openai-fetch-start", {
      requestBodyBytes,
      model: config.OPENAI_WIDGET_MODEL
    });
    upstreamResponse = await fetch(buildOpenAIEndpointUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.OPENAI_API_KEY}`
      },
      body: requestBodyJson
    });
  } catch (error) {
    logOpenAIStreamLatency(timingContext, "openai-fetch-error", {
      error: getErrorMessage(error)
    });
    await writeOpenAITimingLogSafely(config, payload, timingContext, {
      status: "stream_error",
      creatingPromptMs,
      upstreamStartedAt,
      upstreamHeadersMs: null,
      firstTextAt: null,
      streamEndedAt: performance.now(),
      textChunkCount: 0,
      error: getErrorMessage(error)
    });
    throw error;
  }
  const upstreamHeadersMs = roundDuration(performance.now() - upstreamStartedAt);
  logOpenAIStreamLatency(timingContext, "openai-headers", {
    upstreamHeadersMs,
    status: upstreamResponse.status,
    ok: upstreamResponse.ok,
    contentType: upstreamResponse.headers.get("content-type")
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const errorBody = await upstreamResponse.text();
    logOpenAIStreamLatency(timingContext, "openai-upstream-error", {
      status: upstreamResponse.status,
      errorPreview: errorBody.slice(0, 500)
    });
    await writeOpenAITimingLogSafely(config, payload, timingContext, {
      status: "upstream_error",
      creatingPromptMs,
      upstreamStartedAt,
      upstreamHeadersMs,
      firstTextAt: null,
      streamEndedAt: performance.now(),
      textChunkCount: 0,
      error: `OpenAI upstream returned ${upstreamResponse.status}`
    });
    return reply
      .code(upstreamResponse.status)
      .header("content-type", upstreamResponse.headers.get("content-type") || "application/json")
      .send(errorBody);
  }

  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    ...buildCorsStreamHeaders(reply)
  });
  reply.raw.flushHeaders?.();

  reply.raw.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);
  logOpenAIStreamLatency(timingContext, "sse-ready-sent", {
    upstreamHeadersMs
  });
  const emittedTypedEvents = {
    directive: false,
    question: false
  };

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let eventBuffer = "";
  const assistantStreamState = createAssistantStreamState();
  let emittedTextChunkCount = 0;
  let firstTextAt: number | null = null;
  let tokenUsage: OpenAITokenUsage | null = null;
  let emittedResponseId: string | null = null;
  let upstreamChunkCount = 0;
  let upstreamTotalBytes = 0;
  let firstUpstreamChunkLogged = false;
  let firstUpstreamEventLogged = false;
  let firstQuestionLogged = false;
  const askUserCallIdsByOutputIndex = new Map<number, string>();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      upstreamChunkCount += 1;
      upstreamTotalBytes += value.byteLength;
      if (!firstUpstreamChunkLogged) {
        firstUpstreamChunkLogged = true;
        logOpenAIStreamLatency(timingContext, "first-upstream-chunk", {
          upstreamChunkCount,
          upstreamTotalBytes,
          chunkBytes: value.byteLength
        });
      }
      eventBuffer += decoder.decode(value, { stream: true });
      const readyEvents = drainSseEvents(eventBuffer);
      eventBuffer = readyEvents.remainingBuffer;

      for (const eventData of readyEvents.events) {
        if (!firstUpstreamEventLogged) {
          firstUpstreamEventLogged = true;
          logOpenAIStreamLatency(timingContext, "first-upstream-event", {
            eventType: getOpenAIStreamEventType(eventData),
            upstreamChunkCount,
            upstreamTotalBytes
          });
        }
        rememberAskUserToolCallId(eventData, askUserCallIdsByOutputIndex);
        const responseId = extractOpenAIResponseIdFromEvent(eventData);
        if (responseId && responseId !== emittedResponseId) {
          emittedResponseId = responseId;
          reply.raw.write(`data: ${JSON.stringify({ type: "openai_response", responseId })}\n\n`);
        }

        tokenUsage = extractOpenAIUsageFromEvent(eventData) ?? tokenUsage;
        const toolQuestion = extractAskUserToolQuestionsFromEvent(eventData, askUserCallIdsByOutputIndex);
        if (toolQuestion && !emittedTypedEvents.question) {
          emittedTypedEvents.question = true;
          reply.raw.write(
            `data: ${JSON.stringify(buildQuestionEventPayload(toolQuestion.questions, toolQuestion.toolCallId))}\n\n`
          );
          if (!firstQuestionLogged) {
            firstQuestionLogged = true;
            logOpenAIStreamLatency(timingContext, "first-question-sent", {
              questionCount: toolQuestion.questions.length,
              upstreamChunkCount,
              upstreamTotalBytes
            });
          }
          schedulePromptDebugLog();
        }
        const text = extractOpenAITextFromEvent(eventData);
        if (!text) {
          continue;
        }

        const emittedAssistantText = emitStructuredAssistantEvents(
          reply,
          text,
          assistantStreamState,
          emittedTypedEvents
        );
        if (!emittedAssistantText) {
          continue;
        }

        emittedTextChunkCount++;
        if (firstTextAt === null) {
          firstTextAt = performance.now();
          logOpenAIStreamLatency(timingContext, "first-text-sent", {
            aiThinkingMs: roundDuration(firstTextAt - upstreamStartedAt),
            emittedTextChunkCount,
            upstreamChunkCount,
            upstreamTotalBytes
          });
        }
        schedulePromptDebugLog();
      }
    }

    eventBuffer += decoder.decode();
    const finalEvents = drainSseEvents(`${eventBuffer}\n\n`);
    for (const eventData of finalEvents.events) {
      rememberAskUserToolCallId(eventData, askUserCallIdsByOutputIndex);
      const responseId = extractOpenAIResponseIdFromEvent(eventData);
      if (responseId && responseId !== emittedResponseId) {
        emittedResponseId = responseId;
        reply.raw.write(`data: ${JSON.stringify({ type: "openai_response", responseId })}\n\n`);
      }

      tokenUsage = extractOpenAIUsageFromEvent(eventData) ?? tokenUsage;
      const toolQuestion = extractAskUserToolQuestionsFromEvent(eventData, askUserCallIdsByOutputIndex);
      if (toolQuestion && !emittedTypedEvents.question) {
        emittedTypedEvents.question = true;
        reply.raw.write(
          `data: ${JSON.stringify(buildQuestionEventPayload(toolQuestion.questions, toolQuestion.toolCallId))}\n\n`
        );
        if (!firstQuestionLogged) {
          firstQuestionLogged = true;
          logOpenAIStreamLatency(timingContext, "first-question-sent", {
            questionCount: toolQuestion.questions.length,
            upstreamChunkCount,
            upstreamTotalBytes,
            finalBuffer: true
          });
        }
        schedulePromptDebugLog();
      }
      const text = extractOpenAITextFromEvent(eventData);
      if (text) {
        const emittedAssistantText = emitStructuredAssistantEvents(
          reply,
          text,
          assistantStreamState,
          emittedTypedEvents
        );
        if (!emittedAssistantText) {
          continue;
        }

        emittedTextChunkCount++;
        if (firstTextAt === null) {
          firstTextAt = performance.now();
          logOpenAIStreamLatency(timingContext, "first-text-sent", {
            aiThinkingMs: roundDuration(firstTextAt - upstreamStartedAt),
            emittedTextChunkCount,
            upstreamChunkCount,
            upstreamTotalBytes,
            finalBuffer: true
          });
        }
        schedulePromptDebugLog();
      }
    }

    if (emittedTextChunkCount === 0 && !emittedTypedEvents.question) {
      reply.raw.write(
        `data: ${JSON.stringify({
          type: "error",
          error: "OpenAI returned no text chunks."
        })}\n\n`
      );
    }

    reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    reply.raw.end();
    logOpenAIStreamLatency(timingContext, "stream-complete", {
      totalServerMs: roundDuration(performance.now() - timingContext.requestStartedAt),
      upstreamHeadersMs,
      firstTextMs: firstTextAt === null ? null : roundDuration(firstTextAt - timingContext.requestStartedAt),
      emittedTextChunkCount,
      upstreamChunkCount,
      upstreamTotalBytes,
      tokenUsage
    });
    await writeOpenAITimingLogSafely(config, payload, timingContext, {
      status: "completed",
      creatingPromptMs,
      upstreamStartedAt,
      upstreamHeadersMs,
      firstTextAt,
      streamEndedAt: performance.now(),
      textChunkCount: emittedTextChunkCount,
      tokenUsage
    });
  } catch (error) {
    reply.raw.write(`data: ${JSON.stringify({ type: "error", error: getErrorMessage(error) })}\n\n`);
    reply.raw.end();
    logOpenAIStreamLatency(timingContext, "stream-error", {
      error: getErrorMessage(error),
      emittedTextChunkCount,
      upstreamChunkCount,
      upstreamTotalBytes
    });
    await writeOpenAITimingLogSafely(config, payload, timingContext, {
      status: "stream_error",
      creatingPromptMs,
      upstreamStartedAt,
      upstreamHeadersMs,
      firstTextAt,
      streamEndedAt: performance.now(),
      textChunkCount: emittedTextChunkCount,
      tokenUsage,
      error: getErrorMessage(error)
    });
  }

  return reply;
}

interface AssistantStreamState {
  rawText: string;
  emittedAssistantTextLength: number;
}

interface TypedEventState {
  directive: boolean;
  question: boolean;
}

interface StructuredDirective {
  kind: "point" | "element" | "scroll" | "scrollTo" | "navigate";
  elementId?: string;
  surfaceId?: string;
  direction?: "up" | "down";
  route?: string;
  box?: { ymin: number; xmin: number; ymax: number; xmax: number };
  label?: string;
  needFurtherAction?: boolean;
}

interface AssistantQuestionDirective {
  question: string;
  choices: Array<{ label: string; value: string; recommended?: boolean }>;
}

interface AssistantQuestionEvent {
  questions: AssistantQuestionDirective[];
  toolCallId?: string;
}

function createAssistantStreamState(): AssistantStreamState {
  return {
    rawText: "",
    emittedAssistantTextLength: 0
  };
}

function emitStructuredAssistantEvents(
  reply: FastifyReply,
  text: string,
  state: AssistantStreamState,
  emitted: TypedEventState
): boolean {
  state.rawText += text;

  const directive = parseStructuredDirective(state.rawText);
  if (isWaitingForLeadingStructuredDirective(state.rawText)) {
    return false;
  }

  const assistantText = stripStructuredDirectives(state.rawText);
  if (directive && !emitted.directive) {
    if (isWaitingForNeedFurtherActionDirective(state.rawText)) {
      return false;
    }
    emitted.directive = true;
    emitStructuredDirective(reply, {
      ...directive,
      needFurtherAction: parseNeedFurtherActionDirective(state.rawText) ?? false
    });
  }

  const question = parseQuestionDirective(state.rawText);
  if (question && !emitted.question) {
    emitted.question = true;
    reply.raw.write(`data: ${JSON.stringify(buildQuestionEventPayload([question]))}\n\n`);
  }

  if (assistantText.length < state.emittedAssistantTextLength) {
    state.emittedAssistantTextLength = assistantText.length;
    return false;
  }

  const newAssistantText = assistantText.slice(state.emittedAssistantTextLength);
  state.emittedAssistantTextLength = assistantText.length;
  if (!newAssistantText) {
    return false;
  }

  reply.raw.write(`data: ${JSON.stringify({ type: "assistant_text", text: newAssistantText })}\n\n`);
  return true;
}

function emitStructuredDirective(
  reply: FastifyReply,
  directive: StructuredDirective
) {
  if (directive.kind === "navigate" && directive.route) {
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "navigate",
        route: directive.route,
        label: directive.label
      })}\n\n`
    );
    return;
  }

  if (directive.kind === "element" && directive.elementId) {
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "point",
        elementId: directive.elementId,
        label: directive.label,
        ...(directive.needFurtherAction === true ? { needFurtherAction: true } : {})
      })}\n\n`
    );
    return;
  }

  if (directive.kind === "point") {
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "point",
        box: directive.box,
        label: directive.label,
        ...(directive.needFurtherAction === true ? { needFurtherAction: true } : {})
      })}\n\n`
    );
    return;
  }

  if (directive.kind === "scroll") {
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "scroll",
        surfaceId: directive.surfaceId,
        direction: directive.direction,
        label: directive.label,
        ...(directive.needFurtherAction === true ? { needFurtherAction: true } : {})
      })}\n\n`
    );
    return;
  }

  if (directive.kind === "scrollTo") {
    reply.raw.write(
      `data: ${JSON.stringify({
        type: "scroll",
        elementId: directive.elementId,
        label: directive.label,
        ...(directive.needFurtherAction === true ? { needFurtherAction: true } : {})
      })}\n\n`
    );
  }
}

function parseStructuredDirective(text: string): StructuredDirective | null {
  const navigateMatch = text.match(/\[NAVIGATE:([^\]:]+):([^\]]+)\]/i);
  if (navigateMatch) {
    return {
      kind: "navigate",
      route: navigateMatch[1].trim(),
      label: navigateMatch[2].trim()
    };
  }

  const scrollToMatch = text.match(/\[SCROLLTO:([^\]:]+):([^\]]+)\]/i);
  if (scrollToMatch) {
    return {
      kind: "scrollTo",
      elementId: scrollToMatch[1].trim(),
      label: scrollToMatch[2].trim()
    };
  }

  const scrollMatch = text.match(/\[SCROLL:([^\]:]+):(up|down):([^\]]+)\]/i);
  if (scrollMatch) {
    return {
      kind: "scroll",
      surfaceId: scrollMatch[1].trim(),
      direction: scrollMatch[2].toLowerCase() === "up" ? "up" : "down",
      label: scrollMatch[3].trim()
    };
  }

  const elementMatch = text.match(/\[(?:POINTELEMENT|POINELEMENT):([^\]:]+):([^\]]+)\]/i);
  if (elementMatch) {
    return {
      kind: "element",
      elementId: elementMatch[1].trim(),
      label: elementMatch[2].trim()
    };
  }

  const incompleteElementMatch = text.match(/\[(?:POINTELEMENT|POINELEMENT):([^\]:\]\s]+):([^\]\n]{1,80})$/i);
  if (incompleteElementMatch) {
    return {
      kind: "element",
      elementId: incompleteElementMatch[1].trim(),
      label: incompleteElementMatch[2].trim()
    };
  }

  const pointMatch = text.match(/\[(POINTBOX|POINT):([^\]]+)\]/i);
  if (!pointMatch) {
    return null;
  }

  const body = pointMatch[2].trim();
  if (pointMatch[1].toUpperCase() !== "POINTBOX" || body.toLowerCase() === "none") {
    return {
      kind: "point",
      label: body.toLowerCase() === "none" ? undefined : body
    };
  }

  const boxMatch = body.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*:(.+?)\s*$/i);
  if (!boxMatch) {
    return null;
  }

  return {
    kind: "point",
    box: {
      ymin: clampNormalizedCoordinate(parseInt(boxMatch[1], 10)),
      xmin: clampNormalizedCoordinate(parseInt(boxMatch[2], 10)),
      ymax: clampNormalizedCoordinate(parseInt(boxMatch[3], 10)),
      xmax: clampNormalizedCoordinate(parseInt(boxMatch[4], 10))
    },
    label: boxMatch[5].trim()
  };
}

function parseNeedFurtherActionDirective(text: string): boolean | null {
  const match = text.match(/\[NEED_FURTHER_ACTION:(true|false)\]/i);
  if (!match) {
    return null;
  }

  return match[1].toLowerCase() === "true";
}

function parseQuestionDirective(text: string): AssistantQuestionDirective | null {
  const match = text.match(/\[ASK_USER:([^\]]+)\]/i);
  if (!match) {
    return null;
  }

  const parts = match[1]
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const [question, ...rawChoices] = parts;
  if (!question) {
    return null;
  }

  const choices = rawChoices.slice(0, 4).map((choice) => ({
    label: choice,
    value: choice
  }));

  return { question, choices };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildQuestionEventPayload(questions: AssistantQuestionDirective[], toolCallId?: string) {
  const firstQuestion = questions[0];
  return {
    type: "question",
    ...(toolCallId ? { toolCallId } : {}),
    ...(firstQuestion ? { question: firstQuestion.question, choices: firstQuestion.choices } : {}),
    questions
  };
}

function rememberAskUserToolCallId(eventData: string, callIdsByOutputIndex: Map<number, string>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventData);
  } catch {
    return;
  }

  if (!isRecord(parsed)) {
    return;
  }

  const item = isRecord(parsed.item) ? parsed.item : null;
  const outputIndex = typeof parsed.output_index === "number" ? parsed.output_index : null;
  const callId = typeof item?.call_id === "string" ? item.call_id : "";
  if (outputIndex === null || item?.name !== "ask_user" || !callId) {
    return;
  }

  callIdsByOutputIndex.set(outputIndex, callId);
}

function extractAskUserToolQuestionsFromEvent(
  eventData: string,
  callIdsByOutputIndex: Map<number, string> = new Map()
): AssistantQuestionEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventData);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const eventType = typeof parsed.type === "string" ? parsed.type : "";
  if (eventType !== "response.function_call_arguments.done" && eventType !== "response.output_item.done") {
    return null;
  }

  const item = isRecord(parsed.item) ? parsed.item : null;
  const name = typeof item?.name === "string" ? item.name : typeof parsed.name === "string" ? parsed.name : "";
  if (name !== "ask_user") {
    return null;
  }
  const outputIndex = typeof parsed.output_index === "number" ? parsed.output_index : null;
  const toolCallId =
    typeof item?.call_id === "string"
      ? item.call_id
      : typeof parsed.call_id === "string"
        ? parsed.call_id
        : outputIndex === null
          ? undefined
          : callIdsByOutputIndex.get(outputIndex);

  const rawArguments =
    typeof parsed.arguments === "string"
      ? parsed.arguments
      : typeof item?.arguments === "string"
        ? item.arguments
        : "";
  if (!rawArguments) {
    return null;
  }

  let args: unknown;
  try {
    args = JSON.parse(rawArguments);
  } catch {
    return null;
  }

  if (!isRecord(args)) {
    return null;
  }

  const questionCandidates = Array.isArray(args.questions)
    ? args.questions
    : typeof args.question === "string" && Array.isArray(args.options)
      ? [{ question: args.question, options: args.options }]
      : [];
  const questions = questionCandidates
    .slice(0, 3)
    .map((candidate) => parseAskUserQuestion(candidate))
    .filter((question): question is AssistantQuestionDirective => Boolean(question));

  return questions.length > 0 ? { questions, ...(toolCallId ? { toolCallId } : {}) } : null;
}

function parseAskUserQuestion(value: unknown): AssistantQuestionDirective | null {
  if (!isRecord(value) || typeof value.question !== "string" || !Array.isArray(value.options)) {
    return null;
  }

  const question = value.question.trim();
  if (!question) {
    return null;
  }

  const choices = value.options
    .slice(0, 4)
    .map((option) => {
      if (!isRecord(option) || typeof option.label !== "string") {
        return null;
      }
      const label = option.label.trim();
      const choiceValue = typeof option.value === "string" && option.value.trim() ? option.value.trim() : label;
      return label
        ? {
            label,
            value: choiceValue,
            ...(option.recommended === true ? { recommended: true } : {})
          }
        : null;
    })
    .filter((choice): choice is { label: string; value: string; recommended?: boolean } => Boolean(choice));

  return choices.length >= 2 ? { question, choices } : null;
}

function stripStructuredDirectives(text: string): string {
  return text
    .replace(/\[NAVIGATE:[^\]]+\]/gi, " ")
    .replace(/\[SCROLLTO:[^\]]+\]/gi, " ")
    .replace(/\[SCROLL:[^\]]+\]/gi, " ")
    .replace(/\[(?:POINTELEMENT|POINELEMENT):[^\]]+\]/gi, " ")
    .replace(/\[(?:POINTBOX|POINT):[^\]]+\]/gi, " ")
    .replace(/\[NEED_FURTHER_ACTION:(?:true|false)\]/gi, " ")
    .replace(/\[ASK_USER:[^\]]+\]/gi, " ")
    .replace(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT):[^\]]*$/gi, " ")
    .replace(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT)[^\]]*$/gi, " ")
    .replace(/\[NEED_FURTHER_ACTION(?::(?:true|false)?)?$/gi, " ")
    .replace(/\[(?:NEED|need)(?:_(?:FURTHER|further|ACTION|action))*:? *(?:true|false)?(?=[A-Za-z\s]|$)/g, " ")
    .replace(/\[ASK_USER(?::[^\]]*)?$/gi, " ")
    .replace(/\s+/g, " ")
    .trimStart();
}

function isWaitingForNeedFurtherActionDirective(text: string): boolean {
  const directiveMatch = text.match(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT):[^\]]+\]/i);
  if (!directiveMatch) {
    return false;
  }

  const afterDirective = text.slice((directiveMatch.index ?? 0) + directiveMatch[0].length).trimStart();
  if (!afterDirective) {
    return true;
  }

  if (/^\[NEED_FURTHER_ACTION:(true|false)\]/i.test(afterDirective)) {
    return false;
  }

  return isPrefixOfNeedFurtherActionDirective(afterDirective);
}

function isPrefixOfNeedFurtherActionDirective(text: string): boolean {
  const normalizedText = text.trimStart().toUpperCase();
  return (
    "[NEED_FURTHER_ACTION:TRUE]".startsWith(normalizedText) ||
    "[NEED_FURTHER_ACTION:FALSE]".startsWith(normalizedText)
  );
}

function isWaitingForLeadingStructuredDirective(text: string): boolean {
  const trimmedText = text.trimStart();
  if (!trimmedText.startsWith("[")) {
    return false;
  }

  if (trimmedText.includes("]")) {
    return false;
  }

  return /^\[(?:P|PO|POI|POIN|POINT|POINTB|POINTBO|POINTBOX|POINE|POINEL|POINELE|POINELEM|POINELEME|POINELEMEN|POINELEMENT|POINTE|POINTEL|POINTELE|POINTELEM|POINTELEME|POINTELEMEN|POINTELEMENT|S|SC|SCR|SCRO|SCROL|SCROLL|SCROLLT|SCROLLTO|N|NA|NAV|NAVI|NAVIG|NAVIGA|NAVIGAT|NAVIGATE)?(?::|$)/i.test(
    trimmedText
  );
}

function clampNormalizedCoordinate(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1000, value));
}

async function writeOpenAITimingLogSafely(
  config: AppConfig,
  payload: OpenAIWidgetRequest,
  timingContext: OpenAIStreamTimingContext,
  timing: {
    status: "completed" | "upstream_error" | "stream_error";
    creatingPromptMs: number;
    upstreamStartedAt: number;
    upstreamHeadersMs: number | null;
    firstTextAt: number | null;
    streamEndedAt: number;
    textChunkCount: number;
    tokenUsage?: OpenAITokenUsage | null;
    error?: string;
  }
) {
  try {
    await writeOpenAITimingDebugLog(config, {
      requestId: timingContext.requestId,
      siteKey: payload.siteKey,
      route: payload.domSnapshot?.route ?? null,
      model: config.OPENAI_WIDGET_MODEL,
      status: timing.status,
      promptProcessing: {
        contextCaptureMs: payload.debugTimings?.contextCaptureMs ?? null,
        candidateCollectionMs: payload.debugTimings?.candidateCollectionMs ?? null,
        scrollSurfacesMs: payload.debugTimings?.scrollSurfacesMs ?? null,
        activeSurfacesMs: payload.debugTimings?.activeSurfacesMs ?? null,
        layoutSettleMs: payload.debugTimings?.layoutSettleMs ?? null,
        creatingUiFactsMs: payload.debugTimings?.uiFactsCreationMs ?? null,
        cleanDomTreeMs: payload.debugTimings?.cleanDomTreeMs ?? null,
        pageMetaMs: payload.debugTimings?.pageMetaMs ?? null,
        contentBlocksMs: payload.debugTimings?.contentBlocksMs ?? null,
        formsMs: payload.debugTimings?.formsMs ?? null,
        relationshipsMs: payload.debugTimings?.relationshipsMs ?? null,
        domSnapshotBuildMs: payload.debugTimings?.domSnapshotBuildMs ?? null,
        optionalContextSkipped: payload.debugTimings?.optionalContextSkipped ?? null,
        staleRetryCount: payload.debugTimings?.staleRetryCount ?? null,
        gettingRelatedDocumentationMs: timingContext.routeDocMs,
        pipelineBuildMs: timingContext.pipelineBuildMs,
        creatingPromptMs: timing.creatingPromptMs
      },
      aiThinkingMs: timing.firstTextAt === null ? null : roundDuration(timing.firstTextAt - timing.upstreamStartedAt),
      returningAnswerMs: timing.firstTextAt === null ? null : roundDuration(timing.streamEndedAt - timing.firstTextAt),
      requestSetupMs: timingContext.requestSetupMs,
      upstreamHeadersMs: timing.upstreamHeadersMs,
      totalServerMs: roundDuration(timing.streamEndedAt - timingContext.requestStartedAt),
      textChunkCount: timing.textChunkCount,
      ...(timing.tokenUsage
        ? {
            tokenUsage: timing.tokenUsage,
            pricing: calculateOpenAIPricing(config.OPENAI_WIDGET_MODEL, timing.tokenUsage)
          }
        : {}),
      ...(timing.error ? { error: timing.error } : {})
    });
  } catch (error) {
    console.warn(`[openai-debug] failed to write timing log: ${getErrorMessage(error)}`);
  }
}

function drainSseEvents(buffer: string): { events: string[]; remainingBuffer: string } {
  const events: string[] = [];
  let remainingBuffer = buffer;

  while (true) {
    const match = remainingBuffer.match(/\r?\n\r?\n/);
    if (!match || match.index === undefined) {
      break;
    }

    const rawEvent = remainingBuffer.slice(0, match.index);
    remainingBuffer = remainingBuffer.slice(match.index + match[0].length);
    const eventData = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (eventData && eventData !== "[DONE]") {
      events.push(eventData);
    }
  }

  return { events, remainingBuffer };
}

function extractOpenAIUsageFromEvent(eventData: string): OpenAITokenUsage | null {
  let parsed: {
    response?: {
      usage?: OpenAIUsagePayload;
    };
    usage?: OpenAIUsagePayload;
  };

  try {
    parsed = JSON.parse(eventData) as typeof parsed;
  } catch {
    return null;
  }

  const usage = parsed.response?.usage ?? parsed.usage;
  if (!usage) {
    return null;
  }

  const inputTokens = readTokenCount(usage.input_tokens);
  const outputTokens = readTokenCount(usage.output_tokens);
  return {
    input_tokens: inputTokens,
    cached_input_tokens: readTokenCount(usage.input_tokens_details?.cached_tokens ?? usage.cached_tokens),
    output_tokens: outputTokens,
    total_tokens: readTokenCount(usage.total_tokens) || inputTokens + outputTokens
  };
}

function extractOpenAIResponseIdFromEvent(eventData: string): string | null {
  let parsed: {
    id?: unknown;
    response?: {
      id?: unknown;
    };
  };

  try {
    parsed = JSON.parse(eventData) as typeof parsed;
  } catch {
    return null;
  }

  const responseId = parsed.response?.id ?? (typeof parsed.id === "string" && parsed.id.startsWith("resp_") ? parsed.id : null);
  return typeof responseId === "string" && responseId ? responseId : null;
}

interface OpenAIUsagePayload {
  input_tokens?: unknown;
  input_tokens_details?: {
    cached_tokens?: unknown;
  };
  cached_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
}

function extractOpenAITextFromEvent(eventData: string): string {
  let parsed: {
    type?: string;
    delta?: string;
    error?: { message?: string } | string;
    response?: {
      status?: string;
      error?: { message?: string } | string;
      incomplete_details?: { reason?: string };
    };
  };

  try {
    parsed = JSON.parse(eventData) as typeof parsed;
  } catch {
    return "";
  }

  if (parsed.type === "response.output_text.delta") {
    return typeof parsed.delta === "string" ? parsed.delta : "";
  }

  if (
    parsed.type === "response.failed" ||
    parsed.type === "response.incomplete" ||
    parsed.type === "response.error" ||
    parsed.type === "error"
  ) {
    throw new Error(readOpenAIStreamError(parsed));
  }

  return "";
}

function readTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function readOpenAIStreamError(event: {
  type?: string;
  error?: { message?: string } | string;
  response?: {
    status?: string;
    error?: { message?: string } | string;
    incomplete_details?: { reason?: string };
  };
}): string {
  if (typeof event.error === "string") {
    return event.error;
  }

  if (event.error?.message) {
    return event.error.message;
  }

  if (typeof event.response?.error === "string") {
    return event.response.error;
  }

  if (event.response?.error?.message) {
    return event.response.error.message;
  }

  if (event.response?.incomplete_details?.reason) {
    return `OpenAI stream incomplete: ${event.response.incomplete_details.reason}`;
  }

  return `OpenAI stream error: ${event.type || "unknown"}`;
}

function buildCorsStreamHeaders(reply: FastifyReply): Record<string, string> {
  return buildPublicCorsHeaders(reply.request.headers.origin);
}

function isDomainMismatch(origin: string, configuredDomain: string): boolean {
  const originHost = getDomainHostname(origin);
  const configuredHost = getDomainHostname(configuredDomain);

  if (!originHost || !configuredHost) {
    return false;
  }

  return originHost !== configuredHost && !originHost.endsWith(`.${configuredHost}`);
}

function getDomainHostname(value: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z\d+\-.]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
