import type { Collections, SiteDocument } from "../db.js";
import { loadAtlasDocumentationParts } from "./documentation.js";

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

export interface AtlasBackendEndpoint {
  method: string;
  path: string;
  summary: string;
  auth: string;
  request: AtlasBackendEndpointRequest;
  response: {
    success: string;
    errors: string[];
  };
}

export interface AtlasBackendInventoryDocument {
  version: 1;
  project_id: string;
  generated_at: string;
  source_files: string[];
  endpoints: AtlasBackendEndpoint[];
}

export function isAtlasBackendInventoryDocument(value: unknown): value is AtlasBackendInventoryDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const document = value as Partial<AtlasBackendInventoryDocument>;
  return (
    document.version === 1 &&
    typeof document.project_id === "string" &&
    document.project_id.trim().length > 0 &&
    typeof document.generated_at === "string" &&
    !Number.isNaN(Date.parse(document.generated_at)) &&
    isStringArray(document.source_files) &&
    Array.isArray(document.endpoints) &&
    document.endpoints.every(isAtlasBackendEndpoint)
  );
}

export function createEmptyAtlasBackendInventory(projectId: string): AtlasBackendInventoryDocument {
  return {
    version: 1,
    project_id: projectId,
    generated_at: new Date().toISOString(),
    source_files: [],
    endpoints: []
  };
}

export async function loadSiteBackendInventory(
  collections: Collections,
  site: SiteDocument
): Promise<AtlasBackendInventoryDocument | null> {
  const project = await collections.atlasProjects.findOne({
    ownerUserId: site.ownerUserId,
    siteId: site._id
  });
  if (!project) {
    return null;
  }

  const documentationState = await loadAtlasDocumentationParts(collections, site.ownerUserId, project.projectId);
  return isAtlasBackendInventoryDocument(documentationState.backendDocumentation)
    ? documentationState.backendDocumentation
    : null;
}

function isAtlasBackendEndpoint(value: unknown): value is AtlasBackendEndpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const endpoint = value as Partial<AtlasBackendEndpoint>;
  return (
    typeof endpoint.method === "string" &&
    endpoint.method.trim().length > 0 &&
    typeof endpoint.path === "string" &&
    endpoint.path.trim().length > 0 &&
    typeof endpoint.summary === "string" &&
    endpoint.summary.trim().length > 0 &&
    typeof endpoint.auth === "string" &&
    endpoint.auth.trim().length > 0 &&
    isAtlasBackendEndpointRequest(endpoint.request) &&
    isAtlasBackendEndpointResponse(endpoint.response)
  );
}

function isAtlasBackendEndpointRequest(value: unknown): value is AtlasBackendEndpointRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const request = value as Partial<AtlasBackendEndpointRequest>;
  return (
    isOptionalFieldMap(request.params) &&
    isOptionalFieldMap(request.query) &&
    isOptionalFieldMap(request.body)
  );
}

function isOptionalFieldMap(value: unknown): value is AtlasBackendEndpointFieldMap | undefined {
  if (value === undefined) {
    return true;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isAtlasBackendEndpointField);
}

function isAtlasBackendEndpointField(value: unknown): value is AtlasBackendEndpointField {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const field = value as Partial<AtlasBackendEndpointField>;
  return (
    typeof field.type === "string" &&
    field.type.trim().length > 0 &&
    typeof field.required === "boolean" &&
    (field.enum === undefined || isStringArray(field.enum)) &&
    (field.allowedValues === undefined || isStringArray(field.allowedValues))
  );
}

function isAtlasBackendEndpointResponse(value: unknown): value is AtlasBackendEndpoint["response"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const response = value as Partial<AtlasBackendEndpoint["response"]>;
  return (
    typeof response.success === "string" &&
    response.success.trim().length > 0 &&
    Array.isArray(response.errors) &&
    response.errors.every((error) => typeof error === "string")
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
