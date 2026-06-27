const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const publicHost = process.env.BARKAN_PUBLIC_HOST || "100.81.152.74";
const devWebPort = process.env.BARKAN_DEV_WEB_PORT || "4888";
const devApiPort = process.env.BARKAN_DEV_API_PORT || "4001";
const prodApiPort = process.env.BARKAN_PROD_API_PORT || "4000";
const devPublicAppUrl = process.env.BARKAN_DEV_PUBLIC_APP_URL || `http://${publicHost}:${devWebPort}`;
const devPublicApiUrl = process.env.BARKAN_DEV_PUBLIC_API_URL || `http://${publicHost}:${devApiPort}`;
const prodPublicAppUrl = process.env.BARKAN_PROD_PUBLIC_APP_URL || "https://barkan.tech";
const prodPublicApiUrl = process.env.BARKAN_PROD_PUBLIC_API_URL || "https://barkan.tech";
const devApiProxyTarget = process.env.BARKAN_DEV_API_PROXY_TARGET || `http://127.0.0.1:${devApiPort}`;

const common = {
  cwd: __dirname,
  autorestart: true,
  watch: false,
  time: true,
  min_uptime: "5s",
  max_restarts: 1000000,
  restart_delay: 1000,
  ignore_watch: [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".cache",
    ".next",
    ".vite",
    "logs",
    "*.log"
  ],
  watch_options: {
    followSymlinks: false,
    usePolling: false
  }
};

module.exports = {
  apps: [
    {
      ...common,
      name: "dev-barkan-api",
      script: "npm",
      args: "--workspace @barkan/api run dev",
      ignore_watch: [...common.ignore_watch, "packages/widget/dist"],
      env: {
        NODE_ENV: "development",
        API_PORT: devApiPort,
        PUBLIC_APP_URL: devPublicAppUrl,
        PUBLIC_API_URL: devPublicApiUrl
      }
    },
    {
      ...common,
      name: "dev-barkan-web",
      cwd: path.join(__dirname, "apps/web"),
      script: "node_modules/vite/bin/vite.js",
      args: `--host 0.0.0.0 --port ${devWebPort} --strictPort`,
      ignore_watch: [...common.ignore_watch, "packages/widget/dist"],
      env: {
        NODE_ENV: "development",
        API_PROXY_TARGET: devApiProxyTarget,
        VITE_API_URL: devPublicApiUrl,
        VITE_API_PORT: devApiPort
      }
    },
    {
      ...common,
      name: "dev-barkan-widget",
      cwd: path.join(__dirname, "packages/widget"),
      script: "node_modules/vite/bin/vite.js",
      args: "build --watch",
      ignore_watch: [...common.ignore_watch, "packages/widget/dist"],
      env: {
        NODE_ENV: "development"
      }
    },
    {
      ...common,
      name: "prod-barkan-api",
      script: "npm",
      args: "--workspace @barkan/api run start",
      watch: false,
      env: {
        NODE_ENV: "production",
        API_PORT: prodApiPort,
        PUBLIC_APP_URL: prodPublicAppUrl,
        PUBLIC_API_URL: prodPublicApiUrl
      }
    },
    {
      ...common,
      name: "barkan-extension-widget-sync",
      script: "node",
      args: "packages/widget/scripts/sync-extension-widget.cjs",
      watch: false,
      env: {
        NODE_ENV: "development"
      }
    },
    {
      ...common,
      name: "dev-apps",
      script: "bash",
      args: "scripts/start-dev-apps.sh",
      ignore_watch: [
        ...common.ignore_watch,
        "/srv/codex-shared/unknown-test-app/node_modules",
        "/srv/codex-shared/unknown-test-app/frontend/node_modules",
        "/srv/codex-shared/unknown-test-app/backend/node_modules",
        "/srv/codex-shared/unknown-test-app/backend/data",
        "/srv/codex-shared/Alumet/node_modules",
        "/srv/codex-shared/Alumet/client/dist",
        "/srv/codex-shared/Alumet/docs",
        "/srv/codex-shared/Alumet/.git"
      ],
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};
