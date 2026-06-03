export function encodeLine(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}
