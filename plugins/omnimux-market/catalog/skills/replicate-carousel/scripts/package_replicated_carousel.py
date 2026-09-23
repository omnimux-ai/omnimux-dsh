#!/usr/bin/env python3
import argparse
import json
import shutil
import sys
import zipfile
from pathlib import Path

ALLOWED = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

def fail(message):
    print(f'ERROR: {message}', file=sys.stderr)
    raise SystemExit(2)

def main():
    parser = argparse.ArgumentParser(description='Normalize and package approved replicated carousel pages.')
    parser.add_argument('--manifest', required=True, help='JSON list: [{"source":"...","slug":"..."}]')
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--zip', required=True, dest='zip_path')
    args = parser.parse_args()
    manifest = Path(args.manifest)
    out = Path(args.output_dir)
    zip_path = Path(args.zip_path)
    if not manifest.is_file():
        fail('manifest not found')
    try:
        rows = json.loads(manifest.read_text(encoding='utf-8'))
    except Exception as exc:
        fail(f'invalid manifest: {exc}')
    if not isinstance(rows, list) or not rows:
        fail('manifest must be a non-empty list')
    out.mkdir(parents=True, exist_ok=True)
    names, sources = [], []
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict) or not row.get('source') or not row.get('slug'):
            fail(f'manifest item {index} needs source and slug')
        source = Path(row['source'])
        if not source.is_file():
            fail(f'source missing: {source.name}')
        ext = source.suffix.lower()
        if ext not in ALLOWED:
            fail(f'unsupported image extension: {ext}')
        raw_slug = str(row['slug']).lower()
        if not raw_slug.isascii():
            fail(f'non-ASCII slug at item {index}: use lowercase English')
        slug = ''.join(char if (char.isalnum() or char == '-') else '-' for char in raw_slug).strip('-')
        if not slug:
            fail(f'empty slug at item {index}')
        name = f'{index:02d}_{slug}{ext}'
        if name in names:
            fail(f'duplicate output name: {name}')
        names.append(name)
        sources.append(source)
    for name, source in zip(names, sources):
        shutil.copy2(source, out / name)
    actual = sorted(path.name for path in out.iterdir() if path.is_file())
    if actual != sorted(names):
        fail('output directory contains unexpected files')
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            archive.write(out / name, arcname=name)
    with zipfile.ZipFile(zip_path) as archive:
        if archive.namelist() != names:
            fail('ZIP entries do not match manifest order')
        for name in names:
            if archive.getinfo(name).file_size <= 0:
                fail(f'empty ZIP entry: {name}')
    print(json.dumps({'count': len(names), 'files': names, 'zip': zip_path.name}, ensure_ascii=False))

if __name__ == '__main__':
    main()

