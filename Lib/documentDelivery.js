const TRIGGER_VERBS = /\b(minta|kirim|kirimkan|download|unduh|butuh|kasih|berikan|ambil)\b/i;
const TRIGGER_NOUNS = /\b(dokumen|file|template|surat|formulir|berkas|form)\b/i;

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeForMatch(text).split(' ').filter(token => token.length > 2);
}

// Strip the file extension before tokenizing a source name — otherwise "txt"/"docx"/"pdf"
// becomes a counted token in the denominator and dilutes the overlap score against
// genuinely matching words, sometimes pushing a correct match just under threshold.
function tokenizeName(name) {
  return tokenize(String(name || '').replace(/\.[a-z0-9]+$/i, ''));
}

function bestNameMatch(message, sources) {
  const queryTokens = new Set(tokenize(message));
  let best = null;
  let bestScore = 0;

  for (const source of sources) {
    const nameTokens = tokenizeName(source.name);
    if (!nameTokens.length) continue;
    const overlap = nameTokens.filter(token => queryTokens.has(token)).length;
    const score = overlap / nameTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = source;
    }
  }

  return { best, bestScore };
}

function matchDocumentRequest(message, sources) {
  const text = String(message || '');
  if (!TRIGGER_VERBS.test(text) && !TRIGGER_NOUNS.test(text)) return null;
  if (!sources || !sources.length) return null;

  const { best, bestScore } = bestNameMatch(text, sources);
  return bestScore >= 0.34 ? best : null;
}

// Sources whose entire content is a link (e.g. a Microsoft Forms URL) are useless to
// an LLM as RAG context — the answer to "how do I request X" is just the link itself.
// These should surface even without an explicit "minta dokumen" style trigger phrase,
// but only when the question clearly matches that specific form's subject.
function matchLinkSource(message, sources) {
  const linkSources = (sources || []).filter(source => source.link);
  if (!linkSources.length) return null;

  const { best, bestScore } = bestNameMatch(message, linkSources);
  return bestScore >= 0.5 ? best : null;
}

module.exports = { matchDocumentRequest, matchLinkSource };
