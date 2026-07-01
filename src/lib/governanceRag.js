// Governance document RAG (Session BB P5). Chunk + embed a document's text into
// governance_document_chunks (pgvector), and retrieve the nearest chunks for a
// question. Embeddings go through /api/embed (OpenAI, 1536-dim); retrieval is the
// owner-scoped match_governance_chunks RPC (106). No new Vercel function.
import { supabase } from "../supabaseClient";

const CHUNK_CHARS = 900;

// Split text into ~900-char chunks on paragraph/sentence boundaries.
export function chunkText(text) {
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (const para of paras) {
    if (para.length > CHUNK_CHARS) {
      flush();
      // Long paragraph → split on sentence ends.
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sIt of sentences) {
        if ((cur + " " + sIt).length > CHUNK_CHARS) flush();
        cur = cur ? `${cur} ${sIt}` : sIt;
      }
      flush();
    } else if ((cur + "\n\n" + para).length > CHUNK_CHARS) {
      flush(); cur = para;
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  flush();
  return chunks;
}

// Embed an array of texts via /api/embed → number[][] (same order). Throws on failure.
async function embedTexts(texts) {
  const res = await fetch("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, type: "governance" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok || !Array.isArray(body.embeddings)) {
    throw new Error(body?.error || `embed_http_${res.status}`);
  }
  return body.embeddings;
}
const vecLiteral = (v) => `[${v.join(",")}]`;

// Re-index a document: replace its chunks with freshly embedded ones. Returns
// { chunks, error }. Owner RLS gates the chunk writes.
export async function reindexGovernanceDocument(documentId, mosqueId, docText) {
  try {
    await supabase.from("governance_document_chunks").delete().eq("document_id", documentId);
    const chunks = chunkText(docText);
    if (!chunks.length) return { chunks: 0, error: null };
    const embeddings = await embedTexts(chunks);
    const rows = chunks.map((content, i) => ({ document_id: documentId, mosque_id: mosqueId, content, embedding: vecLiteral(embeddings[i]) }));
    const { error } = await supabase.from("governance_document_chunks").insert(rows);
    if (error) return { chunks: 0, error: error.message };
    return { chunks: chunks.length, error: null };
  } catch (e) {
    return { chunks: 0, error: e?.message || "indexing_failed" };
  }
}

// Retrieve the nearest document chunks for a question (owner-scoped). Returns an
// array of chunk texts (empty if no embedded documents / on failure).
export async function retrieveGovernanceChunks(mosqueId, question, k = 5) {
  try {
    const [vec] = await embedTexts([question]);
    const { data, error } = await supabase.rpc("match_governance_chunks", { p_mosque_id: mosqueId, query_embedding: vecLiteral(vec), match_count: k });
    if (error) { console.error("match_governance_chunks failed:", error.message); return []; }
    return (data || []).map((r) => r.content);
  } catch (e) {
    console.error("retrieveGovernanceChunks failed:", e?.message);
    return [];
  }
}
