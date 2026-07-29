import { EmbeddingProvider, LLMProvider, LLMMessage, LLMResponse } from './types.js';

// Helper to handle standard API fetch calls
async function apiFetch(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API Request to ${url} failed with status ${res.status}: ${errorText || res.statusText}`);
  }
  return res.json();
}

/**
 * OpenAI Provider API Adapter
 */
export class OpenAIProvider implements EmbeddingProvider, LLMProvider {
  private apiKey: string;
  private baseURL: string;

  constructor(config: { apiKey: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.openai.com/v1';
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  public async embedQuery(text: string, model = 'text-embedding-3-small'): Promise<number[]> {
    const data = await apiFetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ input: text, model })
    });
    return data.data[0].embedding;
  }

  public async embedDocuments(texts: string[], model = 'text-embedding-3-small'): Promise<number[][]> {
    const data = await apiFetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ input: texts, model })
    });
    return data.data.map((d: any) => d.embedding);
  }

  public async generate(
    messages: LLMMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<LLMResponse> {
    const model = options.model ?? 'gpt-4o-mini';
    const payload = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: options.stream ?? false
    };

    if (options.stream && options.onChunk) {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`OpenAI stream request failed with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Readable stream not supported');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine === 'data: [DONE]') continue;
          if (cleanLine.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(cleanLine.slice(6));
              const delta = parsed.choices[0]?.delta?.content || '';
              if (delta) {
                text += delta;
                options.onChunk(delta);
              }
            } catch {}
          }
        }
      }
      return { text };
    } else {
      const data = await apiFetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      return {
        text: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0
        }
      };
    }
  }
}

/**
 * Google Gemini Provider API Adapter
 */
export class GeminiProvider implements EmbeddingProvider, LLMProvider {
  private apiKey: string;
  private baseURL: string;

  constructor(config: { apiKey: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta';
    if (!this.apiKey) {
      throw new Error('Gemini API key is required');
    }
  }

  public async embedQuery(text: string, model = 'text-embedding-004'): Promise<number[]> {
    const data = await apiFetch(`${this.baseURL}/models/${model}:embedContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] }
      })
    });
    return data.embedding.values;
  }

  public async embedDocuments(texts: string[], model = 'text-embedding-004'): Promise<number[][]> {
    const requests = texts.map(text => ({
      model: `models/${model}`,
      content: { parts: [{ text }] }
    }));
    const data = await apiFetch(`${this.baseURL}/models/${model}:batchEmbedContents?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
    return data.embeddings.map((e: any) => e.values);
  }

  public async generate(
    messages: LLMMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<LLMResponse> {
    const model = options.model ?? 'gemini-1.5-flash';
    
    // Map OpenAI-style messages to Gemini contents structure
    const contents = messages.map(m => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      return {
        role,
        parts: [{ text: m.content }]
      };
    });

    const generationConfig = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens
    };

    if (options.stream && options.onChunk) {
      const res = await fetch(`${this.baseURL}/models/${model}:streamGenerateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig })
      });

      if (!res.ok) {
        throw new Error(`Gemini stream generation failed with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Readable stream not supported');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Gemini returns JSON array of parts, or streams line-by-line SSE chunk responses
        try {
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const clean = line.trim();
            if (!clean) continue;

            const idx = clean.indexOf('"text"');
            if (idx !== -1) {
              const start = clean.indexOf('"', idx + 6);
              if (start !== -1) {
                let end = start + 1;
                while (end < clean.length) {
                  if (clean[end] === '"' && clean[end - 1] !== '\\') {
                    break;
                  }
                  end++;
                }
                if (end < clean.length) {
                  const rawString = clean.substring(start, end + 1);
                  try {
                    const partText = JSON.parse(rawString);
                    text += partText;
                    options.onChunk(partText);
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      return { text };
    } else {
      const data = await apiFetch(`${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig })
      });

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { text };
    }
  }
}

/**
 * Anthropic Claude Provider API Adapter
 */
export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private baseURL: string;

  constructor(config: { apiKey: string; baseURL?: string }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.anthropic.com/v1';
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  public async generate(
    messages: LLMMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<LLMResponse> {
    const model = options.model ?? 'claude-3-5-sonnet-20240620';
    
    // Extract system message if present
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const payload = {
      model,
      system: systemMessage,
      messages: userMessages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      stream: options.stream ?? false
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'dangerously-allow-html': 'true' // For standard compatibility contexts
    };

    if (options.stream && options.onChunk) {
      const res = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Anthropic stream request failed with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Readable stream not supported');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(cleanLine.slice(6));
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta?.text || '';
                text += delta;
                options.onChunk(delta);
              }
            } catch {}
          }
        }
      }
      return { text };
    } else {
      const data = await apiFetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      return {
        text: data.content[0].text,
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0
        }
      };
    }
  }
}

/**
 * Ollama Provider API Adapter (Local Server)
 */
export class OllamaProvider implements EmbeddingProvider, LLMProvider {
  private baseURL: string;

  constructor(config: { baseURL?: string } = {}) {
    this.baseURL = config.baseURL ?? 'http://localhost:11434';
  }

  public async embedQuery(text: string, model = 'nomic-embed-text'): Promise<number[]> {
    const data = await apiFetch(`${this.baseURL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, model })
    });
    return data.embedding;
  }

  public async embedDocuments(texts: string[], model = 'nomic-embed-text'): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const emb = await this.embedQuery(texts[i], model);
      embeddings.push(emb);
    }
    return embeddings;
  }

  public async generate(
    messages: LLMMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<LLMResponse> {
    const model = options.model ?? 'llama3';
    const payload = {
      model,
      messages,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens
      },
      stream: options.stream ?? false
    };

    if (options.stream && options.onChunk) {
      const res = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Ollama stream request failed with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Readable stream not supported');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;
          try {
            const parsed = JSON.parse(cleanLine);
            const delta = parsed.message?.content || '';
            if (delta) {
              text += delta;
              options.onChunk(delta);
            }
          } catch {}
        }
      }
      return { text };
    } else {
      const data = await apiFetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return {
        text: data.message.content
      };
    }
  }
}

/**
 * Custom / General REST API Provider Adapter
 */
export class CustomProvider implements EmbeddingProvider, LLMProvider {
  constructor(
    private config: {
      embedURL?: string;
      generateURL?: string;
      headers?: Record<string, string>;
      transformEmbedPayload?: (text: string) => any;
      transformEmbedResponse?: (res: any) => number[];
      transformGeneratePayload?: (messages: LLMMessage[], options?: any) => any;
      transformGenerateResponse?: (res: any) => LLMResponse;
    }
  ) {}

  public async embedQuery(text: string): Promise<number[]> {
    if (!this.config.embedURL || !this.config.transformEmbedPayload || !this.config.transformEmbedResponse) {
      throw new Error('Custom provider missing embedding configuration parameters.');
    }
    const payload = this.config.transformEmbedPayload(text);
    const data = await apiFetch(this.config.embedURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.config.headers },
      body: JSON.stringify(payload)
    });
    return this.config.transformEmbedResponse(data);
  }

  public async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const emb = await this.embedQuery(texts[i]);
      embeddings.push(emb);
    }
    return embeddings;
  }

  public async generate(messages: LLMMessage[], options?: any): Promise<LLMResponse> {
    if (!this.config.generateURL || !this.config.transformGeneratePayload || !this.config.transformGenerateResponse) {
      throw new Error('Custom provider missing generate configuration parameters.');
    }
    const payload = this.config.transformGeneratePayload(messages, options);
    const data = await apiFetch(this.config.generateURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.config.headers },
      body: JSON.stringify(payload)
    });
    return this.config.transformGenerateResponse(data);
  }
}
