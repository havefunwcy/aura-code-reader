const https = require('https');

// Memory LRU Cache for raw API responses
const rawCache = new Map();
const MAX_CACHE = 1000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function cleanAndFilterDefinitions(rawTr, maxMeanings = 2) {
  if (!rawTr) return '';
  const posMatch = rawTr.match(/^([a-z]+\.|\【[^】]+\】)\s*/i);
  const pos = posMatch ? posMatch[0] : '';
  let content = rawTr.slice(pos.length);

  // Remove parenthetical domain notes, e.g. （面部表情）... （酒与凉饮料）...
  content = content.replace(/（[^）]+）\s*[^；;，,\n]+/g, '');
  content = content.replace(/\([^)]+\)\s*[^；;，,\n]+/g, '');

  const parts = content.split(/[；;]/).map(p => p.trim()).filter(Boolean);
  const topMeanings = parts.slice(0, maxMeanings);
  let result = topMeanings.join('；');
  result = result.replace(/[；;，,]$/, '');

  return pos ? `${pos}${result}` : result;
}

function detectTargetPos(word, sentence) {
  if (!sentence) return null;
  const lowerWord = word.toLowerCase();
  const lowerSent = sentence.toLowerCase();

  // Pattern 1: Verb + too/so/as/how + word -> adverb (e.g. "takes too long", "waited so long")
  if (new RegExp(`\\b(take|takes|took|taken|wait|waited|stay|stayed|sleep|slept|live|lived|last|lasted|run|ran|stand|stood)\\s+(too\\s+|so\\s+|as\\s+)?${lowerWord}\\b`, 'i').test(lowerSent)) {
    return 'adv';
  }

  // Pattern 2: too/so/how/very + word before comma, period, or conjunction
  if (new RegExp(`\\b(too|so|how)\\s+${lowerWord}\\s*([,.;!?]|and|or|but|$)`, 'i').test(lowerSent)) {
    return 'adv';
  }

  // Pattern 3: Modal / auxiliary / infinitive to + word -> Verb
  if (new RegExp(`\\b(can|could|will|would|should|must|may|might|to|did|do|does)\\s+${lowerWord}\\b`, 'i').test(lowerSent)) {
    return 'v';
  }

  // Pattern 4: Pronoun + word -> Verb (e.g. "I said", "we long")
  if (new RegExp(`\\b(i|you|he|she|it|we|they)\\s+${lowerWord}\\b`, 'i').test(lowerSent)) {
    return 'v';
  }

  // Pattern 5: Determiner / Possessive + word + noun -> Adjective (e.g. "a long journey", "air travel")
  if (new RegExp(`\\b(a|an|the|this|that|these|those|my|your|his|her|its|our|their)\\s+${lowerWord}\\s+[a-z]+`, 'i').test(lowerSent)) {
    return 'adj';
  }

  // Pattern 6: Determiner / Preposition + word at end of clause -> Noun
  if (new RegExp(`\\b(a|an|the|this|that|my|your|his|her|its|our|their|in|on|at|of|with|for|from)\\s+${lowerWord}\\s*([,.;!?]|and|or|but|$)`, 'i').test(lowerSent)) {
    return 'n';
  }

  // Pattern 7: be + word (ending in ed/ing) -> Adjective
  if (new RegExp(`\\b(am|is|are|was|were|been|be)\\s+${lowerWord}\\b`, 'i').test(lowerSent)) {
    return 'adj';
  }

  return null;
}

function selectContextualMeaning(word, sentence, rawTrs, phrases = []) {
  if (!rawTrs || rawTrs.length === 0) return '暂无释义';

  const cleanWord = word.toLowerCase();
  const cleanSent = (sentence || '').toLowerCase();

  // 1. Check if sentence contains any matching phrase (e.g. "too long", "no longer", "as long as")
  if (phrases && phrases.length > 0) {
    for (const phr of phrases) {
      if (phr.entry && cleanSent.includes(phr.entry.toLowerCase())) {
        return `[${phr.entry}] ${cleanAndFilterDefinitions(phr.explain, 2)}`;
      }
    }
  }

  // 2. Detect POS from sentence context
  const targetPos = detectTargetPos(cleanWord, sentence);
  if (targetPos && rawTrs.length > 0) {
    for (const tr of rawTrs) {
      const lowerTr = tr.toLowerCase();
      if (lowerTr.startsWith(targetPos + '.') || lowerTr.startsWith(targetPos + 't.') || lowerTr.startsWith(targetPos + 'i.')) {
        return cleanAndFilterDefinitions(tr, 2);
      }
    }
  }

  // 3. Fallback: take first entry and clean it
  return cleanAndFilterDefinitions(rawTrs[0], 2);
}

async function fetchRawData(cleanWord) {
  if (rawCache.has(cleanWord)) {
    return rawCache.get(cleanWord);
  }

  let data = null;
  try {
    const jsonUrl = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(cleanWord)}`;
    data = await fetchJson(jsonUrl);
  } catch (e) {
    // Ignore
  }

  if (rawCache.size >= MAX_CACHE) {
    const firstKey = rawCache.keys().next().value;
    rawCache.delete(firstKey);
  }
  if (data) {
    rawCache.set(cleanWord, data);
  }
  return data;
}

async function lookup(word, sentence = '') {
  const cleanWord = (word || '').trim().toLowerCase();
  if (!cleanWord || !/^[a-zA-Z\-'’\s]{2,40}$/.test(cleanWord)) {
    return null;
  }

  const data = await fetchRawData(cleanWord);

  if (data && data.ec && data.ec.word && data.ec.word[0]) {
    const w = data.ec.word[0];
    const usphone = w.usphone ? `/${w.usphone}/` : (w.ukphone ? `/${w.ukphone}/` : (w.phone ? `/${w.phone}/` : ''));
    const trs = [];
    if (w.trs && Array.isArray(w.trs)) {
      for (const item of w.trs) {
        if (item.tr && item.tr[0] && item.tr[0].l && item.tr[0].l.i) {
          trs.push(item.tr[0].l.i[0]);
        }
      }
    }

    // Extract phrases
    const phrases = [];
    if (data.phrs && data.phrs.phrs) {
      for (const p of data.phrs.phrs) {
        if (p.phr && p.phr.headword && p.phr.headword.l && p.phr.trs && p.phr.trs[0]) {
          phrases.push({
            entry: p.phr.headword.l.i,
            explain: p.phr.trs[0].tr.l.i
          });
        }
      }
    }

    const contextualTranslation = selectContextualMeaning(cleanWord, sentence, trs, phrases);

    return {
      word: cleanWord,
      phonetic: usphone || '',
      translation: contextualTranslation,
      shortTrans: contextualTranslation,
      audioUrl: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`
    };
  }

  // Fallback to suggest API
  try {
    const suggestUrl = `https://dict.youdao.com/suggest?q=${encodeURIComponent(cleanWord)}&num=1&doctype=json`;
    const sData = await fetchJson(suggestUrl);
    if (sData && sData.data && sData.data.entries && sData.data.entries[0]) {
      const entry = sData.data.entries[0];
      const cleanExplain = cleanAndFilterDefinitions(entry.explain || '暂无释义', 2);
      return {
        word: cleanWord,
        phonetic: '',
        translation: cleanExplain,
        shortTrans: cleanExplain,
        audioUrl: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`
      };
    }
  } catch (err) {
    // Ignore
  }

  return null;
}

module.exports = {
  lookup
};
