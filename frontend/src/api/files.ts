import { ApiError, api, unwrap } from "./client";
import { tokens } from "./tokens";
import type { ListDirResponse, ReadFileResponse } from "./types";

// Listing/read go through the typed openapi-fetch client (auth + refresh handled by authFetch).
export async function fetchDir(
  deploymentId: string,
  volume: string,
  path: string,
): Promise<ListDirResponse> {
  return unwrap(
    await api.GET("/deployments/{id}/volumes/{name}/files", {
      params: { path: { id: deploymentId, name: volume }, query: { path } },
    }),
  );
}

export async function readFile(
  deploymentId: string,
  volume: string,
  path: string,
): Promise<ReadFileResponse> {
  return unwrap(
    await api.GET("/deployments/{id}/volumes/{name}/file", {
      params: { path: { id: deploymentId, name: volume }, query: { path } },
    }),
  );
}

function authHeaders(): Record<string, string> {
  const token = tokens.getAccess();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorFrom(response: Response): Promise<ApiError> {
  let message = `request failed (${response.status})`;

  try {
    const body = (await response.json()) as { message?: unknown };

    if (body.message) {
      message = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
    }
  } catch {
    // Non-JSON body — keep the status-based message.
  }

  return new ApiError(message, response.status);
}

// Multipart upload and binary download bypass the JSON client (FormData / blob bodies); they still
// carry the bearer token. A 401 isn't transparently refreshed here, matching the SSE/log streams.
export async function uploadFile(
  deploymentId: string,
  volume: string,
  dir: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("path", dir);
  form.append("file", file);

  const response = await fetch(
    `/api/deployments/${deploymentId}/volumes/${encodeURIComponent(volume)}/upload`,
    { method: "POST", headers: authHeaders(), body: form },
  );

  if (!response.ok) {
    throw await errorFrom(response);
  }
}

export async function downloadFile(
  deploymentId: string,
  volume: string,
  path: string,
  filename: string,
): Promise<void> {
  const url = `/api/deployments/${deploymentId}/volumes/${encodeURIComponent(
    volume,
  )}/download?path=${encodeURIComponent(path)}`;
  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw await errorFrom(response);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
