import type { StreamEvent } from "./protocol";

const encoder = new TextEncoder();

/** One server-sent event. `data` is JSON on a single line (JSON.stringify never emits raw newlines). */
export function encodeSse(e: StreamEvent): Uint8Array {
  return encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
}

export const SSE_PING = encoder.encode(": ping\n\n");

/**
 * Incremental SSE parser: feed it decoded chunks in any split; it calls onEvent for each complete
 * event. Comments are ignored; malformed JSON is skipped (the caller validates the shape).
 */
export function createSseParser(onEvent: (event: string, data: unknown) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n?/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let name = "message";
      const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length === 0) continue;
      try {
        onEvent(name, JSON.parse(data.join("\n")));
      } catch {
        // skip malformed event
      }
    }
  };
}
