"""Narrow no-follow filesystem worker. JSON lines in/out; no shell execution."""
import base64
import errno
import fcntl
import hashlib
import json
import os
import stat
import sys
import time
import uuid
import unicodedata
from contextlib import contextmanager

CHUNK = 1024 * 1024
LOCKS = {}
READERS = {}
READ_CHUNK = 64 * 1024
CURRENT_ID = None
LAST_PROGRESS = 0.0


class StorageError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def emit(value: dict) -> None:
    print(json.dumps(value, ensure_ascii=True), flush=True)


def progress(**values: object) -> None:
    global LAST_PROGRESS
    now = time.monotonic()
    if now - LAST_PROGRESS >= 0.2:
        emit({"id": CURRENT_ID, "progress": values})
        LAST_PROGRESS = now


def parts(path: str) -> list:
    if not isinstance(path, str) or not path or path.startswith('/') or '\\' in path or '\0' in path:
        raise StorageError('path-denied', 'unsafe relative path')
    result = path.split('/')
    if any(p in ('', '.', '..') for p in result) or ':' in result[0]:
        raise StorageError('path-denied', 'unsafe relative path')
    return result


@contextmanager
def root_fd(path: str, strict: bool = False):
    if not isinstance(path, str) or not os.path.isabs(path):
        raise StorageError('path-denied', 'absolute root required')
    # Reject the final link even when its canonical target is a directory.
    path = path.rstrip('/') or '/'
    if stat.S_ISLNK(os.lstat(path).st_mode):
        raise StorageError('path-denied', 'root is a symbolic link')
    if strict and any(part in ('.', '..') for part in path.split('/')):
        raise StorageError('path-denied', 'canonical root required for streaming')
    canonical = path if strict else os.path.realpath(path)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in canonical.split('/')[1:]:
            if not part:
                continue
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
        yield fd, canonical
    finally:
        os.close(fd)


@contextmanager
def parent_fd(root: int, path: str, create: bool = False):
    components = parts(path)
    fd = os.dup(root)
    root_dev = os.fstat(root).st_dev
    try:
        for part in components[:-1]:
            if create:
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                    os.fsync(fd)
                except FileExistsError:
                    pass
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            if os.fstat(nxt).st_dev != root_dev:
                os.close(nxt)
                raise StorageError('path-denied', 'nested volume is not supported')
            os.close(fd)
            fd = nxt
        yield fd, components[-1]
    finally:
        os.close(fd)


def fingerprint(info: os.stat_result) -> dict:
    return {key: str(value) for key, value in {
        'dev': info.st_dev, 'ino': info.st_ino, 'size': info.st_size,
        'mtimeNs': info.st_mtime_ns, 'ctimeNs': info.st_ctime_ns,
        'mode': info.st_mode, 'nlink': info.st_nlink,
    }.items()}


def same(actual: dict, expected: dict) -> None:
    if expected and any(actual.get(k) != v for k, v in expected.items() if k != 'sha256'):
        raise StorageError('plan-stale', 'file identity or content changed since planning')


def hash_fd(fd: int) -> dict:
    before = os.fstat(fd)
    if not stat.S_ISREG(before.st_mode):
        raise StorageError('path-denied', 'not a regular file')
    os.lseek(fd, 0, os.SEEK_SET)
    h = hashlib.sha256()
    total = 0
    while True:
        chunk = os.read(fd, CHUNK)
        if not chunk:
            break
        h.update(chunk)
        total += len(chunk)
        progress(verifyBytes=total)
    same(fingerprint(os.fstat(fd)), fingerprint(before))
    emit({'id': CURRENT_ID, 'progress': {'verifyBytes': total}})
    return {**fingerprint(before), 'sha256': h.hexdigest()}


def hash_rel(root: int, path: str) -> dict:
    with parent_fd(root, path) as (parent, name):
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            return hash_fd(fd)
        finally:
            os.close(fd)


def identity(fd: int, canonical: str) -> dict:
    info = os.fstat(fd)
    volume = os.fstatvfs(fd)
    return {'path': canonical, 'dev': str(info.st_dev), 'ino': str(info.st_ino),
            'fsid': str(volume.f_fsid), 'freeBytes': volume.f_bavail * volume.f_frsize}


def atomic_json(root: int, path: str, value: object) -> dict:
    data = (json.dumps(value, ensure_ascii=True, separators=(',', ':')) + '\n').encode()
    with parent_fd(root, path, True) as (parent, name):
        try:
            existing = os.stat(name, dir_fd=parent, follow_symlinks=False)
            if not stat.S_ISREG(existing.st_mode) or existing.st_nlink != 1:
                raise StorageError('path-denied', 'unsafe JSON destination')
        except FileNotFoundError:
            pass
        tmp = '.storage-' + uuid.uuid4().hex
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        try:
            with os.fdopen(fd, 'wb', closefd=False) as stream:
                stream.write(data)
                stream.flush()
            os.fsync(fd)
            os.rename(tmp, name, src_dir_fd=parent, dst_dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(fd)
            try:
                os.unlink(tmp, dir_fd=parent)
            except FileNotFoundError:
                pass
    return {'sha256': hashlib.sha256(data).hexdigest()}


def scan(root: int, relative_root: str = '', metadata_only: bool = False, single_level: bool = False) -> dict:
    rows = []
    excluded = []
    stack = [relative_root]
    seen = set()
    device = os.fstat(root).st_dev
    while stack:
        relative = stack.pop()
        with parent_fd(root, relative + '/placeholder' if relative else 'placeholder') as (fd, _):
            before = fingerprint(os.fstat(fd))
            ident = (os.fstat(fd).st_dev, os.fstat(fd).st_ino)
            if ident in seen:
                raise StorageError('path-denied', 'directory identity visited twice')
            seen.add(ident)
            for name in sorted(os.listdir(fd)):
                rel = relative + '/' + name if relative else name
                try:
                    parts(rel)
                    info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                    if info.st_dev != device or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                        excluded.append({'relative_path': rel, 'reason': 'link-special-or-nested-volume'})
                        continue
                    row = {'relative_path': rel, 'kind': 'directory' if stat.S_ISDIR(info.st_mode) else 'file',
                           'size': info.st_size if stat.S_ISREG(info.st_mode) else 0, 'identity': fingerprint(info)}
                    if row['kind'] == 'directory':
                        if rel != '.omnimux-assets' and not single_level:
                            stack.append(rel)
                    elif not metadata_only:
                        row['identity'] = hash_rel(root, rel)
                        row['sha256'] = row['identity']['sha256']
                    if not metadata_only:
                        with parent_fd(root, rel) as (parent, leaf):
                            file_fd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
                            try:
                                row['extendedMetadata'] = metadata(file_fd)['extendedMetadata']
                                if 'com.apple.provenance' in row['extendedMetadata']:
                                    row['provenanceHash'] = hashlib.sha256(provenance(file_fd)).hexdigest()
                            except (OSError, StorageError) as error:
                                row['metadataError'] = str(error)
                            finally:
                                os.close(file_fd)
                    rows.append(row)
                    progress(scannedItems=len(rows) + len(excluded), currentEntryId=rel)
                except (OSError, StorageError) as error:
                    if single_level and isinstance(error, OSError):
                        raise StorageError('directory-unreadable', str(error)) from error
                    excluded.append({'relative_path': rel, 'reason': str(error)})
            if single_level:
                same(fingerprint(os.fstat(fd)), before)
    return {'entries': rows, 'excluded': excluded, **({'directoryIdentity': before} if single_level else {})}


def metadata(fd: int) -> dict:
    """Inspect potential critical attributes without changing the opened object."""
    attributes = os.listxattr(fd) if hasattr(os, 'listxattr') else None
    if sys.platform == 'darwin':
        import ctypes
        libc = ctypes.CDLL(None, use_errno=True)
        libc.flistxattr.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int]
        libc.flistxattr.restype = ctypes.c_ssize_t
        size = libc.flistxattr(fd, None, 0, 0)
        if size < 0 or size > 1024 * 1024:
            raise StorageError('metadata-unsupported', 'extended attribute inspection failed')
        buffer = ctypes.create_string_buffer(max(1, size))
        count = libc.flistxattr(fd, buffer, size, 0)
        if count < 0:
            raise StorageError('metadata-unsupported', 'extended attribute inspection changed')
        attributes = [name.decode('utf-8', 'replace') for name in buffer.raw[:count].split(b'\0') if name]
        libc.acl_get_fd_np.argtypes = [ctypes.c_int, ctypes.c_int]
        libc.acl_get_fd_np.restype = ctypes.c_void_p
        libc.acl_get_entry.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)]
        libc.acl_free.argtypes = [ctypes.c_void_p]
        ctypes.set_errno(0)
        acl = libc.acl_get_fd_np(fd, 0x100)
        if not acl:
            if ctypes.get_errno() == errno.ENOENT:
                return {'extendedMetadata': sorted(attributes), 'identity': fingerprint(os.fstat(fd))}
            raise StorageError('metadata-unsupported', 'ACL inspection failed')
        try:
            item = ctypes.c_void_p()
            result = libc.acl_get_entry(acl, 0, ctypes.byref(item))
            if result == 0:
                attributes.append('posix-acl')
            elif result != -1 or ctypes.get_errno() not in (0, errno.EINVAL):
                raise StorageError('metadata-unsupported', 'ACL entry inspection failed')
        finally:
            libc.acl_free(acl)
    if attributes is None:
        raise StorageError('metadata-unsupported', 'extended attribute inspection unavailable')
    return {'extendedMetadata': sorted(attributes), 'identity': fingerprint(os.fstat(fd))}


def provenance(fd: int, value: bytes = None) -> bytes:
    """Read/write the supported macOS provenance attribute through the same FD."""
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    name = b'com.apple.provenance'
    libc.fgetxattr.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int]
    libc.fgetxattr.restype = ctypes.c_ssize_t
    if value is not None:
        libc.fsetxattr.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int]
        if libc.fsetxattr(fd, name, value, len(value), 0, 0) != 0:
            raise StorageError('metadata-unsupported', 'provenance write failed')
    size = libc.fgetxattr(fd, name, None, 0, 0, 0)
    if size < 0 or size > 65536:
        raise StorageError('metadata-unsupported', 'provenance read failed')
    data = ctypes.create_string_buffer(max(1, size))
    count = libc.fgetxattr(fd, name, data, size, 0, 0)
    if count != size:
        raise StorageError('metadata-unsupported', 'provenance changed during read')
    return data.raw[:count]


def copy_verify(request: dict) -> dict:
    with root_fd(request['sourceRoot']) as (source, _), root_fd(request['root']) as (target, _):
        with parent_fd(source, request['sourceRel']) as (sp, sn), parent_fd(target, request['targetRel'], True) as (tp, tn):
            src = os.open(sn, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=sp)
            dst = None
            try:
                before = os.fstat(src)
                if not stat.S_ISREG(before.st_mode):
                    raise StorageError('path-denied', 'copy requires regular file')
                same(fingerprint(before), request.get('expected'))
                source_metadata = metadata(src) if request.get('protectMetadata') else None
                if source_metadata and any(name != 'com.apple.provenance' for name in source_metadata['extendedMetadata']):
                    raise StorageError('metadata-unsupported', 'critical source metadata cannot be copied')
                source_provenance = provenance(src) if source_metadata and 'com.apple.provenance' in source_metadata['extendedMetadata'] else None
                space = os.fstatvfs(tp)
                if space.f_bavail * space.f_frsize < before.st_size + request.get('reserve', 0):
                    raise StorageError('disk-space-insufficient', 'insufficient copy space')
                dst = os.open(tn, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=tp)
                h = hashlib.sha256()
                total = 0
                while True:
                    data = os.read(src, CHUNK)
                    if not data:
                        break
                    space = os.fstatvfs(tp)
                    if space.f_bavail * space.f_frsize < len(data) + request.get('reserve', 0):
                        raise StorageError('disk-space-insufficient', 'copy reserve exhausted')
                    h.update(data)
                    view = memoryview(data)
                    while view:
                        written = os.write(dst, view)
                        view = view[written:]
                    total += len(data)
                    progress(copyBytes=total)
                same(fingerprint(os.fstat(src)), fingerprint(before))
                if request.get('expected', {}).get('sha256') not in (None, h.hexdigest()):
                    raise StorageError('plan-stale', 'source hash changed')
                emit({'id': CURRENT_ID, 'progress': {'copyBytes': total}})
                if source_provenance is not None and provenance(dst, source_provenance) != source_provenance:
                    raise StorageError('metadata-unsupported', 'provenance verification failed')
                os.fchmod(dst, stat.S_IMODE(before.st_mode) & 0o777)
                os.utime(dst, ns=(before.st_atime_ns, before.st_mtime_ns))
                os.fsync(dst)
                actual = hash_fd(dst)
                if (int(actual['mode']) & 0o777) != (before.st_mode & 0o777) or int(actual['mtimeNs']) != before.st_mtime_ns:
                    raise StorageError('metadata-unsupported', 'copied permissions or mtime differ')
                if actual['sha256'] != h.hexdigest():
                    raise StorageError('plan-stale', 'staged copy verification failed')
                os.fsync(tp)
                return actual
            finally:
                os.close(src)
                if dst is not None:
                    os.close(dst)


def close_reader(key: str) -> None:
    """Release an opened reader exactly once, including on EOF or IPC teardown."""
    reader = READERS.pop(key, None)
    if reader is not None:
        os.close(reader['fd'])


def open_reader(request: dict) -> dict:
    """Open through a no-follow chain; all subsequent bytes use this descriptor."""
    expected = request.get('expectedRoot')
    with root_fd(request['root'], strict=True) as (root, canonical):
        actual = identity(root, canonical)
        if expected is not None:
            keys = ('path', 'dev', 'ino', 'fsid')
            if not isinstance(expected, dict) or any(expected.get(k) != actual[k] for k in keys):
                raise StorageError('root-identity-changed', 'stream root identity changed')
        with parent_fd(root, request['rel']) as (parent, name):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            try:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_dev != os.fstat(root).st_dev:
                    raise StorageError('path-denied', 'stream requires an in-volume regular file')
                key = uuid.uuid4().hex
                file_identity = fingerprint(info)
                READERS[key] = {'fd': fd, 'identity': file_identity, 'remaining': info.st_size}
                return {'key': key, 'size': info.st_size, 'identity': file_identity}
            except Exception:
                os.close(fd)
                raise


def read_chunk(key: str) -> dict:
    """Pull at most one bounded chunk, rejecting concurrent file changes."""
    reader = READERS.get(key)
    if reader is None:
        raise StorageError('recovery-required', 'stream descriptor is closed')
    try:
        same(fingerprint(os.fstat(reader['fd'])), reader['identity'])
        data = os.read(reader['fd'], min(READ_CHUNK, reader['remaining']))
        same(fingerprint(os.fstat(reader['fd'])), reader['identity'])
        if not data and reader['remaining']:
            raise StorageError('plan-stale', 'stream ended before its opened size')
        reader['remaining'] -= len(data)
        eof = reader['remaining'] == 0
        if eof:
            close_reader(key)
        return {'data': base64.b64encode(data).decode('ascii'), 'eof': eof}
    except Exception:
        close_reader(key)
        raise


def execute(request: dict) -> object:
    op = request.get('op')
    if op == 'probe':
        required = (os.open, os.stat, os.mkdir, os.rename, os.unlink, os.rmdir, os.link)
        if not all(f in os.supports_dir_fd for f in required) or not hasattr(os, 'O_NOFOLLOW') or not hasattr(os.statvfs('/'), 'f_fsid'):
            raise StorageError('storage-platform-unsupported', 'dir_fd, no-follow, fsid and flock required')
        return {'supported': True, 'python': sys.version.split()[0], 'chunkBytes': CHUNK}
    if op == 'stream_open':
        return open_reader(request)
    if op == 'stream_read':
        return read_chunk(request['key'])
    if op == 'stream_close':
        close_reader(request['key'])
        return True
    if op == 'copy':
        return copy_verify(request)
    if op == 'unlock':
        fd = LOCKS.pop(request['key'], None)
        if fd is not None:
            os.close(fd)
        return True
    with root_fd(request['root']) as (root, canonical):
        if op == 'identity':
            return identity(root, canonical)
        if op == 'scan':
            return {**scan(root, request.get('rel', ''), request.get('metadataOnly', False), request.get('singleLevel', False)), 'identity': identity(root, canonical)}
        if op == 'hash':
            return hash_rel(root, request['rel'])
        if op == 'metadata':
            with parent_fd(root, request['rel']) as (parent, name):
                fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                try:
                    result = metadata(fd)
                    if 'com.apple.provenance' in result['extendedMetadata']:
                        result['provenanceHash'] = hashlib.sha256(provenance(fd)).hexdigest()
                    return result
                finally:
                    os.close(fd)
        if op == 'stat':
            with parent_fd(root, request['rel']) as (parent, name):
                try:
                    info = os.stat(name, dir_fd=parent, follow_symlinks=False)
                except FileNotFoundError:
                    if request.get('optional'):
                        return None
                    raise
                return {'identity': fingerprint(info), 'kind': 'directory' if stat.S_ISDIR(info.st_mode) else 'file' if stat.S_ISREG(info.st_mode) else 'unsafe'}
        if op == 'json':
            return atomic_json(root, request['rel'], request['value'])
        if op == 'read':
            with parent_fd(root, request['rel']) as (parent, name):
                try:
                    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                except FileNotFoundError:
                    if request.get('optional'):
                        return None
                    raise
                with os.fdopen(fd, 'rb') as stream:
                    if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                        raise StorageError('ledger-corrupt', 'JSON is not regular file')
                    data = stream.read(64 * 1024 * 1024 + 1)
                    if len(data) > 64 * 1024 * 1024:
                        raise StorageError('ledger-corrupt', 'JSON exceeds bounded ledger size')
                    try:
                        return json.loads(data)
                    except (ValueError, UnicodeError) as error:
                        raise StorageError('ledger-corrupt', 'invalid JSON') from error
        if op == 'directory_metadata':
            with root_fd(request['sourceRoot']) as (source, _), parent_fd(source, request['sourceRel']) as (sp, sn), parent_fd(root, request['rel']) as (tp, tn):
                src = os.open(sn, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=sp)
                dst = os.open(tn, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=tp)
                try:
                    before = os.fstat(src)
                    same(fingerprint(before), request['expected'])
                    actual = fingerprint(os.fstat(dst))
                    if any(actual[key] != request['createdIdentity'][key] for key in ('dev', 'ino')):
                        raise StorageError('plan-stale', 'created directory identity changed')
                    attributes = metadata(src)['extendedMetadata']
                    if any(name != 'com.apple.provenance' for name in attributes):
                        raise StorageError('metadata-unsupported', 'directory attributes cannot be preserved')
                    if 'com.apple.provenance' in attributes:
                        value = provenance(src)
                        if provenance(dst, value) != value:
                            raise StorageError('metadata-unsupported', 'directory provenance differs')
                    os.fchmod(dst, before.st_mode & 0o777)
                    os.utime(dst, ns=(before.st_atime_ns, before.st_mtime_ns))
                    os.fsync(dst)
                    result = fingerprint(os.fstat(dst))
                    if result['mtimeNs'] != str(before.st_mtime_ns) or (int(result['mode']) & 0o777) != (before.st_mode & 0o777):
                        raise StorageError('metadata-unsupported', 'directory mode or mtime differs')
                    return result
                finally:
                    os.close(src)
                    os.close(dst)
        if op == 'destination':
            components = parts(request['rel'])
            fd = os.dup(root)
            try:
                for index, component in enumerate(components):
                    if len(os.fsencode(component)) > os.fpathconf(fd, 'PC_NAME_MAX'):
                        raise StorageError('name-conflict', 'destination component exceeds volume limit')
                    key = unicodedata.normalize('NFD', component).casefold()
                    matches = [name for name in os.listdir(fd) if unicodedata.normalize('NFD', name).casefold() == key]
                    if not matches:
                        break
                    if matches != [component] or index == len(components) - 1:
                        raise StorageError('name-conflict', 'destination exists or has an ambiguous normalized alias')
                    nxt = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                    os.close(fd)
                    fd = nxt
                return True
            finally:
                os.close(fd)
        if op == 'install_directory':
            # RENAME_EXCL refuses even an empty external destination directory.
            if sys.platform != 'darwin':
                raise StorageError('storage-platform-unsupported', 'exclusive directory install requires macOS')
            import ctypes
            libc = ctypes.CDLL(None, use_errno=True)
            rename = libc.renameatx_np
            rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
            rename.restype = ctypes.c_int
            with parent_fd(root, request['stagedRel']) as (sp, sn), parent_fd(root, request['rel']) as (tp, tn):
                staged = os.stat(sn, dir_fd=sp, follow_symlinks=False)
                same(fingerprint(staged), request['expected'])
                if not stat.S_ISDIR(staged.st_mode):
                    raise StorageError('path-denied', 'staged directory required')
                parent_before = os.fstat(tp)
                if rename(sp, os.fsencode(sn), tp, os.fsencode(tn), 4) != 0:
                    number = ctypes.get_errno()
                    raise OSError(number, os.strerror(number))
                os.utime(tp, ns=(parent_before.st_atime_ns, parent_before.st_mtime_ns))
                os.fsync(tp)
                os.fsync(sp)
                return fingerprint(os.stat(tn, dir_fd=tp, follow_symlinks=False))
        if op == 'mkdir':
            with parent_fd(root, request['rel'] + '/placeholder', True):
                return True
        if op == 'lock':
            key = canonical + '/' + request['rel']
            if key not in LOCKS:
                with parent_fd(root, request['rel'], True) as (parent, name):
                    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=parent)
                    try:
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        os.fsync(fd)
                        os.fsync(parent)
                    except OSError as error:
                        os.close(fd)
                        raise StorageError('storage-busy', 'another writer owns this library') from error
                    LOCKS[key] = fd
            with parent_fd(root, request['rel']) as (parent, name):
                current = os.stat(name, dir_fd=parent, follow_symlinks=False)
                held = os.fstat(LOCKS[key])
                if not stat.S_ISREG(current.st_mode) or current.st_nlink != 1 or (current.st_dev, current.st_ino) != (held.st_dev, held.st_ino):
                    raise StorageError('recovery-required', 'writer lock path was replaced')
            return {'key': key}
        if op == 'install':
            staged = hash_rel(root, request['stagedRel'])
            if staged['sha256'] != request['sha256']:
                raise StorageError('plan-stale', 'staged hash changed')
            with parent_fd(root, request['stagedRel']) as (sp, sn), parent_fd(root, request['rel'], True) as (tp, tn):
                parent_before = os.fstat(tp)
                if request.get('expected'):
                    current = hash_rel(root, request['rel'])
                    same(current, request['expected'])
                    if current['sha256'] != request['expected']['sha256']:
                        raise StorageError('plan-stale', 'overwrite content changed')
                    if current['nlink'] != '1':
                        raise StorageError('unsafe-hardlink', 'cannot overwrite hardlinked content')
                    backup = hash_rel(root, request['backupRel'])
                    if backup['sha256'] != current['sha256']:
                        raise StorageError('recovery-required', 'verified backup required')
                    os.rename(sn, tn, src_dir_fd=sp, dst_dir_fd=tp)
                else:
                    os.link(sn, tn, src_dir_fd=sp, dst_dir_fd=tp, follow_symlinks=False)
                    os.unlink(sn, dir_fd=sp)
                os.utime(tp, ns=(parent_before.st_atime_ns, parent_before.st_mtime_ns))
                os.fsync(tp)
                os.fsync(sp)
            return hash_rel(root, request['rel'])
        if op == 'rmdir':
            with parent_fd(root, request['rel']) as (parent, name):
                info = os.stat(name, dir_fd=parent, follow_symlinks=False)
                expected = request.get('expected')
                if not expected or 'ino' not in expected or 'dev' not in expected:
                    raise StorageError('plan-stale', 'rmdir requires verified container identity credentials')
                if str(info.st_ino) != str(expected['ino']) or str(info.st_dev) != str(expected['dev']):
                    raise StorageError('plan-stale', 'container directory inode changed')
                os.rmdir(name, dir_fd=parent)
                os.fsync(parent)
            return True
        if op == 'unlink':
            for guard in request.get('guards', []):
                with root_fd(guard['root']) as (guard_root, _):
                    guarded = hash_rel(guard_root, guard['rel'])
                    same(guarded, guard['expected'])
                    if guarded['sha256'] != guard['expected']['sha256']:
                        raise StorageError('plan-stale', 'cleanup target changed')
            current = hash_rel(root, request['rel'])
            same(current, request['expected'])
            if current['sha256'] != request['expected']['sha256'] or current['nlink'] != '1':
                raise StorageError('plan-stale', 'unreferenced owned file changed')
            with parent_fd(root, request['rel']) as (parent, name):
                same(fingerprint(os.stat(name, dir_fd=parent, follow_symlinks=False)), current)
                os.unlink(name, dir_fd=parent)
                os.fsync(parent)
            return True
        raise StorageError('path-denied', 'unknown filesystem operation')


for line in sys.stdin:
    try:
        if len(line) > 64 * 1024 * 1024:
            raise StorageError('path-denied', 'request too large')
        request = json.loads(line)
        CURRENT_ID = request['id']
        emit({'id': CURRENT_ID, 'result': execute(request)})
    except Exception as error:
        code = getattr(error, 'code', None)
        if not code:
            code = ('storage-offline' if isinstance(error, (FileNotFoundError, PermissionError)) else
                    'disk-space-insufficient' if isinstance(error, OSError) and error.errno == errno.ENOSPC else
                    'plan-stale' if isinstance(error, FileExistsError) else 'path-denied')
        if isinstance(error, FileNotFoundError) and request.get('op') in ('read', 'stat') and request.get('optional'):
            emit({'id': CURRENT_ID, 'result': None})
        else:
            emit({'id': CURRENT_ID, 'error': {'code': code, 'message': str(error)}})
for key in list(READERS):
    close_reader(key)
for fd in LOCKS.values():
    os.close(fd)
