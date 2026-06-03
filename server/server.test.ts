import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type ProtocolMessage } from "./protocol";
import { bundledFrontendEntry } from "./server";

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
