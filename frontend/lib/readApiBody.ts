/** Parse JSON from a fetch Response; throw a clear message if the body is HTML or plain text (e.g. Flask 500 page). */
export async function readApiBody(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const trimmed = raw.trimStart();
    const snippet = raw.replace(/\s+/g, ' ').slice(0, 200);
    const htmlHint =
      trimmed.startsWith('<!') || trimmed.toLowerCase().includes('<html')
        ? ' This usually means the Flask API returned an error page — check the terminal running the backend (python backend/app.py) for the traceback.'
        : '';
    throw new Error(`API returned non-JSON (HTTP ${res.status}). ${snippet}${htmlHint}`);
  }
}
