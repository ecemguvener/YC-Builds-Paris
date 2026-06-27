import { describe, expect, it } from "vitest";
import { SpokenResponseStreamingChunker } from "./spoken-chunker";

describe("spoken chunker", () => {
  it("emits stable phrase chunks and flushes the remainder", () => {
    const chunker = new SpokenResponseStreamingChunker();

    expect(chunker.updateSpokenPreview("click the checkout button, then")).toEqual([
      { text: "click the checkout button, ", flush: false }
    ]);
    expect(chunker.flushRemaining("click the checkout button, then pay.")).toEqual({
      text: "then pay.",
      flush: true
    });
  });
});
