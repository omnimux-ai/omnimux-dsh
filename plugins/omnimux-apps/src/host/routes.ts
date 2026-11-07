/**
 * plugins/omnimux-apps/src/host/routes.ts
 *
 * HTTP API Routes for omnimux-apps:
 * - GET /omnimux-apps/api/apps (list shipped built-in manifests)
 * - GET /omnimux-apps/api/apps/:appId (one manifest: user-published first, built-in fallback)
 * - POST /omnimux-apps/api/apps/manifest (persist a user-published manifest)
 * - POST /omnimux-apps/api/apps/:appId/executions (launch headless execution)
 * - GET /omnimux-apps/api/apps/:appId/executions/:executionId (poll status & outputs)
 * - POST /omnimux-apps/api/apps/:appId/executions/:executionId/cancel (cancel execution)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OmnimuxAppsService } from './index.ts';
import type { HeadlessExecutionSeam } from './executionBridge.ts';
import { BUILTIN_MANIFESTS } from '../shared/builtinCatalogData.ts';
import { isValidAppId } from './storage/appStorage.ts';

const PREFIX = '/omnimux-apps/api/apps';
const LIST_PATH = PREFIX;
/** `manifest` 是保存清单的保留路径，不能被单项 GET 当成 appId 吞掉。 */
const RESERVED_SEGMENTS = new Set(['manifest']);
const ITEM_PATH_RE = new RegExp(`^${PREFIX}/([^/]+)$`);
const EXECUTION_POST_RE = new RegExp(`^${PREFIX}/([^/]+)/executions$`);
const EXECUTION_ITEM_RE = new RegExp(`^${PREFIX}/([^/]+)/executions/([^/]+)$`);
const EXECUTION_CANCEL_RE = new RegExp(`^${PREFIX}/([^/]+)/executions/([^/]+)/cancel$`);

/**
 * 读取随包内置清单。返回 null 表示**读不到**（内联清单缺失且文件也读不出来），
 * 与「读到了但清单为空」是两种不同的结果——调用方据此回 503 而不是伪装成空清单。
 */
function loadBuiltinApps(): any[] | null {
  if (Array.isArray(BUILTIN_MANIFESTS) && BUILTIN_MANIFESTS.length > 0) {
    return BUILTIN_MANIFESTS as any[];
  }

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.resolve(currentDir, '../catalog/builtin-apps.json'),
      path.resolve(currentDir, '../../catalog/builtin-apps.json'),
      path.resolve(currentDir, '../../../catalog/builtin-apps.json'),
      path.resolve(process.cwd(), 'plugins/omnimux-apps/catalog/builtin-apps.json'),
      path.resolve(process.cwd(), 'catalog/builtin-apps.json'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  return null;
}

/** 路径段解码：非法百分号编码返回 null，由调用方回 400 而不是抛 URIError。 */
function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

const MAX_BODY_BYTES = 1024 * 1024;

export function createAppsRoutes(deps: {
  service: OmnimuxAppsService;
  getHeadlessSeam: () => HeadlessExecutionSeam | null;
  getModelCatalog?: () => any;
  /** 可注入的内置清单读取（测试据此覆盖「读不到」分支）；默认读随包清单。 */
  loadBuiltinApps?: () => any[] | null;
  /** Host connection auth; production apply wires this so browser requests are authenticated. */
  getConnection?: () => { requestRejection?: (req: any) => number | undefined } | undefined;
}) {
  const { service, getHeadlessSeam, getModelCatalog } = deps;
  const readBuiltinApps = deps.loadBuiltinApps ?? loadBuiltinApps;

  return {
    async handle(req: any, res: any): Promise<boolean> {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (!pathname.startsWith(PREFIX)) return false;

      const method = (req.method || 'GET').toUpperCase();

      const sendJson = (status: number, body: unknown) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(body));
      };

      const readBody = async (): Promise<any> => {
        if (req.body && typeof req.body === 'object') return req.body;
        return new Promise((resolve) => {
          const chunks: Buffer[] = [];
          let size = 0;
          let tooLarge = false;
          req.on('data', (chunk: Buffer) => {
            if (tooLarge) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              tooLarge = true;
              chunks.length = 0;
              return;
            }
            chunks.push(chunk);
          });
          req.on('end', () => {
            if (tooLarge) {
              resolve(undefined);
              return;
            }
            try {
              const str = Buffer.concat(chunks).toString('utf-8');
              resolve(str ? JSON.parse(str) : {});
            } catch {
              resolve({});
            }
          });
          req.on('error', () => resolve({}));
        });
      };

      const connection = typeof deps.getConnection === 'function' ? deps.getConnection() : undefined;
      if (typeof deps.getConnection === 'function') {
        if (!connection || typeof connection.requestRejection !== 'function') {
          sendJson(503, { error: 'auth-unavailable', message: 'Host connection authentication is unavailable' });
          return true;
        }
        const rejection = connection.requestRejection(req);
        if (rejection !== undefined) {
          sendJson(rejection, { error: 'request-denied', message: 'Request not authorized' });
          return true;
        }
      }

      // 0. GET /omnimux-apps/api/apps (官方内置应用清单；只读，不含用户已发布记录)
      //    读不到清单回 503，绝不伪装成「成功但零个应用」——那是把故障说成空数据。
      if (pathname === LIST_PATH) {
        if (method !== 'GET') {
          res.setHeader?.('Allow', 'GET');
          sendJson(405, { error: 'method_not_allowed', message: '清单接口只支持 GET' });
          return true;
        }
        const apps = readBuiltinApps();
        if (!apps) {
          sendJson(503, { error: 'builtin_apps_unavailable', message: '官方内置应用清单不可用' });
          return true;
        }
        sendJson(200, { apps });
        return true;
      }

      // 0b. GET /omnimux-apps/api/apps/:appId（单个 manifest：用户已发布优先，内置兜底）
      const manifestMatch = ITEM_PATH_RE.exec(pathname);
      if (manifestMatch && method === 'GET') {
        const appId = decodeSegment(manifestMatch[1] || '');
        if (appId === null) {
          sendJson(400, { error: 'invalid_app_id', message: 'appId 编码非法' });
          return true;
        }
        // 保留段必须按**解码后**的值判定：`%6Danifest` 解码后同样是 manifest，
        // 按原始编码比对会漏过去，让保存路径的 GET 语义与 `/apps/manifest` 分叉。
        if (RESERVED_SEGMENTS.has(appId)) return false;
        // appId 是目录名：解码出的 `/`、`..` 必须在这里就被拒，不能交给 path.join。
        if (!isValidAppId(appId)) {
          sendJson(400, { error: 'invalid_app_id', message: 'appId 非法' });
          return true;
        }
        let stored: any = null;
        let storedError: any = null;
        try {
          stored = await service.getManifest(appId);
        } catch (err: any) {
          storedError = err;
        }
        // 存储读错时不能静默回落到出厂版本：用户覆盖发布过的应用会无声变回官方原版，
        // 用户看不到「你的版本读失败了」。回 500 让调用方给出真实错误。
        // 错误详情不外泄给浏览器（可能含绝对路径），只回稳定错误码。
        if (storedError) {
          sendJson(500, { error: 'manifest_read_failed', message: '读取应用清单失败' });
          return true;
        }
        const manifest = stored || readBuiltinApps()?.find((a) => a?.appId === appId) || null;
        if (!manifest) {
          sendJson(404, { error: 'app_not_found', message: `应用 ${appId} 未找到` });
          return true;
        }
        sendJson(200, { app: manifest });
        return true;
      }

      // 1. POST /omnimux-apps/api/apps/manifest (保存应用清单至用户磁盘目录，实现物理隔离)
      if (pathname === `${PREFIX}/manifest` && method === 'POST') {
        const body = await readBody();
        if (body === undefined) {
          sendJson(413, { error: 'body_too_large', message: `应用清单不能超过 ${MAX_BODY_BYTES} 字节` });
          return true;
        }
        if (!body || typeof body !== 'object' || !body.appId) {
          sendJson(400, { error: 'invalid_manifest', message: 'appId is required' });
          return true;
        }
        try {
          const res = await service.saveManifest(body);
          sendJson(200, { success: true, filePath: res.filePath, appId: body.appId });
        } catch (err: any) {
          const code = err?.code === 'version_conflict' ? 409 : (err?.code === 'invalid_manifest' ? 400 : 500);
          // 对外只给稳定文案：底层错误可能含本机绝对路径（评审 N5 实测会漏出去）。
          const message = err?.code === 'version_conflict'
            ? '该应用版本已存在且不可覆盖'
            : (err?.code === 'invalid_manifest' ? '应用清单校验失败' : '保存应用清单失败');
          sendJson(code, { error: err?.code || 'save_failed', message });
        }
        return true;
      }

      // 1. POST /omnimux-apps/api/apps/:appId/executions
      const postMatch = EXECUTION_POST_RE.exec(pathname);
      if (postMatch && method === 'POST') {
        const appId = decodeSegment(postMatch[1] || '');
        if (appId === null || !isValidAppId(appId)) {
          sendJson(400, { error: 'invalid_app_id', message: 'appId 非法' });
          return true;
        }
        const body = await readBody();
        if (body === undefined) {
          sendJson(413, { error: 'body_too_large', message: `执行请求不能超过 ${MAX_BODY_BYTES} 字节` });
          return true;
        }
        const payload = body && typeof body === 'object' ? body : {};
        const inputs = payload.inputs || {};

        // 存储层现在会对损坏的索引抛 io_error；这里必须接住并回稳定错误码，
        // 否则异常会穿过路由变成连接级失败（评审 N2 实测：从 404 JSON 退化成空响应）。
        let manifest: any = null;
        try {
          manifest = await service.getManifest(appId, payload.version);
        } catch (err: any) {
          if (err?.code === 'io_error' || err?.code === 'invalid_manifest') {
            sendJson(500, { error: 'manifest_read_failed', message: '读取应用清单失败' });
            return true;
          }
          throw err;
        }
        if (!manifest) {
          const builtins = readBuiltinApps() ?? [];
          manifest = builtins.find((a) => a.appId === appId) || null;
        }
        if (!manifest && payload.manifest && payload.manifest.appId === appId) {
          const validation = typeof service.validateManifest === 'function'
            ? service.validateManifest(payload.manifest)
            : null;
          if (validation && validation.valid !== true) {
            sendJson(400, { error: 'invalid_manifest', message: '内联应用清单校验失败' });
            return true;
          }
          manifest = payload.manifest;
        }

        if (!manifest) {
          sendJson(404, {
            error: 'app_not_found',
            message: `应用 ${appId} 未找到`,
          });
          return true;
        }

        const headlessSeam = getHeadlessSeam();
        if (!headlessSeam) {
          sendJson(503, {
            error: 'seam_unavailable',
            message: '后台工作流执行通道尚未就绪',
          });
          return true;
        }

        try {
          const modelCatalog =
            body.modelCatalog ??
            (typeof getModelCatalog === 'function' ? getModelCatalog() : undefined);
          const result = await service.executeApp(manifest, inputs, headlessSeam, { modelCatalog });
          sendJson(200, result);
        } catch (err: any) {
          sendJson(500, {
            error: 'execution_failed',
            message: err?.message || '任务启动失败',
          });
        }
        return true;
      }

      // 2. POST /omnimux-apps/api/apps/:appId/executions/:executionId/cancel
      const cancelMatch = EXECUTION_CANCEL_RE.exec(pathname);
      if (cancelMatch && method === 'POST') {
        const executionId = decodeSegment(cancelMatch[2] || '');
        if (executionId === null) {
          sendJson(400, { error: 'invalid_execution_id', message: 'executionId 编码非法' });
          return true;
        }
        const headlessSeam = getHeadlessSeam();
        if (!headlessSeam) {
          sendJson(503, { error: 'seam_unavailable', message: '后台工作流执行通道尚未就绪' });
          return true;
        }
        try {
          const result = await service.cancelJob(executionId, headlessSeam);
          sendJson(200, result);
        } catch (err: any) {
          sendJson(500, { error: 'cancel_failed', message: err?.message || '取消任务失败' });
        }
        return true;
      }

      // 3. GET /omnimux-apps/api/apps/:appId/executions/:executionId
      const itemMatch = EXECUTION_ITEM_RE.exec(pathname);
      if (itemMatch && method === 'GET') {
        const executionId = decodeSegment(itemMatch[2] || '');
        if (executionId === null) {
          sendJson(400, { error: 'invalid_execution_id', message: 'executionId 编码非法' });
          return true;
        }
        const headlessSeam = getHeadlessSeam();
        if (!headlessSeam) {
          sendJson(503, { error: 'seam_unavailable', message: '后台工作流执行通道尚未就绪' });
          return true;
        }
        try {
          const jobStatus = await service.getJobStatus(executionId, headlessSeam);
          if (!jobStatus) {
            sendJson(404, { error: 'execution_not_found', message: `未找到执行记录 ${executionId}` });
            return true;
          }
          sendJson(200, jobStatus);
        } catch (err: any) {
          sendJson(500, { error: 'query_failed', message: err?.message || '查询任务状态失败' });
        }
        return true;
      }

      return false;
    },
  };
}

export function registerAppsApiRoutes(
  webServer: any,
  deps: {
    service: OmnimuxAppsService;
    getHeadlessSeam: () => HeadlessExecutionSeam | null;
    getModelCatalog?: () => any;
    getConnection?: () => { requestRejection?: (req: any) => number | undefined } | undefined;
  },
): () => void {
  if (!webServer || typeof webServer.register !== 'function') {
    return () => {};
  }
  const router = createAppsRoutes(deps);
  return webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req: any, res: any) {
      const handled = await router.handle(req, res);
      if (!handled && !res.writableEnded) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found', message: 'Not Found' }));
      }
    },
  });
}
