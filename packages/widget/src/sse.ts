export interface WidgetQuestionPrompt {
  question: string;
  choices: Array<{ label: string; value: string; recommended?: boolean }>;
}

export type WidgetSseEvent =
  | { type: "ready" }
  | { type: "openai_response"; responseId: string }
  | { type: "text"; text: string }
  | { type: "assistant_text"; text: string }
  | {
      type: "question";
      question: string;
      choices: WidgetQuestionPrompt["choices"];
      questions: WidgetQuestionPrompt[];
      toolCallId?: string;
    }
  | {
      type: "point";
      elementId?: string;
      box?: { ymin: number; xmin: number; ymax: number; xmax: number };
      label?: string;
      needFurtherAction?: boolean;
    }
  | {
      type: "scroll";
      elementId?: string;
      surfaceId?: string;
      direction?: "up" | "down";
      label?: string;
      needFurtherAction?: boolean;
    }
  | { type: "navigate"; route: string; label?: string }
  | { type: "done" }
  | { type: "error"; error: string };

export function parseWidgetSseEvent(eventData: string): WidgetSseEvent | null {
  const trimmedEventData = eventData.trim();
  if (!trimmedEventData || trimmedEventData === "[DONE]") {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedEventData) as {
      type?: string;
      text?: string;
      error?: string;
      elementId?: unknown;
      surfaceId?: unknown;
      direction?: unknown;
      route?: unknown;
      label?: unknown;
      needFurtherAction?: unknown;
      box?: unknown;
      responseId?: unknown;
      question?: unknown;
      choices?: unknown;
      questions?: unknown;
      toolCallId?: unknown;
    };

    if (parsed.type === "error") {
      return { type: "error", error: parsed.error || "stream failed" };
    }

    if (parsed.type === "ready") {
      return { type: "ready" };
    }

    if (parsed.type === "openai_response" && typeof parsed.responseId === "string") {
      return { type: "openai_response", responseId: parsed.responseId };
    }

    if (parsed.type === "assistant_text" && typeof parsed.text === "string") {
      return { type: "assistant_text", text: parsed.text };
    }

    if (parsed.type === "question") {
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .map((question) => parseQuestionPrompt(question))
            .filter((question): question is WidgetQuestionPrompt => Boolean(question))
        : [];
      const legacyQuestion =
        typeof parsed.question === "string"
          ? parseQuestionPrompt({ question: parsed.question, choices: parsed.choices })
          : null;
      const questionPrompts = questions.length > 0 ? questions : legacyQuestion ? [legacyQuestion] : [];
      const firstQuestion = questionPrompts[0];
      if (firstQuestion) {
        return {
          type: "question",
          question: firstQuestion.question,
          choices: firstQuestion.choices,
          questions: questionPrompts,
          ...(typeof parsed.toolCallId === "string" ? { toolCallId: parsed.toolCallId } : {})
        };
      }
    }

    if (parsed.type === "point") {
      const box = parsePointBoxPayload(parsed.box);
      return {
        type: "point",
        elementId: typeof parsed.elementId === "string" ? parsed.elementId : undefined,
        box,
        label: typeof parsed.label === "string" ? parsed.label : undefined,
        ...(parsed.needFurtherAction === true ? { needFurtherAction: true } : {})
      };
    }

    if (parsed.type === "scroll") {
      return {
        type: "scroll",
        elementId: typeof parsed.elementId === "string" ? parsed.elementId : undefined,
        surfaceId: typeof parsed.surfaceId === "string" ? parsed.surfaceId : undefined,
        direction: parsed.direction === "up" || parsed.direction === "down" ? parsed.direction : undefined,
        label: typeof parsed.label === "string" ? parsed.label : undefined,
        ...(parsed.needFurtherAction === true ? { needFurtherAction: true } : {})
      };
    }

    if (parsed.type === "navigate" && typeof parsed.route === "string") {
      return {
        type: "navigate",
        route: parsed.route,
        label: typeof parsed.label === "string" ? parsed.label : undefined
      };
    }

    if (parsed.type === "done") {
      return { type: "done" };
    }

    if (parsed.text) {
      return { type: "text", text: parsed.text };
    }

    return null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function parseQuestionPrompt(value: unknown): WidgetQuestionPrompt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { question?: unknown; choices?: unknown; options?: unknown };
  if (typeof candidate.question !== "string") {
    return null;
  }

  const question = candidate.question.trim();
  if (!question) {
    return null;
  }

  const rawChoices = Array.isArray(candidate.choices)
    ? candidate.choices
    : Array.isArray(candidate.options)
      ? candidate.options
      : [];
  const choices = rawChoices
    .map((choice) => parseQuestionChoice(choice))
    .filter((choice): choice is { label: string; value: string; recommended?: boolean } => Boolean(choice));

  return choices.length >= 2 ? { question, choices } : null;
}

function parseQuestionChoice(value: unknown): { label: string; value: string; recommended?: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { label?: unknown; recommended?: unknown; value?: unknown };
  if (typeof candidate.label !== "string") {
    return null;
  }

  const label = candidate.label.trim();
  if (!label) {
    return null;
  }

  return {
    label,
    value: typeof candidate.value === "string" ? candidate.value : label,
    ...(candidate.recommended === true ? { recommended: true } : {})
  };
}

function parsePointBoxPayload(value: unknown): { ymin: number; xmin: number; ymax: number; xmax: number } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { ymin?: unknown; xmin?: unknown; ymax?: unknown; xmax?: unknown };
  if (
    typeof candidate.ymin !== "number" ||
    typeof candidate.xmin !== "number" ||
    typeof candidate.ymax !== "number" ||
    typeof candidate.xmax !== "number"
  ) {
    return undefined;
  }

  return {
    ymin: clampNormalizedCoordinate(candidate.ymin),
    xmin: clampNormalizedCoordinate(candidate.xmin),
    ymax: clampNormalizedCoordinate(candidate.ymax),
    xmax: clampNormalizedCoordinate(candidate.xmax)
  };
}

function clampNormalizedCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1000, value));
}

export function extractTextFromSseEvent(eventData: string): string {
  const event = parseWidgetSseEvent(eventData);
  if (!event) {
    return "";
  }

  if (event.type === "error") {
    throw new Error(event.error);
  }

  return event.type === "text" || event.type === "assistant_text" ? event.text : "";
}

export async function readPostSseStream(
  response: Response,
  onText: (text: string) => Promise<void> | void,
  onEvent?: (event: WidgetSseEvent) => Promise<void> | void,
  onChunk?: (chunk: { chunkIndex: number; byteLength: number; totalBytes: number; elapsedMs: number }) => Promise<void> | void
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const streamStartedAt = performance.now();
  let chunkIndex = 0;
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunkIndex += 1;
    totalBytes += value.byteLength;
    await onChunk?.({
      chunkIndex,
      byteLength: value.byteLength,
      totalBytes,
      elapsedMs: Math.round(performance.now() - streamStartedAt)
    });
    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex = buffer.indexOf("\n\n");

    while (boundaryIndex >= 0) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      const data = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      const event = parseWidgetSseEvent(data);
      if (!event) {
        continue;
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }

      await onEvent?.(event);
      if ((event.type === "text" || event.type === "assistant_text") && event.text) {
        await onText(event.text);
      }
    }
  }
}
