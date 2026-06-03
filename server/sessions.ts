export interface Session {
  sessionId: number;
  version: number;
}

export class SessionRegistry {
  readonly sessions = new Map<number, Session>();
}
