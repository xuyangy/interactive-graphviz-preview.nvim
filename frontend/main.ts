import type { ProtocolMessage } from "./protocol";
import { createWebSocketClient } from "./ws";

const app = document.getElementById("app");

function show(text: string): void {
  if (app) {
    app.textContent = text;
  }
}

// Story 1.3 is the communication spine only: connect, send `hello`, and
// stash/log inbound envelopes. No DOM render of DOT yet (Story 1.4); d3-graphviz /
// @hpcc-js/wasm-graphviz are intentionally NOT imported here.
const lastEnvelopes: ProtocolMessage[] = [];

const client = createWebSocketClient({
  onMessage(msg) {
    lastEnvelopes.push(msg);
    // Diagnostic only; rendering arrives in Story 1.4.
    console.debug("interactive-graphviz: received envelope", msg);
    if (msg.type === "render") {
      show("connected — render envelope received (awaiting render in 1.4)");
    }
  },
});

// Expose the stash for debugging / future render wiring.
(window as unknown as { __igEnvelopes?: ProtocolMessage[] }).__igEnvelopes = lastEnvelopes;

show(client.connected ? "connected, awaiting render" : "connecting, awaiting render");
