import { NanoSearch, Schema } from '../src/index.js';
import {
  RAGPipeline,
  OpenAIProvider,
  GeminiProvider,
  AnthropicProvider,
  OllamaProvider,
  CustomProvider
} from '../src/rag/index.js';

// Define schemas
const schema = {
  content: { type: 'text' },
  embedding: { type: 'vector' }
} as const satisfies Schema;

const searchEngine = new NanoSearch(schema, {
  vectorMetric: 'cosine',
  vectorDimensions: 3,
  vectorIndexType: 'vptree'
});

// Mock Providers for demonstration/run correctness without keys
const mockEmbeddingProvider = {
  embedQuery: async (text: string) => [0.9, 0.1, 0.0],
  embedDocuments: async (texts: string[]) => texts.map(() => [0.9, 0.1, 0.0])
};

const mockLLMProvider = {
  generate: async (messages: any[], options?: any) => {
    if (options?.stream && options?.onChunk) {
      options.onChunk('This ');
      options.onChunk('is ');
      options.onChunk('a ');
      options.onChunk('mocked ');
      options.onChunk('streamed ');
      options.onChunk('response.');
    }
    return { text: 'This is a mocked RAG response citing [Source 1].' };
  }
};

async function main() {
  console.log('--- 1. Basic RAG Pipeline Setup ---');
  const pipeline = new RAGPipeline({
    searchEngine,
    embeddingProvider: mockEmbeddingProvider,
    llmProvider: mockLLMProvider,
    textField: 'content',
    vectorField: 'embedding',
    systemPrompt: 'Answer questions using the provided context chunks. Cite sources.'
  });

  console.log('Indexing documents...');
  await pipeline.addDocument(
    'doc-1',
    'NanoSearch is a tiny, zero-dependency hybrid search engine written in TypeScript.',
    { category: 'search' },
    { chunkSize: 100, chunkOverlap: 20 }
  );

  console.log('--- 2. Querying RAG with citations ---');
  const result = await pipeline.query('What is NanoSearch?');
  console.log(`Answer:\n${result.answer}\n`);
  console.log('Sources cited:');
  result.sources.forEach((src, idx) => {
    console.log(`- [Source ${idx + 1}] ID: ${src.id} (Score: ${src.score.toFixed(4)})`);
  });

  console.log('\n--- 3. Streaming RAG responses ---');
  process.stdout.write('Streamed Answer: ');
  await pipeline.query('What is NanoSearch?', {
    stream: true,
    onChunk: (chunk) => process.stdout.write(chunk)
  });
  console.log('\n');

  console.log('--- 4. LLM / API Provider Examples (Instantiation Blueprint) ---');
  
  // OpenAI Blueprint
  const openai = new OpenAIProvider({ apiKey: 'YOUR_OPENAI_API_KEY' });
  console.log('- OpenAI Provider instantiated successfully');

  // Gemini Blueprint
  const gemini = new GeminiProvider({ apiKey: 'YOUR_GEMINI_API_KEY' });
  console.log('- Gemini Provider instantiated successfully');

  // Anthropic Claude Blueprint
  const claude = new AnthropicProvider({ apiKey: 'YOUR_CLAUDE_API_KEY' });
  console.log('- Claude Provider instantiated successfully');

  // Ollama Blueprint (Local models)
  const ollama = new OllamaProvider({ baseURL: 'http://localhost:11434' });
  console.log('- Ollama Provider instantiated successfully');

  // Custom HTTP Provider Blueprint
  const custom = new CustomProvider({
    embedURL: 'https://api.mycustomembedder.ai/v1/embed',
    generateURL: 'https://api.mycustomllm.ai/v1/generate',
    headers: { 'Authorization': 'Bearer MY_SECRET_TOKEN' },
    transformEmbedPayload: (text) => ({ text_input: text }),
    transformEmbedResponse: (res) => res.data.embedding_values,
    transformGeneratePayload: (messages) => ({ prompt: messages[messages.length - 1].content }),
    transformGenerateResponse: (res) => ({ text: res.completion_text })
  });
  console.log('- Custom HTTP Provider instantiated successfully\n');
}

main().catch(console.error);
