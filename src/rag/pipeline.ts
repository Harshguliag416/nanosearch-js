import { NanoSearch } from '../index.js';
import { Schema, Document, Filter, SearchOptions } from '../types.js';
import { EmbeddingProvider, LLMProvider, RAGAnswer, LLMMessage, RAGSource } from './types.js';
import { chunkText, ChunkingOptions } from './chunker.js';

export interface RAGPipelineConfig<S extends Schema> {
  searchEngine: NanoSearch<S>;
  embeddingProvider: EmbeddingProvider;
  llmProvider: LLMProvider;
  
  // Schema field mappings
  textField: keyof S & string;
  vectorField?: keyof S & string;

  // Custom system prompt context
  systemPrompt?: string;
}

export class RAGPipeline<S extends Schema> {
  private searchEngine: NanoSearch<S>;
  private embeddingProvider: EmbeddingProvider;
  private llmProvider: LLMProvider;
  private textField: keyof S & string;
  private vectorField?: keyof S & string;
  private systemPrompt: string;
  
  private history: LLMMessage[] = [];

  constructor(config: RAGPipelineConfig<S>) {
    this.searchEngine = config.searchEngine;
    this.embeddingProvider = config.embeddingProvider;
    this.llmProvider = config.llmProvider;
    this.textField = config.textField;
    this.vectorField = config.vectorField;
    this.systemPrompt = config.systemPrompt ?? 
      'You are a helpful assistant. Use the following retrieved context chunks to answer the user question. Cite sources clearly if requested.';
  }

  /**
   * Chunk document text, embed chunks using the EmbeddingProvider,
   * and insert them into the NanoSearch engine under a single commit transaction.
   */
  public async addDocument(
    id: string,
    text: string,
    metadata: Record<string, unknown> = {},
    chunkOptions?: ChunkingOptions
  ): Promise<void> {
    const chunks = chunkText(text, { ...metadata, id }, chunkOptions);
    const chunkTexts = chunks.map(c => c.text);
    
    let embeddings: number[][] = [];
    if (this.vectorField) {
      embeddings = await this.embeddingProvider.embedDocuments(chunkTexts);
    }

    const tx = this.searchEngine.transaction();
    for (let i = 0; i < chunks.length; i++) {
      const doc: Document = {
        id: chunks[i].id,
        [this.textField]: chunks[i].text
      };
      
      // Inject index metadata parameters
      for (const [k, v] of Object.entries(metadata)) {
        doc[k] = v;
      }

      if (this.vectorField && embeddings[i]) {
        doc[this.vectorField] = embeddings[i];
      }

      tx.add(doc);
    }
    tx.commit();
  }

  /**
   * Perform vector/keyword/hybrid retrieval on indexed document chunks.
   */
  public async retrieve(
    question: string,
    options: {
      limit?: number;
      filter?: Filter;
      hybridWeightText?: number;
      hybridWeightVector?: number;
    } = {}
  ): Promise<RAGSource[]> {
    const limit = options.limit ?? 5;
    
    let searchVector: number[] | undefined;
    if (this.vectorField) {
      searchVector = await this.embeddingProvider.embedQuery(question);
    }

    const searchOpts: SearchOptions<S> = {
      limit,
      filter: options.filter
    };

    if (searchVector && this.vectorField) {
      searchOpts.vector = searchVector;
      if (question) {
        searchOpts.query = question;
        searchOpts.hybrid = {
          mode: 'weighted',
          weightText: options.hybridWeightText ?? 0.5,
          weightVector: options.hybridWeightVector ?? 0.5
        };
      }
    } else if (question) {
      searchOpts.query = question;
    }

    const searchResults = this.searchEngine.search(searchOpts);

    return searchResults.hits.map(hit => ({
      id: hit.id,
      text: (hit.document as Record<string, unknown>)[this.textField] as string,
      score: hit.score,
      metadata: hit.document
    }));
  }

  /**
   * Clear the conversation history.
   */
  public clearHistory(): void {
    this.history = [];
  }

  /**
   * Get the current conversation history.
   */
  public getHistory(): LLMMessage[] {
    return [...this.history];
  }

  /**
   * Generate an answer for a user question incorporating retrieved context.
   */
  public async query(
    question: string,
    options: {
      limit?: number;
      filter?: Filter;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<RAGAnswer> {
    // 1. Retrieve relevant contexts
    const sources = await this.retrieve(question, {
      limit: options.limit,
      filter: options.filter
    });

    // 2. Build context instructions
    const contextText = sources
      .map((src, idx) => `[Source ${idx + 1}] (ID: ${src.id})\n${src.text}`)
      .join('\n\n');

    const promptWithContext = `Retrieved context:\n${contextText}\n\nUser Question: ${question}`;

    // 3. Assemble chat message payload
    const messages: LLMMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.history,
      { role: 'user', content: promptWithContext }
    ];

    // 4. Invoke the generation API
    const response = await this.llmProvider.generate(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stream: options.stream,
      onChunk: options.onChunk
    });

    // Preserve the clean QA context inside history (omit full raw prompt/context)
    this.history.push(
      { role: 'user', content: question },
      { role: 'assistant', content: response.text }
    );

    return {
      answer: response.text,
      sources
    };
  }
}
