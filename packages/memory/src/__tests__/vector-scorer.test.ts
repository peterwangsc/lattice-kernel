import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  textOverlapScore,
  createVectorScorer,
} from "../vector-scorer.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("handles high-dimensional vectors", () => {
    const a = [0.1, 0.2, 0.3, 0.4, 0.5];
    const b = [0.5, 0.4, 0.3, 0.2, 0.1];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("is symmetric", () => {
    const a = [0.1, 0.5, 0.3];
    const b = [0.4, 0.2, 0.8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });
});

describe("textOverlapScore", () => {
  it("returns 1 when all query terms match", () => {
    expect(textOverlapScore("hello world", "hello wonderful world")).toBeCloseTo(1);
  });

  it("returns 0 when no terms match", () => {
    expect(textOverlapScore("hello world", "foo bar baz")).toBe(0);
  });

  it("returns partial score for partial matches", () => {
    const score = textOverlapScore("quarterly billing preference", "customer prefers quarterly billing");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("is case insensitive", () => {
    expect(textOverlapScore("Hello", "HELLO world")).toBeCloseTo(1);
  });
});

describe("createVectorScorer", () => {
  it("provides text scoring via score()", () => {
    const scorer = createVectorScorer();
    expect(scorer.score("test query", "this is a test")).toBeGreaterThan(0);
  });

  it("provides embedding scoring via scoreEmbeddings()", () => {
    const scorer = createVectorScorer();
    expect(scorer.scoreEmbeddings([1, 0], [1, 0])).toBeCloseTo(1);
  });
});
