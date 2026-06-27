import { describe, expect, it } from "vitest";
import { parsePointTag, pointBoxToViewportCenter, tryExtractSpeakableText } from "./point-tags";

describe("widget point tags", () => {
  it("maps normalized boxes into viewport coordinates", () => {
    const parsed = parsePointTag("[POINTBOX:250,500,750,1000:checkout] go here");

    expect(parsed.spokenText).toBe("go here");
    expect(parsed.box).not.toBeNull();
    expect(pointBoxToViewportCenter(parsed.box!, 1200, 800)).toEqual({
      x: 900,
      y: 400
    });
  });

  it("suppresses speech while the leading point tag is still streaming", () => {
    expect(tryExtractSpeakableText("[POINTBOX:250,500,")).toBeNull();
    expect(tryExtractSpeakableText("[POINTBOX:250,500,750,1000:checkout] go here")?.spokenText).toBe(
      "go here"
    );
  });

  it("parses DOM element point tags", () => {
    const parsed = tryExtractSpeakableText("[POINTELEMENT:e12:create campaign] use this button");

    expect(parsed?.elementId).toBe("e12");
    expect(parsed?.spokenText).toBe("use this button");
    expect(tryExtractSpeakableText("[POINTELEMENT:e12:create")).toBeNull();
  });

  it("tolerates the common missing-t model typo in element point tags", () => {
    const parsed = tryExtractSpeakableText("[poinelement:c20:nom de l'alumet] click the title field.");

    expect(parsed?.elementId).toBe("c20");
    expect(parsed?.spokenText).toBe("click the title field.");
  });

  it("removes malformed inline point directive fragments from spoken text", () => {
    const parsed = tryExtractSpeakableText("click [POINTELEMENT:c23:paramètres");

    expect(parsed?.elementId).toBe("c23");
    expect(parsed?.spokenText).toBe("click");
  });

  it("removes malformed dangling point directive prefixes from spoken text", () => {
    const parsed = tryExtractSpeakableText("drag this first column to the right of [POINTELEMENT.");

    expect(parsed?.elementId).toBeNull();
    expect(parsed?.spokenText).toBe("drag this first column to the right of");
  });

  it("removes malformed need-further directive fragments from spoken text", () => {
    const parsed = tryExtractSpeakableText("[POINT:none][NEED_FURTHERi can't see any move control here.");

    expect(parsed?.elementId).toBeNull();
    expect(parsed?.spokenText).toBe("i can't see any move control here.");
  });

  it("parses scroll action tags", () => {
    const parsed = tryExtractSpeakableText("[SCROLL:page:down:more activity] looking lower");

    expect(parsed?.scroll).toEqual({
      surfaceId: "page",
      direction: "down",
      label: "more activity"
    });
    expect(parsed?.spokenText).toBe("looking lower");
    expect(tryExtractSpeakableText("[SCROLL:page:down")).toBeNull();
  });

  it("parses scroll-to-element action tags", () => {
    const parsed = tryExtractSpeakableText("[SCROLLTO:o4:review security] checking that section");

    expect(parsed?.scrollTo).toEqual({
      elementId: "o4",
      label: "review security"
    });
    expect(parsed?.spokenText).toBe("checking that section");
    expect(tryExtractSpeakableText("[SCROLLTO:o4:review")).toBeNull();
  });
});
