/**
 * Island bundle + capability catalog + manifest.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGACY_WORKFLOW_ROUTE_PREFIX, WORKFLOW_ROUTE_PREFIX } from '../../shared/api';
import type { GenerationGateway } from '../seam/gateway';
import type { RouteTry } from './dispatch';

/** Build artifacts addressed by `?v=<sha256[:16]>`; legacy prefix included for the alias mount. */
const BUILD_ARTIFACTS: Record<string, string> = {
  [`${WORKFLOW_ROUTE_PREFIX}/canvas.js`]: 'canvas.js',
  [`${LEGACY_WORKFLOW_ROUTE_PREFIX}/canvas.js`]: 'canvas.js',
  [`${WORKFLOW_ROUTE_PREFIX}/director.js`]: 'director.js',
  [`${LEGACY_WORKFLOW_ROUTE_PREFIX}/director.js`]: 'director.js',
};

export function createStaticRoutes(opts: {
  pluginRoot: string;
  gateway: GenerationGateway;
}): { tryBundle: RouteTry; tryCapabilities: RouteTry; bundleVersion: (path: string) => string | null } {
  const { pluginRoot, gateway } = opts;
  const capabilitiesPath = `${WORKFLOW_ROUTE_PREFIX}/api/capabilities`;
  const manifestPath = `${WORKFLOW_ROUTE_PREFIX}/api/manifest`;

  const artifactHashes = new Map<string, { hash: string; at: number }>();
  /** Build hash (sha256[:16]) of an artifact; cached briefly so manifest and bundle share one read. */
  function artifactHash(file: string): string {
    const now = Date.now();
    const cached = artifactHashes.get(file);
    if (cached && now - cached.at < 5_000) return cached.hash;
    const hash = existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) : 'missing';
    artifactHashes.set(file, { hash, at: now });
    return hash;
  }

  const tryBundle: RouteTry = (method, path) => {
    const artifact = BUILD_ARTIFACTS[path];
    if (method === 'GET' && artifact) {
      const file = join(pluginRoot, 'lib', artifact);
      if (!existsSync(file)) {
        if (artifact === 'canvas.js') {
          return { status: 404, body: { error: 'not-found', message: 'canvas bundle not built (run npm run build)' } };
        }
        return { status: 404, body: { error: 'director-not-built' } };
      }
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
      const canvasFile = join(pluginRoot, 'lib', 'canvas.js');
      const directorFile = join(pluginRoot, 'lib', 'director.js');
      const directorHash = existsSync(directorFile) ? artifactHash(directorFile) : null;
      return { status: 200, body: { canvasHash: artifactHash(canvasFile), directorHash, directorAbi: 1 } };
    }
    return null;
  };

  /**
   * Build hash of a `?v=`-versioned island bundle, or null for any other path
   * (or an unbuilt artifact). Shares the manifest's cached read.
   */
  function bundleVersion(path: string): string | null {
    const artifact = BUILD_ARTIFACTS[path];
    if (!artifact) return null;
    const hash = artifactHash(join(pluginRoot, 'lib', artifact));
    return hash === 'missing' ? null : hash;
  }

  const tryCapabilities: RouteTry = async (method, path) => {
    if (method === 'GET' && path === capabilitiesPath) {
      return { status: 200, body: await gateway.capabilities() };
    }
    return null;
  };

  return { tryBundle, tryCapabilities, bundleVersion };
}

export type StaticRoutes = ReturnType<typeof createStaticRoutes>;
