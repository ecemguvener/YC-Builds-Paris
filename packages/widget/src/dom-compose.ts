export function getDomChildElements(element: Element): HTMLElement[] {
  const children = Array.from(element.children).filter(isHtmlElement);
  if (isHtmlElement(element) && element.shadowRoot) {
    children.push(...Array.from(element.shadowRoot.children).filter(isHtmlElement));
  }
  const frameBody = getSameOriginFrameBody(element);
  if (frameBody) {
    children.push(...Array.from(frameBody.children).filter(isHtmlElement));
  }
  return children;
}

export function getComposedParentElement(element: HTMLElement): HTMLElement | null {
  if (element.parentElement) {
    return element.parentElement;
  }

  const root = element.getRootNode();
  if (isShadowRootLike(root) && isHtmlElement(root.host)) {
    return root.host;
  }

  const frameElement = element.ownerDocument.defaultView?.frameElement;
  return isHtmlElement(frameElement) ? frameElement : null;
}

export function elementContainsDeep(container: HTMLElement, target: HTMLElement): boolean {
  if (container === target || container.contains(target)) {
    return true;
  }

  let current = getComposedParentElement(target);
  while (current) {
    if (current === container) {
      return true;
    }
    current = getComposedParentElement(current);
  }
  return false;
}

export function collectComposedDomCandidates(
  root: HTMLElement,
  limit: number,
  shouldSkip: (element: HTMLElement) => boolean
): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  const stack = [...getDomChildElements(root)].reverse();

  while (stack.length > 0 && candidates.length < limit) {
    const element = stack.pop()!;
    if (shouldSkip(element)) {
      continue;
    }

    candidates.push(element);
    stack.push(...getDomChildElements(element).reverse());
  }

  return candidates;
}

export function* iterateComposedHtmlDescendants(
  root: HTMLElement,
  maxElements: number,
  shouldSkip: (element: HTMLElement) => boolean
): Generator<HTMLElement> {
  const stack = [...getDomChildElements(root)].reverse();
  let visited = 0;

  while (stack.length > 0 && visited < maxElements) {
    const element = stack.pop()!;
    visited++;
    if (shouldSkip(element)) {
      continue;
    }

    yield element;
    stack.push(...getDomChildElements(element).reverse());
  }
}

export function getElementViewportRect(element: HTMLElement): DOMRect {
  const ownRect = element.getBoundingClientRect();
  let left = ownRect.left;
  let top = ownRect.top;
  let frameElement = element.ownerDocument.defaultView?.frameElement;

  while (isHtmlElement(frameElement)) {
    const frameRect = frameElement.getBoundingClientRect();
    left += frameRect.left;
    top += frameRect.top;
    frameElement = frameElement.ownerDocument.defaultView?.frameElement;
  }

  return createDomRect(left, top, ownRect.width, ownRect.height);
}

function getSameOriginFrameBody(element: Element): HTMLElement | null {
  if (!isElementOfType(element, "HTMLIFrameElement")) {
    return null;
  }

  try {
    const body = (element as HTMLIFrameElement).contentDocument?.body;
    return body && isHtmlElement(body) ? body : null;
  } catch {
    return null;
  }
}

export function isHtmlElement(value: unknown): value is HTMLElement {
  if (!value || typeof value !== "object" || !("ownerDocument" in value)) {
    return false;
  }

  const element = value as Element;
  const view = element.ownerDocument?.defaultView;
  return Boolean(view?.HTMLElement && element instanceof view.HTMLElement);
}

export function isElementOfType(element: Element, constructorName: string): boolean {
  const view = element.ownerDocument?.defaultView;
  const constructor = view ? (view as unknown as Record<string, unknown>)[constructorName] : undefined;
  return typeof constructor === "function" && element instanceof constructor;
}

export function findElementByIdInAccessibleScope(owner: HTMLElement, id: string): HTMLElement | null {
  const root = owner.getRootNode();
  if (isShadowRootLike(root)) {
    const shadowMatch = root.getElementById(id);
    if (isHtmlElement(shadowMatch)) {
      return shadowMatch;
    }
  }

  const ownerDocumentMatch = owner.ownerDocument.getElementById(id);
  return isHtmlElement(ownerDocumentMatch) ? ownerDocumentMatch : null;
}

export function findPreferredPointableAncestor(
  element: HTMLElement,
  options: {
    isPointable: (candidate: HTMLElement) => boolean;
    shouldIgnore?: (candidate: HTMLElement) => boolean;
    maxDepth?: number;
  }
): HTMLElement {
  if (options.isPointable(element)) {
    return element;
  }

  const originalRect = getElementViewportRect(element);
  if (originalRect.width < 1 || originalRect.height < 1) {
    return element;
  }

  const originalArea = Math.max(1, originalRect.width * originalRect.height);
  let current = getComposedParentElement(element);
  let depth = 0;
  const maxDepth = options.maxDepth ?? 6;

  while (current && depth < maxDepth) {
    if (options.shouldIgnore?.(current)) {
      break;
    }

    if (options.isPointable(current)) {
      const rect = getElementViewportRect(current);
      const area = Math.max(1, rect.width * rect.height);
      const containsOriginal =
        originalRect.left >= rect.left - 2 &&
        originalRect.top >= rect.top - 2 &&
        originalRect.right <= rect.right + 2 &&
        originalRect.bottom <= rect.bottom + 2;
      const isReasonableTargetSize = area <= originalArea * 90 || rect.width <= 420 || rect.height <= 160;
      const isNotPageShell = rect.width * rect.height <= window.innerWidth * window.innerHeight * 0.65;

      if (containsOriginal && isReasonableTargetSize && isNotPageShell) {
        return current;
      }
    }

    current = getComposedParentElement(current);
    depth++;
  }

  return element;
}

function isShadowRootLike(value: unknown): value is ShadowRoot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ShadowRoot>;
  return typeof candidate.getElementById === "function" && isHtmlElement(candidate.host);
}

function createDomRect(left: number, top: number, width: number, height: number): DOMRect {
  if (typeof DOMRect !== "undefined") {
    return DOMRect.fromRect({ x: left, y: top, width, height });
  }

  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { x: left, y: top, width, height, left, top, right: left + width, bottom: top + height };
    }
  } as DOMRect;
}
