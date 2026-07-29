import { describe, test, expect, vi } from 'vitest';
import { NanoSearch, Schema } from '../src/index.js';
import {
  RAGPipeline,
  chunkText,
  OpenAIProvider,
  GeminiProvider,
  AnthropicProvider,
  OllamaProvider,
  CustomProvider,
  LLMMessage
} from '../src/rag/index.js';

describe('RAG Pipeline Tests', () => {
  const schema: Schema = {
    content: { type: 'text' },
    embedding: { type: 'vector' }
  };

  const mockEmbeddingProvider = {
    embedQuery: vi.fn(async (text: string) => [0.1, 0.2, 0.3]),
    embedDocuments: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]))
  };

  const mockLLMProvider = {
    generate: vi.fn(async (messages: LLMMessage[], options?: any) => {
      if (options?.stream && options?.onChunk) {
        options.onChunk('Streamed ');
        options.onChunk('Answer');
      }
      return {
        text: 'Generated Answer referencing [Source 1].',
        usage: { promptTokens: 10, completionTokens: 5 }
      };
    })
  };

  test('Text chunking with sliding window', () => {
    const text = 'Hello world this is a test of the sliding window text chunking algorithm.';
    const chunks = chunkText(text, { id: 'doc-1' }, { chunkSize: 20, chunkOverlap: 5 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].id).toBe('doc-1-chunk-0');
    expect(chunks[0].text.length).toBeLessThanOrEqual(20);
    // Overlapping portion check
    expect(chunks[0].metadata.id).toBe('doc-1');
  });

  test('Complete RAG indexing, retrieval, and querying', async () => {
    const searchEngine = new NanoSearch(schema, { vectorDimensions: 3 });
    const pipeline = new RAGPipeline({
      searchEngine,
      embeddingProvider: mockEmbeddingProvider,
      llmProvider: mockLLMProvider,
      textField: 'content',
      vectorField: 'embedding'
    });

    // 1. Index document
    await pipeline.addDocument('doc-1', 'This is a context chunk describing vector databases.', { category: 'Tech' });

    expect(mockEmbeddingProvider.embedDocuments).toHaveBeenCalledTimes(1);

    // 2. Retrieve
    const sources = await pipeline.retrieve('vector databases', { limit: 1 });
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('doc-1-chunk-0');
    expect(sources[0].text).toContain('vector databases');

    // 3. Query
    const results = await pipeline.query('Tell me about vector databases');
    expect(results.answer).toContain('Generated Answer');
    expect(results.sources).toHaveLength(1);
    expect(pipeline.getHistory()).toHaveLength(2); // Q & A added

    // 4. Test history clear
    pipeline.clearHistory();
    expect(pipeline.getHistory()).toHaveLength(0);
  });

  test('Streaming generation triggers onChunk', async () => {
    const searchEngine = new NanoSearch(schema, { vectorDimensions: 3 });
    const pipeline = new RAGPipeline({
      searchEngine,
      embeddingProvider: mockEmbeddingProvider,
      llmProvider: mockLLMProvider,
      textField: 'content',
      vectorField: 'embedding'
    });

    let chunksReceived = '';
    await pipeline.query('stream query', {
      stream: true,
      onChunk: (c) => { chunksReceived += c; }
    });

    expect(chunksReceived).toBe('Streamed Answer');
  });

  test('OpenAIProvider generate and embed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/embeddings')) {
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenAI Response' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 }
        })
      } as unknown as Response;
    });

    const openai = new OpenAIProvider({ apiKey: 'test-key' });
    const emb = await openai.embedQuery('test text');
    expect(emb).toEqual([0.1, 0.2, 0.3]);

    const res = await openai.generate([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('OpenAI Response');
    expect(res.usage?.promptTokens).toBe(5);

    fetchSpy.mockRestore();
  });

  test('GeminiProvider generate and embed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('embedContent')) {
        return {
          ok: true,
          json: async () => ({ embedding: { values: [0.4, 0.5, 0.6] } })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Gemini Response' }] } }]
        })
      } as unknown as Response;
    });

    const gemini = new GeminiProvider({ apiKey: 'test-key' });
    const emb = await gemini.embedQuery('test text');
    expect(emb).toEqual([0.4, 0.5, 0.6]);

    const res = await gemini.generate([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('Gemini Response');

    fetchSpy.mockRestore();
  });

  test('AnthropicProvider generate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          content: [{ text: 'Claude Response' }],
          usage: { input_tokens: 4, output_tokens: 2 }
        })
      } as unknown as Response;
    });

    const claude = new AnthropicProvider({ apiKey: 'test-key' });
    const res = await claude.generate([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('Claude Response');
    expect(res.usage?.promptTokens).toBe(4);

    fetchSpy.mockRestore();
  });

  test('OllamaProvider generate and embed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('/api/embeddings')) {
        return {
          ok: true,
          json: async () => ({ embedding: [0.7, 0.8, 0.9] })
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          message: { content: 'Ollama Response' }
        })
      } as unknown as Response;
    });

    const ollama = new OllamaProvider();
    const emb = await ollama.embedQuery('test text');
    expect(emb).toEqual([0.7, 0.8, 0.9]);

    const res = await ollama.generate([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('Ollama Response');

    fetchSpy.mockRestore();
  });

  test('CustomProvider generate and embed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({ custom_values: [0.99] })
      } as unknown as Response;
    });

    const custom = new CustomProvider({
      embedURL: 'http://custom/embed',
      generateURL: 'http://custom/generate',
      transformEmbedPayload: () => ({}),
      transformEmbedResponse: (res) => res.custom_values,
      transformGeneratePayload: () => ({}),
      transformGenerateResponse: (res) => ({ text: 'Custom Response' })
    });

    const emb = await custom.embedQuery('test');
    expect(emb).toEqual([0.99]);

    const res = await custom.generate([]);
    expect(res.text).toBe('Custom Response');

    fetchSpy.mockRestore();
  });

  test('RAG error handling and missing secrets', () => {
    expect(() => new OpenAIProvider({ apiKey: '' })).toThrow();
    expect(() => new AnthropicProvider({ apiKey: '' })).toThrow();
    expect(() => new GeminiProvider({ apiKey: '' })).toThrow();
  });
});
