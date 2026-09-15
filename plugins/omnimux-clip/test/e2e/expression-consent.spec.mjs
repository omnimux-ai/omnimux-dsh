import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture, repo } from './expression-consent/build.mjs';

const root = join(repo, '.agent-reports/clip-expression-consent');
await mkdir(root, { recursive: true });
const output = await mkdtemp(join(root, 'run-'));
let server;
try {
  await buildFixture(output);
  server = createServer(async (req, res) => {
    const file = req.url === '/' ? 'index.html' : req.url === '/fixture.js' ? 'fixture.js' : null;
    if (req.method !== 'GET' || !file) { res.writeHead(404); res.end(); return; }
    try {
      const payload = await readFile(join(output, 'dist', file));
      res.writeHead(200, {
        'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'",
      });
      res.end(payload);
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const options = { url: `http://127.0.0.1:${server.address().port}/`, output,
    duplicateJourney: join(dirname(fileURLToPath(import.meta.url)), 'expression-consent/duplicate-approval-journey.mjs'),
    deferClosure: process.env.CLIP_QA_DEFER_CLOSURE === '1',
    samples: join(output, 'samples'), spaceId: Number(process.env.CLIP_QA_SPACE_ID) || undefined };
  const journey = await readFile(join(dirname(fileURLToPath(import.meta.url)), 'expression-consent/browser-journey.mjs'), 'utf8');
  const result = await new Promise((resolve, reject) => {
    const child = execFile('ego-browser', ['nodejs'], {
      timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => error
      ? reject(Object.assign(error, { stdout, stderr }))
      : resolve({ stdout, stderr }));
    child.stdin.end(`const options = ${JSON.stringify(options)};\n${journey}`);
  });
  console.log(result.stdout);
  await writeFile(join(output, 'result.json'), JSON.stringify({ passed: true, output, browser: 'ego-browser', scope: 'native Clip import, graph editor and render/export-frame; no full host or video encoder' }, null, 2));
} catch (error) {
  await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, message: error.message, stdout: error.stdout, stderr: error.stderr }, null, 2));
  throw error;
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await rm(join(output, 'dist'), { recursive: true, force: true });
  await writeFile(join(output, 'server-closure.json'), JSON.stringify({ stopped: true }));
  console.log(`Evidence: ${output}`);
}
