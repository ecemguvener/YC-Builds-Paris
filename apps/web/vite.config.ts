import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const homepageDirectory = path.resolve(__dirname, "public/barkan-homepage");

function getHomepageFilePath(requestUrl: string | undefined) {
  if (!requestUrl) {
    return null;
  }

  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const routeAliases: Record<string, string> = {
    "/": "index.html",
    "/index.html": "index.html",
    "/contact": "contact.html",
    "/contact.html": "contact.html",
    "/404": "404.html",
    "/404.html": "404.html",
    "/legal/privacy": "legal/privacy.html",
    "/legal/privacy.html": "legal/privacy.html",
    "/legal/terms": "legal/terms.html",
    "/legal/terms.html": "legal/terms.html"
  };

  const relativePath =
    routeAliases[pathname] ??
    (pathname.startsWith("/framerusercontent.com/") ? pathname.slice(1) : null);

  if (!relativePath) {
    return null;
  }

  const filePath = path.resolve(homepageDirectory, relativePath);
  if (!filePath.startsWith(`${homepageDirectory}${path.sep}`) && filePath !== homepageDirectory) {
    return null;
  }

  return filePath;
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  return "application/octet-stream";
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "barkan-homepage-root",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.method !== "GET" && request.method !== "HEAD") {
            next();
            return;
          }

          const filePath = getHomepageFilePath(request.url);
          if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            next();
            return;
          }

          response.setHeader("Content-Type", getContentType(filePath));
          if (request.method === "HEAD") {
            response.end();
            return;
          }

          fs.createReadStream(filePath).pipe(response);
        });
      }
    },
    {
      name: "barkan-widget-cors-preflight",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.method !== "OPTIONS" || !request.url?.startsWith("/api/widget/")) {
            next();
            return;
          }

          const origin = request.headers.origin;
          if (typeof origin === "string") {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Vary", "Origin, Access-Control-Request-Headers");
          }
          response.setHeader("Access-Control-Allow-Credentials", "true");
          response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
          response.setHeader(
            "Access-Control-Allow-Headers",
            request.headers["access-control-request-headers"] || "content-type"
          );
          response.statusCode = 204;
          response.end();
        });
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 4888,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4001",
        changeOrigin: false
      },
      "/widget.js": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4001",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"]
  }
});
