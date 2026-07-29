export interface Chunk {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface EmbeddingProvider {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMProvider {
  generate(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (text: string) => void;
      [key: string]: unknown; // Allow generic option passes safely
    }
  ): Promise<LLMResponse>;
}

export interface RAGSource {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RAGAnswer {
  answer: string;
  sources: RAGSource[];
}
