import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type ProtocolMessage } from "./protocol";
import { bundledFrontendEntry, heartbeatTimeoutMs, resolveBindAddress, resolvePort } from "./server";

describe("server scaffold", () => {
  test("exports canonical protocol stubs", () => {
    const message: ProtocolMessage = { type: "ping" };

    expect(PROTOCOL_VERSION).toBe(1);
    expect(message.type).toBe("ping");
  });

  test("exposes a bundled frontend entrypoint for executable builds", () => {
    expect(bundledFrontendEntry()).toBeTruthy();
  });
});

describe("server env-var config (IG_BIND / IG_PORT)", () => {
  // Save and restore env vars around each test to avoid cross-test pollution.
  let savedBind: string | undefined;
  let savedPort: string | undefined;

  beforeEach(() => {
    savedBind = process.env.IG_BIND;
    savedPort = process.env.IG_PORT;
  });

  afterEach(() => {
    if (savedBind === undefined) {
      delete process.env.IG_BIND;
    } else {
      process.env.IG_BIND = savedBind;
    }
    if (savedPort === undefined) {
      delete process.env.IG_PORT;
    } else {
      process.env.IG_PORT = savedPort;
    }
  });

  test("resolveBindAddress() returns loopback when IG_BIND is absent", () => {
    delete process.env.IG_BIND;
    expect(resolveBindAddress()).toBe("127.0.0.1");
  });

  test("resolveBindAddress() returns 0.0.0.0 when IG_BIND=0.0.0.0 (expose_to_lan=true)", () => {
    process.env.IG_BIND = "0.0.0.0";
    expect(resolveBindAddress()).toBe("0.0.0.0");
  });

  test("resolvePort() returns 0 (ephemeral) when IG_PORT is absent", () => {
    delete process.env.IG_PORT;
    expect(resolvePort()).toBe(0);
  });

  test("resolvePort() returns the configured port when IG_PORT=3000", () => {
    process.env.IG_PORT = "3000";
    expect(resolvePort()).toBe(3000);
  });

  test("resolvePort() returns 0 on non-numeric IG_PORT (NaN guard)", () => {
    process.env.IG_PORT = "not-a-number";
    expect(resolvePort()).toBe(0);
  });

  test("heartbeatTimeoutMs uses IG_HEARTBEAT_TIMEOUT_MS env var (same pattern)", () => {
    // Verify the heartbeatTimeoutMs function uses the same env-reading pattern
    // that resolveBindAddress and resolvePort follow.
    const saved = process.env.IG_HEARTBEAT_TIMEOUT_MS;
    process.env.IG_HEARTBEAT_TIMEOUT_MS = "5000";
    expect(heartbeatTimeoutMs()).toBe(5000);
    if (saved === undefined) {
      delete process.env.IG_HEARTBEAT_TIMEOUT_MS;
    } else {
      process.env.IG_HEARTBEAT_TIMEOUT_MS = saved;
    }
  });
});
