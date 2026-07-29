import { NanoSearchPlugin, Document, SearchOptions } from '../types.js';

// Extremely lightweight Porter Stemmer implementation for English
export function stemWord(w: string): string {
  if (w.length < 3) return w;

  let word = w.toLowerCase();

  // Step 1a
  if (word.endsWith('sses')) {
    word = word.slice(0, -2);
  } else if (word.endsWith('sies')) {
    word = word.slice(0, -3) + 'i';
  } else if (word.endsWith('ss')) {
    // do nothing
  } else if (word.endsWith('s') && !word.endsWith('us') && !word.endsWith('is')) {
    word = word.slice(0, -1);
  }

  // Step 1b
  if (word.endsWith('eed')) {
    const stem = word.slice(0, -3);
    if (/[aeiouy]/.test(stem)) {
      word = stem + 'ee';
    }
  } else if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    if (/[aeiouy]/.test(stem)) {
      word = stem;
      word = cleanStep1bSuffix(word);
    }
  } else if (word.endsWith('ed')) {
    const stem = word.slice(0, -2);
    if (/[aeiouy]/.test(stem)) {
      word = stem;
      word = cleanStep1bSuffix(word);
    }
  }

  // Step 1c - y to i
  if (word.endsWith('y') && /[bcdfghjklmnpqrstvwxz]/.test(word[word.length - 2])) {
    word = word.slice(0, -1) + 'i';
  }

  return word;
}

function cleanStep1bSuffix(word: string): string {
  if (word.endsWith('at') || word.endsWith('bl') || word.endsWith('iz')) {
    return word + 'e';
  }
  // Double consonants
  const lastChar = word[word.length - 1];
  if (
    word.length > 2 &&
    lastChar === word[word.length - 2] &&
    !['l', 's', 'z'].includes(lastChar)
  ) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Porter Stemmer plugin factory.
 * Stems all text-type fields of ingested documents and query search terms.
 */
export function PorterStemmerPlugin(textFields: string[]): NanoSearchPlugin {
  const stemText = (text: string): string => {
    return text
      .split(/\s+/)
      .map(word => {
        // Strip punctuation from boundaries before stemming
        const clean = word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
        if (!clean) return word;
        const stemmed = stemWord(clean);
        return word.replace(clean, stemmed);
      })
      .join(' ');
  };

  return {
    name: 'porter-stemmer',
    
    beforeAdd: (doc: Document) => {
      const stemmedDoc = { ...doc };
      for (const field of textFields) {
        const val = doc[field];
        if (typeof val === 'string') {
          stemmedDoc[field] = stemText(val);
        }
      }
      return stemmedDoc;
    },

    beforeSearch: (options: SearchOptions<any>) => {
      if (options.query) {
        options.query = stemText(options.query);
      }
      return options;
    }
  };
}
