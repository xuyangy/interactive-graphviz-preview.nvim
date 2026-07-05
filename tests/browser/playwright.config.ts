import { defineConfig, devices } from "@playwright/test";

// Real-browser smoke harness (deliberately tiny — see smoke.spec.ts). Chromium
// only: the goal is one real WASM render + one real interaction under CI, not
// cross-browser coverage. No screenshots, no trace by default — keep it fast.
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { ...devices["Desktop Chrome"] },
  projects: [{ name: "chromium" }],
});
