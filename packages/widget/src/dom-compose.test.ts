// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  collectComposedDomCandidates,
  elementContainsDeep,
  findElementByIdInAccessibleScope,
  findPreferredPointableAncestor,
  getComposedParentElement,
  getElementViewportRect,
  isElementOfType,
  isHtmlElement,
  iterateComposedHtmlDescendants
} from "./dom-compose";

describe("composed DOM traversal", () => {
  it("walks open shadow roots and relates shadow controls to their host", () => {
    document.body.innerHTML = `
      <main>
        <settings-panel id="panel"></settings-panel>
      </main>
    `;
    const host = document.getElementById("panel");
    if (!(host instanceof HTMLElement)) {
      throw new Error("missing host");
    }

    const shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <section aria-label="Organization">
        <button id="invite">Invite member</button>
      </section>
    `;
    const inviteButton = shadowRoot.getElementById("invite");
    if (!(inviteButton instanceof HTMLElement)) {
      throw new Error("missing shadow button");
    }

    const candidates = collectComposedDomCandidates(document.body, 20, () => false);
    const descendants = Array.from(iterateComposedHtmlDescendants(host, 20, () => false));

    expect(candidates).toContain(host);
    expect(candidates).toContain(inviteButton);
    expect(descendants).toContain(inviteButton);
    expect(getComposedParentElement(inviteButton)).toBe(shadowRoot.querySelector("section"));
    expect(elementContainsDeep(host, inviteButton)).toBe(true);
  });

  it("resolves aria label references inside a shadow root scope", () => {
    document.body.innerHTML = `<settings-panel id="panel"></settings-panel>`;
    const host = document.getElementById("panel");
    if (!(host instanceof HTMLElement)) {
      throw new Error("missing host");
    }

    const shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <span id="people-label">People and members</span>
      <button id="people-button" aria-labelledby="people-label"></button>
    `;
    const peopleButton = shadowRoot.getElementById("people-button");
    if (!(peopleButton instanceof HTMLElement)) {
      throw new Error("missing shadow button");
    }

    expect(findElementByIdInAccessibleScope(peopleButton, "people-label")?.textContent).toBe("People and members");
  });

  it("walks same-origin iframe bodies and maps child coordinates to the top viewport", () => {
    document.body.innerHTML = `<iframe id="frame"></iframe>`;
    const frame = document.getElementById("frame");
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentDocument?.body) {
      throw new Error("missing frame");
    }

    frame.contentDocument.body.innerHTML = `<button id="checkout">Pay invoice</button>`;
    const checkoutButton = frame.contentDocument.getElementById("checkout");
    const frameHTMLElement = (frame.contentWindow as unknown as { HTMLElement?: typeof HTMLElement })?.HTMLElement;
    if (!checkoutButton || !frameHTMLElement || !(checkoutButton instanceof frameHTMLElement)) {
      throw new Error("missing frame button");
    }

    viSpyRect(frame, { left: 100, top: 50, width: 400, height: 300 });
    viSpyRect(checkoutButton, { left: 20, top: 30, width: 120, height: 40 });

    const candidates = collectComposedDomCandidates(document.body, 20, () => false);
    const rect = getElementViewportRect(checkoutButton);

    expect(candidates).toContain(frame);
    expect(candidates).toContain(checkoutButton);
    expect(getComposedParentElement(frame.contentDocument.documentElement)).toBe(frame);
    expect(elementContainsDeep(frame, checkoutButton)).toBe(true);
    expect(rect.left).toBe(120);
    expect(rect.top).toBe(80);
    expect(rect.width).toBe(120);
    expect(rect.height).toBe(40);
  });

  it("resolves aria label references inside a same-origin iframe document", () => {
    document.body.innerHTML = `
      <span id="pay-label">Wrong top-document label</span>
      <iframe id="frame"></iframe>
    `;
    const frame = document.getElementById("frame");
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentDocument?.body) {
      throw new Error("missing frame");
    }

    frame.contentDocument.body.innerHTML = `
      <span id="pay-label">Pay invoice</span>
      <button id="pay" aria-labelledby="pay-label"></button>
    `;
    const payButton = frame.contentDocument.getElementById("pay");
    const frameHTMLElement = (frame.contentWindow as unknown as { HTMLElement?: typeof HTMLElement })?.HTMLElement;
    if (!payButton || !frameHTMLElement || !(payButton instanceof frameHTMLElement)) {
      throw new Error("missing frame button");
    }

    expect(findElementByIdInAccessibleScope(payButton, "pay-label")?.textContent).toBe("Pay invoice");
  });

  it("recognizes iframe elements with realm-safe type checks", () => {
    document.body.innerHTML = `<iframe id="frame"></iframe>`;
    const frame = document.getElementById("frame");
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentDocument?.body) {
      throw new Error("missing frame");
    }

    frame.contentDocument.body.innerHTML = `
      <form id="billing">
        <input id="card" type="text" value="4242">
        <button id="submit" type="submit">Pay now</button>
      </form>
    `;
    const cardInput = frame.contentDocument.getElementById("card");
    const submitButton = frame.contentDocument.getElementById("submit");
    if (!cardInput || !submitButton) {
      throw new Error("missing frame controls");
    }

    expect(isHtmlElement(cardInput)).toBe(true);
    expect(isElementOfType(cardInput, "HTMLInputElement")).toBe(true);
    expect(isElementOfType(submitButton, "HTMLButtonElement")).toBe(true);
  });

  it("promotes tiny icon children to the real clickable ancestor for pointing", () => {
    document.body.innerHTML = `
      <button id="create-api-key" type="button">
        <span id="icon">+</span>
        <span>Create API key</span>
      </button>
    `;
    const button = document.getElementById("create-api-key");
    const icon = document.getElementById("icon");
    if (!(button instanceof HTMLElement) || !(icon instanceof HTMLElement)) {
      throw new Error("missing button fixture");
    }

    viSpyRect(button, { left: 1500, top: 20, width: 170, height: 40 });
    viSpyRect(icon, { left: 1510, top: 30, width: 12, height: 12 });

    const preferred = findPreferredPointableAncestor(icon, {
      isPointable: (candidate) => candidate.tagName.toLowerCase() === "button"
    });

    expect(preferred).toBe(button);
  });

  it("does not promote precise text targets to huge page shells", () => {
    document.body.innerHTML = `
      <main id="shell" role="main" tabindex="0">
        <p id="price">$42.00</p>
      </main>
    `;
    const shell = document.getElementById("shell");
    const price = document.getElementById("price");
    if (!(shell instanceof HTMLElement) || !(price instanceof HTMLElement)) {
      throw new Error("missing shell fixture");
    }

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    viSpyRect(shell, { left: 0, top: 0, width: 1200, height: 780 });
    viSpyRect(price, { left: 40, top: 120, width: 80, height: 24 });

    const preferred = findPreferredPointableAncestor(price, {
      isPointable: (candidate) => candidate.tabIndex >= 0
    });

    expect(preferred).toBe(price);
  });
});

function viSpyRect(
  element: Element,
  rect: { left: number; top: number; width: number; height: number }
) {
  const value = {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => value
  } as DOMRect;

  element.getBoundingClientRect = () => value;
}
