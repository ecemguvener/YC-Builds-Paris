const ALLOWED_BARKAN_ORIGINS = new Set([
  "https://100.81.152.74:4000",
  "https://100.81.152.74:4001",
  "https://100.81.152.74:4889",
  "http://127.0.0.1:4000",
  "http://127.0.0.1:4001",
  "http://localhost:4000",
  "http://localhost:4001",
  "http://localhost:4889",
]);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "barkan-fetch") {
    return;
  }

  let activeController = null;

  port.onMessage.addListener((message) => {
    if (message?.type === "abort") {
      activeController?.abort();
      return;
    }

    if (message?.type !== "fetch") {
      safePost(port, { type: "error", error: "Unknown Barkan proxy message." });
      return;
    }

    activeController = new AbortController();
    fetchForContentScript(message.request, activeController.signal, port)
      .catch((error) => {
        safePost(port, {
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        activeController = null;
      });
  });

  port.onDisconnect.addListener(() => {
    activeController?.abort();
    activeController = null;
  });
});

async function fetchForContentScript(request, signal, port) {
  const url = new URL(request.url);
  if (!ALLOWED_BARKAN_ORIGINS.has(url.origin) || !isSecureBarkanUrl(url)) {
    throw new Error(`Barkan proxy blocked unexpected origin: ${url.origin}`);
  }

  const method = String(request.method || "GET").toUpperCase();
  const headers = new Headers();
  for (const [name, value] of request.headers || []) {
    if (isForwardableHeader(name)) {
      headers.append(name, value);
    }
  }

  const init = {
    method,
    headers,
    redirect: "follow",
    signal
  };

  const body = decodeRequestBody(request.body);
  if (body && method !== "GET" && method !== "HEAD") {
    init.body = body;
  }

  const response = await fetch(url.toString(), init);
  safePost(port, {
    type: "response",
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries())
  });

  if (!response.body) {
    safePost(port, { type: "end" });
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value?.byteLength) {
      safePost(port, { type: "chunk", base64: bytesToBase64(value) });
    }
  }

  safePost(port, { type: "end" });
}

function isSecureBarkanUrl(url) {
  return url.protocol === "https:" || isLoopbackHostname(url.hostname);
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function decodeRequestBody(body) {
  if (!body) {
    return null;
  }

  if (body.type === "text") {
    return body.text || "";
  }

  if (body.type === "base64") {
    return base64ToBytes(body.base64 || "");
  }

  return null;
}

function isForwardableHeader(name) {
  const normalized = String(name).toLowerCase();
  return ![
    "connection",
    "content-length",
    "cookie",
    "host",
    "origin",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
  ].includes(normalized);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch {
  }
}
