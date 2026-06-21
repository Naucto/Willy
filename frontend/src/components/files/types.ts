// An open editor tab. `content` is the live text; `original` is the last-saved text (dirty = differ).
// Binary files carry no editable text — they're download-only.
export interface OpenFile {
  path: string;
  name: string;
  content: string;
  original: string;
  isBinary: boolean;
  size: number;
  mode: string;
  uid: number;
  gid: number;
  language: string;
  loading: boolean;
  error: string | null;
}
