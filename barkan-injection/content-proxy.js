(() => {
  "use strict";

  const BARKAN_SITE_KEY = "site_3qS7_idTrWUdS4rtbEzlBor9mfmJeUdD";
  const BARKAN_SCRIPT_URL = "https://100.81.152.74:4001/widget.js";
  const BARKAN_EXTENSION_BUILD_ID = "site-3qs7-port-4001-2026-05-27";
  const BARKAN_API_ORIGINS = new Set([
    "https://100.81.152.74:4000",
    "https://100.81.152.74:4001",
    "https://100.81.152.74:4889",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:4001",
    "http://localhost:4000",
    "http://localhost:4001",
    "http://localhost:4889",
  ]);
  const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

  if (window.__BARKAN_EXTENSION_INJECTED__) {
    return;
  }

  Object.defineProperty(window, "__BARKAN_EXTENSION_INJECTED__", {
    value: true,
    configurable: false
  });

  removeStaleWidgetRoot();
  ensureBarkanScriptPlaceholder();
  installSidebarLayoutGuard();

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = getRequestUrl(input);
    if (!url || !shouldProxy(url)) {
      return nativeFetch(input, init);
    }

    return proxyFetch(input, init);
  };

  window.__BARKAN_INJECTION__ = {
    extensionBuildId: BARKAN_EXTENSION_BUILD_ID,
    siteKey: BARKAN_SITE_KEY,
    scriptUrl: BARKAN_SCRIPT_URL,
    proxiedOrigins: Array.from(BARKAN_API_ORIGINS)
  };

  function ensureBarkanScriptPlaceholder() {
    const existing = document.querySelector('script[data-barkan-extension-placeholder="true"]');
    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.type = "application/barkan-placeholder";
    script.src = BARKAN_SCRIPT_URL;
    script.dataset.barkanSite = BARKAN_SITE_KEY;
    script.dataset.barkanExtensionPlaceholder = "true";
    script.dataset.barkanInjection = "chrome-extension";
    document.documentElement.appendChild(script);
  }

  function removeStaleWidgetRoot() {
    document.getElementById("barkan-widget-root")?.remove();
  }

  function installSidebarLayoutGuard() {
    const sidebarReservedWidthProperty = "--barkan-chat-sidebar-reserved-width";
    const activeAttribute = "data-barkan-extension-sidebar-reserved";
    const reservedWidthProperty = "--barkan-extension-sidebar-reserved-width";
    const availableWidthProperty = "--barkan-extension-page-available-width";
    const styleId = "barkan-extension-sidebar-layout-guard";
    let animationFrame = 0;

    document.getElementById("barkan-extension-sidebar-left-edge-guard")?.remove();
    document.getElementById(styleId)?.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
html[${activeAttribute}="true"],
html[${activeAttribute}="true"] body {
  overflow-x: hidden !important;
}

html[${activeAttribute}="true"] body {
  width: var(${availableWidthProperty}) !important;
  max-width: var(${availableWidthProperty}) !important;
  min-width: 0 !important;
  margin-right: var(${reservedWidthProperty}) !important;
}

html[${activeAttribute}="true"] body > #root {
  width: var(${availableWidthProperty}) !important;
  max-width: var(${availableWidthProperty}) !important;
  min-width: 0 !important;
  overflow-x: hidden !important;
}

html[${activeAttribute}="true"] body > #root > * {
  width: var(${availableWidthProperty}) !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
    const targetRestores = new Map();
    let observedBody = null;
    let observedRoot = null;

    const scheduleSync = () => {
      if (animationFrame) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        syncSidebarLayoutGuard();
      });
    };

    const syncSidebarLayoutGuard = () => {
      const reservedWidth = readReservedSidebarWidth(sidebarReservedWidthProperty);
      const isActive = reservedWidth > 1;
      if (isActive) {
        document.documentElement.setAttribute(activeAttribute, "true");
        document.documentElement.style.setProperty(reservedWidthProperty, `${reservedWidth}px`);
        document.documentElement.style.setProperty(availableWidthProperty, `calc(100vw - ${reservedWidth}px)`);
        constrainViewportAppShells(reservedWidth, targetRestores);
      } else {
        document.documentElement.removeAttribute(activeAttribute);
        document.documentElement.style.removeProperty(reservedWidthProperty);
        document.documentElement.style.removeProperty(availableWidthProperty);
        restoreViewportAppShells(targetRestores);
      }
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", activeAttribute]
    });
    const observeBodyAndRoot = () => {
      if (document.body && document.body !== observedBody) {
        observedBody = document.body;
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ["style"],
          childList: true
        });
      }

      const root = document.getElementById("root");
      if (root && root !== observedRoot) {
        observedRoot = root;
        observer.observe(root, {
          childList: true,
          subtree: true
        });
      }
    };

    observeBodyAndRoot();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        observeBodyAndRoot();
        scheduleSync();
      }, { once: true });
    }

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("scroll", scheduleSync, { passive: true });
    scheduleSync();
  }

  function readReservedSidebarWidth(sidebarReservedWidthProperty) {
    const root = document.documentElement;
    const values = [
      root.style.getPropertyValue(sidebarReservedWidthProperty),
      getComputedStyle(root).getPropertyValue(sidebarReservedWidthProperty),
      document.body ? document.body.style.marginRight : ""
    ];

    for (const value of values) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return 0;
  }

  function constrainViewportAppShells(reservedWidth, targetRestores) {
    const root = document.getElementById("root");
    if (!root) {
      return;
    }

    const availableWidth = Math.max(0, Math.round(window.innerWidth - reservedWidth));
    const rightBoundary = window.innerWidth - reservedWidth;
    const candidates = new Set([root, ...Array.from(root.children), ...Array.from(root.querySelectorAll("*"))]);

    for (const element of candidates) {
      if (!(element instanceof HTMLElement) || element.closest("#barkan-widget-root, #barkan-widget-root")) {
        continue;
      }

      if (!isPotentialLayoutContainer(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 40) {
        continue;
      }

      const computedStyle = getComputedStyle(element);
      if (computedStyle.display === "none" || computedStyle.visibility === "hidden") {
        continue;
      }

      const targetWidth = Math.floor(rightBoundary - Math.max(0, rect.left));
      if (targetWidth < 160) {
        continue;
      }

      const isRootShell = element === root || element.parentElement === root || element.parentElement?.parentElement === root;
      const crossesChatBoundary = rect.right > rightBoundary + 2;
      const isWideLayoutBox = rect.width >= Math.min(availableWidth * 0.55, 640);
      const isViewportWide = rect.left <= 4 && crossesChatBoundary && rect.width >= availableWidth - 4;
      const isAnchoredShell =
        ["fixed", "sticky", "absolute"].includes(computedStyle.position) &&
        rect.left <= 24 &&
        crossesChatBoundary &&
        rect.width >= availableWidth * 0.75;
      const isNestedCrossingShell = crossesChatBoundary && isWideLayoutBox && rect.left < rightBoundary - 80;

      if (!isRootShell && !isViewportWide && !isAnchoredShell && !isNestedCrossingShell) {
        continue;
      }

      rememberViewportAppShell(element, targetRestores);
      element.style.boxSizing = "border-box";
      element.style.width = `${targetWidth}px`;
      element.style.maxWidth = `${targetWidth}px`;
      element.style.minWidth = "0px";
      element.style.overflowX = "hidden";
      if (computedStyle.display.includes("flex") || computedStyle.flexGrow !== "0") {
        element.style.flexBasis = `${targetWidth}px`;
      }
      if (isAnchoredShell) {
        element.style.right = `${reservedWidth}px`;
      }
    }
  }

  function isPotentialLayoutContainer(element) {
    if (element.children.length === 0) {
      return false;
    }

    return ![
      "A",
      "BUTTON",
      "INPUT",
      "OPTION",
      "SELECT",
      "SVG",
      "TEXTAREA"
    ].includes(element.tagName);
  }

  function rememberViewportAppShell(element, targetRestores) {
    if (targetRestores.has(element)) {
      return;
    }

    targetRestores.set(element, {
      width: element.style.width,
      maxWidth: element.style.maxWidth,
      minWidth: element.style.minWidth,
      right: element.style.right,
      boxSizing: element.style.boxSizing,
      flexBasis: element.style.flexBasis,
      overflowX: element.style.overflowX
    });
  }

  function restoreViewportAppShells(targetRestores) {
    for (const [element, previousStyle] of targetRestores.entries()) {
      if (!element.isConnected) {
        continue;
      }
      element.style.width = previousStyle.width;
      element.style.maxWidth = previousStyle.maxWidth;
      element.style.minWidth = previousStyle.minWidth;
      element.style.right = previousStyle.right;
      element.style.boxSizing = previousStyle.boxSizing;
      element.style.flexBasis = previousStyle.flexBasis;
      element.style.overflowX = previousStyle.overflowX;
    }
    targetRestores.clear();
  }

  function getRequestUrl(input) {
    try {
      if (input instanceof Request) {
        return new URL(input.url, window.location.href).toString();
      }
      return new URL(String(input), window.location.href).toString();
    } catch {
      return "";
    }
  }

  function shouldProxy(url) {
    try {
      const parsedUrl = new URL(url);
      return BARKAN_API_ORIGINS.has(parsedUrl.origin) && isSecureBarkanUrl(parsedUrl);
    } catch {
      return false;
    }
  }

  function isSecureBarkanUrl(url) {
    return url.protocol === "https:" || isLoopbackHostname(url.hostname);
  }

  function isLoopbackHostname(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  async function proxyFetch(input, init) {
    const request = await serializeRequest(input, init);
    const signal = init?.signal || (input instanceof Request ? input.signal : null);
    return fetchThroughBackground(request, signal);
  }

  async function serializeRequest(input, init) {
    const inputRequest = input instanceof Request ? input : null;
    const url = getRequestUrl(input);
    const method = String(init?.method || inputRequest?.method || "GET").toUpperCase();
    const headers = new Headers(inputRequest?.headers);

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const bodySource =
      init && Object.prototype.hasOwnProperty.call(init, "body")
        ? init.body
        : inputRequest && method !== "GET" && method !== "HEAD"
          ? await inputRequest.clone().arrayBuffer()
          : null;

    return {
      url,
      method,
      headers: Array.from(headers.entries()),
      body: await encodeRequestBody(bodySource)
    };
  }

  async function encodeRequestBody(body) {
    if (body === null || body === undefined) {
      return null;
    }

    if (typeof body === "string") {
      return { type: "text", text: body };
    }

    if (body instanceof URLSearchParams) {
      return { type: "text", text: body.toString() };
    }

    if (body instanceof Blob) {
      return { type: "base64", base64: arrayBufferToBase64(await body.arrayBuffer()) };
    }

    if (body instanceof ArrayBuffer) {
      return { type: "base64", base64: arrayBufferToBase64(body) };
    }

    if (ArrayBuffer.isView(body)) {
      return {
        type: "base64",
        base64: arrayBufferToBase64(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
      };
    }

    throw new TypeError("Barkan injection cannot proxy this request body type.");
  }

  function fetchThroughBackground(request, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      const port = chrome.runtime.connect({ name: "barkan-fetch" });
      let responseResolved = false;
      let streamClosed = false;
      let streamController = null;

      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };

      const fail = (error) => {
        cleanup();
        if (responseResolved) {
          streamController?.error(error);
        } else {
          reject(error);
        }
      };

      const closePort = () => {
        streamClosed = true;
        try {
          port.disconnect();
        } catch {
        }
      };

      const onAbort = () => {
        try {
          port.postMessage({ type: "abort" });
        } catch {
        }
        fail(createAbortError());
        closePort();
      };

      const bodyStream = new ReadableStream({
        start(controller) {
          streamController = controller;
        },
        cancel() {
          try {
            port.postMessage({ type: "abort" });
          } catch {
          }
          cleanup();
          closePort();
        }
      });

      port.onMessage.addListener((message) => {
        if (message?.type === "response") {
          responseResolved = true;
          const responseBody = NULL_BODY_STATUSES.has(message.status) ? null : bodyStream;
          resolve(
            new Response(responseBody, {
              status: message.status,
              statusText: message.statusText,
              headers: new Headers(message.headers || [])
            })
          );
          return;
        }

        if (message?.type === "chunk") {
          streamController?.enqueue(base64ToBytes(message.base64 || ""));
          return;
        }

        if (message?.type === "end") {
          cleanup();
          streamController?.close();
          closePort();
          return;
        }

        if (message?.type === "error") {
          fail(new TypeError(message.error || "Barkan proxy request failed."));
          closePort();
        }
      });

      port.onDisconnect.addListener(() => {
        if (!streamClosed) {
          fail(new TypeError("Barkan proxy disconnected before the request finished."));
        }
      });

      signal?.addEventListener("abort", onAbort, { once: true });
      port.postMessage({ type: "fetch", request });
    });
  }

  function createAbortError() {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
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
})();
