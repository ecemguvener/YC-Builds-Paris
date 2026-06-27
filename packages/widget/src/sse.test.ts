import { describe, expect, it } from "vitest";
import { extractTextFromSseEvent, parseWidgetSseEvent } from "./sse";

describe("SSE parsing", () => {
  it("extracts Barkan assistant text events", () => {
    const event = JSON.stringify({ type: "assistant_text", text: "hello world" });

    expect(extractTextFromSseEvent(event)).toBe("hello world");
  });

  it("ignores ready events", () => {
    expect(extractTextFromSseEvent(JSON.stringify({ type: "ready" }))).toBe("");
  });

  it("parses native OpenAI response id events", () => {
    expect(parseWidgetSseEvent(JSON.stringify({ type: "openai_response", responseId: "resp_123" }))).toEqual({
      type: "openai_response",
      responseId: "resp_123"
    });
  });

  it("parses model question choice events", () => {
    expect(
      parseWidgetSseEvent(
        JSON.stringify({
          type: "question",
          question: "Which workspace?",
          choices: [
            { label: "Personal", value: "personal" },
            { label: "Team" },
            { label: "" },
            "ignored"
          ]
        })
      )
    ).toEqual({
      type: "question",
      question: "Which workspace?",
      choices: [
        { label: "Personal", value: "personal" },
        { label: "Team", value: "Team" }
      ],
      questions: [
        {
          question: "Which workspace?",
          choices: [
            { label: "Personal", value: "personal" },
            { label: "Team", value: "Team" }
          ]
        }
      ]
    });
  });

  it("parses batched model question choice events", () => {
    expect(
      parseWidgetSseEvent(
        JSON.stringify({
          type: "question",
          toolCallId: "call_test",
          questions: [
            {
              question: "First choice?",
              choices: [
                { label: "A", value: "a", recommended: true },
                { label: "B", value: "b" }
              ]
            },
            {
              question: "Second choice?",
              choices: [
                { label: "Fast", value: "fast" },
                { label: "Careful", value: "careful" }
              ]
            }
          ]
        })
      )
    ).toEqual({
      type: "question",
      toolCallId: "call_test",
      question: "First choice?",
      choices: [
        { label: "A", value: "a", recommended: true },
        { label: "B", value: "b" }
      ],
      questions: [
        {
          question: "First choice?",
          choices: [
            { label: "A", value: "a", recommended: true },
            { label: "B", value: "b" }
          ]
        },
        {
          question: "Second choice?",
          choices: [
            { label: "Fast", value: "fast" },
            { label: "Careful", value: "careful" }
          ]
        }
      ]
    });
  });

  it("parses typed navigate events", () => {
    expect(parseWidgetSseEvent(JSON.stringify({ type: "navigate", route: "/settings/billing", label: "billing" }))).toEqual({
      type: "navigate",
      route: "/settings/billing",
      label: "billing"
    });
  });

  it("parses typed point boxes with normalized coordinate clamping", () => {
    expect(
      parseWidgetSseEvent(
        JSON.stringify({
          type: "point",
          box: { ymin: -20, xmin: 500, ymax: 750, xmax: 1200 },
          label: "checkout"
        })
      )
    ).toEqual({
      type: "point",
      elementId: undefined,
      box: { ymin: 0, xmin: 500, ymax: 750, xmax: 1000 },
      label: "checkout"
    });
  });

  it("parses multi-step point metadata", () => {
    expect(
      parseWidgetSseEvent(JSON.stringify({ type: "point", elementId: "c3", label: "options", needFurtherAction: true }))
    ).toEqual({
      type: "point",
      elementId: "c3",
      box: undefined,
      label: "options",
      needFurtherAction: true
    });
  });

  it("parses typed scroll events", () => {
    expect(parseWidgetSseEvent(JSON.stringify({ type: "scroll", surfaceId: "page", direction: "down" }))).toEqual({
      type: "scroll",
      elementId: undefined,
      surfaceId: "page",
      direction: "down",
      label: undefined
    });
  });

  it("parses multi-step scroll metadata", () => {
    expect(
      parseWidgetSseEvent(
        JSON.stringify({ type: "scroll", elementId: "c21", label: "requested item", needFurtherAction: true })
      )
    ).toEqual({
      type: "scroll",
      elementId: "c21",
      surfaceId: undefined,
      direction: undefined,
      label: "requested item",
      needFurtherAction: true
    });
  });
});
