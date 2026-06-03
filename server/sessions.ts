// Authoritative, in-memory session map owned by the server.
// `sessionId === bufnr`. Refcount is `size`, never subscriber count.
// Architecture invariant: this map is mutated ONLY in this module.

export interface Session {
  sessionId: number;
  version: number;
}

export class SessionRegistry {
  readonly sessions = new Map<number, Session>();

  register(sessionId: number): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { sessionId, version: 0 };
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
}
