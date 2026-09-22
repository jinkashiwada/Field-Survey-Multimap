const COMPACT_PREFIX = '#s=1.';
const MAX_COMPACT_TOKEN_LENGTH = 32_000;
const MAX_EXPANDED_HASH_BYTES = 72_000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function collectLimited(stream: ReadableStream<Uint8Array>, maximum: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > maximum) throw new Error('expanded hash is too large');
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function readableBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function gzipStream(): TransformStream<Uint8Array, Uint8Array> {
  return new CompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
}

function gunzipStream(): TransformStream<Uint8Array, Uint8Array> {
  return new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
}

export function supportsCompactUrls(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

export async function compactHash(hash: string): Promise<string> {
  if (!supportsCompactUrls() || !hash.startsWith('#v=1&')) return hash;
  const input = new TextEncoder().encode(hash);
  const compressed = await collectLimited(
    readableBytes(input).pipeThrough(gzipStream()),
    MAX_COMPACT_TOKEN_LENGTH,
  );
  const compact = `${COMPACT_PREFIX}${bytesToBase64Url(compressed)}`;
  return compact.length < hash.length ? compact : hash;
}

export async function expandCompactHash(hash: string): Promise<{ hash: string; error: boolean }> {
  if (!hash.startsWith('#s=')) return { hash, error: false };
  if (!supportsCompactUrls() || !hash.startsWith(COMPACT_PREFIX)) return { hash: '#v=1&shareError=1', error: true };
  const token = hash.slice(COMPACT_PREFIX.length);
  if (token.length === 0 || token.length > MAX_COMPACT_TOKEN_LENGTH) return { hash: '#v=1&shareError=1', error: true };
  try {
    const compressed = base64UrlToBytes(token);
    const expanded = await collectLimited(
      readableBytes(compressed).pipeThrough(gunzipStream()),
      MAX_EXPANDED_HASH_BYTES,
    );
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(expanded);
    if (!decoded.startsWith('#v=1&')) throw new Error('invalid expanded hash');
    return { hash: decoded, error: false };
  } catch {
    return { hash: '#v=1&shareError=1', error: true };
  }
}

export async function compactShareUrl(urlValue: string): Promise<string> {
  const url = new URL(urlValue);
  url.hash = await compactHash(url.hash);
  return url.href;
}
