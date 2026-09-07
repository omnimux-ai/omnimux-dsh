import { createReadStream, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname } from 'node:path';
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

/** Stream workflow media and static files with MIME and Range support. */
export function serveFile(res: ServerResponse, filePath: string, fallbackMime: string, rangeHeader?: string): void {
  const mime = detectMimeFromFile(filePath, MIME_BY_EXT[extname(filePath)] ?? fallbackMime);
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
    'Content-Type': mime, 'Content-Length': stat.size,
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
  });
  const stream = createReadStream(filePath);
  stream.on('error', () => { res.destroy(); });
  stream.pipe(res);
}
