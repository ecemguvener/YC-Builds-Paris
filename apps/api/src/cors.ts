import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";

type CorsOptions = {
  origin?: string | boolean;
  credentials?: boolean;
  methods?: string[];
  strictPreflight?: boolean;
};

const corsMethods = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"];

export function buildCorsOptionsForRequest(config: AppConfig, request: FastifyRequest): CorsOptions {
  if (isPublicCorsPath(request.url)) {
    return {
      origin: true,
      credentials: false,
      methods: corsMethods,
      strictPreflight: false
    };
  }

  const origin = request.headers.origin;
  return {
    origin: typeof origin === "string" && isTrustedDashboardOrigin(origin, config) ? origin : false,
    credentials: true,
    methods: corsMethods,
    strictPreflight: false
  };
}

export function buildTrustedDashboardCorsHeaders(origin: unknown, config: AppConfig): Record<string, string> {
  if (typeof origin !== "string" || !isTrustedDashboardOrigin(origin, config)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin"
  };
}

export function buildPublicCorsHeaders(origin: unknown): Record<string, string> {
  return {
    "access-control-allow-origin": typeof origin === "string" && origin.trim() ? origin : "*",
    vary: "Origin"
  };
}

export function isTrustedDashboardOrigin(origin: string, config: AppConfig): boolean {
  return getTrustedDashboardOrigins(config).has(normalizeOrigin(origin));
}

export function isPublicCorsPath(requestUrl: string): boolean {
  const pathname = requestUrl.split("?", 1)[0] || "/";
  return pathname === "/widget.js" || pathname.startsWith("/api/widget/");
}

export function getTrustedDashboardOrigins(config: AppConfig): Set<string> {
  return new Set([config.PUBLIC_APP_URL, config.PUBLIC_API_URL].map(normalizeOrigin).filter(Boolean));
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
