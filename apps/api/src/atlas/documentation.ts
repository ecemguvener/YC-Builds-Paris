import { ObjectId } from "mongodb";
import type { Collections } from "../db.js";

export const atlasDocumentationType = "documentation";

export interface AtlasDocumentationObject {
  frontend: unknown | null;
  backend: unknown | null;
}

export interface AtlasDocumentationParts {
  documentation: unknown | null;
  backendDocumentation: unknown | null;
}

export function createAtlasDocumentationObject({
  routeMap,
  backendInventory
}: {
  routeMap: unknown;
  backendInventory: unknown;
}): AtlasDocumentationObject {
  return {
    frontend: routeMap,
    backend: backendInventory
  };
}

export async function saveAtlasDocumentationObject(
  collections: Collections,
  ownerUserId: ObjectId,
  projectId: string,
  documentation: AtlasDocumentationObject
) {
  const now = new Date();
  await collections.atlasDocuments.updateOne(
    {
      projectId,
      type: atlasDocumentationType
    },
    {
      $set: {
        ownerUserId,
        projectId,
        type: atlasDocumentationType,
        documentation,
        updatedAt: now
      },
      $setOnInsert: {
        _id: new ObjectId(),
        createdAt: now
      }
    },
    { upsert: true }
  );
}

export async function loadAtlasDocumentationParts(
  collections: Collections,
  ownerUserId: ObjectId,
  projectId: string
): Promise<AtlasDocumentationParts> {
  const combinedDocument = await collections.atlasDocuments.findOne({
    ownerUserId,
    projectId,
    type: atlasDocumentationType
  });

  return readAtlasDocumentationObject(combinedDocument?.documentation);
}

function readAtlasDocumentationObject(value: unknown): AtlasDocumentationParts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { documentation: null, backendDocumentation: null };
  }

  const documentation = value as Partial<AtlasDocumentationObject>;
  return {
    documentation: documentation.frontend ?? null,
    backendDocumentation: documentation.backend ?? null
  };
}
