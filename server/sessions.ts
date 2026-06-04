// Authoritative, in-memory session map owned by the server.
// `sessionId === bufnr`. Refcount is `size`, never subscriber count.
// Architecture invariant: this map AND every session's `subscribers` set are
// mutated ONLY in this module (single-owner), so refcount/cleanup stay coherent.

import type { ServerWebSocket } from "bun";
import type { ProtocolMessage } from "./protocol";

// Per-socket state attached via Bun's `server.upgrade(req, { data })`.
export interface SocketData {
  sessionId?: number;
  subscribed: boolean;
}

export type Subscriber = ServerWebSocket<SocketData>;

export interface Session {
  sessionId: number;
  version: number;
  // Last render envelope received — replayed to a browser that subscribes after
  // the first fan-out (cold-open race fix). Not lastGoodDot; no good/bad
  // distinction yet — that is Story 1.6.
  lastRender?: ProtocolMessage;
  // Live WebSocket subscribers for this session.
  subscribers: Set<Subscriber>;
}

export class SessionRegistry {
  readonly sessions = new Map<number, Session>();

  register(sessionId: number): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { sessionId, version: 0, subscribers: new Set<Subscriber>() };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  unregister(sessionId: number): boolean {
    return this.sessions.delete(sessionId);
  }

  has(sessionId: number): boolean {
    return this.sessions.has(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  /**
   * Subscribe a socket to a session's broadcast set, registering the session if
   * it is not yet known (a browser may `hello` before/around `session_open`).
   * Returns the session. Subscriber-set mutation lives only here.
   */
  subscribe(sessionId: number, ws: Subscriber): Session {
    const session = this.register(sessionId);
    session.subscribers.add(ws);
    return session;
  }

  /** Remove a socket from its session's subscriber set. Idempotent. */
  unsubscribe(sessionId: number, ws: Subscriber): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.subscribers.delete(ws);
    }
  }

  /** Iterate a session's subscribers for broadcast (empty if session unknown). */
  subscribersOf(sessionId: number): Iterable<Subscriber> {
    return this.sessions.get(sessionId)?.subscribers ?? [];
  }

  /** Store the last render envelope for cold-open replay. Mutation lives here. */
  setLastRender(sessionId: number, render: ProtocolMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastRender = render;
    }
  }
}
