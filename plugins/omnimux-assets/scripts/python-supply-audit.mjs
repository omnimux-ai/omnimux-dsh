/** Static audit only: never executes a downloaded Python binary. */
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { manifest, runtimeRoot, sha256, verifyBytes } from './python-supply.mjs';

function command(file, args, allowFailure = false) {
  const result = spawnSync(file, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
  if (result.error || (!allowFailure && result.status !== 0)) throw new Error(`${file}: ${result.error || result.stderr}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const reports = [];
for (const artifact of manifest.artifacts) {
  const root = join(runtimeRoot, artifact.directory);
  verifyBytes(readFileSync(join(runtimeRoot, 'archives', artifact.filename)), artifact.sha256, artifact.compressedBytes);
  const rows = [];
  const binaries = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const info = lstatSync(path);
      const row = { path: relative(root, path), mode: info.mode & 0o7777 };
      if (!info.isSymbolicLink() && (info.mode & 0o6022)) throw new Error(`unsafe-write-or-setid-mode: ${path}`);
      if (info.isSymbolicLink()) {
        row.link = readlinkSync(path);
        if (!realpathSync(path).startsWith(root + sep)) throw new Error(`escaping-symlink: ${path}`);
      } else if (info.isDirectory()) {
        walk(path);
      } else if (info.isFile()) {
        const bytes = readFileSync(path);
        row.bytes = bytes.length;
        row.sha256 = sha256(bytes);
        if (bytes.length >= 8 && bytes.readUInt32LE(0) === 0xfeedfacf) {
          const cpu = bytes.readUInt32LE(4);
          if (cpu !== (artifact.arch === 'arm64' ? 0x100000c : 0x1000007)) throw new Error(`cpu-mismatch: ${path}`);
          const loads = command('/usr/bin/otool', ['-l', path]).stdout;
          const linked = command('/usr/bin/otool', ['-L', path]).stdout;
          const dylibId = loads.match(/cmd LC_ID_DYLIB\s+cmdsize \d+\s+name (\S+)/)?.[1];
          const dependencies = linked.split('\n').slice(1).filter(Boolean).map(x => x.trim().split(' (')[0]).filter(x => x !== dylibId);
          const rpaths = [...loads.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (\S+)/g)].map(x => x[1]);
          const resolveToken = value => value.replace('@loader_path', dirname(path)).replace('@executable_path', join(root, 'python/bin'));
          for (const dep of dependencies) {
            if (dep.startsWith('/usr/lib/') || dep.startsWith('/System/Library/Frameworks/')) continue;
            const candidates = dep.startsWith('@rpath/') ? rpaths.map(p => resolve(resolveToken(p), dep.slice(7))) : [resolveToken(dep)];
            if (!candidates.some(p => resolve(p).startsWith(root + sep) && existsSync(p))) throw new Error(`unresolved-non-system-library: ${path}: ${dep}`);
          }
          binaries.push({ path: row.path, sha256: row.sha256, cpu, dependencies, rpaths,
            minimumMacOS: [...loads.matchAll(/(?:minos (\d+\.\d+(?:\.\d+)?)|cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version (\d+\.\d+(?:\.\d+)?))/g)].map(x => x[1] || x[2]),
            codeSignature: command('/usr/bin/codesign', ['--verify', '--strict', path], true),
            signatureDetails: command('/usr/bin/codesign', ['-dvv', path], true),
          });
        }
      } else throw new Error(`special-file: ${path}`);
      rows.push(row);
    }
  }
  walk(root);
  const inventory = { arch: artifact.arch, archiveSha256: artifact.sha256, entries: rows };
  writeFileSync(join(runtimeRoot, 'evidence', `${artifact.arch}-inventory.json`), JSON.stringify(inventory, null, 2) + '\n');
  const executable = join(root, artifact.executable);
  verifyBytes(readFileSync(executable), artifact.executableSha256);
  const report = { arch: artifact.arch, compressedBytes: artifact.compressedBytes, unpackedFileBytes: rows.reduce((n, row) => n + (row.bytes || 0), 0),
    entryCount: rows.length, executable, executableSha256: sha256(readFileSync(executable)), binaries,
    diskUsage: command('/usr/bin/du', ['-sk', root]).stdout,
    extendedAttributes: command('/usr/bin/xattr', ['-lr', root]),
    gatekeeper: command('/usr/sbin/spctl', ['--assess', '--type', 'execute', '-vv', executable], true),
  };
  reports.push(report);
  console.log(JSON.stringify({ arch: report.arch, compressedBytes: report.compressedBytes, unpackedFileBytes: report.unpackedFileBytes, entryCount: report.entryCount, executableSha256: report.executableSha256, binaries: binaries.length, gatekeeperStatus: report.gatekeeper.status }));
}
writeFileSync(join(runtimeRoot, 'evidence', 'static-audit.json'), JSON.stringify(reports, null, 2) + '\n');
