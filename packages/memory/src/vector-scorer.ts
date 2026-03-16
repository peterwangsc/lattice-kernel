/**
 * Vector similarity scoring for memory retrieval.
 * Provides cosine similarity ranking when embeddings are available,
 * falling back to text-overlap scoring.
 */

export interface VectorScorer {
  /** Score a document against a query. Higher = more relevant. */
  score(query: string, document: string): number;
  /** Score using pre-computed embeddings. */
  scoreEmbeddings(queryEmbedding: number[], docEmbedding: number[]): number;
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Text-based overlap scorer (default fallback).
 * Counts how many query terms appear in the document.
 */
export function textOverlapScore(query: string, document: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const docLower = document.toLowerCase();
  return queryTerms.filter((t) => docLower.includes(t)).length / Math.max(queryTerms.length, 1);
}

/**
 * Creates a vector scorer that uses cosine similarity when embeddings
 * are available, falling back to text overlap.
 */
export function createVectorScorer(): VectorScorer {
  return {
    score: textOverlapScore,
    scoreEmbeddings: cosineSimilarity,
  };
}
