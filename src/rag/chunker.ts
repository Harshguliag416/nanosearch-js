import { Chunk } from './types.js';

export interface ChunkingOptions {
  chunkSize?: number;       // character limit (default 500)
  chunkOverlap?: number;    // overlapping characters (default 100)
}

/**
 * Split text into overlapping chunks using a sliding window.
 * Attempts to preserve word boundaries where possible.
 */
export function chunkText(
  text: string,
  metadata: Record<string, unknown> = {},
  options: ChunkingOptions = {}
): Chunk[] {
  const chunkSize = options.chunkSize ?? 500;
  const chunkOverlap = options.chunkOverlap ?? 100;

  if (chunkSize <= 0) {
    throw new Error('chunkSize must be greater than 0');
  }
  if (chunkOverlap < 0) {
    throw new Error('chunkOverlap must be 0 or positive');
  }
  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be strictly less than chunkSize');
  }

  const chunks: Chunk[] = [];
  const textLen = text.length;
  let start = 0;
  let count = 0;

  const docId = metadata.id ?? 'doc';

  while (start < textLen) {
    let end = start + chunkSize;
    if (end > textLen) {
      end = textLen;
    }

    // Smart splitting: try to split at space boundaries to avoid mid-word cuts
    if (end < textLen) {
      const lastSpace = text.lastIndexOf(' ', end);
      // Only backtrack if the space is not too far back (up to 30% of chunkSize)
      if (lastSpace > start + Math.floor(chunkSize * 0.7)) {
        end = lastSpace;
      }
    }

    const chunkContent = text.substring(start, end).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        id: `${docId}-chunk-${count++}`,
        text: chunkContent,
        metadata
      });
    }

    start = end - chunkOverlap;
    if (start >= textLen || end === textLen) {
      break;
    }
  }

  return chunks;
}
