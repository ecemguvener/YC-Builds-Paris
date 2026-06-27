import { describe, expect, it } from "vitest";
import {
  SequentialAsyncQueue,
  getRuntimeRoute,
  isCallToggleShortcut,
  isChatToggleShortcut,
  isMuteToggleShortcut,
  placeAgentNearTarget
} from "./interaction";

describe("widget interaction helpers", () => {
  it("detects Alt+C call toggles and ignores repeats", () => {
    expect(isCallToggleShortcut({ altKey: true, code: "KeyC", repeat: false })).toBe(true);
    expect(isCallToggleShortcut({ altKey: true, code: "KeyC", repeat: true })).toBe(false);
    expect(isCallToggleShortcut({ altKey: false, code: "KeyC", repeat: false })).toBe(false);
    expect(isCallToggleShortcut({ altKey: true, code: "KeyV", repeat: false })).toBe(false);
  });

  it("detects Alt+M mute toggles and ignores repeats", () => {
    expect(isMuteToggleShortcut({ altKey: true, code: "KeyM", repeat: false })).toBe(true);
    expect(isMuteToggleShortcut({ altKey: true, code: "KeyM", repeat: true })).toBe(false);
    expect(isMuteToggleShortcut({ altKey: false, code: "KeyM", repeat: false })).toBe(false);
    expect(isMuteToggleShortcut({ altKey: true, code: "KeyC", repeat: false })).toBe(false);
  });

  it("detects Alt+V chat toggles and ignores repeats", () => {
    expect(isChatToggleShortcut({ altKey: true, code: "KeyV", repeat: false })).toBe(true);
    expect(isChatToggleShortcut({ altKey: true, code: "KeyV", repeat: true })).toBe(false);
    expect(isChatToggleShortcut({ altKey: false, code: "KeyV", repeat: false })).toBe(false);
    expect(isChatToggleShortcut({ altKey: true, code: "KeyC", repeat: false })).toBe(false);
  });

  it("prefers hash routes for SPA pages", () => {
    expect(getRuntimeRoute("/shell", "?workspace=1", "#/new-app?step=2")).toBe("/new-app?step=2");
    expect(getRuntimeRoute("/new-app", "", "")).toBe("/new-app");
  });

  it("moves the bubble above the target near the bottom border", () => {
    expect(placeAgentNearTarget({ x: 24, y: 760 }, { width: 1024, height: 768 }, { width: 196, height: 90 })).toEqual({
      placement: "above-right",
      width: 228,
      height: 110,
      x: 18,
      y: 656
    });
  });

  it("moves the bubble left of the target near the right border", () => {
    expect(placeAgentNearTarget({ x: 1000, y: 40 }, { width: 1024, height: 768 }, { width: 196, height: 60 })).toEqual({
      placement: "below-left",
      width: 228,
      height: 80,
      x: 778,
      y: 34
    });
  });

  it("processes committed turns sequentially", async () => {
    const processed: string[] = [];
    let releaseFirstTurn!: () => void;
    const firstTurnBlocked = new Promise<void>((resolve) => {
      releaseFirstTurn = resolve;
    });

    const queue = new SequentialAsyncQueue<string>(async (turn) => {
      processed.push(`start:${turn}`);
      if (turn === "one") {
        await firstTurnBlocked;
      }
      processed.push(`end:${turn}`);
    });

    queue.enqueue("one");
    queue.enqueue("two");
    await Promise.resolve();

    expect(processed).toEqual(["start:one"]);
    expect(queue.processing).toBe(true);
    expect(queue.pendingCount).toBe(1);

    releaseFirstTurn();
    await waitFor(() => processed.length === 4);

    expect(processed).toEqual(["start:one", "end:one", "start:two", "end:two"]);
    expect(queue.processing).toBe(false);
    expect(queue.pendingCount).toBe(0);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
