export interface StalenessElementSnapshot {
  label?: string;
  text?: string;
  attributes?: Record<string, string>;
  visibility?: string;
  children?: StalenessElementSnapshot[];
}

export interface StalenessUiFact {
  id?: string;
  label?: string;
  text?: string;
  context?: string;
}

export interface StalenessSnapshot {
  route: string;
  title?: string;
  elements?: StalenessElementSnapshot[];
  uiFacts?: StalenessUiFact[];
  offscreenUiFacts?: StalenessUiFact[];
  pageMeta?: {
    title?: string;
    headings?: string[];
    landmarks?: string[];
    selectedNav?: string[];
  };
}

export interface StalenessOptions {
  livePrimaryControlCount?: number;
}

interface RouteContentAlignment {
  routeTokens: string[];
  requiredTokens: string[];
  matchedRequiredTokenCount: number;
  elementMatchedRequiredTokenCount: number;
  aligned: boolean;
  elementAligned: boolean;
}

export function isDomSnapshotProbablyStale(snapshot: StalenessSnapshot, options: StalenessOptions = {}): boolean {
  const alignment = getSnapshotRouteContentAlignment(snapshot);
  if (alignment.requiredTokens.length > 0) {
    if (!alignment.elementAligned && alignment.elementMatchedRequiredTokenCount === 0) {
      return true;
    }

    if (!alignment.aligned && alignment.matchedRequiredTokenCount === 0) {
      return true;
    }
  }

  if ((snapshot.uiFacts?.length ?? 0) === 0 && (options.livePrimaryControlCount ?? 0) > 0) {
    return true;
  }

  return false;
}

function getSnapshotRouteContentAlignment(snapshot: StalenessSnapshot): RouteContentAlignment {
  const routeTokens = getRouteContentTokens(snapshot.route);
  const requiredTokens = getRequiredRouteContentTokens(routeTokens);
  if (requiredTokens.length === 0) {
    return {
      routeTokens,
      requiredTokens,
      matchedRequiredTokenCount: 0,
      elementMatchedRequiredTokenCount: 0,
      aligned: true,
      elementAligned: true
    };
  }

  const visibleTokenSet = new Set(tokenizeForSearch(collectSnapshotVisibleTextForRouteMatching(snapshot)));
  const elementTokenSet = new Set(tokenizeForSearch(collectSnapshotElementTextForRouteMatching(snapshot)));
  const matchedRequiredTokenCount = requiredTokens.filter((token) => visibleTokenSet.has(token)).length;
  const elementMatchedRequiredTokenCount = requiredTokens.filter((token) => elementTokenSet.has(token)).length;
  return {
    routeTokens,
    requiredTokens,
    matchedRequiredTokenCount,
    elementMatchedRequiredTokenCount,
    aligned: matchedRequiredTokenCount === requiredTokens.length,
    elementAligned: elementMatchedRequiredTokenCount === requiredTokens.length
  };
}

function collectSnapshotVisibleTextForRouteMatching(snapshot: StalenessSnapshot): string {
  const textParts: string[] = [
    snapshot.title ?? "",
    snapshot.pageMeta?.title ?? "",
    ...(snapshot.pageMeta?.headings ?? []),
    ...(snapshot.pageMeta?.landmarks ?? []),
    ...(snapshot.pageMeta?.selectedNav ?? [])
  ];

  for (const fact of [...(snapshot.uiFacts ?? []), ...(snapshot.offscreenUiFacts ?? [])]) {
    textParts.push(fact.label ?? "", fact.text ?? "", fact.context ?? "");
  }

  textParts.push(collectSnapshotElementTextForRouteMatching(snapshot));
  return cleanDomText(textParts.filter(Boolean).join(" ")).slice(0, 6000);
}

function collectSnapshotElementTextForRouteMatching(snapshot: StalenessSnapshot): string {
  const textParts: string[] = [];
  const visit = (elements: StalenessElementSnapshot[] = []) => {
    for (const element of elements) {
      if (element.visibility === "visible" || element.visibility === "partially_visible" || !element.visibility) {
        textParts.push(element.label ?? "", element.text ?? "", ...Object.values(element.attributes ?? {}));
      }

      if (element.children?.length) {
        visit(element.children);
      }
    }
  };

  visit(snapshot.elements);
  return cleanDomText(textParts.filter(Boolean).join(" ")).slice(0, 6000);
}

function getRouteContentTokens(route: string): string[] {
  const path = getRoutePathname(route);
  const segments = path
    .split("/")
    .map((segment) => safeDecodeRouteSegment(segment))
    .filter(Boolean);
  const tokens: string[] = [];

  for (const segment of segments) {
    if (isRouteIdentitySegment(segment)) {
      continue;
    }

    for (const token of tokenizeForSearch(segment.replace(/[-_]+/g, " "))) {
      if (!tokens.includes(token)) {
        tokens.push(token);
      }
    }
  }

  return tokens.slice(0, 8);
}

function getRequiredRouteContentTokens(routeTokens: string[]): string[] {
  const genericRouteTokens = new Set(["setting", "settings", "home", "dashboard", "page", "view", "index"]);
  const specificTokens = routeTokens.filter((token) => !genericRouteTokens.has(token));
  if (specificTokens.length > 0) {
    return specificTokens.slice(-3);
  }

  return routeTokens.slice(-1);
}

function getRoutePathname(route: string): string {
  try {
    return new URL(route, "https://example.invalid").pathname;
  } catch {
    return route.split(/[?#]/, 1)[0] ?? "";
  }
}

function safeDecodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isRouteIdentitySegment(segment: string): boolean {
  const normalized = segment.trim().toLowerCase();
  return (
    /^(new|edit|details?|overview|index)$/.test(normalized) ||
    /^\d+$/.test(normalized) ||
    /^[a-f0-9]{8,}$/i.test(normalized) ||
    /^[a-z]+_[a-z0-9]{8,}$/i.test(normalized) ||
    (normalized.length > 18 && /\d/.test(normalized))
  );
}

function tokenizeForSearch(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .map((token) => singularizeToken(token.trim()))
        .filter((token) => token.length >= 2)
    )
  );
}

function singularizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

function cleanDomText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
