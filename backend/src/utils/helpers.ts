export function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function computeHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}
