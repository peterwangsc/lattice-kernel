export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface BenchmarkSuite {
  add(name: string, fn: () => Promise<void> | void): void;
  run(iterations?: number): Promise<BenchmarkResult[]>;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

export function createBenchmarkSuite(): BenchmarkSuite {
  const benchmarks: Array<{ name: string; fn: () => Promise<void> | void }> =
    [];

  return {
    add(name: string, fn: () => Promise<void> | void): void {
      benchmarks.push({ name, fn });
    },

    async run(iterations = 1000): Promise<BenchmarkResult[]> {
      const results: BenchmarkResult[] = [];

      for (const bench of benchmarks) {
        const timings: number[] = [];

        // Warmup
        for (let i = 0; i < Math.min(10, iterations); i++) {
          await bench.fn();
        }

        // Measured runs
        for (let i = 0; i < iterations; i++) {
          const start = performance.now();
          await bench.fn();
          timings.push(performance.now() - start);
        }

        timings.sort((a, b) => a - b);
        const totalMs = timings.reduce((a, b) => a + b, 0);

        results.push({
          name: bench.name,
          iterations,
          totalMs: Math.round(totalMs * 100) / 100,
          avgMs: Math.round((totalMs / iterations) * 1000) / 1000,
          opsPerSec: Math.round((iterations / totalMs) * 1000),
          p50Ms: Math.round(percentile(timings, 50) * 1000) / 1000,
          p95Ms: Math.round(percentile(timings, 95) * 1000) / 1000,
          p99Ms: Math.round(percentile(timings, 99) * 1000) / 1000,
        });
      }

      return results;
    },
  };
}

export function formatResults(results: BenchmarkResult[]): string {
  const lines = [
    "┌──────────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┐",
    "│ Benchmark                                │  ops/sec │  avg(ms) │  p95(ms) │  p99(ms) │",
    "├──────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤",
  ];

  for (const r of results) {
    const name = r.name.padEnd(40);
    const ops = String(r.opsPerSec).padStart(8);
    const avg = r.avgMs.toFixed(3).padStart(8);
    const p95 = r.p95Ms.toFixed(3).padStart(8);
    const p99 = r.p99Ms.toFixed(3).padStart(8);
    lines.push(`│ ${name} │ ${ops} │ ${avg} │ ${p95} │ ${p99} │`);
  }

  lines.push(
    "└──────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┘",
  );
  return lines.join("\n");
}
