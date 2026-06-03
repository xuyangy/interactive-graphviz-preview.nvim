import type { ProtocolMessage } from "./protocol";

// Inbound-envelope callbacks. The frontend dispatches by `type`; in this story it
// only stashes/logs envelopes (no DOM render — Story 1.4).
export interface WebSocketClientHandlers {
  onRender?: (msg: ProtocolMessage) => void;
  onErrorDisplay?: (msg: ProtocolMessage) => void;
  onSessionClosed?: (msg: ProtocolMessage) => void;
  onMessage?: (msg: ProtocolMessage) => void;
}

export interface WebSocketClient {
  connected: boolean;
  close: () => void;
}

interface ConnectParams {
  sessionId: string | null;
  token: string | null;
}

// Read the session/token the browser was opened with (Story 1.4 mints the URL).
function readConnectParams(): ConnectParams {
  const params = new URLSearchParams(window.location.search);
  return { sessionId: params.get("sessionId"), token: params.get("token") };
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/`;
}

/**
 * Open a live WebSocket to the server, authenticate with `hello{sessionId,token}`
 * on open, and dispatch inbound envelopes by `type` to the provided handlers.
 * The envelope is never redefined here — types come from `frontend/protocol.ts`.
 */
export function createWebSocketClient(handlers: WebSocketClientHandlers = {}): WebSocketClient {
  const client: WebSocketClient = { connected: false, close: () => {} };
  const { sessionId, token } = readConnectParams();

  const socket = new WebSocket(wsUrl());
  client.close = () => socket.close();

  socket.addEventListener("open", () => {
    client.connected = true;
    if (sessionId !== null && token !== null) {
      const hello: ProtocolMessage = {
        type: "hello",
        sessionId: Number(sessionId),
        token,
      };
      socket.send(JSON.stringify(hello));
    }
  });

  socket.addEventListener("close", () => {
    client.connected = false;
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    let msg: ProtocolMessage;
    try {
      msg = JSON.parse(String(event.data)) as ProtocolMessage;
    } catch {
      // Ignore a malformed frame — never throw across the connection.
      return;
    }
    handlers.onMessage?.(msg);
    switch (msg.type) {
      case "render":
        handlers.onRender?.(msg);
        break;
      case "error_display":
        handlers.onErrorDisplay?.(msg);
        break;
      case "session_closed":
        handlers.onSessionClosed?.(msg);
        break;
      default:
        // Unrecognized inbound type: ignored (channel stays warm).
        break;
    }
  });

  return client;
}
