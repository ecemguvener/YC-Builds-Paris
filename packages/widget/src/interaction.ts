export type VoiceState = "idle" | "connecting" | "listening" | "muted" | "thinking" | "speaking" | "error";

export interface ShortcutEventLike {
  altKey: boolean;
  code: string;
  repeat?: boolean;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface AgentSize {
  width: number;
  height: number;
}

export type AgentPlacement = "below-right" | "below-left" | "above-right" | "above-left";

export interface AgentPlacementResult extends ViewportPoint {
  placement: AgentPlacement;
  width: number;
  height: number;
}

const agentPointerSize = 28;
const agentPointerTipInset = 6;
const agentBubbleOffsetX = 32;
const agentBubbleOffsetY = 20;

export function isCallToggleShortcut(event: ShortcutEventLike): boolean {
  return event.altKey && event.code === "KeyC" && !event.repeat;
}

export function isMuteToggleShortcut(event: ShortcutEventLike): boolean {
  return event.altKey && event.code === "KeyM" && !event.repeat;
}

export function isChatToggleShortcut(event: ShortcutEventLike): boolean {
  return event.altKey && event.code === "KeyV" && !event.repeat;
}

export function getRuntimeRoute(pathname: string, search: string, hash: string): string {
  return hash.startsWith("#/") ? hash.slice(1) : `${pathname}${search}`;
}

export function placeAgentNearTarget(
  target: ViewportPoint,
  viewport: ViewportSize,
  bubbleSize: AgentSize,
  margin = 12
): AgentPlacementResult {
  const hasBubble = bubbleSize.width > 0 && bubbleSize.height > 0;
  const layoutWidth = hasBubble
    ? Math.max(agentPointerSize, Math.ceil(bubbleSize.width) + agentBubbleOffsetX)
    : agentPointerSize;
  const layoutHeight = hasBubble
    ? Math.max(agentPointerSize, Math.ceil(bubbleSize.height) + agentBubbleOffsetY)
    : agentPointerSize;
  const horizontalPreference = target.x + agentBubbleOffsetX + bubbleSize.width <= viewport.width - margin
    ? "right"
    : "left";
  const verticalPreference = target.y + agentBubbleOffsetY + bubbleSize.height <= viewport.height - margin
    ? "below"
    : "above";
  const orderedPlacements = prioritizePlacements(verticalPreference, horizontalPreference);
  const candidates = orderedPlacements.map((placement, order) =>
    buildPlacementCandidate(placement, target, viewport, layoutWidth, layoutHeight, bubbleSize, margin, order)
  );
  candidates.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    return left.order - right.order;
  });

  const bestCandidate = candidates[0] ?? buildPlacementCandidate(
    "below-right",
    target,
    viewport,
    layoutWidth,
    layoutHeight,
    bubbleSize,
    margin,
    0
  );
  const bubbleShift = hasBubble ? getRectViewportShift(bestCandidate.bubbleRect, viewport, margin) : { x: 0, y: 0 };

  return {
    placement: bestCandidate.placement,
    width: layoutWidth,
    height: layoutHeight,
    x: bestCandidate.x + bubbleShift.x,
    y: bestCandidate.y + bubbleShift.y
  };
}

export class SequentialAsyncQueue<T> {
  private readonly handler: (item: T) => Promise<void>;
  private readonly queue: T[] = [];
  private isProcessing = false;

  constructor(handler: (item: T) => Promise<void>) {
    this.handler = handler;
  }

  enqueue(item: T): void {
    this.queue.push(item);
    void this.drain();
  }

  clear(): void {
    this.queue.length = 0;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  private async drain(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const nextItem = this.queue.shift();
        if (nextItem !== undefined) {
          await this.handler(nextItem);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

function prioritizePlacements(vertical: "above" | "below", horizontal: "left" | "right"): AgentPlacement[] {
  const primary = `${vertical}-${horizontal}` as AgentPlacement;
  const sameVertical = `${vertical}-${horizontal === "right" ? "left" : "right"}` as AgentPlacement;
  const sameHorizontal = `${vertical === "below" ? "above" : "below"}-${horizontal}` as AgentPlacement;
  const opposite = `${vertical === "below" ? "above" : "below"}-${horizontal === "right" ? "left" : "right"}` as AgentPlacement;

  return [primary, sameVertical, sameHorizontal, opposite];
}

function buildPlacementCandidate(
  placement: AgentPlacement,
  target: ViewportPoint,
  viewport: ViewportSize,
  layoutWidth: number,
  layoutHeight: number,
  bubbleSize: AgentSize,
  margin: number,
  order: number
) {
  const tipX = placement.endsWith("right") ? agentPointerTipInset : layoutWidth - agentPointerTipInset;
  const tipY = placement.startsWith("below") ? agentPointerTipInset : layoutHeight - agentPointerTipInset;
  const x = target.x - tipX;
  const y = target.y - tipY;
  const bubbleRect = getBubbleRect(placement, x, y, layoutWidth, layoutHeight, bubbleSize);
  const pointerRect = getPointerRect(placement, x, y, layoutWidth, layoutHeight);
  const bubbleOverflow = bubbleSize.width > 0 && bubbleSize.height > 0
    ? getRectOverflowScore(bubbleRect, viewport, margin)
    : 0;
  const pointerOverflow = getRectOverflowScore(pointerRect, viewport, 0);

  return {
    placement,
    order,
    x,
    y,
    bubbleRect,
    score: bubbleOverflow * 10 + pointerOverflow
  };
}

function getBubbleRect(
  placement: AgentPlacement,
  x: number,
  y: number,
  layoutWidth: number,
  layoutHeight: number,
  bubbleSize: AgentSize
) {
  const isRight = placement.endsWith("right");
  const isBelow = placement.startsWith("below");
  const left = isRight ? x + agentBubbleOffsetX : x + layoutWidth - agentBubbleOffsetX - bubbleSize.width;
  const top = isBelow ? y + agentBubbleOffsetY : y + layoutHeight - agentBubbleOffsetY - bubbleSize.height;

  return {
    left,
    top,
    right: left + bubbleSize.width,
    bottom: top + bubbleSize.height
  };
}

function getPointerRect(
  placement: AgentPlacement,
  x: number,
  y: number,
  layoutWidth: number,
  layoutHeight: number
) {
  const isRight = placement.endsWith("right");
  const isBelow = placement.startsWith("below");
  const left = isRight ? x : x + layoutWidth - agentPointerSize;
  const top = isBelow ? y : y + layoutHeight - agentPointerSize;

  return {
    left,
    top,
    right: left + agentPointerSize,
    bottom: top + agentPointerSize
  };
}

function getRectOverflowScore(
  rect: { left: number; top: number; right: number; bottom: number },
  viewport: ViewportSize,
  margin: number
): number {
  return (
    Math.max(0, margin - rect.left) +
    Math.max(0, margin - rect.top) +
    Math.max(0, rect.right - (viewport.width - margin)) +
    Math.max(0, rect.bottom - (viewport.height - margin))
  );
}

function getRectViewportShift(
  rect: { left: number; top: number; right: number; bottom: number },
  viewport: ViewportSize,
  margin: number
): ViewportPoint {
  let x = 0;
  let y = 0;
  const maxRight = viewport.width - margin;
  const maxBottom = viewport.height - margin;

  if (rect.left < margin) {
    x = margin - rect.left;
  } else if (rect.right > maxRight) {
    x = maxRight - rect.right;
  }

  if (rect.top < margin) {
    y = margin - rect.top;
  } else if (rect.bottom > maxBottom) {
    y = maxBottom - rect.bottom;
  }

  return { x, y };
}
