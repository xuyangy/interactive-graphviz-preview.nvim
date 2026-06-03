// Newline-delimited JSON framing for the stdio control channel.
// stdout is reserved for protocol lines only (see architecture "Process Patterns").

export function encodeLine(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * Accumulates raw stdin chunks and yields complete lines, tolerating chunk
 * boundaries that split a JSON line. Blank lines are dropped.
 */
export class LineBuffer {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk;
    const lines: string[] = [];
    let nl = this.buf.indexOf("\n");
    while (nl >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.trim().length > 0) {
        lines.push(line);
      }
      nl = this.buf.indexOf("\n");
    }
    return lines;
  }

  /** Bytes buffered but not yet terminated by a newline (for diagnostics/tests). */
  get pending(): string {
    return this.buf;
  }
}
