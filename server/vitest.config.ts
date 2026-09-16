import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Tests hit real MySQL and use real transactions/locks - run test
    // files one at a time so unrelated suites don't contend for
    // connections or clobber each other's reservations truncation.
    fileParallelism: false,
    testTimeout: 10000,
    globalSetup: "./tests/global-setup.ts",
  },
});