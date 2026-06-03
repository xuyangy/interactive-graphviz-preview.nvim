import { describe, expect, test } from "bun:test";

const SERVER = `${import.meta.dir}/server.ts`;

async function readFirstLine(stream: ReadableStream<Uint8Array>, timeoutMs: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buf += decoder.decode(value, { stream: true });
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        return buf.slice(0, nl);
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("no line received before timeout");
}

describe("server supervision", () => {
  test("announces ready{port,token} on a real ephemeral port", async () => {
    const proc = Bun.spawn(["bun", "run", SERVER], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      env: { ...process.env, IG_HEARTBEAT_TIMEOUT_MS: "2000" },
    });

    try {
      const line = await readFirstLine(proc.stdout, 8000);
      const ready = JSON.parse(line) as { type: string; port: number; token: string };

      expect(ready.type).toBe("ready");
      expect(typeof ready.port).toBe("number");
      expect(ready.port).toBeGreaterThan(0);
      expect(typeof ready.token).toBe("string");
      expect(ready.token.length).toBeGreaterThan(0);

      // Closing stdin (EOF) must self-terminate the server — the no-orphan path.
      proc.stdin.end();
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill(); // no-op if already exited; prevents a leaked process on assertion failure
    }
  }, 15000);

  test("self-terminates on heartbeat timeout when stdin stays silent", async () => {
    const proc = Bun.spawn(["bun", "run", SERVER], {
      stdin: "pipe", // open but we never write — the watchdog must fire
      stdout: "ignore",
      stderr: "ignore",
      env: { ...process.env, IG_HEARTBEAT_TIMEOUT_MS: "800" },
    });

    try {
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill(); // safety net if the watchdog regressed and the process is still up
    }
  }, 15000);
});
