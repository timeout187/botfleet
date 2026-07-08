import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Several tests here (drainAgent, reconcileWorkloads) query the
    // *entire* agents/workloads tables against one shared live dev
    // Postgres DB - vitest's default file-level parallelism let two test
    // files' fixtures interleave and made an unrelated file's leftover
    // "online" agent a valid (wrong) scheduler candidate in another
    // file's test. Running test files sequentially avoids that; these
    // are integration tests against real infra, not isolated unit tests,
    // so the tradeoff is fine.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
