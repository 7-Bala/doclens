/**
 * Incremental NDJSON parser. Network chunks can end mid-line, so partial lines are
 * buffered until their newline arrives; blank lines are ignored.
 */
export class NdjsonDecoder<T> {
  private buffer = "";

  /** Feeds a chunk of text and returns every complete event it finished. */
  push(chunk: string): T[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
  }

  /** Returns a final event that arrived without a trailing newline, if any. */
  flush(): T[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [JSON.parse(rest) as T] : [];
  }
}
