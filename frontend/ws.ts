export interface WebSocketClient {
  connected: boolean;
}

export function createWebSocketClient(): WebSocketClient {
  return { connected: false };
}
