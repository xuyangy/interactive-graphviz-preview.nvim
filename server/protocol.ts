export type MessageType =
  | "session_open"
  | "render"
  | "set_engine"
  | "session_close"
  | "ping"
  | "shutdown"
  | "ready"
  | "pong"
  | "log"
  | "error_display"
  | "session_closed"
  | "hello"
  | "ack";

export interface ProtocolMessage {
  type: MessageType;
  sessionId?: number;
  v?: number;
  [key: string]: unknown;
}

export const PROTOCOL_VERSION = 1;
