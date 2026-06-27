import type { Collections, SiteDocument } from "../db.js";
import { loadAtlasDocumentationParts } from "./documentation.js";

export interface AtlasRouteEntry {
  path: string;
  summary: string;
}

export interface AtlasRouteMapDocument {
  version: 1;
  project_id: string;
  generated_at: string;
  source_files: string[];
  routes: AtlasRouteEntry[];
}

export function isAtlasRouteMapDocument(value: unknown): value is AtlasRouteMapDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const document = value as Partial<AtlasRouteMapDocument>;
  return (
    document.version === 1 &&
    typeof document.project_id === "string" &&
    document.project_id.trim().length > 0 &&
    typeof document.generated_at === "string" &&
    !Number.isNaN(Date.parse(document.generated_at)) &&
    isStringArray(document.source_files) &&
    Array.isArray(document.routes) &&
    document.routes.every(isAtlasRouteEntry)
  );
}

export async function loadSiteRouteMap(
  collections: Collections,
  site: SiteDocument
): Promise<AtlasRouteMapDocument | null> {
  const project = await collections.atlasProjects.findOne({
    ownerUserId: site.ownerUserId,
    siteId: site._id
  });
  if (!project) {
    return null;
  }

  const documentationState = await loadAtlasDocumentationParts(collections, site.ownerUserId, project.projectId);

  return isAtlasRouteMapDocument(documentationState.documentation) ? documentationState.documentation : null;
}

function isAtlasRouteEntry(value: unknown): value is AtlasRouteEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const route = value as Partial<AtlasRouteEntry>;
  return (
    typeof route.path === "string" &&
    route.path.trim().length > 0 &&
    typeof route.summary === "string" &&
    route.summary.trim().length > 0
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
