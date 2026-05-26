export async function* readNDJSONStream<T = unknown>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options?: { prefix?: string }
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let lineStr = options?.prefix && line.startsWith(options.prefix)
        ? line.slice(options.prefix.length)
        : line;
      lineStr = lineStr.trim();
      if (!lineStr || lineStr === '[DONE]') continue;
      try {
        yield JSON.parse(lineStr) as T;
      } catch {
        // skip malformed lines
      }
    }
  }
}
