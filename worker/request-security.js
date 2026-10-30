export class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Count bytes while streaming, including requests with no Content-Length.
export async function readJsonBody(request, maxBytes = 24 * 1024) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestError('JSON body required', 415);
  }
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RequestError('Request too large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Invalid JSON body', 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError('Request too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid object');
    return body;
  } catch {
    throw new RequestError('Invalid JSON body', 400);
  }
}
