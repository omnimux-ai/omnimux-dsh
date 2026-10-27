# Third-party media inspection

`lib/video-inspect.js` includes unmodified Mediabunny 1.55.3, copyright Vanilagy and contributors, under the Mozilla Public License 2.0. Its original notices remain in the bundle. The complete license is distributed as `lib/mediabunny-LICENSE.txt`.

The corresponding unmodified source is available at https://www.npmjs.com/package/mediabunny/v/1.55.3 (the published package contains `src/`) and https://github.com/Vanilagy/mediabunny. The package version is pinned in this repository's lockfile. This file-level license does not change the license of independently authored OmniMux code, which is the GNU Affero General Public License v3.0 — see this package's `LICENSE`. Mediabunny 1.55.3 is not marked "Incompatible With Secondary Licenses", so MPL-2.0 Section 3.3 permits distributing it as part of a larger work under AGPL-3.0 while the MPL continues to govern that file.

Image inspection uses normal packaged dependencies: pngjs 7.0.0 (MIT), jpeg-js 0.4.4 (BSD-3-Clause), image-size 2.0.4 (MIT), exif-reader 2.0.3 (MIT), and @jsquash/webp 1.5.0 (Apache-2.0; its libwebp codec carries BSD notices). The WebP decoder runs its bundled WebAssembly bytes locally, not a native host extension. Each dependency retains its own upstream license and notices; no dependency source is copied or relicensed in this package.
