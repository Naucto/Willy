import { tokens } from "./tokens";

// Pulls complete SSE frames out of a rolling buffer, returning their `data:` lines
// and the leftover incomplete frame to carry into the next chunk. Pure — unit-tested.
export function parseSseBuffer(buffer: string): { data: string[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const data: string[] = [];

  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      if (line.startsWith("data:")) {
        data.push(line.slice(5).replace(/^ /, ""));
      }
    }
  }

  return { data, rest };
}

// Reads a NestJS SSE endpoint via fetch (not EventSource) so the bearer token can
// be sent as a header. Resolves when the stream ends; rejects on abort/error.
export async function streamSse(
  path: string,
  onData: (data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const accessToken = tokens.getAccess();
  const response = await fetch(`/api${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`log stream failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const { data, rest } = parseSseBuffer(buffer);
    buffer = rest;
    data.forEach(onData);
  }
}
