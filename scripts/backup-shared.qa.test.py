"""Independent #778 QA; all mutating calls use disposable roots and registry."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path('/Users/x/.agents/skills/agent-backup/scripts/backup.py')
spec = importlib.util.spec_from_file_location('shared_backup_qa', SCRIPT)
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class SharedBackupQA(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='backup-shared-qa-')
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name).resolve()
        self.root = self.base / 'project'
        self.root.mkdir()
        self.home = self.base / 'home'
        self.home.mkdir()
        env = patch.dict(os.environ, {
            'HOME': str(self.home),
            'AGENT_BACKUP_STATE_DIR': str(self.home / 'registry'),
            'PYTHONDONTWRITEBYTECODE': '1',
        })
        env.start()
        self.addCleanup(env.stop)
        (self.root / 'data.txt').write_bytes(b'independent QA fixture')

    def cli(self, *args, ok=True):
        result = subprocess.run(
            [sys.executable, '-B', str(SCRIPT), *args,
             '--root', str(self.root)],
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0 if ok else 1, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value['ok'], ok, value)
        return value

    def capture(self):
        return self.cli('capture', '--task', 'QA-778', '--reason',
                        'disposable fixture', 'data.txt')

    def rows(self):
        return self.cli('index')['backups']

    def directory(self, name):
        directory = self.root / b.STORE / name
        directory.mkdir(parents=True)
        return directory

    def tree(self, root):
        result = {}
        for path in sorted(root.rglob('*')):
            info = path.lstat()
            result[str(path.relative_to(root))] = (
                info.st_mode, info.st_mtime_ns,
                hashlib.sha256(path.read_bytes()).hexdigest()
                if path.is_file() else None,
            )
        return result

    def test_manifest_only_custom_directory_fails_closed(self):
        directory = self.directory('custom-manifest')
        (directory / 'manifest.json').write_text('{}')
        before = self.tree(directory)
        self.cli('register', ok=False)
        self.assertEqual(self.tree(directory), before)
        self.assertEqual(self.rows(), [])

    def test_payload_only_fifo_is_managed_without_blocking(self):
        directory = self.directory('custom-payload')
        os.mkfifo(directory / 'payload.zip')
        self.cli('register', ok=False)
        self.assertTrue((directory / 'payload.zip').exists())
        self.assertEqual(self.rows(), [])

    def test_generated_id_boundary_is_exact(self):
        for name in ('20260908T110759Z-a717f5040af9-extra',
                     '20260908T110759Z-A717F5040AF9',
                     'notes-20260908T110759Z-a717f5040af9'):
            self.directory(name)
        before = self.tree(self.root / b.STORE)
        result = self.cli('register')
        self.assertEqual(len(result['unmanaged']), 3)
        self.assertEqual(self.tree(self.root / b.STORE), before)
        exact = self.directory('20260909T110759Z-a717f5040af9')
        self.cli('register', ok=False)
        self.assertTrue(exact.is_dir())

    def test_index_only_absent_custom_batch_fails_closed(self):
        receipt = self.capture()
        with b.registry() as (db, _):
            db.execute('UPDATE backups SET batch=? WHERE root=?',
                       ('absent-custom', str(self.root)))
            db.commit()
        before = self.rows()
        self.cli('register', ok=False)
        after = {row['batch']: row for row in self.rows()}
        self.assertEqual(after['absent-custom'], before[0])
        self.assertEqual(set(after), {'absent-custom', receipt['batch']})
        self.assertTrue((Path(receipt['directory']) / 'payload.zip').is_file())

    def test_other_root_same_custom_id_is_not_managed_here(self):
        other = self.base / 'other'
        other.mkdir()
        (other / 'data.txt').write_bytes(b'other')
        receipt = b.capture(other, other, ['data.txt'], 'QA', 'fixture')
        with b.registry() as (db, _):
            b.index_batch(db, other, receipt['batch'])
            db.execute('UPDATE backups SET batch=? WHERE root=?',
                       ('shared-label', str(other)))
            db.commit()
        directory = self.directory('shared-label')
        (directory / 'notes').write_bytes(b'leave in place')
        before = self.tree(directory)
        rows = self.rows()
        result = self.cli('register')
        self.assertEqual(result['unmanaged'], ['shared-label'])
        self.assertEqual(result['indexed'], [])
        self.assertEqual(self.rows(), rows)
        self.assertEqual(self.tree(directory), before)

    def test_scalar_manifests_return_json_errors_without_index_writes(self):
        receipt = self.capture()
        manifest = Path(receipt['directory']) / 'manifest.json'
        rows = self.rows()
        for value in ('null', 'false', '7', '"text"', '[]'):
            with self.subTest(value=value):
                manifest.write_text(value)
                self.cli('register', ok=False)
                self.assertEqual(self.rows(), rows)

    def test_ready_fifo_payload_rejected_before_reindex(self):
        receipt = self.capture()
        archive = Path(receipt['directory']) / 'payload.zip'
        rows = self.rows()
        archive.unlink()
        os.mkfifo(archive)
        value = self.cli('register', ok=False)
        self.assertIn('not a regular payload', value['error'])
        self.assertEqual(self.rows(), rows)

    def test_missing_payload_adoption_does_not_create_policy(self):
        receipt = b.capture(self.root, self.root, ['data.txt'], 'QA', 'fixture')
        directory, manifest = b.load_batch(self.root, receipt['batch'])
        del manifest['retention']
        b.write_json(directory / 'manifest.json', manifest)
        (directory / 'payload.zip').unlink()
        before = (directory / 'manifest.json').read_bytes()
        self.cli('register', '--approval', 'test fixture adoption', ok=False)
        self.assertEqual((directory / 'manifest.json').read_bytes(), before)
        self.assertEqual(self.rows(), [])

    def test_partial_commit_survives_new_connection_and_stops_cleanup(self):
        broken = self.directory('zz-invalid')
        (broken / 'manifest.json').write_text('null')
        receipt = self.cli('capture', '--task', 'QA-778', '--reason',
                           'disposable fixture', 'data.txt', ok=False)
        self.assertTrue(receipt['backup_ok'])
        self.assertEqual(receipt['failed_phase'], 'registration')
        self.assertNotIn('cleanup', receipt)
        index = self.home / 'registry/index.sqlite3'
        with sqlite3.connect(f'{index.as_uri()}?mode=ro', uri=True) as db:
            rows = db.execute('SELECT batch, bytes FROM backups').fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], receipt['batch'])
        self.assertGreater(rows[0][1], 0)
        self.assertTrue((Path(receipt['directory']) / 'payload.zip').is_file())

    def test_nonready_receipts_and_deadlines_remain_unchanged(self):
        receipt = self.capture()
        directory, manifest = b.load_batch(self.root, receipt['batch'])
        (directory / 'payload.zip').unlink()
        for state in ('expiring', 'pruned'):
            with self.subTest(state=state):
                manifest['state'] = state
                b.write_json(directory / 'manifest.json', manifest)
                before = (directory / 'manifest.json').read_bytes()
                result = self.cli('register')
                self.assertEqual(result['indexed'], [receipt['batch']])
                row = self.rows()[0]
                self.assertEqual((row['state'], row['bytes']), (state, 0))
                self.assertEqual(row['expires_at'], receipt['retention']['expires_at'])
                self.assertEqual((directory / 'manifest.json').read_bytes(), before)

    def test_audit_loose_false_alarm_does_not_hide_bad_archive(self):
        receipt = self.capture()
        self.directory('ordinary-notes')
        result = b.audit(self.root, self.root, validate=True)
        self.assertFalse(result['ok'])
        self.assertEqual(len(result['batches']), 1)
        self.assertEqual([e['batch'] for e in result['errors']], ['ordinary-notes'])
        (Path(receipt['directory']) / 'payload.zip').write_bytes(b'corrupt')
        result = b.audit(self.root, self.root, validate=True)
        self.assertFalse(result['ok'])
        self.assertEqual(len(result['errors']), 2)
        self.assertEqual(result['batches'], [])

    def test_audit_is_not_index_reconciliation_but_register_is(self):
        receipt = self.capture()
        Path(receipt['directory']).rename(self.base / 'held-fixture')
        result = b.audit(self.root, self.root, validate=True)
        self.assertTrue(result['ok'])
        self.assertEqual(result['batches'], [])
        self.cli('register', ok=False)
        self.assertEqual(self.rows()[0]['batch'], receipt['batch'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
