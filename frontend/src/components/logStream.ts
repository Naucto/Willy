// Backend control markers (logs.controller). EOF = the build stream finished (a later close is
// expected, not an error); STALLED/LIVE flag a frozen runtime tail so the viewer can banner it.
const LOG_STREAM_EOF = "__willy_eof__";
const LOG_STREAM_STALLED = "__willy_stalled__";
const LOG_STREAM_LIVE = "__willy_live__";

// Classify an SSE frame. A stray non-printable byte can precede a marker on the wire, so strip
// anything outside printable ASCII before matching; non-markers pass through verbatim as log lines.
export function interpretLogLine(raw: string): {
  kind: "eof" | "stalled" | "live" | "line";
  text: string;
} {
  const sentinel = raw.replace(/[^\x20-\x7e]/g, "").trim();

  if (sentinel === LOG_STREAM_EOF) {
    return { kind: "eof", text: "" };
  }

  if (sentinel === LOG_STREAM_STALLED) {
    return { kind: "stalled", text: "" };
  }

  if (sentinel === LOG_STREAM_LIVE) {
    return { kind: "live", text: "" };
  }

  return { kind: "line", text: raw };
}
