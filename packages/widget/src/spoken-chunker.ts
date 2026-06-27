export interface StreamingSpeechTextChunk {
  text: string;
  flush: boolean;
}

const minimumPhraseChunkCharacterCount = 24;
const minimumLongClauseChunkCharacterCount = 48;

export class SpokenResponseStreamingChunker {
  private latestObservedSpokenText = "";
  private emittedCharacterCount = 0;

  updateSpokenPreview(spokenPreviewText: string): StreamingSpeechTextChunk[] {
    const normalizedSpokenPreviewText = spokenPreviewText.trim();
    if (!normalizedSpokenPreviewText) {
      this.latestObservedSpokenText = "";
      return [];
    }

    const commonPrefixLength = calculateCommonPrefixLength(
      this.latestObservedSpokenText,
      normalizedSpokenPreviewText
    );
    this.latestObservedSpokenText = normalizedSpokenPreviewText;

    if (commonPrefixLength < this.emittedCharacterCount) {
      return [];
    }

    return this.extractReadyChunks(normalizedSpokenPreviewText, false);
  }

  flushRemaining(finalSpokenText: string): StreamingSpeechTextChunk | null {
    const readyChunks = this.extractReadyChunks(finalSpokenText.trim(), true);
    if (readyChunks.length === 0) {
      return null;
    }

    return {
      text: readyChunks.map((chunk) => chunk.text).join(""),
      flush: readyChunks.at(-1)?.flush ?? true
    };
  }

  private extractReadyChunks(currentSpokenText: string, flushRemainingText: boolean) {
    const readyChunks: StreamingSpeechTextChunk[] = [];

    while (this.emittedCharacterCount < currentSpokenText.length) {
      const unsentText = currentSpokenText.slice(this.emittedCharacterCount);
      const readyCharacterCount = flushRemainingText
        ? unsentText.length
        : findReadyCharacterCount(unsentText);

      if (readyCharacterCount <= 0) {
        break;
      }

      const text = unsentText.slice(0, readyCharacterCount);
      this.emittedCharacterCount += readyCharacterCount;
      if (text.trim()) {
        readyChunks.push({
          text,
          flush: flushRemainingText && this.emittedCharacterCount >= currentSpokenText.length
        });
      }
    }

    return readyChunks;
  }
}

function findReadyCharacterCount(unsentText: string): number {
  const terminalBoundary = findLastBoundary(unsentText, /[.!?]/);
  if (terminalBoundary > 0) {
    return terminalBoundary;
  }

  if (unsentText.length >= minimumPhraseChunkCharacterCount) {
    const phraseBoundary = findLastBoundary(unsentText, /[,;:]/);
    if (phraseBoundary > 0) {
      return phraseBoundary;
    }
  }

  if (unsentText.length >= minimumLongClauseChunkCharacterCount) {
    const whitespaceBoundary = unsentText.lastIndexOf(" ");
    if (whitespaceBoundary > 0) {
      return whitespaceBoundary + 1;
    }
  }

  return 0;
}

function findLastBoundary(text: string, pattern: RegExp): number {
  let lastBoundary = 0;
  for (let index = 0; index < text.length; index++) {
    if (pattern.test(text[index])) {
      lastBoundary = index + 1;
      while (lastBoundary < text.length && /[\s"')\]}]/.test(text[lastBoundary])) {
        lastBoundary++;
      }
    }
  }
  return lastBoundary;
}

function calculateCommonPrefixLength(firstText: string, secondText: string): number {
  const commonLength = Math.min(firstText.length, secondText.length);
  let index = 0;
  while (index < commonLength && firstText[index] === secondText[index]) {
    index++;
  }
  return index;
}
