import { ObjectId } from "mongodb";
import type { FastifyReply } from "fastify";

export function parseObjectId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseBearerToken(authorization: unknown): string | null {
  if (typeof authorization !== "string") return null;

  const parts = authorization.trim().split(/\s+/);
  if (parts.length !== 2) return null;

  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorResponse(message: string) {
  return { error: message, message };
}

/** Base error for tool-module route handlers that carry an HTTP status code. */
export class HttpToolError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Wrap an async route handler so that any thrown HttpToolError subclass is
 * translated into an HTTP error response instead of propagating as a 500.
 */
export async function runWithHttpToolError(reply: FastifyReply, fn: () => unknown | Promise<unknown>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpToolError) {
      return reply.code(error.status).send({ error: error.message });
    }
    throw error;
  }
}
