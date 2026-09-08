/** Retain pinned upstream sources and checksum-verified full-build metadata. */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { manifest, runtimeRoot, sha256, verifyBytes } from './python-supply.mjs';

const evidence = join(runtimeRoot, 'evidence');
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const sources = ['docs/distributions.rst', 'cpython-unix/targets.yml', 'pythonbuild/downloads.py', 'LICENSE'];
const receipts = [];
for (const source of sources) {
  const url = `https://raw.githubusercontent.com/astral-sh/python-build-standalone/${manifest.upstreamCommit}/${source}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`source-download-failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const filename = `upstream-${source.replaceAll('/', '-')}`;
  writeFileSync(join(evidence, filename), bytes);
  receipts.push({ url, filename, sha256: sha256(bytes), bytes: bytes.length });
}
const builds = [
  { arch: 'arm64', triple: 'aarch64-apple-darwin', size: 58558161, hash: '7e6d391f88b0d21cf8872761b37080a07f36d9be63187041a0aee4f5549282b0' },
  { arch: 'x64', triple: 'x86_64-apple-darwin', size: 57699566, hash: 'bd1512eca94f3ea941537d42b4569f4e3bba5d349eab1f85c7616242385ec9aa' },
];
for (const build of builds) {
  const filename = `cpython-${manifest.version}+${manifest.release}-${build.triple}-pgo+lto-full.tar.zst`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${manifest.release}/${encodeURIComponent(filename)}`;
  const path = join(evidence, filename);
  if (!existsSync(path)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
    if (!response.ok) throw new Error(`metadata-download-failed: ${response.status} ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyBytes(bytes, build.hash, build.size);
    writeFileSync(path, bytes, { flag: 'wx' });
  }
  verifyBytes(readFileSync(path), build.hash, build.size);
  const result = spawnSync('/usr/bin/tar', ['-xOf', path, 'python/PYTHON.json'], { maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`metadata-extraction-failed: ${result.error || result.stderr}`);
  const metadata = JSON.parse(result.stdout.toString());
  writeFileSync(join(evidence, `${build.arch}-PYTHON.json`), result.stdout);
  const licenses = [...new Set([metadata.license_path, ...Object.values(metadata.build_info.extensions).flat().flatMap(x => x.license_paths || x.license_path || [])])];
  const licenseReceipts = [];
  for (const name of licenses) {
    const extracted = spawnSync('/usr/bin/tar', ['-xOf', path, `python/${name}`], { maxBuffer: 4 * 1024 * 1024 });
    if (extracted.error || extracted.status !== 0) {
      const zlib = metadata.build_info.extensions.zlib;
      if (name === 'licenses/LICENSE.zlib-ng.txt' && zlib.every(x => x.links.every(link => link.name === 'z' && link.system === true))) {
        licenseReceipts.push({ archivePath: `python/${name}`, status: 'upstream-metadata-overdeclares-unbundled-zlib-ng', evidence: 'Darwin zlib links only system libz; checked separately by otool.' });
        continue;
      }
      throw new Error(`license-extraction-failed: ${name}`);
    }
    const local = `${build.arch}-${name.replaceAll('/', '-')}`;
    writeFileSync(join(evidence, local), extracted.stdout);
    licenseReceipts.push({ archivePath: `python/${name}`, filename: local, sha256: sha256(extracted.stdout) });
  }
  receipts.push({ url, filename, sha256: build.hash, bytes: build.size, licenses: licenseReceipts });
  console.log(JSON.stringify({ arch: build.arch, version: metadata.python_version, minimumMacOS: metadata.apple_sdk_deployment_target, licenses: metadata.licenses, licenseFiles: licenses }));
}
writeFileSync(join(evidence, 'upstream-receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
