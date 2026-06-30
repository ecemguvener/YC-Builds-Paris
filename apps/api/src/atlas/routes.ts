import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { ApiKeyDocument, AtlasProjectDocument, Collections, SiteDocument, UserDocument } from "../db.js";
import { generateAtlasBackendInventory, generateAtlasRouteMap, selectAtlasDocumentationFiles } from "./openai.js";
import { createAtlasProjectId, hashApiKey, isAtlasProjectId } from "../security.js";
import { parseBearerToken } from "../shared/http.js";
import { getAtlasAgentStatus } from "./agent-bridge.js";

export interface ApiKeyAuthContext {
  apiKey: ApiKeyDocument;
  user: UserDocument;
}

interface AtlasProjectAccessResult {
  project: AtlasProjectDocument;
  created: boolean;
}

const atlasFileSelectionSchema = z.object({
  project_id: z.string().min(1),
  file_paths: z.array(z.string().min(1)).min(1).max(500)
});

const atlasSourceBatchSchema = z.object({
  project_id: z.string().min(1),
  files: z.array(z.object({
    path: z.string().min(1),
    chunk_index: z.number().int().min(0),
    chunk_count: z.number().int().min(1),
    content: z.string()
  })).min(1).max(30)
});

export function registerAtlasRoutes(
  app: FastifyInstance,
  collections: Collections,
  config: AppConfig
) {
  app.post("/api/atlas/connect", async (request, reply) => {
    const authContext = await requireApiKeyAuth(request, reply, collections, config);
    if (!authContext) {
      return;
    }

    const site = await findApiKeySite(collections, authContext);
    const projectAccess = await resolveAtlasProjectForApiKey(collections, authContext, {
      createIfMissing: true,
      projectName: site?.name
    });
    if (!projectAccess) {
      return reply.code(403).send({ error: "API key is not authorized for this project" });
    }

    return {
      ok: true,
      user: serializeAtlasUser(authContext.user),
      site: site ? serializeAtlasSite(site) : null,
      project: serializeAtlasProject(projectAccess.project)
    };
  });

  app.get("/api/atlas/agent/status", async (request, reply) => {
    const authContext = await requireApiKeyAuth(request, reply, collections, config);
    if (!authContext) {
      return;
    }

    const projectAccess = await resolveAtlasProjectForApiKey(collections, authContext);
    if (!projectAccess) {
      return reply.code(403).send({ error: "API key is not authorized for an Atlas project" });
    }

    const agentStatus = getAtlasAgentStatus(projectAccess.project.projectId);
    return {
      ok: true,
      project: serializeAtlasProject(projectAccess.project),
      agent: {
        connected: agentStatus.connected,
        connectedAt: agentStatus.connectedAt
      }
    };
  });

  app.post("/api/atlas/agent/select-files", async (request, reply) => {
    const authContext = await requireApiKeyAuth(request, reply, collections, config);
    if (!authContext) {
      return;
    }

    const payload = atlasFileSelectionSchema.parse(request.body ?? {});
    const projectAccess = await resolveAtlasProjectForApiKey(collections, authContext, {
      requestedProjectId: payload.project_id
    });
    if (!projectAccess) {
      return reply.code(403).send({ error: "API key is not authorized for this project" });
    }

    const selection = await selectAtlasDocumentationFiles(config, payload.file_paths);

    return {
      ok: true,
      selected_files: selection.selectedFiles,
      context_files: selection.contextFiles,
      backend_selected_files: selection.backendSelectedFiles,
      backend_context_files: selection.backendContextFiles,
      token_usage: selection.tokenUsage
    };
  });

  app.post("/api/atlas/agent/generate-route-batch", async (request, reply) => {
    const authContext = await requireApiKeyAuth(request, reply, collections, config);
    if (!authContext) {
      return;
    }

    const payload = atlasSourceBatchSchema.parse(request.body ?? {});
    const projectAccess = await resolveAtlasProjectForApiKey(collections, authContext, {
      requestedProjectId: payload.project_id
    });
    if (!projectAccess) {
      return reply.code(403).send({ error: "API key is not authorized for this project" });
    }

    const routeMap = await generateAtlasRouteMap(config, {
      projectId: payload.project_id,
      files: payload.files
    });

    return {
      ok: true,
      documentation: routeMap.documentation,
      token_usage: routeMap.token_usage
    };
  });

  app.post("/api/atlas/agent/generate-backend-batch", async (request, reply) => {
    const authContext = await requireApiKeyAuth(request, reply, collections, config);
    if (!authContext) {
      return;
    }

    const payload = atlasSourceBatchSchema.parse(request.body ?? {});
    const projectAccess = await resolveAtlasProjectForApiKey(collections, authContext, {
      requestedProjectId: payload.project_id
    });
    if (!projectAccess) {
      return reply.code(403).send({ error: "API key is not authorized for this project" });
    }

    const inventory = await generateAtlasBackendInventory(config, {
      projectId: payload.project_id,
      files: payload.files
    });

    return {
      ok: true,
      documentation: inventory.documentation,
      token_usage: inventory.token_usage
    };
  });
}

export async function requireApiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  collections: Collections,
  _config: AppConfig
): Promise<ApiKeyAuthContext | null> {
  const apiKey = extractBearerApiKey(request);
  if (!apiKey) {
    reply.code(401).send({ error: "API key required" });
    return null;
  }

  const apiKeyDocument = await collections.apiKeys.findOne({ keyHash: hashApiKey(apiKey) });
  if (!apiKeyDocument) {
    reply.code(401).send({ error: "invalid API key" });
    return null;
  }

  const user = await collections.users.findOne({ _id: apiKeyDocument.userId });
  if (!user) {
    reply.code(401).send({ error: "invalid API key" });
    return null;
  }

  await collections.apiKeys.updateOne(
    { _id: apiKeyDocument._id },
    { $set: { lastUsedAt: new Date() } }
  );

  return { apiKey: apiKeyDocument, user };
}

function extractBearerApiKey(request: FastifyRequest): string | null {
  const token = parseBearerToken(request.headers.authorization);
  if (!token?.startsWith("ck_")) {
    return null;
  }

  return token;
}

function serializeAtlasUser(user: UserDocument) {
  return {
    id: String(user._id),
    email: user.email
  };
}

function serializeAtlasProject(project: AtlasProjectDocument) {
  return {
    id: project.projectId,
    name: project.name
  };
}

async function resolveAtlasProjectForApiKey(
  collections: Collections,
  authContext: ApiKeyAuthContext,
  {
    requestedProjectId,
    createIfMissing = false,
    projectName
  }: {
    requestedProjectId?: string;
    createIfMissing?: boolean;
    projectName?: string;
  } = {}
): Promise<AtlasProjectAccessResult | null> {
  if (isAtlasProjectId(authContext.apiKey.projectId)) {
    if (requestedProjectId && requestedProjectId !== authContext.apiKey.projectId) {
      return null;
    }

    const project = await collections.atlasProjects.findOne({
      ownerUserId: authContext.user._id,
      projectId: authContext.apiKey.projectId
    });
    if (project) {
      return { project, created: false };
    }

    if (!createIfMissing || !authContext.apiKey.siteId) {
      return null;
    }
  }

  if (requestedProjectId) {
    const project = await collections.atlasProjects.findOne({
      ownerUserId: authContext.user._id,
      projectId: requestedProjectId
    });
    if (!project || !isProjectCompatibleWithApiKey(project, authContext.apiKey)) {
      return null;
    }

    await bindApiKeyToProject(collections, authContext, project.projectId);
    return { project, created: false };
  }

  if (!createIfMissing) {
    return null;
  }

  if (authContext.apiKey.siteId) {
    const existingSiteProject = await collections.atlasProjects.findOne({
      ownerUserId: authContext.user._id,
      siteId: authContext.apiKey.siteId
    });
    if (existingSiteProject) {
      const project = isAtlasProjectId(existingSiteProject.projectId)
        ? existingSiteProject
        : await repairAtlasProject(collections, existingSiteProject);
      await bindApiKeyToProject(collections, authContext, project.projectId);
      return { project, created: false };
    }
  }

  const site = await findApiKeySite(collections, authContext);
  const now = new Date();
  const project: AtlasProjectDocument = {
    _id: new ObjectId(),
    ownerUserId: authContext.user._id,
    ...(authContext.apiKey.siteId ? { siteId: authContext.apiKey.siteId } : {}),
    projectId: createAtlasProjectId(),
    name: site?.name || projectName || "Untitled project",
    createdAt: now,
    updatedAt: now
  } as AtlasProjectDocument;
  await collections.atlasProjects.insertOne(project);
  await bindApiKeyToProject(collections, authContext, project.projectId);
  return { project, created: true };
}

function isProjectCompatibleWithApiKey(project: AtlasProjectDocument, apiKey: ApiKeyDocument): boolean {
  return !apiKey.siteId || Boolean(project.siteId?.equals(apiKey.siteId));
}

async function bindApiKeyToProject(
  collections: Collections,
  authContext: ApiKeyAuthContext,
  projectId: string
): Promise<void> {
  authContext.apiKey.projectId = projectId;
  await collections.apiKeys.updateOne(
    { _id: authContext.apiKey._id },
    { $set: { projectId, lastUsedAt: new Date() } }
  );
}

async function repairAtlasProject(
  collections: Collections,
  project: AtlasProjectDocument
): Promise<AtlasProjectDocument> {
  const repairedProject = {
    ...project,
    projectId: createAtlasProjectId(),
    updatedAt: new Date()
  };

  await collections.atlasProjects.updateOne(
    { _id: project._id },
    {
      $set: {
        projectId: repairedProject.projectId,
        updatedAt: repairedProject.updatedAt
      }
    }
  );

  return repairedProject;
}

async function findApiKeySite(
  collections: Collections,
  authContext: ApiKeyAuthContext
): Promise<SiteDocument | null> {
  if (!authContext.apiKey.siteId) {
    return null;
  }

  return collections.sites.findOne({
    _id: authContext.apiKey.siteId,
    ownerUserId: authContext.user._id
  });
}

function serializeAtlasSite(site: SiteDocument) {
  return {
    id: String(site._id),
    name: site.name,
    domain: site.domain
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
