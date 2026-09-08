/** Assemble distribution notices without modifying either upstream payload. */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { manifest, runtimeRoot, sha256 } from './python-supply.mjs';

const destination = join(runtimeRoot, 'licenses');
mkdirSync(destination, { recursive: true, mode: 0o700 });
const receipts = JSON.parse(readFileSync(join(runtimeRoot, 'evidence/upstream-receipts.json')));
const index = [];
for (const artifact of manifest.artifacts) {
  const full = receipts.find(row => row.filename.includes(`${artifact.triple}-pgo+lto-full`));
  const root = join(runtimeRoot, artifact.directory);
  const archive = join(runtimeRoot, 'evidence', full.filename);
  const expectedExe = readFileSync(join(root, artifact.executable));
  const originalExe = spawnSync('/usr/bin/tar', ['-xOf', archive, 'python/install/bin/python3.13'], { maxBuffer: 32 * 1024 * 1024 });
  if (originalExe.status !== 0 || sha256(originalExe.stdout) !== sha256(expectedExe)) throw new Error('full-install-only-binary-disagreement');
  const notices = [];
  for (const license of full.licenses) {
    if (!license.filename) continue;
    const bytes = readFileSync(join(runtimeRoot, 'evidence', license.filename));
    if (sha256(bytes) !== license.sha256) throw new Error('license-checksum-mismatch');
    writeFileSync(join(destination, license.filename), bytes);
    notices.push({ path: `licenses/${license.filename}`, sha256: license.sha256, source: `${full.url}#${license.archivePath}` });
  }
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const info = lstatSync(path);
      if (info.isDirectory()) walk(path);
      else if (info.isFile() && /licen[sc]e|copying|copyright/i.test(name)) {
        const bytes = readFileSync(path);
        notices.push({ path: `${artifact.directory}/${relative(root, path)}`, sha256: sha256(bytes), source: artifact.url });
      }
    }
  }
  walk(root);
  const metadata = JSON.parse(readFileSync(join(runtimeRoot, 'evidence', `${artifact.arch}-PYTHON.json`)));
  index.push({ arch: artifact.arch, archiveSha256: artifact.sha256, fullArchiveSha256: full.sha256,
    fullAndInstallOnlyExecutableIdentical: true,
    declaredLicenses: [...new Set([...metadata.licenses, ...Object.values(metadata.build_info.extensions).flat().flatMap(x => x.licenses || [])])],
    metadataException: full.licenses.filter(x => x.status), notices });
}
writeFileSync(join(destination, 'license-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify(index.map(x => ({ arch: x.arch, notices: x.notices.length, licenses: x.declaredLicenses, fullAndInstallOnlyExecutableIdentical: true })), null, 2));
