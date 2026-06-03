import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type ProtocolMessage } from "./protocol";

describe("server scaffold", () => {
  test("exports canonical protocol stubs", () => {
    const message: ProtocolMessage = { type: "ping" };

    expect(PROTOCOL_VERSION).toBe(1);
    expect(message.type).toBe("ping");
  });
});
