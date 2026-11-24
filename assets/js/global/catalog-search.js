(() => {
  'use strict';

  const indexes = new WeakMap();
  const maxJoinedWords = 3;
  const digit = /\p{N}/u;
  const latin = /^[a-z]+$/;
  const cyrillic = /^[а-я]+$/;
  const georgian = /^[ა-ჰ\d]+$/;
  const letterMap = {
    a: 'ა', b: 'ბ', c: 'ც', d: 'დ', e: 'ე', f: 'ფ', g: 'გ', h: 'ჰ', i: 'ი', j: 'ჯ', k: 'კ', l: 'ლ', m: 'მ',
    n: 'ნ', o: 'ო', p: 'პ', q: 'ქ', r: 'რ', s: 'ს', t: 'ტ', u: 'უ', v: 'ვ', w: 'წ', x: 'ხ', y: 'ყ', z: 'ზ',
    B: 'ჩ', C: 'ჩ', G: 'ღ', J: 'ჟ', R: 'ღ', S: 'შ', T: 'თ', W: 'ჭ', Z: 'ძ',
    а: 'ა', б: 'ბ', в: 'ვ', г: 'გ', д: 'დ', е: 'ე', ж: 'ჟ', з: 'ზ', и: 'ი', й: 'ი', к: 'კ', л: 'ლ', м: 'მ',
    н: 'ნ', о: 'ო', п: 'პ', р: 'რ', с: 'ს', т: 'ტ', у: 'უ', ф: 'ფ', х: 'ხ', ц: 'ც', ч: 'ჩ', ш: 'შ', щ: 'შ',
    ъ: '', ы: 'ი', ь: '', э: 'ე', ю: 'იუ', я: 'ია'
  };
  const digraphs = { ch: 'ჩ', sh: 'შ', kh: 'ხ', gh: 'ღ', zh: 'ჟ', ts: 'ც', dz: 'ძ' };
  const latinKeys = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const cyrillicKeys = ['йцукенгшщз', 'фывапролд', 'ячсмить'];
  const visuallySimilar = ['aceopxyk', 'асеорхук'];
  const consonantGroups = ['თტ', 'ქკყ', 'ფპ', 'ცწ', 'ჩჭ', 'ხჰ', 'შჟ', 'სზ', 'დტ', 'ბპ', 'გკ',
    'бп', 'вф', 'гк', 'дт', 'жш', 'зс', 'шщ', 'чщ'];
  const vowelGroups = ['აეიოუ', 'аеёиоуыэюя', 'aeiouy'];
  const closeConsonants = new Map();
  for (const group of consonantGroups) {
    for (const letter of group) closeConsonants.set(letter, (closeConsonants.get(letter) || '') + group);
  }
  const vowelClass = new Map(vowelGroups.flatMap(group => [...group].map(letter => [letter, group])));
  const normalize = value => String(value ?? '').normalize('NFKD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  const words = value => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
  const asList = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const titles = value => typeof value === 'string' ? [value] : [value?.ka, value?.ru, value?.en];
  const remap = (word, from, to) => [...word].map(letter => to[from.indexOf(letter)] ?? letter).join('');
  const georgianForm = value => value.replace(/[a-zа-я]/giu, char => letterMap[char] ?? letterMap[char.toLowerCase()] ?? char);
  const alphabet = word => latin.test(word) ? 'latin' : cyrillic.test(word) ? 'cyrillic' : georgian.test(word) ? 'georgian' : '';

  function soundForms(word) {
    const lower = word.toLowerCase();
    const phonetic = lower.replace(/ph/g, 'f').replace(/ck|c(?![eiyh])/g, 'k').replace(/y$/, 'i')
      .replace(/ch|sh|kh|gh|zh|ts|dz|[a-zа-я]/g, char => digraphs[char] ?? letterMap[char] ?? char);
    return [...new Set([georgianForm(word), georgianForm(lower), phonetic])].filter(value => georgian.test(value));
  }

  function queryForms(word) {
    const lower = word.toLowerCase();
    const spellings = new Map([[lower, 0]]);
    if (/[a-z]/.test(lower) && /[а-я]/.test(lower)) {
      for (const [from, to] of [visuallySimilar, [...visuallySimilar].reverse()]) {
        const repaired = remap(lower, from, to);
        if (repaired !== lower) spellings.set(repaired, 0.2);
      }
    }
    const keyboard = lower.length >= 3 && (latin.test(lower) ? remap(lower, latinKeys.join(''), cyrillicKeys.join(''))
      : cyrillic.test(lower) && remap(lower, cyrillicKeys.join(''), latinKeys.join('')));
    const sounds = new Map();
    for (const [spelling, cost] of spellings) {
      for (const sound of soundForms(cost ? spelling : word)) {
        sounds.set(sound, Math.min(sounds.get(sound) ?? Infinity, cost));
      }
    }
    return { spellings: Array.from(spellings, ([value, cost]) => ({ value, cost, script: alphabet(value) })),
      sounds, keyboard, numeric: digit.test(lower), length: lower.length };
  }

  function addField(terms, value, weight, leadingBonus = 0, wholeBonus = 0) {
    const tokens = words(value).map(word => word.toLowerCase());
    for (let start = 0; start < tokens.length; start++) {
      let joined = '';
      for (let end = start; end < Math.min(tokens.length, start + maxJoinedWords); end++) {
        joined += tokens[end];
        const score = weight - (end - start) * 3 + (start === 0 ? leadingBonus : 0)
          + (start === 0 && end === tokens.length - 1 ? wholeBonus : 0);
        if (score > (terms.get(joined) || 0)) terms.set(joined, score);
      }
    }
    return tokens.join(' ');
  }

  function taxonomy(store, structure) {
    const categories = new Map();
    const subcategories = new Map();
    function add(categoryId, title, subs) {
      categories.set(categoryId, [...(categories.get(categoryId) || [categoryId]), ...titles(title)]);
      for (const sub of subs || []) {
        if (sub.visible === false) continue;
        subcategories.set(sub.id, [...(subcategories.get(sub.id) || [sub.id]), ...titles(sub.title || sub.name)]);
      }
    }
    for (const [id, category] of Object.entries(structure || {})) add(id, category.title, category.subs);
    for (const category of store?.categories || []) {
      if (category.visible !== false) add(category.id, category.title, category.subs);
    }
    return { categories, subcategories };
  }

  function indexCatalog(products) {
    const { ENKA_STORE: store, CATALOG_STRUCTURE: structure, ENKA_CATALOG_LABELS_BY_LOCALE: labels } = window;
    const cached = indexes.get(products);
    if (cached && cached.store === store && cached.structure === structure && cached.labels === labels) return cached;
    const sections = taxonomy(store, structure);
    const locales = Object.values(labels || {});
    const entries = [];
    const vocabulary = new Map();
    const seen = new Set();
    for (const product of products) {
      if (!product?.id || typeof product.name !== 'string' || !product.name.trim() || window.productStock(product.stockStatus) === 'out_of_stock') continue;
      const id = String(product.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const terms = new Map();
      const names = new Set([product.name]);
      for (const locale of locales) {
        if (Object.hasOwn(locale || {}, id) && locale[id]?.name) names.add(locale[id].name);
      }
      const namePhrases = [...names].map(name => addField(terms, name, 30, 5));
      addField(terms, product.brand, 24);
      const codes = [product.sku, product.id].map(code => addField(terms, code, 22).replaceAll(' ', ''));
      for (const sub of asList(product.subcategories || product.subcategory || product.sub)) {
        for (const label of sections.subcategories.get(sub) || [sub]) addField(terms, label, 18, 0, 18);
      }
      for (const category of asList(product.categories || product.category)) {
        for (const label of sections.categories.get(category) || [category]) addField(terms, label, 10);
      }
      for (const term of terms.keys()) {
        if (!vocabulary.has(term)) vocabulary.set(term, { sounds: soundForms(term), numeric: digit.test(term), script: alphabet(term) });
      }
      entries.push({ product, terms, namePhrases, codes });
    }
    const index = { entries, vocabulary, store, structure, labels };
    indexes.set(products, index);
    return index;
  }

  function substitutionCost(left, right) {
    if (left === right) return 0;
    if (closeConsonants.get(left)?.includes(right)) return 0.35;
    if (vowelClass.get(left)?.includes(right)) return 0.55;
    return 1;
  }

  const deletionCost = (word, position) => word[position] === word[position - 1] ? 0.55 : 1;

  // Weighted, banded Damerau–Levenshtein distance over adjacent transpositions.
  function editDistance(query, term, limit, allowPrefix) {
    const band = Math.floor(limit / 0.55);
    const prefix = allowPrefix && query.length >= 4 && term.length > query.length && (query[0] === term[0] || query[1] === term[1]);
    if (limit <= 0 || (!prefix && Math.abs(query.length - term.length) > band)) return Infinity;
    let previous = [0];
    for (let j = 0; j < Math.min(term.length, band); j++) previous.push(previous[j] + deletionCost(term, j));
    let beforePrevious;
    let removed = 0;
    let previousBest = 0;
    for (let i = 1; i <= query.length; i++) {
      const deletion = deletionCost(query, i - 1);
      removed += deletion;
      const row = [removed];
      let rowBest = removed;
      for (let j = Math.max(1, i - band); j <= Math.min(term.length, i + band); j++) {
        const cost = substitutionCost(query[i - 1], term[j - 1]);
        row[j] = Math.min((previous[j] ?? Infinity) + deletion, (row[j - 1] ?? Infinity) + deletionCost(term, j - 1),
          (previous[j - 1] ?? Infinity) + cost);
        if (i > 1 && j > 1 && query[i - 1] === term[j - 2] && query[i - 2] === term[j - 1]) {
          row[j] = Math.min(row[j], (beforePrevious[j - 2] ?? Infinity) + 0.75);
        }
        rowBest = Math.min(rowBest, row[j]);
      }
      if (rowBest > limit && previousBest > limit) return Infinity;
      previousBest = rowBest;
      beforePrevious = previous;
      previous = row;
    }
    let distance = previous[term.length] <= limit ? previous[term.length] : Infinity;
    if (prefix) {
      // Typo-tolerant completion needs more evidence than ordinary prefix matching.
      for (let end = query.length - 1; end <= Math.min(term.length - 1, query.length + 1); end++) {
        if (previous[end] <= Math.min(limit, 1)) distance = Math.min(distance, previous[end] + 0.65);
      }
    }
    return distance;
  }

  function typoBudget(length) {
    if (length < 3) return 0;
    if (length < 5) return 1;
    if (length < 8) return 1.75;
    if (length < 12) return 2.25;
    return 3;
  }

  function literalCost(query, term) {
    if (query === term) return 0;
    // A prefix can end before a unit, but must preserve numeric boundaries.
    if (query.length < 2 || !term.startsWith(query) || (digit.test(query.at(-1)) && digit.test(term[query.length]))) return Infinity;
    return 0.45 + Math.min(0.45, (term.length - query.length) * 0.06);
  }

  function termCost(query, term, info, allowPrefix) {
    let best = query.keyboard === term ? 0.45 : Infinity;
    const textual = !query.numeric && !info.numeric;
    for (const { value, cost, script } of query.spellings) {
      best = Math.min(best, cost + literalCost(value, term));
      if (best > cost + 0.75 && textual && (!script || !info.script || script === info.script)) {
        const limit = Math.min(typoBudget(Math.min(value.length, term.length)), best - cost - 0.4);
        best = Math.min(best, cost + 0.4 + editDistance(value, term, limit, allowPrefix));
      }
    }
    if (best <= 0.35) return best;
    for (const [sound, cost] of query.sounds) {
      for (const target of info.sounds) {
        const scriptCost = cost + 0.35;
        best = Math.min(best, scriptCost + literalCost(sound, target));
        if (best > scriptCost + 0.55 && textual) {
          const budget = Math.min(typoBudget(Math.min(sound.length, target.length, query.length)), best - scriptCost - 0.2);
          best = Math.min(best, scriptCost + 0.2 + editDistance(sound, target, budget, allowPrefix));
        }
      }
    }
    return best;
  }

  function candidateTerms(word, vocabulary, allowPrefix) {
    const query = queryForms(word);
    const candidates = new Map();
    for (const [term, info] of vocabulary) {
      const cost = termCost(query, term, info, allowPrefix);
      if (Number.isFinite(cost)) candidates.set(term, cost);
    }
    return candidates;
  }

  function relevance(entry, groups, lookup, phrase, compact) {
    if (entry.codes.includes(compact)) return { product: entry.product, cost: 0, score: 10000 };
    // Rank complete alignments of query words, allowing separators on either side.
    const paths = Array(groups.length + 1);
    paths[groups.length] = { cost: 0, score: 0 };
    for (let start = groups.length - 1; start >= 0; start--) {
      for (let length = 1; length <= groups[start].length; length++) {
        const tail = paths[start + length];
        if (!tail) continue;
        const termGroup = groups[start][length - 1];
        for (const [term, correction] of lookup(termGroup, start + length === groups.length)) {
          const weight = entry.terms.get(term);
          if (!weight) continue;
          const cost = tail.cost + correction + (length - 1) * 0.08;
          const score = tail.score + weight * length - (cost - tail.cost) * 50;
          if (!paths[start] || score > paths[start].score) paths[start] = { cost, score };
        }
      }
    }
    const path = paths[0];
    if (!path) return null;
    const titleBonus = entry.namePhrases.includes(phrase) ? 24
      : entry.namePhrases.some(name => (' ' + name + ' ').includes(' ' + phrase + ' ')) ? 12 : 0;
    return { product: entry.product, cost: path.cost, score: path.score + titleBonus };
  }

  window.searchCatalog = (products, query) => {
    const tokens = words(String(query ?? '').slice(0, 200));
    if (!tokens.length) return [];
    const index = indexCatalog(products);
    const key = tokens.join(' ');
    if (index.query === key) return index.results;
    const phrase = key.toLowerCase();
    const compact = phrase.replaceAll(' ', '');
    const groups = tokens.map((_, start) => Array.from({ length: Math.min(maxJoinedWords, tokens.length - start) },
      (_, offset) => tokens.slice(start, start + offset + 1).join('')));
    const matchedTerms = new Map();
    const lookup = (word, isLast) => {
      const key = isLast ? word + '$' : word;
      if (!matchedTerms.has(key)) matchedTerms.set(key, candidateTerms(word, index.vocabulary, isLast));
      return matchedTerms.get(key);
    };
    const matches = index.entries.map(entry => relevance(entry, groups, lookup, phrase, compact)).filter(Boolean);
    const closest = matches.reduce((best, match) => Math.min(best, match.cost), Infinity);
    // Keep nearby alternatives while excluding interpretations that need much weaker edits.
    const results = matches.filter(match => match.cost <= closest + 0.8)
      .sort((a, b) => b.score - a.score).map(match => match.product);
    index.query = key;
    index.results = results;
    return results;
  };
})();
