// Fuzzy matching between recipe ingredient names (from the menu-costing sheet)
// and inventory product names (from the supplier price list). Both are Arabic
// text; inventory names are more verbose and carry supplier descriptors, so we
// normalize, strip descriptor "stop words", and score by token overlap.

// Descriptor / packaging / unit words that add noise to inventory names.
const STOP = new Set([
  'كغ', 'كج', 'كﻎ', 'مل', 'رقم', 'حب', 'حبه', 'حبة', 'ني', 'نيه',
  'مجمد', 'مجمده', 'مجمدة', 'بودره', 'بودرة', 'بودر', 'ناعم', 'ناعمه', 'ناعمة',
  'خشن', 'سوري', 'سوريه', 'سورية', 'تركي', 'تركيه', 'تركية', 'هندي', 'هنديه', 'هندية',
  'مصري', 'مصريه', 'مصرية', 'امريكي', 'فرنسي', 'ايراني', 'عربي', 'عربيه', 'عربية',
  'كامل', 'مقشور', 'محمص', 'اعواد', 'بالقشر', 'ظرف', 'جالون', 'طاوله', 'طاولة',
  'كسر', 'مبشوره', 'مبشورة', 'شرائح', 'مشوي', 'مجروش', 'مجروشه', 'مجروشة',
  'جولدن', 'اروما', 'بستيك', 'ايند', 'دبليو', 'a', 'كﻎ',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '17', '18', '20', '25', '30', '40', '320', '700', '777', '800', '900', '1000', '1100', '1200', '1300', '1400', '1500',
])

// Normalize Arabic text: strip diacritics/tatweel, unify alef/ya/hamza/ta-marbuta
// forms, and drop any non-letter glyphs (PDF-extraction artifacts, punctuation).
export function normalizeAr(s) {
  if (!s) return ''
  return String(s)
    .replace(/[\u064B-\u065F\u0670]/g, '') // tashkeel
    .replace(/\u0640/g, '')                 // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u063A\u0641-\u064Aa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function tokenize(s) {
  return normalizeAr(s)
    .split(' ')
    .filter(t => t && !STOP.has(t))
}

// Score how well an inventory item matches an ingredient (0..1).
// Rewards matching the ingredient's meaningful tokens; lightly penalizes
// inventory items that carry many extra tokens (prefers the most focused match).
export function scoreMatch(ingredientTokens, invNorm, invTokens) {
  if (!ingredientTokens.length) return 0
  let matched = 0
  for (const t of ingredientTokens) {
    if (invTokens.includes(t)) matched += 1
    else if (t.length >= 3 && invNorm.includes(t)) matched += 0.6
  }
  const ratio = matched / ingredientTokens.length
  if (ratio === 0) return 0
  const extra = Math.max(0, invTokens.length - ingredientTokens.length)
  return Math.max(0, Math.min(1, ratio - 0.03 * extra))
}

// Given an ingredient name and a list of {id, name, unit, cost, quantity}
// inventory rows, return the top-N ranked candidate matches.
export function rankInventory(ingredientName, inventory, limit = 6) {
  const ingTokens = tokenize(ingredientName)
  if (!ingTokens.length) return []
  const scored = []
  for (const inv of inventory) {
    const invNorm = inv._norm ?? normalizeAr(inv.name)
    const invTokens = inv._tokens ?? tokenize(inv.name)
    const s = scoreMatch(ingTokens, invNorm, invTokens)
    if (s > 0) scored.push({ inv, score: s, nameLen: invNorm.length })
  }
  scored.sort((a, b) => b.score - a.score || a.nameLen - b.nameLen)
  return scored.slice(0, limit).map(x => ({
    id: x.inv.id,
    name: x.inv.name,
    unit: x.inv.unit,
    cost: x.inv.cost,
    quantity: x.inv.quantity,
    category: x.inv.category,
    score: Math.round(x.score * 100) / 100,
  }))
}

// Precompute normalized/token fields once for a batch of inventory rows.
export function prepareInventory(inventory) {
  return inventory.map(inv => ({
    ...inv,
    _norm: normalizeAr(inv.name),
    _tokens: tokenize(inv.name),
  }))
}
