const STOPWORDS_ID = new Set([
'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'atau', 'pada',
'adalah',
'ini', 'itu', 'dalam', 'juga', 'karena', 'agar', 'sebagai', 'saat',
'oleh', 'akan',
'bisa', 'dapat', 'sudah', 'belum', 'kami', 'kamu', 'anda', 'saya',
'aku', 'kita',
'mereka', 'apa', 'siapa', 'kapan', 'dimana', 'bagaimana', 'kenapa',
'jika', 'kalau',
'ingin', 'tahu', 'mau', 'pingin', 'halo', 'hai', 'tolong', 'mohon',
'gimana', 'caranya'
]);
class RAGEngine {
constructor() {
this.cache = {
signature: '',
index: null
};
}
tokenize(text) {
if (!text) return [];
return text
.toLowerCase()
.replace(/[^a-z0-9\s]/g, ' ')
.split(/\s+/)
.filter(token => token.length > 2 && !STOPWORDS_ID.has(token));
}
splitIntoChunks(text, chunkSize = 700, overlap = 120) {
if (!text) return [];
const normalized = text.replace(/\r/g, '').trim();
if (!normalized) return [];

const chunks = [];
let start = 0;
while (start < normalized.length) {
let end = Math.min(start + chunkSize, normalized.length);
if (end < normalized.length) {
const lastBreak = normalized.lastIndexOf('\n', end);
if (lastBreak > start + 120) {
end = lastBreak;
}
}
const chunk = normalized.slice(start, end).trim();
if (chunk.length > 40) {
chunks.push(chunk);
}
if (end >= normalized.length) break;
start = Math.max(end - overlap, start + 1);
}
return chunks;
}
buildTfMap(tokens) {
const tf = new Map();
for (const token of tokens) {
tf.set(token, (tf.get(token) || 0) + 1);
}
return tf;
}
buildRagIndex(documents) {
if (!documents || documents.length === 0) {
return { idf: new Map(), vectors: [] };
}
const tokenizedDocs = documents.map(doc =>
this.tokenize(doc.text));
const docFreq = new Map();
tokenizedDocs.forEach(tokens => {
const uniqueTokens = new Set(tokens);
uniqueTokens.forEach(token => {
docFreq.set(token, (docFreq.get(token) || 0) + 1);

});
});
const totalDocs = Math.max(documents.length, 1);
const idf = new Map();
docFreq.forEach((freq, token) => {
idf.set(token, Math.log((totalDocs + 1) / (freq + 1)) + 1);
});
const vectors = tokenizedDocs.map((tokens, idx) => {
const tf = this.buildTfMap(tokens);
const vector = new Map();
let normSquared = 0;
tf.forEach((count, token) => {
const weight = count * (idf.get(token) || 0);
vector.set(token, weight);
normSquared += weight * weight;
});
return {
id: documents[idx].id,
sourceId: documents[idx].sourceId,
source: documents[idx].source,
chunk: documents[idx].chunk,
text: documents[idx].text,
vector,
norm: Math.sqrt(normSquared)
};
});
return { idf, vectors };
}
retrieveContext(query, documents, topK = 3) {
if (!documents || documents.length === 0) return [];
const signature = documents
.map(doc => `${doc.id || ''}:${doc.source || ''}:${doc.text ? doc.text.length : 0}`)
.join('|');
if (!this.cache.index || this.cache.signature !== signature) {
this.cache.signature = signature;
this.cache.index = this.buildRagIndex(documents);
}
const { idf, vectors } = this.cache.index;
if (!vectors.length) return [];
const queryTokens = this.tokenize(query);
if (!queryTokens.length) return [];
const queryTf = this.buildTfMap(queryTokens);
const queryVector = new Map();
let queryNormSquared = 0;
queryTf.forEach((count, token) => {

const weight = count * (idf.get(token) || 0);
if (weight > 0) {
queryVector.set(token, weight);
queryNormSquared += weight * weight;
}
});
const queryNorm = Math.sqrt(queryNormSquared);
if (!queryNorm) return [];
const queryTokenSet = new Set(queryTokens);
const scored = vectors
.map(item => {
let cosine = 0;
if (item.norm) {
queryVector.forEach((qWeight, token) => {
const dWeight = item.vector.get(token);
if (dWeight) cosine += qWeight * dWeight;
});
cosine = cosine / (queryNorm * item.norm);
}
// Documents whose filename matches the query topic (e.g. "syarat yudisium" vs
// "Panduan Pendaftaran Yudisium.pdf") often have poorly OCR'd/table-mangled body
// text that scores low on pure cosine similarity. Boost by how much of the query's
// own vocabulary the title covers, so the obviously-on-topic document doesn't lose
// to a generic one just because its body text is denser/cleaner.
const titleTokens = new Set(this.tokenize(item.source));
const titleOverlap = queryTokenSet.size
? [...queryTokenSet].filter(token => titleTokens.has(token)).length / queryTokenSet.size
: 0;
// Cosine similarity dilutes against chunks with a large, varied vocabulary (e.g. a
// schedule table full of unique month/column words) even when every query word is
// literally present — a short 2-word query like "jadwal yudisium" can lose to a
// shorter, less relevant chunk purely on vector-length grounds. Reward chunks that
// contain *every* query content-word verbatim, regardless of document length.
const itemTokenSet = new Set(this.tokenize(item.text));
const queryCoverage = queryTokenSet.size
? [...queryTokenSet].filter(token => itemTokenSet.has(token)).length / queryTokenSet.size
: 0;
const coverageBoost = queryCoverage === 1 ? 0.15 : 0;
return {
id: item.id,
sourceId: item.sourceId,
source: item.source,
chunk: item.chunk,
text: item.text,
score: cosine + titleOverlap * 0.4 + coverageBoost
};
})
        .filter(item => item.score > 0.01)
.sort((a, b) => b.score - a.score)
.slice(0, topK);
return this.expandWithNeighbors(scored, vectors, topK);
}
// Number-heavy table rows (e.g. "3,92 7 475 ... Summa cumlaude") carry the actual answer but
// score low against a natural-language question because they share few words with it — the
// decree/heading chunk right before them scores high instead. So for each retrieved chunk,
// also pull the immediately adjacent chunks (+/-1) from the SAME source, which is where the
// spilled-over table/detail usually lives. Neighbors inherit a lower score so genuine top
// hits stay first.
expandWithNeighbors(scored, vectors, topK, maxExtra = 6) {
if (!scored.length) return scored;
const byKey = new Map();
vectors.forEach(v => byKey.set(`${v.sourceId}:${v.chunk}`, v));
const present = new Set(scored.map(item => `${item.sourceId}:${item.chunk}`));
const additions = [];
for (const item of scored) {
if (typeof item.chunk !== 'number') continue;
for (const delta of [-1, 1]) {
if (additions.length >= maxExtra) break;
const key = `${item.sourceId}:${item.chunk + delta}`;
if (present.has(key) || !byKey.has(key)) continue;
const neighbor = byKey.get(key);
present.add(key);
additions.push({
id: neighbor.id,
sourceId: neighbor.sourceId,
source: neighbor.source,
chunk: neighbor.chunk,
text: neighbor.text,
score: item.score * 0.6
});
}
}
return [...scored, ...additions].sort((a, b) => b.score - a.score);
}
buildContextBlock(contextItems) {
if (!contextItems || !contextItems.length) return '';
return contextItems
.map((item, idx) => {
const cleanText = item.text.replace(/\s+/g, ' ').trim();
return `[Konteks ${idx + 1}] Sumber: ${item.source}${item.chunk ? `, potongan ${item.chunk}` : ''}\n${cleanText}`;
})
.join('\n\n');
}
clearCache() {
this.cache.signature = '';

this.cache.index = null;
}
}
module.exports = RAGEngine;
