export interface NormalizedPointBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  label: string;
}

export interface PointTagParseResult {
  spokenText: string;
  box: NormalizedPointBox | null;
  elementId: string | null;
  scroll: ScrollAction | null;
  scrollTo: ScrollToAction | null;
}

export interface ScrollAction {
  surfaceId: string;
  direction: "up" | "down";
  label: string;
}

export interface ScrollToAction {
  elementId: string;
  label: string;
}

const anyPointTagPattern = /\[(POINTBOX|POINT):([^\]]+)\]/i;
const anyElementTagPattern = /\[(?:POINTELEMENT|POINELEMENT):([^\]:]+):([^\]]+)\]/i;
const incompleteElementTagPattern = /\[(?:POINTELEMENT|POINELEMENT):([^\]:\]\s]+):([^\]\n]{1,80})$/i;
const anyScrollTagPattern = /\[SCROLL:([^\]:]+):(up|down):([^\]]+)\]/i;
const anyScrollToTagPattern = /\[SCROLLTO:([^\]:]+):([^\]]+)\]/i;
const leadingPointTagPattern = /^\s*\[(POINTBOX|POINT):([^\]]+)\]\s*(.*)$/is;
const leadingElementTagPattern = /^\s*\[(?:POINTELEMENT|POINELEMENT):([^\]:]+):([^\]]+)\]\s*(.*)$/is;
const leadingScrollTagPattern = /^\s*\[SCROLL:([^\]:]+):(up|down):([^\]]+)\]\s*(.*)$/is;
const leadingScrollToTagPattern = /^\s*\[SCROLLTO:([^\]:]+):([^\]]+)\]\s*(.*)$/is;
const boxPattern = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*:(.+?)\s*$/i;

const emptyPointTagResult: PointTagParseResult = {
  spokenText: "",
  box: null,
  elementId: null,
  scroll: null,
  scrollTo: null
};

export function parsePointTag(responseText: string): PointTagParseResult {
  if (!responseText.trim()) {
    return emptyPointTagResult;
  }

  const leadingScrollToMatch = responseText.match(leadingScrollToTagPattern);
  const scrollToMatch = leadingScrollToMatch ?? responseText.match(anyScrollToTagPattern);
  if (scrollToMatch) {
    return {
      spokenText: leadingScrollToMatch
        ? normalizeSpokenText(leadingScrollToMatch[3])
        : normalizeSpokenText(responseText.replace(scrollToMatch[0], " ")),
      ...withoutPointing(),
      scrollTo: {
        elementId: scrollToMatch[1].trim(),
        label: scrollToMatch[2].trim()
      }
    };
  }

  const leadingScrollMatch = responseText.match(leadingScrollTagPattern);
  const scrollMatch = leadingScrollMatch ?? responseText.match(anyScrollTagPattern);
  if (scrollMatch) {
    return {
      spokenText: leadingScrollMatch
        ? normalizeSpokenText(leadingScrollMatch[4])
        : normalizeSpokenText(responseText.replace(scrollMatch[0], " ")),
      ...withoutPointing(),
      scroll: {
        surfaceId: scrollMatch[1].trim(),
        direction: scrollMatch[2].toLowerCase() === "up" ? "up" : "down",
        label: scrollMatch[3].trim()
      },
      scrollTo: null
    };
  }

  const leadingElementMatch = responseText.match(leadingElementTagPattern);
  const elementMatch = leadingElementMatch ?? responseText.match(anyElementTagPattern) ?? responseText.match(incompleteElementTagPattern);
  if (elementMatch) {
    return {
      spokenText: leadingElementMatch
        ? normalizeSpokenText(leadingElementMatch[3])
        : normalizeSpokenText(responseText.replace(elementMatch[0], " ")),
      ...withoutPointing(),
      elementId: elementMatch[1].trim()
    };
  }

  const leadingMatch = responseText.match(leadingPointTagPattern);
  const tagMatch = leadingMatch ?? responseText.match(anyPointTagPattern);
  if (!tagMatch) {
    return { spokenText: normalizeSpokenText(responseText), ...withoutPointing() };
  }

  const tagName = tagMatch[1].toUpperCase();
  const body = tagMatch[2].trim();
  const spokenText = leadingMatch
    ? normalizeSpokenText(leadingMatch[3])
    : normalizeSpokenText(responseText.replace(tagMatch[0], " "));

  if (tagName !== "POINTBOX" || body.toLowerCase() === "none") {
    return { spokenText, ...withoutPointing() };
  }

  const boxMatch = body.match(boxPattern);
  if (!boxMatch) {
    return { spokenText, ...withoutPointing() };
  }

  return {
    spokenText,
    box: {
      ymin: clampNormalized(parseInt(boxMatch[1], 10)),
      xmin: clampNormalized(parseInt(boxMatch[2], 10)),
      ymax: clampNormalized(parseInt(boxMatch[3], 10)),
      xmax: clampNormalized(parseInt(boxMatch[4], 10)),
      label: boxMatch[5].trim()
    },
    elementId: null,
    scroll: null,
    scrollTo: null
  };
}

function withoutPointing(): Omit<PointTagParseResult, "spokenText"> {
  return {
    box: null,
    elementId: null,
    scroll: null,
    scrollTo: null
  };
}

export function tryExtractSpeakableText(responseText: string): PointTagParseResult | null {
  if (isWaitingForLeadingPointTag(responseText)) {
    return null;
  }

  return parsePointTag(responseText);
}

export function pointBoxToViewportCenter(
  box: NormalizedPointBox,
  viewportWidth: number,
  viewportHeight: number
) {
  return {
    x: ((box.xmin + box.xmax) / 2 / 1000) * viewportWidth,
    y: ((box.ymin + box.ymax) / 2 / 1000) * viewportHeight
  };
}

function normalizeSpokenText(text: string): string {
  return text
    .replace(/\[NAVIGATE:[^\]]+\]/gi, " ")
    .replace(/\[SCROLLTO:[^\]]+\]/gi, " ")
    .replace(/\[SCROLL:[^\]]+\]/gi, " ")
    .replace(/\[(?:POINTELEMENT|POINELEMENT):[^\]]+\]/gi, " ")
    .replace(/\[(?:POINTBOX|POINT):[^\]]+\]/gi, " ")
    .replace(/\[NEED_FURTHER_ACTION:(?:true|false)\]/gi, " ")
    .replace(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT):[^\]]*$/gi, " ")
    .replace(/\[(?:NAVIGATE|SCROLLTO|SCROLL|POINTELEMENT|POINELEMENT|POINTBOX|POINT)[^\]]*$/gi, " ")
    .replace(/\[NEED_FURTHER_ACTION(?::(?:true|false)?)?$/gi, " ")
    .replace(/\[(?:NEED|need)(?:_(?:FURTHER|further|ACTION|action))*:? *(?:true|false)?(?=[A-Za-z\s]|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWaitingForLeadingPointTag(responseText: string): boolean {
  const trimmedText = responseText.trimStart();
  if (!trimmedText.startsWith("[")) {
    return false;
  }

  if (trimmedText.includes("]")) {
    return false;
  }

  return /^\[(?:P|PO|POI|POIN|POINT|POINTB|POINTBO|POINTBOX|POINE|POINEL|POINELE|POINELEM|POINELEME|POINELEMEN|POINELEMENT|POINTE|POINTEL|POINTELE|POINTELEM|POINTELEME|POINTELEMEN|POINTELEMENT|S|SC|SCR|SCRO|SCROL|SCROLL|SCROLLT|SCROLLTO)?(?::|$)/i.test(trimmedText);
}

function clampNormalized(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1000, value));
}
