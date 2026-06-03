// Authoritative, in-memory session map owned by the server.
// `sessionId === bufnr`. Refcount is `size`, never subscriber count.
// Architecture invariant: this map AND every session's `subscribers` set are
// mutated ONLY in this module (single-owner), so refcount/cleanup stay coherent.

import type { ServerWebSocket } from "bun";

// Per-socket state attached via Bun's `server.upgrade(req, { data })`.
export interface SocketData {
  sessionId?: number;
  subscribed: boolean;
}

export type Subscriber = ServerWebSocket<SocketData>;

export interface Session {
  sessionId: number;
  version: number;
  // Live WebSocket subscribers for this session. Architecture's full Session
  // shape also carries `lastGoodDot`/`engine` — those arrive in Stories 1.4/1.6;
  // this story only needs the subscriber set.
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
}
