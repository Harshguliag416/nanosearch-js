export const DEFAULT_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have',
  'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt',
  'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'shan' , 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some',
  'such', 'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent',
  'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why',
  'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours',
  'yourself', 'yourselves'
]);

export interface TokenizerOptions {
  stopWords?: Set<string> | string[];
  lowercase?: boolean;
  normalizeUnicode?: boolean;
  regex?: RegExp;
}

export class Tokenizer {
  private stopWords: Set<string>;
  private lowercase: boolean;
  private normalizeUnicode: boolean;
  private regex: RegExp;

  constructor(options: TokenizerOptions = {}) {
    this.lowercase = options.lowercase ?? true;
    this.normalizeUnicode = options.normalizeUnicode ?? true;
    this.regex = options.regex ?? /[\p{L}\p{N}]+/gu; // unicode word characters and numbers

    if (options.stopWords) {
      this.stopWords = options.stopWords instanceof Set 
        ? options.stopWords 
        : new Set(options.stopWords);
    } else {
      this.stopWords = DEFAULT_STOP_WORDS;
    }
  }

  /**
   * Normalize and tokenize text.
   */
  public tokenize(text: string): string[] {
    if (!text || typeof text !== 'string') return [];

    let processed = text;
    
    if (this.lowercase) {
      processed = processed.toLowerCase();
    }

    if (this.normalizeUnicode) {
      // Decompose accents and remove diacritics
      processed = processed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    const matches = processed.match(this.regex);
    if (!matches) return [];

    const tokens: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      const token = matches[i];
      if (!this.stopWords.has(token)) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Tokenizes and retains character offsets for highlighting.
   */
  public tokenizeWithOffsets(text: string): { token: string; start: number; end: number }[] {
    if (!text || typeof text !== 'string') return [];

    let processed = text;
    if (this.lowercase) {
      processed = processed.toLowerCase();
    }
    if (this.normalizeUnicode) {
      processed = processed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    const results: { token: string; start: number; end: number }[] = [];
    // Reset regex index
    this.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = this.regex.exec(processed)) !== null) {
      const token = match[0];
      if (!this.stopWords.has(token)) {
        results.push({
          token,
          start: match.index,
          end: match.index + token.length
        });
      }
    }

    return results;
  }
}
