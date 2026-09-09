#!/usr/bin/env python3
"""Bounded, non-executing archive inspection and cooperative profile locks."""
import fcntl
import gzip
import hashlib
import contextlib
import re
import tempfile
import json
import os
import pathlib
import stat
import subprocess
import sys
import tarfile
import unicodedata

LIMITS = {"compressed": 128 << 20, "decoded": 544 << 20,
          "payload": 512 << 20, "file": 128 << 20,
          "members": 10000, "path": 1024, "depth": 32, "json": 1 << 20}


def strict_json(raw: bytes) -> object:
    """Decode unambiguous UTF-8 JSON, including nested objects."""
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    def constant(value):
        raise ValueError("non-finite JSON value")

    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                      parse_constant=constant)


def safe_path(path: str, missing: bool = False) -> pathlib.Path:
    """Require absolute, canonical, non-symlink ancestors."""
    value = pathlib.Path(path)
    if not value.is_absolute() or any(p in ("", ".", "..") for p in path.split("/")[1:]):
        raise ValueError("non-canonical path")
    current = pathlib.Path(value.anchor)
    for part in value.parts[1:]:
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            if missing:
                continue
            raise
        if stat.S_ISLNK(info.st_mode):
            raise ValueError("symlink ancestor")
    return value


def identity(info: os.stat_result) -> list:
    return [str(v) for v in (info.st_dev, info.st_ino, info.st_size,
                            info.st_mtime_ns, info.st_ctime_ns)]


class DirectoryAnchor:
    """Hold every ancestor descriptor and verify its name binding."""

    def __init__(self, path: str):
        safe_path(path)
        self.fds = [os.open('/', os.O_RDONLY | os.O_DIRECTORY)]
        self.bindings = []
        try:
            for part in pathlib.Path(path).parts[1:]:
                parent = self.fds[-1]
                fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                             dir_fd=parent)
                self.fds.append(fd)
                self.bindings.append((parent, part, fd))
            self.fd = self.fds[-1]
            self.verify()
        except BaseException:
            self.close()
            raise

    def verify(self) -> None:
        for parent, name, fd in self.bindings:
            actual = os.stat(name, dir_fd=parent, follow_symlinks=False)
            held = os.fstat(fd)
            if (actual.st_dev, actual.st_ino) != (held.st_dev, held.st_ino) or not stat.S_ISDIR(actual.st_mode):
                raise ValueError('ancestor binding drift')

    def close(self) -> None:
        for fd in reversed(self.fds):
            os.close(fd)
        self.fds = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def preparation_checkpoint(stage: str) -> None:
    """In-process deterministic test seam; not selectable through JSON or env."""


@contextlib.contextmanager
def child_anchor(parent: DirectoryAnchor, name: str, create: bool = False):
    """Extend a held ancestor chain without reopening an absolute path."""
    if name in ('', '.', '..') or '/' in name:
        raise ValueError('invalid directory component')
    parent.verify()
    if create:
        try:
            os.mkdir(name, 0o700, dir_fd=parent.fd)
            os.fsync(parent.fd)
        except FileExistsError:
            pass
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent.fd)
    child = DirectoryAnchor.__new__(DirectoryAnchor)
    child.fd = fd
    child.fds = [fd]
    child.bindings = parent.bindings + [(parent.fd, name, fd)]
    try:
        child.verify()
        yield child
        child.verify()
    finally:
        child.close()


def verify_leaf(parent: DirectoryAnchor, name: str, expected: list) -> None:
    parent.verify()
    if identity(os.stat(name, dir_fd=parent.fd, follow_symlinks=False)) != expected:
        raise ValueError('preparation leaf binding drift')


def copy_entry(source: DirectoryAnchor, name: str, target: DirectoryAnchor, destination: str) -> None:
    """Copy ordinary bytes/modes while holding both complete ancestor chains."""
    source.verify()
    target.verify()
    before = os.stat(name, dir_fd=source.fd, follow_symlinks=False)
    if stat.S_ISDIR(before.st_mode):
        with child_anchor(source, name) as a:
            os.mkdir(destination, 0o700, dir_fd=target.fd)
            with child_anchor(target, destination) as b:
                inventory = sorted(os.listdir(a.fd))
                preparation_checkpoint('copy-directory')
                a.verify()
                b.verify()
                for member in inventory:
                    copy_entry(a, member, b, member)
                if inventory != sorted(os.listdir(a.fd)):
                    raise ValueError('source inventory drift')
                os.fchmod(b.fd, stat.S_IMODE(before.st_mode))
                os.fsync(b.fd)
        verify_leaf(source, name, identity(before))
    elif stat.S_ISREG(before.st_mode):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source.fd)
        with os.fdopen(fd, 'rb') as stream:
            if identity(os.fstat(fd)) != identity(before):
                raise ValueError('source file binding drift')
            output = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=target.fd)
            with os.fdopen(output, 'wb') as writer:
                preparation_checkpoint('copy-file')
                source.verify()
                target.verify()
                length = 0
                while chunk := stream.read(65536):
                    length += len(chunk)
                    if length > before.st_size:
                        raise ValueError('source grew during preparation')
                    writer.write(chunk)
                if length != before.st_size:
                    raise ValueError('source truncated during preparation')
                writer.flush()
                os.fchmod(output, stat.S_IMODE(before.st_mode))
                os.fsync(output)
                copied = identity(os.fstat(output))
            verify_leaf(source, name, identity(before))
            if identity(os.fstat(fd)) != identity(before):
                raise ValueError('source content drift')
            verify_leaf(target, destination, copied)
    else:
        raise ValueError('non-ordinary preparation source')
    os.fsync(target.fd)
    source.verify()
    target.verify()


def sync_anchor(anchor: DirectoryAnchor) -> None:
    """Fsync a complete tree without following installation symlinks."""
    anchor.verify()
    inventory = sorted(os.listdir(anchor.fd))
    for name in inventory:
        before = os.stat(name, dir_fd=anchor.fd, follow_symlinks=False)
        if stat.S_ISDIR(before.st_mode):
            with child_anchor(anchor, name) as child:
                preparation_checkpoint('sync-directory')
                sync_anchor(child)
        elif stat.S_ISREG(before.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=anchor.fd)
            try:
                if identity(os.fstat(fd)) != identity(before):
                    raise ValueError('sync leaf binding drift')
                os.fsync(fd)
            finally:
                os.close(fd)
        elif not stat.S_ISLNK(before.st_mode):
            raise ValueError('special preparation entry')
        verify_leaf(anchor, name, identity(before))
    if inventory != sorted(os.listdir(anchor.fd)):
        raise ValueError('sync inventory drift')
    os.fsync(anchor.fd)
    anchor.verify()


def prepare_files(request: dict) -> dict:
    """Internal anchored candidate copy, write, directory, sync and identity seam."""
    operation = request['operation']
    if operation == 'batch':
        with DirectoryAnchor(request['root']) as anchor:
            for item in request['operations']:
                anchor.verify()
                prepare_files(item)
                anchor.verify()
    elif operation == 'copy':
        source = pathlib.Path(request['source'])
        destination = pathlib.Path(request['destination'])
        safe_path(str(source))
        safe_path(str(destination), missing=True)
        with DirectoryAnchor(str(source.parent)) as a, DirectoryAnchor(str(destination.parent)) as b:
            preparation_checkpoint('opened')
            a.verify()
            b.verify()
            copy_entry(a, source.name, b, destination.name)
    elif operation == 'mkdir':
        target = safe_path(request['path'], missing=True)
        missing = []
        while not target.exists():
            missing.insert(0, target.name)
            target = target.parent
        with contextlib.ExitStack() as stack:
            anchor = stack.enter_context(DirectoryAnchor(str(target)))
            preparation_checkpoint('opened')
            anchor.verify()
            for name in missing:
                anchor = stack.enter_context(child_anchor(anchor, name, create=True))
            os.fsync(anchor.fd)
    elif operation == 'write':
        target = safe_path(request['path'], missing=True)
        text = request['text'].encode('utf-8')
        if len(text) > 16 << 20:
            raise ValueError('preparation text limit')
        with DirectoryAnchor(str(target.parent)) as anchor:
            preparation_checkpoint('opened')
            anchor.verify()
            if request.get('emptyOnly'):
                try:
                    existing = os.open(target.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=anchor.fd)
                except FileNotFoundError:
                    existing = None
                if existing is not None:
                    try:
                        before = identity(os.fstat(existing))
                        if not stat.S_ISREG(os.fstat(existing).st_mode) or os.read(existing, 1):
                            raise ValueError('private config is not empty')
                        verify_leaf(anchor, target.name, before)
                    finally:
                        os.close(existing)
                    return {'verified': True}
            temporary = '.prepare-' + os.urandom(12).hex()
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=anchor.fd)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(text)
                    stream.flush()
                    os.fchmod(stream.fileno(), request.get('mode', 0o600))
                    os.fsync(stream.fileno())
                    written = identity(os.fstat(stream.fileno()))
                anchor.verify()
                verify_leaf(anchor, temporary, written)
                os.rename(temporary, target.name, src_dir_fd=anchor.fd, dst_dir_fd=anchor.fd)
                anchor.verify()
                if identity(os.stat(target.name, dir_fd=anchor.fd, follow_symlinks=False))[:4] != written[:4]:
                    raise ValueError('published preparation leaf drift')
                os.fsync(anchor.fd)
            finally:
                try:
                    os.unlink(temporary, dir_fd=anchor.fd)
                except FileNotFoundError:
                    pass
    elif operation == 'sync':
        with DirectoryAnchor(request['path']) as anchor:
            preparation_checkpoint('opened')
            anchor.verify()
            sync_anchor(anchor)
    elif operation == 'identities':
        with contextlib.ExitStack() as stack:
            anchors = [stack.enter_context(DirectoryAnchor(p)) for p in request['paths']]
            result = [[p, identity(os.fstat(a.fd))[:2]] for p, a in zip(request['paths'], anchors)]
            for anchor in anchors:
                anchor.verify()
            if request.get('expected') is not None and result != request['expected']:
                raise ValueError('preparation directory identity drift')
            return {'verified': True, 'identities': result}
    else:
        raise ValueError('unknown preparation operation')
    return {'verified': True}


class BoundedReader:
    """Count actual decompressed bytes, not declared tar sizes."""

    def __init__(self, stream, limit: int):
        self.stream = stream
        self.limit = limit
        self.count = 0

    def read(self, size: int = -1) -> bytes:
        if size < 0 or size > 1 << 20:
            raise ValueError('unbounded stream read')
        chunk = self.stream.read(min(size, self.limit - self.count + 1))
        self.count += len(chunk)
        if self.count > self.limit:
            raise ValueError('decoded tar limit')
        return chunk


class BoundedTarInfo(tarfile.TarInfo):
    """Bound extension allocations made by the standard tar parser."""

    @classmethod
    def fromtarfile(cls, archive):
        try:
            return super().fromtarfile(archive)
        except tarfile.EOFHeaderError:
            if archive.fileobj.read(tarfile.BLOCKSIZE) != b'\0' * tarfile.BLOCKSIZE:
                raise ValueError('missing tar end blocks')
            raise
        except tarfile.HeaderError as error:
            raise ValueError('invalid or truncated tar header') from error

    def _proc_pax(self, archive):
        archive._managed_extension_bytes = getattr(archive, '_managed_extension_bytes', 0) + self.size
        archive._managed_extension_count = getattr(archive, '_managed_extension_count', 0) + 1
        if self.size > 1 << 20 or archive._managed_extension_bytes > 1 << 20 or archive._managed_extension_count > 128:
            raise ValueError('PAX metadata limit')
        return super()._proc_pax(archive)

    def _proc_gnulong(self, archive):
        archive._managed_extension_count = getattr(archive, '_managed_extension_count', 0) + 1
        if self.size > 4096 or archive._managed_extension_count > 128:
            raise ValueError('GNU name metadata limit')
        return super()._proc_gnulong(archive)


class ArchiveGuard:
    """Freeze one archive and extract only verified ordinary members."""

    def __init__(self, limits=None):
        self.limits = dict(LIMITS if limits is None else limits)
        self.request = {}
        self.original = []
        self.frozen = None
        self.manifest = {}

    def freeze(self, request: dict, destination: str = None) -> dict:
        self.request = request
        source = safe_path(request['tarball'])
        if not str(source).endswith(('.tgz', '.tar.gz')):
            raise ValueError('expected local gzip tarball')
        self.frozen = tempfile.TemporaryFile()
        with DirectoryAnchor(str(source.parent)) as parent:
            fd = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent.fd)
            with os.fdopen(fd, 'rb') as stream:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_size > self.limits['compressed']:
                    raise ValueError('compressed input limit or type')
                self.original = identity(info)
                digest = hashlib.sha256()
                length = 0
                while chunk := stream.read(1 << 20):
                    length += len(chunk)
                    if length > self.limits['compressed']:
                        raise ValueError('compressed input limit')
                    digest.update(chunk)
                    self.frozen.write(chunk)
                if identity(os.fstat(fd)) != self.original:
                    raise ValueError('input drift')
                parent.verify()
        if digest.hexdigest() != request['sha256']:
            raise ValueError('SHA256 mismatch')
        self.recheckInput()
        self.manifest = self._scan()
        if destination is not None:
            target = pathlib.Path(destination)
            with DirectoryAnchor(str(target.parent)) as parent:
                parent.verify()
                fd = os.open(target.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o400, dir_fd=parent.fd)
                with os.fdopen(fd, 'wb') as output:
                    self.frozen.seek(0)
                    while chunk := self.frozen.read(1 << 20):
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                parent.verify()
                os.fsync(parent.fd)
        return self.manifest

    def _scan(self, root_fd: int = None, bindings: dict = None) -> dict:
        self.frozen.seek(0)
        entries = {}
        folded = {}
        payload = 0
        package = None
        with contextlib.ExitStack() as stack:
            compressed = stack.enter_context(gzip.GzipFile(fileobj=self.frozen))
            decoded = BoundedReader(compressed, self.limits['decoded'])
            archive = stack.enter_context(tarfile.open(fileobj=decoded, mode='r|',
                                                       tarinfo=BoundedTarInfo))
            for count, member in enumerate(archive, 1):
                archive.members.clear()
                archive._managed_extension_count = 0
                if count > self.limits["members"]:
                    raise ValueError("member limit")
                raw = member.name
                if member.isdir() and raw.endswith("/"):
                    raw = raw[:-1]
                parts = raw.split("/")
                if (not parts or parts[0] != "package" or
                        any(p in ("", ".", "..") for p in parts) or
                        any(ord(c) < 32 or ord(c) == 127 for c in raw) or
                        "\\" in raw or ":" in raw or
                        len(raw.encode("utf-8")) > self.limits["path"] or
                        len(parts) > self.limits["depth"]):
                    raise ValueError("unsafe member path")
                if not (member.isfile() or member.isdir()) or member.issparse():
                    raise ValueError("unsupported member type")
                if member.mode & 0o7000:
                    raise ValueError("special permission bits")
                mode = member.mode & 0o777
                if (mode & 0o500 != 0o500 if member.isdir() else mode & 0o400 != 0o400):
                    raise ValueError("unreadable member")
                if any(key not in ("path", "size", "mtime", "atime", "ctime", "uid", "gid", "uname", "gname")
                       for key in member.pax_headers):
                    raise ValueError("unsupported PAX semantics")
                rel = "/".join(parts[1:])
                if not rel:
                    if not member.isdir():
                        raise ValueError("package root must be directory")
                folded_key = unicodedata.normalize("NFC", rel).casefold()
                if rel in entries or folded_key in folded:
                    raise ValueError("duplicate or normalized member collision")
                folded[folded_key] = rel
                if member.size < 0 or member.size > self.limits["file"]:
                    raise ValueError("single file limit")
                data = bytearray()
                file_hash = hashlib.sha256()
                length = 0
                if member.isfile():
                    payload += member.size
                    if payload > self.limits['payload']:
                        raise ValueError('payload limit')
                    if rel == 'package.json' and member.size > self.limits['json']:
                        raise ValueError('package.json limit')
                    with contextlib.ExitStack() as output_stack:
                        output = None
                        if root_fd is not None:
                            parent_name, _, name = rel.rpartition('/')
                            parent_fd = self._directory(root_fd, parent_name, bindings=bindings)
                            output_stack.callback(os.close, parent_fd)
                            target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                             0o600, dir_fd=parent_fd)
                            output = output_stack.enter_context(os.fdopen(target, 'wb'))
                        reader = archive.extractfile(member)
                        while chunk := reader.read(1 << 16):
                            length += len(chunk)
                            if length > member.size:
                                raise ValueError('member size mismatch')
                            file_hash.update(chunk)
                            if rel == 'package.json':
                                data.extend(chunk)
                            if output is not None:
                                output.write(chunk)
                        if output is not None:
                            output.flush()
                            os.fchmod(output.fileno(), mode)
                            os.fsync(output.fileno())
                            bindings[rel] = identity(os.fstat(output.fileno()))
                    if length != member.size:
                        raise ValueError('truncated member')
                elif member.size:
                    raise ValueError('directory payload')
                record = {'path': rel, 'type': 'directory' if member.isdir() else 'file',
                          'size': length, 'mode': mode,
                          'sha256': file_hash.hexdigest() if member.isfile() else None}
                entries[rel] = record
                if rel == 'package.json':
                    package = strict_json(data)
            # Drain through tarfile's buffered stream so hidden trailing bytes and
            # gzip CRC/EOF are checked even when the tar end marker arrives early.
            while chunk := archive.fileobj.read(1 << 16):
                if any(chunk):
                    raise ValueError('nonzero tar trailing data')
        for rel in list(entries):
            parents = pathlib.PurePosixPath(rel).parents
            for parent in parents:
                key = str(parent)
                if key == ".":
                    continue
                if key in entries and entries[key]["type"] != "directory":
                    raise ValueError("file/directory conflict")
                folded_key = unicodedata.normalize("NFC", key).casefold()
                if folded_key in folded and folded[folded_key] != key:
                    raise ValueError("normalized parent collision")
                folded[folded_key] = key
                if key not in entries:
                    entries[key] = {"path": key, "type": "directory", "size": 0,
                                    "mode": 0o755, "sha256": None}
        if (not isinstance(package, dict) or package.get("name") != self.request["name"] or
                package.get("version") != self.request["version"]):
            raise ValueError("package identity mismatch")
        records = sorted((entry for key, entry in entries.items() if key), key=lambda item: item["path"])
        digest = hashlib.sha256(json.dumps(records, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        self.manifest = {"entries": records, "digest": digest, "identity": self.original}
        return self.manifest

    def recheckInput(self) -> None:
        path = safe_path(self.request["tarball"])
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
            if identity(os.fstat(stream.fileno())) != self.original:
                raise ValueError("input identity drift")
            digest = hashlib.sha256()
            length = 0
            while chunk := stream.read(1 << 20):
                length += len(chunk)
                if length > self.limits["compressed"]:
                    raise ValueError("input growth")
                digest.update(chunk)
            if digest.hexdigest() != self.request["sha256"] or identity(path.lstat()) != self.original:
                raise ValueError("input content drift")

    def extractVerified(self, destination: str) -> dict:
        root = safe_path(destination, missing=True)
        with DirectoryAnchor(str(root.parent)) as parent:
            parent.verify()
            os.mkdir(root.name, 0o700, dir_fd=parent.fd)
            root_fd = os.open(root.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                              dir_fd=parent.fd)
            try:
                expected = self.manifest
                bindings = {}
                for record in expected['entries']:
                    if record['type'] == 'directory':
                        self._directory(root_fd, record['path'], create=True, bindings=bindings)
                actual = self._scan(root_fd, bindings)
                if actual != expected:
                    raise ValueError('frozen payload drift')
                for record in reversed(expected['entries']):
                    if record['type'] == 'directory':
                        fd = self._directory(root_fd, record['path'], bindings=bindings)
                        try:
                            os.fchmod(fd, record['mode'])
                            os.fsync(fd)
                        finally:
                            os.close(fd)
                self._verify_extraction(root_fd, expected['entries'], bindings)
                os.fsync(root_fd)
                parent.verify()
                held = os.fstat(root_fd)
                named = os.stat(root.name, dir_fd=parent.fd, follow_symlinks=False)
                if (held.st_dev, held.st_ino) != (named.st_dev, named.st_ino):
                    raise ValueError('extraction root drift')
                os.fsync(parent.fd)
            finally:
                os.close(root_fd)
        self.recheckInput()
        return self.manifest

    @staticmethod
    def _verify_extraction(root_fd: int, records: list, bindings: dict) -> None:
        """Check the complete named tree through held, no-follow directory FDs."""
        children = {}
        for record in records:
            parent, _, name = record['path'].rpartition('/')
            children.setdefault(parent, {})[name] = record

        def walk(fd: int, relative: str) -> None:
            expected = children.get(relative, {})
            if set(os.listdir(fd)) != set(expected):
                raise ValueError('extraction inventory drift')
            for name, record in expected.items():
                rel = record['path']
                named = os.stat(name, dir_fd=fd, follow_symlinks=False)
                directory = record['type'] == 'directory'
                if (not stat.S_ISDIR(named.st_mode) if directory else not stat.S_ISREG(named.st_mode)):
                    raise ValueError('extraction entry type drift')
                stamp = identity(named)
                if (stamp[:2] != bindings[rel][:2] if directory else stamp != bindings[rel]):
                    raise ValueError('extraction entry binding drift')
                if stat.S_IMODE(named.st_mode) != record['mode']:
                    raise ValueError('extraction mode drift')
                if directory:
                    child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                    try:
                        if identity(os.fstat(child)) != stamp:
                            raise ValueError('extraction directory binding drift')
                        walk(child, rel)
                    finally:
                        os.close(child)
                if identity(os.stat(name, dir_fd=fd, follow_symlinks=False)) != stamp:
                    raise ValueError('extraction entry changed during verification')
            if set(os.listdir(fd)) != set(expected):
                raise ValueError('extraction inventory drift')

        walk(root_fd, '')

    @staticmethod
    def _directory(root_fd: int, relative: str, create: bool = False, bindings: dict = None) -> int:
        fd = os.dup(root_fd)
        current = []
        try:
            for part in relative.split("/") if relative else []:
                current.append(part)
                if create:
                    try:
                        os.mkdir(part, 0o700, dir_fd=fd)
                    except FileExistsError:
                        pass
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
                if bindings is not None:
                    key = '/'.join(current)
                    stamp = identity(os.fstat(fd))
                    if key in bindings and bindings[key][:2] != stamp[:2]:
                        raise ValueError('extraction directory binding drift')
                    bindings.setdefault(key, stamp)
            if create:
                os.close(fd)
                return -1
            return fd
        except BaseException:
            os.close(fd)
            raise

    @staticmethod
    def withProfileLocks(profiles: list, command: list) -> int:
        """Exec a continuation with validated inherited flock descriptors."""
        inherited = json.loads(os.environ.get("OMNIMUX_PROFILE_LOCKS", "{}"))
        locks = {}
        for profile in sorted(set(os.path.realpath(p) for p in profiles)):
            pathlib.Path(profile).mkdir(parents=True, exist_ok=True)
            root = safe_path(profile)
            lock = root / ".materialize.lock"
            if str(root) in inherited:
                fd = int(inherited[str(root)])
                current = os.fstat(fd)
                expected = lock.lstat()
                if (current.st_dev, current.st_ino) != (expected.st_dev, expected.st_ino):
                    raise ValueError("inherited lock inode mismatch")
                # A separate open must conflict: an unlocked forged FD is not authority.
                probe = os.open(lock, os.O_RDWR | os.O_NOFOLLOW)
                try:
                    try:
                        fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        pass
                    else:
                        raise ValueError("inherited FD does not hold lock")
                finally:
                    os.close(probe)
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            os.set_inheritable(fd, True)
            locks[str(root)] = fd
        env = dict(os.environ, OMNIMUX_PROFILE_LOCKS=json.dumps(locks))
        return subprocess.call(command, env=env, pass_fds=tuple(locks.values()))


def read_at(parent: DirectoryAnchor, name: str, limit: int = 64 << 20) -> object:
    """Read a bounded journal through an anchored no-follow descriptor."""
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent.fd)
    with os.fdopen(fd, 'rb') as stream:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('journal is not regular')
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('journal limit')
    parent.verify()
    return strict_json(raw)


def allowed_moves(txn_id: str, name: str, transition: bool = False) -> list:
    if not re.fullmatch(r'[0-9a-f-]{36}', txn_id) or not re.fullmatch(r'(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*', name):
        raise ValueError('journal identity invalid')
    prefix = f'.materialize-transactions/{txn_id}'
    pairs = []
    for item in ('node_modules', 'package.json', 'pnpm-lock.yaml'):
        pairs.extend([(item, f'{prefix}/old-generation/{item}'),
                      (f'{prefix}/candidate/{item}', item)])
    source = f'.materialize-snapshots/plugins/{name}'
    pairs.append((f'{prefix}/candidate/{source}', source))
    if transition:
        pairs.append((source, f'{prefix}/old-generation/{source}'))
    return pairs


def validate_journal(value: object, profile: str, txn_id: str) -> list:
    if not isinstance(value, dict) or value.get('schemaVersion') not in (1, 2) or value.get('id') != txn_id or value.get('profile') != profile:
        raise ValueError('journal identity mismatch')
    if value.get('phase') not in ('PREPARING', 'PREPARED', 'COMMITTING', 'RECOVERING', 'COMMITTED', 'ROLLED_BACK', 'REJECTED'):
        raise ValueError('journal phase invalid')
    transition = value.get('transition')
    if value['schemaVersion'] == 2:
        if not isinstance(transition, dict):
            raise ValueError('transition journal missing identity')
        for side in ('before', 'after'):
            item = transition.get(side)
            if not isinstance(item, dict) or not isinstance(item.get('version'), str):
                raise ValueError('transition identity invalid')
            for key in ('sha256', 'payloadDigest'):
                if not re.fullmatch(r'[a-f0-9]{64}', item.get(key, '')):
                    raise ValueError('transition digest invalid')
            if item.get('sourceSpec') != f"file:.materialize-snapshots/plugins/{value.get('name')}":
                raise ValueError('transition source invalid')
    elif transition is not None:
        raise ValueError('legacy journal cannot authorize transition')
    pairs = allowed_moves(txn_id, value.get('name', ''), value['schemaVersion'] == 2)
    moves = value.get('moves', [])
    if not isinstance(moves, list) or any(not isinstance(m, dict) or (m.get('from'), m.get('to')) not in pairs for m in moves):
        raise ValueError('journal move outside exact write set')
    if value['phase'] not in ('COMMITTED', 'ROLLED_BACK', 'REJECTED') and 'moves' not in value:
        raise ValueError('active journal missing moves')
    return pairs


def named_identity(parent: DirectoryAnchor, name: str):
    try:
        info = os.stat(name, dir_fd=parent.fd, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
        raise ValueError('unsafe move leaf')
    return identity(info)


def safeMove(profile: str, txn_id: str, source: str, destination: str, expected: dict) -> dict:
    """Rename a journal-authorized item with held ancestor descriptors."""
    safe_path(profile)
    transaction = f'{profile}/.materialize-transactions/{txn_id}'
    with DirectoryAnchor(transaction) as journal_parent:
        journal = read_at(journal_parent, 'journal.json')
        pairs = validate_journal(journal, profile, txn_id)
        if (source, destination) not in pairs and (destination, source) not in pairs:
            raise ValueError('move outside four-item whitelist')
        if not any((m['from'], m['to']) in ((source, destination), (destination, source)) for m in journal['moves']):
            raise ValueError('durable move intent missing')
        if journal['phase'] not in ('COMMITTING', 'RECOVERING'):
            raise ValueError('journal is not publishing or recovering')
        src = pathlib.Path(profile, source)
        dst = pathlib.Path(profile, destination)
        with DirectoryAnchor(str(src.parent)) as a, DirectoryAnchor(str(dst.parent)) as b:
            before = {'from': named_identity(a, src.name), 'to': named_identity(b, dst.name)}
            if before != expected or before['from'] is None or before['to'] is not None:
                raise ValueError('move identity drift or occupied destination')
            if os.fstat(a.fd).st_dev != os.fstat(b.fd).st_dev:
                raise ValueError('cross-filesystem move')
            a.verify()
            b.verify()
            journal_parent.verify()
            os.rename(src.name, dst.name, src_dir_fd=a.fd, dst_dir_fd=b.fd)
            os.fsync(a.fd)
            os.fsync(b.fd)
            a.verify()
            b.verify()
            after = {'from': named_identity(a, src.name), 'to': named_identity(b, dst.name)}
            if after['from'] is not None or after['to'][:2] != before['from'][:2]:
                raise ValueError('post-move identity drift')
            return {'before': before, 'after': after}


def probeRecovery(paths: list) -> dict:
    """Probe same-device roundtrip rename/fsync only in transaction scratch."""
    if not paths or not all(isinstance(p, str) for p in paths):
        raise ValueError('recovery paths required')
    with contextlib.ExitStack() as stack:
        anchors = [stack.enter_context(DirectoryAnchor(p)) for p in paths]
        devices = {os.fstat(a.fd).st_dev for a in anchors}
        if len(devices) != 1:
            raise ValueError('recovery paths span filesystems')
        owned = [a for p, a in zip(paths, anchors)
                 if re.search(r'/\.materialize-transactions/[0-9a-f-]{36}/(?:candidate|old-generation)(?:/|$)', p)]
        if len(owned) < 2:
            raise ValueError('two owned recovery probe directories required')
        name = '.recovery-probe-' + os.urandom(12).hex()
        a, b = owned[0], owned[1]
        current = a
        fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=a.fd)
        try:
            os.write(fd, b'probe')
            os.fsync(fd)
            for anchor in anchors:
                anchor.verify()
                os.fsync(anchor.fd)
            os.rename(name, name, src_dir_fd=a.fd, dst_dir_fd=b.fd)
            current = b
            os.fsync(a.fd)
            os.fsync(b.fd)
            os.rename(name, name, src_dir_fd=b.fd, dst_dir_fd=a.fd)
            current = a
            os.fsync(a.fd)
            os.fsync(b.fd)
            for anchor in anchors:
                anchor.verify()
        finally:
            os.close(fd)
            os.unlink(name, dir_fd=current.fd)
            os.fsync(current.fd)
        info = os.fstatvfs(a.fd)
        return {'verified': True, 'device': str(next(iter(devices))),
                'availableBytes': str(info.f_bavail * info.f_frsize),
                'identities': [identity(os.fstat(anchor.fd)) for anchor in anchors]}


def main() -> int:
    if sys.version_info < (3, 12):
        raise ValueError("Python >=3.12 required")
    action = sys.argv[1]
    if action == "check-locks":
        inherited = json.loads(os.environ.get("OMNIMUX_PROFILE_LOCKS", "{}"))
        profiles = [os.path.realpath(p) for p in sys.argv[2:]]
        if any(profile not in inherited for profile in profiles):
            return 10
        for profile in profiles:
            root = safe_path(profile)
            fd = int(inherited[profile])
            info = os.fstat(fd)
            lock = (root / ".materialize.lock").lstat()
            if (info.st_dev, info.st_ino) != (lock.st_dev, lock.st_ino):
                raise ValueError("inherited lock inode mismatch")
            probe = os.open(root / ".materialize.lock", os.O_RDWR | os.O_NOFOLLOW)
            try:
                try:
                    fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    pass
                else:
                    raise ValueError("inherited FD does not hold lock")
            finally:
                os.close(probe)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return 0
    if action == "pending":
        for profile in sys.argv[2:]:
            root = safe_path(os.path.realpath(profile)) / ".materialize-transactions"
            if not root.exists():
                continue
            safe_path(str(root))
            for transaction in root.iterdir():
                safe_path(str(transaction))
                with DirectoryAnchor(str(transaction)) as parent:
                    value = read_at(parent, 'journal.json')
                    validate_journal(value, str(root.parent), transaction.name)
                    if value['phase'] not in ('COMMITTED', 'ROLLED_BACK', 'REJECTED'):
                        raise ValueError('managed transaction requires explicit recovery')
        return 0
    if action == "lock":
        split = sys.argv.index("--")
        return ArchiveGuard.withProfileLocks(sys.argv[2:split], sys.argv[split + 1:])
    request = strict_json(sys.stdin.buffer.read(2 << 20))
    if action == "json":
        print(json.dumps(strict_json(pathlib.Path(request["path"]).read_bytes())))
        return 0
    if action == 'prepareFiles':
        print(json.dumps(prepare_files(request)))
        return 0
    if action == 'safeMove':
        print(json.dumps(safeMove(request['profile'], request['txnId'], request['from'],
                                  request['to'], request['expected'])))
        return 0
    if action == 'probeRecovery':
        print(json.dumps(probeRecovery(request['paths'])))
        return 0
    guard = ArchiveGuard()
    manifest = guard.freeze(request, request.get('destination') if action == 'freeze' else None)
    if action == "extract":
        manifest = guard.extractVerified(request["destination"])
    elif action not in ('inspect', 'freeze'):
        raise ValueError("unknown archive action")
    print(json.dumps(manifest, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, tarfile.TarError, EOFError, KeyError, TypeError) as error:
        action = sys.argv[1] if len(sys.argv) > 1 else ''
        code = 7 if action in ('pending', 'safeMove') else 5 if action == 'probeRecovery' else 3
        print(json.dumps({'error': str(error), 'phase': action, 'code': code}), file=sys.stderr)
        sys.exit(code)
