# CPython private-runtime notices

This directory accompanies the unmodified Astral python-build-standalone CPython 3.13.15+20260807 Darwin install_only payloads. OmniMux does not claim authorship or endorsement by Python, Astral, or the incorporated projects. No Python source or binary was modified during supply verification. The interpreter is invoked only for the plugin's fixed storage helper; pip and ensurepip are not invoked, and `-I -S -B -u` disables site/user-site initialization and bytecode writes.

## Provenance and retained terms

- Official release: https://github.com/astral-sh/python-build-standalone/releases/tag/20260807
- Builder commit: `00c8a06113f11220667c3bcf5fab1672ff9e78ef`.
- `license-index.json` records each retained license's exact file path, SHA-256 and official source archive. Corresponding full-build and install_only interpreter bytes were compared and match for each architecture.
- CPython: PSF License 2 / historical CNRI, BeOpen and CWI terms. Retain the complete payload `python/lib/python3.13/LICENSE.txt` and the full-build `*-LICENSE.cpython.txt` notices (the latter includes additional incorporated-software acknowledgements).
- Declared native dependencies: bzip2 (bzip2-1.0.6); libffi/expat (MIT); ncurses (X11); mpdecimal (BSD-2-Clause); OpenSSL (Apache-2.0 plus upstream-retained historical OpenSSL notice); liblzma (0BSD); SQLite (public domain); Tcl/Tk (TCL); libuuid/libedit (BSD-3-Clause); zlib (Zlib). Copyright, disclaimer, attribution and non-endorsement terms remain in the retained files. Build metadata is authoritative about actual links, not a blanket assertion that all listed variants are bundled.
- Darwin uses system libedit, not GPL readline. The older repository `python-licenses.rst` includes GPL readline for other historical builds and is not used as this artifact's license inventory.
- Upstream Darwin metadata overdeclares `licenses/LICENSE.zlib-ng.txt`, absent from both full archives. Both actual metadata link tables and Mach-O load commands show only system libz; no zlib-ng binary is supplied. This explicit discrepancy is recorded in `license-index.json`, not silently replaced with another distribution.
- Pip 26.2.1 is present unmodified in the upstream payload, with MIT and vendored dependency notices retained both in `_vendor/` and `pip-26.2.1.dist-info/licenses/`. Its certifi CA bundle includes an MPL-2.0 notice: the covered source-form certificate data remains distributed with the notice; MPL does not relicense the plugin. Preserve these source-form files and notices if carrying the upstream payload unchanged. Shipping pip is not permission to enable runtime package installation.

## Distribution boundary

The supply-stage verification is not a legal opinion or a release approval. Shipping must include both the relevant runtime payload's existing notices and this `licenses/` directory. The coordinator must verify the final package whitelist, runtime permissions/identity, required embedded-component notices, signing/notarization and recipient installation behavior before release. Do not ship `archives/`, `evidence/` full build archives, test fixtures or acquisition scripts as customer runtime content. No first-launch downloading or system Python installation is allowed.
