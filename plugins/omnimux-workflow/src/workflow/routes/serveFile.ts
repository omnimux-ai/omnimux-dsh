import { createReadStream, readFileSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { parseByteRange } from '../byteRange';
import { detectMimeFromFile } from '../../shared/localMedia';

const MIME_BY_EXT: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/** Response hardening shared by every file response; SVG gets a sandbox CSP. */
function securityHeadersFor(mime: string): Record<string, string> {
  const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff' };
  if ((mime.split(';')[0] ?? '').trim().toLowerCase() === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
  }
  return headers;
}

/** Stream workflow media and static files with MIME and Range support. */
export function serveFile(res: ServerResponse, filePath: string, fallbackMime: string, rangeHeader?: string): void {
  const mime = detectMimeFromFile(filePath, MIME_BY_EXT[extname(filePath)] ?? fallbackMime);
  const securityHeaders = securityHeadersFor(mime);
  const stat = statSync(filePath);
  const range = parseByteRange(rangeHeader, stat.size);
  if (range && 'invalid' in range) {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Requested Range Not Satisfiable');
    return;
  }
  if (range) {
    const chunkSize = range.end - range.start + 1;
    res.writeHead(206, {
      ...securityHeaders,
      'Content-Type': mime, 'Content-Length': chunkSize,
      'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
    });
    const stream = createReadStream(filePath, { start: range.start, end: range.end });
    stream.on('error', () => { res.destroy(); });
    stream.pipe(res);
    return;
  }
  res.writeHead(200, {
    ...securityHeaders,
    'Content-Type': mime, 'Content-Length': stat.size,
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
  });
  const stream = createReadStream(filePath);
  stream.on('error', () => { res.destroy(); });
  stream.pipe(res);
}

export interface IslandBundleOptions {
  /** Strong ETag (quoted build hash) carried by the content-addressed URL. */
  etag: string;
  range?: string;
  acceptEncoding?: string;
  ifNoneMatch?: string;
}

/** The bundle URL carries `?v=<sha256[:16]>`, so those bytes never change in place. */
const ISLAND_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Compressed bundle bodies, reused until the artifact on disk changes. */
const compressedBundles = new Map<string, { stamp: string; body: Buffer }>();

/** gzip/br negotiation; brotli wins when both are offered, q=0 refuses. */
function pickBundleEncoding(acceptEncoding: string | undefined): 'br' | 'gzip' | null {
  if (!acceptEncoding) return null;
  const accepted = new Set<string>();
  for (const token of acceptEncoding.split(',')) {
    const [rawName, ...params] = token.trim().split(';');
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    if (q && Number(q.slice(2)) === 0) continue;
    accepted.add(name);
  }
  if (accepted.has('br')) return 'br';
  if (accepted.has('gzip')) return 'gzip';
  return null;
}

/** If-None-Match match against a strong ETag; `*` matches any representation. */
function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const target = etag.replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => {
    const value = candidate.trim().replace(/^W\//, '');
    return value === '*' || value === target;
  });
}

/**
 * Island bundle response for a content-addressed `?v=` URL: immutable caching,
 * strong ETag (304 on If-None-Match), and gzip/br on the wire when accepted.
 * Range requests keep the generic media path; non-addressed files never reach here.
 */
export function serveIslandBundle(res: ServerResponse, filePath: string, options: IslandBundleOptions): void {
  if (options.range) {
    serveFile(res, filePath, 'application/octet-stream', options.range);
    return;
  }
  const mime = detectMimeFromFile(filePath, MIME_BY_EXT[extname(filePath)] ?? 'application/octet-stream');
  const headers = {
    ...securityHeadersFor(mime),
    'Cache-Control': ISLAND_CACHE_CONTROL,
    ETag: options.etag,
    Vary: 'Accept-Encoding',
  };
  if (etagMatches(options.ifNoneMatch, options.etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const stat = statSync(filePath);
  const encoding = pickBundleEncoding(options.acceptEncoding);
  if (!encoding) {
    res.writeHead(200, {
      ...headers,
      'Content-Type': mime, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes',
    });
    const stream = createReadStream(filePath);
    stream.on('error', () => { res.destroy(); });
    stream.pipe(res);
    return;
  }
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  const cacheKey = `${filePath}\u0000${encoding}`;
  const cached = compressedBundles.get(cacheKey);
  let body: Buffer;
  if (cached && cached.stamp === stamp) {
    body = cached.body;
  } else {
    const raw = readFileSync(filePath);
    body = encoding === 'br'
      // Quality 5 keeps the 2.6MB canvas bundle at ~53ms; the default 11 takes ~6s.
      ? brotliCompressSync(raw, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length,
          },
        })
      : gzipSync(raw, { level: 6 });
    compressedBundles.set(cacheKey, { stamp, body });
  }
  res.writeHead(200, {
    ...headers,
    'Content-Type': mime, 'Content-Encoding': encoding, 'Content-Length': body.length,
  });
  res.end(body);
}
