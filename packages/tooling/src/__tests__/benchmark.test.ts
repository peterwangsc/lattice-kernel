import { describe, it, expect } from "vitest";
import { createBenchmarkSuite, formatResults } from "../bench/framework.js";

describe("BenchmarkSuite", () => {
  it("runs benchmarks and collects results", async () => {
    const suite = createBenchmarkSuite();
    suite.add("sync op", () => {
      Math.sqrt(144);
    });
    suite.add("async op", async () => {
      await Promise.resolve();
    });

    const results = await suite.run(100);
    expect(results).toHaveLength(2);
    expect(results[0]!.name).toBe("sync op");
    expect(results[0]!.iterations).toBe(100);
    expect(results[0]!.opsPerSec).toBeGreaterThan(0);
    expect(results[0]!.avgMs).toBeGreaterThanOrEqual(0);
    expect(results[0]!.p50Ms).toBeGreaterThanOrEqual(0);
    expect(results[0]!.p95Ms).toBeGreaterThanOrEqual(results[0]!.p50Ms);
    expect(results[0]!.p99Ms).toBeGreaterThanOrEqual(results[0]!.p95Ms);
  });

  it("formats results as table", async () => {
    const suite = createBenchmarkSuite();
    suite.add("test benchmark", () => {});
    const results = await suite.run(10);

    const table = formatResults(results);
    expect(table).toContain("test benchmark");
    expect(table).toContain("ops/sec");
    expect(table).toContain("avg(ms)");
  });
});
