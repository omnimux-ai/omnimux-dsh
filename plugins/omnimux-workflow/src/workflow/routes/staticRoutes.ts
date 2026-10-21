/**
 * Island bundle + capability catalog + manifest.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api';
import type { GenerationGateway } from '../seam/gateway';
import type { RouteTry } from './dispatch';

export function createStaticRoutes(opts: {
  pluginRoot: string;
  gateway: GenerationGateway;
}): { tryBundle: RouteTry; tryCapabilities: RouteTry } {
  const { pluginRoot, gateway } = opts;
  const capabilitiesPath = `${WORKFLOW_ROUTE_PREFIX}/api/capabilities`;
  const manifestPath = `${WORKFLOW_ROUTE_PREFIX}/api/manifest`;
  const canvasJsPath = `${WORKFLOW_ROUTE_PREFIX}/canvas.js`;

  let cachedCanvasHash: { hash: string; at: number } | null = null;
  function canvasJsHash(): string {
    const now = Date.now();
    if (cachedCanvasHash && now - cachedCanvasHash.at < 5_000) return cachedCanvasHash.hash;
    const file = join(pluginRoot, 'lib', 'canvas.js');
    let hash = 'missing';
    if (existsSync(file)) {
      hash = createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex').slice(0, 16);
    }
    cachedCanvasHash = { hash, at: now };
    return hash;
  }

  const tryBundle: RouteTry = (method, path) => {
    if (method === 'GET' && path === canvasJsPath) {
      const file = join(pluginRoot, 'lib', 'canvas.js');
      if (!existsSync(file)) {
        return { status: 404, body: { error: 'not-found', message: 'canvas bundle not built (run npm run build)' } };
      }
      return { status: 200, file };
    }
    if (method === 'GET' && path === `${WORKFLOW_ROUTE_PREFIX}/director.js`) {
      const file = join(pluginRoot, 'lib', 'director.js');
      if (!existsSync(file)) return { status: 404, body: { error: 'director-not-built' } };
      return { status: 200, file };
    }
    const assetName = path.startsWith(`${WORKFLOW_ROUTE_PREFIX}/director-assets/`)
      ? path.slice(`${WORKFLOW_ROUTE_PREFIX}/director-assets/`.length) : '';
    const directorAssets = ['quaternius-standard-male.glb', 'quaternius-standard-female.glb', 'quaternius-standard-male.LICENSE.md', 'quaternius-standard-female.LICENSE.md'];
    if (method === 'GET' && directorAssets.includes(assetName)) {
      const file = join(pluginRoot, 'assets', 'director', 'models', assetName);
      if (!existsSync(file)) return { status: 404, body: { error: 'director-asset-not-found' } };
      return { status: 200, file };
    }
    if (method === 'GET' && path.startsWith(`${WORKFLOW_ROUTE_PREFIX}/director-assets/licenses/`)) {
      const licenseName = path.slice(`${WORKFLOW_ROUTE_PREFIX}/director-assets/licenses/`.length);
      const licenses = new Set(['fix-webm-duration-MIT.txt', 'react-three-fiber-MIT.txt', 'cc0-1.0-legalcode.txt']);
      if (!licenses.has(licenseName)) return { status: 404, body: { error: 'director-asset-not-found' } };
      const file = join(pluginRoot, 'assets', 'director', 'licenses', licenseName);
      if (!existsSync(file)) return { status: 404, body: { error: 'director-asset-not-found' } };
      return { status: 200, file };
    }
    if (method === 'GET' && path === manifestPath) {
      const directorFile = join(pluginRoot, 'lib', 'director.js');
      const directorHash = existsSync(directorFile) ? createHash('sha256').update(readFileSync(directorFile)).digest('hex').slice(0, 16) : null;
      return { status: 200, body: { canvasHash: canvasJsHash(), directorHash, directorAbi: 1 } };
    }
    return null;
  };

  const tryCapabilities: RouteTry = async (method, path) => {
    if (method === 'GET' && path === capabilitiesPath) {
      return { status: 200, body: await gateway.capabilities() };
    }
    return null;
  };

  return { tryBundle, tryCapabilities };
}

export type StaticRoutes = ReturnType<typeof createStaticRoutes>;
