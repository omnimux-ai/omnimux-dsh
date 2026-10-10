import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fixtureModel = 'synthetic-avatar-image-3280';
export function catalogScene(scene) {
  assert.ok(['A', 'B'].includes(scene), 'Scene must be A or B');
  return {
    defaults: { image: fixtureModel },
    image: [{
      id: fixtureModel,
      label: '角色验收图像',
      family: 'openai',
      parameters: {},
      channelGroups: [
        { id: 'disabled-default-3280', label: '停用默认渠道', wireGroup: 'disabled-wire-3280', default: true, enabled: false, pricing: { pointsEstimate: 11 }, constraints: { image: { maxCount: 1 } } },
        { id: 'enabled-group-3280', label: '验收可用渠道', wireGroup: 'enabled-wire-3280', default: false, enabled: scene === 'A', pricing: { pointsEstimate: 12 }, constraints: { image: { maxCount: 1 } } },
      ],
    }],
    video: [],
    text: [],
  };
}

/** Task-local HTTP/WS transport; never overrides browser fetch or production code. */
export async function startAvatarProxy({ origin, record = () => {} }) {
  const target = new URL(origin);
  assert.equal(target.protocol, 'http:');
  assert.equal(target.hostname, '127.0.0.1');
  const sockets = new Set(), upstreamRequests = new Set();
  const submissions = [], blocked = [], catalogResponses = [];
  let scene = 'A', proxyOrigin;
  const headersToHost = request => {
    const headers = { ...request.headers, host: target.host };
    const localOrigin = proxyOrigin?.replace('127.0.0.1', 'localhost');
    if (headers.origin === proxyOrigin || headers.origin === localOrigin) headers.origin = target.origin;
    for (const alias of [proxyOrigin, localOrigin]) if (alias && headers.referer?.startsWith(alias + '/')) headers.referer = target.origin + headers.referer.slice(alias.length);
    return headers;
  };
  const mapHeaders = headers => {
    const mapped = { ...headers };
    if (typeof mapped.location === 'string' && mapped.location.startsWith(target.origin + '/')) mapped.location = proxyOrigin + mapped.location.slice(target.origin.length);
    return mapped;
  };
  const send = (response, status, body) => {
    const bytes = Buffer.from(JSON.stringify(body));
    response.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length, 'cache-control': 'no-store' });
    response.end(bytes);
  };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, proxyOrigin).pathname;
    if (request.method === 'GET' && request.url === '/omnimux/model-catalog') {
      const body = catalogScene(scene), entry = { scene, pathname, sha256: sha256(JSON.stringify(body)), body };
      catalogResponses.push(entry); record('catalog', entry); send(response, 200, body); return;
    }
    if (request.method === 'POST' && pathname === '/api/omnimux/avatar/sheet') {
      try {
        let length = 0; const parts = [];
        for await (const part of request) { length += part.length; if (length > 1048576) throw new Error('Payload too large'); parts.push(part); }
        const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
        const entry = { scene, pathname, body, supplierCalled: false };
        submissions.push(entry); record('sheet', entry);
        send(response, 200, { success: false, error: '合成验收：未调用供应商' });
      } catch { send(response, 400, { success: false, error: '合成验收：请求不是合法 JSON 或超限' }); }
      return;
    }
    if (request.method === 'POST' && (pathname === '/api/omnimux/avatar/multiview' || pathname === '/multiview' || /^\/(?:api\/)?omnimux\/media/.test(pathname) || /^\/(?:api\/)?(?:omnimux\/)?tools(?:\/|$)/.test(pathname))) {
      const entry = { pathname, method: request.method, supplierCalled: false }; blocked.push(entry); record('blocked', entry);
      request.resume(); send(response, 403, { success: false, error: '合成验收：禁止其他生成请求' }); return;
    }
    record('pass', { method: request.method, pathname });
    const upstream = httpRequest(new URL(request.url, target), { method: request.method, headers: headersToHost(request), timeout: 30000 }, incoming => {
      response.writeHead(incoming.statusCode, mapHeaders(incoming.headers)); incoming.pipe(response);
    });
    upstreamRequests.add(upstream); upstream.once('close', () => upstreamRequests.delete(upstream));
    upstream.on('timeout', () => upstream.destroy(new Error('Upstream timeout')));
    upstream.on('error', () => { if (!response.headersSent) send(response, 502, { error: 'Task proxy upstream unavailable' }); else response.destroy(); });
    request.on('aborted', () => upstream.destroy()); request.pipe(upstream);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, proxyOrigin).pathname;
    const upstream = httpRequest(new URL(request.url, target), { headers: headersToHost(request), timeout: 30000 });
    upstreamRequests.add(upstream); upstream.once('close', () => upstreamRequests.delete(upstream));
    upstream.on('upgrade', (incoming, upstreamSocket, upstreamHead) => {
      sockets.add(upstreamSocket); upstreamSocket.once('close', () => sockets.delete(upstreamSocket));
      record('upgrade', { pathname, status: incoming.statusCode });
      const headers = mapHeaders(incoming.headers);
      socket.write(`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\n` + Object.entries(headers).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(item => `${key}: ${item}\r\n`)).join('') + '\r\n');
      if (head.length) upstreamSocket.write(head); if (upstreamHead.length) socket.write(upstreamHead);
      upstreamSocket.on('error', () => socket.destroy()); socket.on('error', () => upstreamSocket.destroy());
      socket.once('close', () => upstreamSocket.destroy()); upstreamSocket.once('close', () => socket.destroy());
      socket.pipe(upstreamSocket).pipe(socket);
    });
    upstream.on('response', incoming => { record('upgrade-rejected', { pathname, status: incoming.statusCode }); incoming.resume(); socket.destroy(); });
    upstream.on('timeout', () => upstream.destroy()); upstream.on('error', () => socket.destroy()); upstream.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  proxyOrigin = `http://127.0.0.1:${server.address().port}`;
  let closePromise;
  return {
    origin: proxyOrigin,
    submissions,
    blocked,
    catalogResponses,
    setScene(value) { catalogScene(value); scene = value; record('scene', { scene }); },
    mapLoginUrl(loginUrl) { const url = new URL(loginUrl); assert.equal(url.origin, target.origin); return proxyOrigin + url.pathname + url.search + url.hash; },
    cleanup() {
      return closePromise ??= (async () => {
        for (const upstream of upstreamRequests) upstream.destroy();
        const closedSockets = [...sockets].map(socket => new Promise(resolve => {
          if (socket.closed) { sockets.delete(socket); resolve(); }
          else { socket.once('close', resolve); socket.destroy(); }
        }));
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await Promise.all(closedSockets);
        return { closed: !server.listening, sockets: sockets.size };
      })();
    },
  };
}
