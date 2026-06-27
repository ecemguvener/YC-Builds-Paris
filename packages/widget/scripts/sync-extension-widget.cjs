#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const rootDirectory = path.resolve(__dirname, "../../..");
const sourcePath = path.join(rootDirectory, "packages/widget/dist/widget.js");
const targetPath = path.join(rootDirectory, "barkan-injection/vendor/barkan-widget.js");
const sourceDirectory = path.dirname(sourcePath);
const debounceMs = 150;

let pendingCopy = null;
let lastCopiedHash = "";

function relative(filePath) {
  return path.relative(rootDirectory, filePath);
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

function queueCopy(reason) {
  if (pendingCopy) {
    clearTimeout(pendingCopy);
  }

  pendingCopy = setTimeout(() => {
    pendingCopy = null;
    void copyWidget(reason);
  }, debounceMs);
}

async function copyWidget(reason) {
  try {
    const sourceBuffer = await fs.promises.readFile(sourcePath);
    const nextHash = hash(sourceBuffer);

    if (nextHash === lastCopiedHash) {
      return;
    }

    let targetBuffer = null;
    try {
      targetBuffer = await fs.promises.readFile(targetPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (targetBuffer && targetBuffer.equals(sourceBuffer)) {
      lastCopiedHash = nextHash;
      return;
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, sourceBuffer);
    lastCopiedHash = nextHash;
    console.log(
      `[barkan-widget-sync] copied ${relative(sourcePath)} -> ${relative(targetPath)} (${nextHash}, ${reason})`
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[barkan-widget-sync] waiting for ${relative(sourcePath)}...`);
      return;
    }

    console.error(`[barkan-widget-sync] copy failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  await fs.promises.mkdir(sourceDirectory, { recursive: true });
  queueCopy("startup");

  const watcher = fs.watch(sourceDirectory, (eventType, fileName) => {
    if (!fileName || fileName === "widget.js") {
      queueCopy(eventType);
    }
  });

  const close = () => {
    watcher.close();
    process.exit(0);
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  console.log(`[barkan-widget-sync] watching ${relative(sourcePath)}`);
}

void main().catch((error) => {
  console.error(`[barkan-widget-sync] failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
