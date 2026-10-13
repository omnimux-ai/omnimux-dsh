// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/misc.js
function assert(x) {
  if (!x) {
    throw new Error("Assertion failed.");
  }
}
var normalizeRotation = (rotation) => {
  const mappedRotation = (rotation % 360 + 360) % 360;
  if (mappedRotation === 0 || mappedRotation === 90 || mappedRotation === 180 || mappedRotation === 270) {
    return mappedRotation;
  } else {
    throw new Error(`Invalid rotation ${rotation}.`);
  }
};
var last = (arr) => {
  return arr && arr[arr.length - 1];
};
var readExpGolomb = (bitstream) => {
  let leadingZeroBits = 0;
  while (bitstream.readBits(1) === 0 && leadingZeroBits < 32) {
    leadingZeroBits++;
  }
  if (leadingZeroBits >= 32) {
    throw new Error("Invalid exponential-Golomb code.");
  }
  const result = (1 << leadingZeroBits) - 1 + bitstream.readBits(leadingZeroBits);
  return result;
};
var readSignedExpGolomb = (bitstream) => {
  const codeNum = readExpGolomb(bitstream);
  return (codeNum & 1) === 0 ? -(codeNum >> 1) : codeNum + 1 >> 1;
};
var toUint8Array = (source) => {
  if (source.constructor === Uint8Array) {
    return source;
  } else if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  } else {
    return new Uint8Array(source);
  }
};
var toDataView = (source) => {
  if (source.constructor === DataView) {
    return source;
  } else if (ArrayBuffer.isView(source)) {
    return new DataView(source.buffer, source.byteOffset, source.byteLength);
  } else {
    return new DataView(source);
  }
};
var textDecoder = /* @__PURE__ */ new TextDecoder();
var invertObject = (object) => {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [value, key]));
};
var COLOR_PRIMARIES_MAP = {
  bt709: 1,
  // ITU-R BT.709
  bt470bg: 5,
  // ITU-R BT.470BG
  smpte170m: 6,
  // ITU-R BT.601 525 - SMPTE 170M
  bt2020: 9,
  // ITU-R BT.202
  smpte432: 12
  // SMPTE EG 432-1
};
var COLOR_PRIMARIES_MAP_INVERSE = /* @__PURE__ */ invertObject(COLOR_PRIMARIES_MAP);
var TRANSFER_CHARACTERISTICS_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "smpte170m": 6,
  // SMPTE 170M
  "linear": 8,
  // Linear transfer characteristics
  "iec61966-2-1": 13,
  // IEC 61966-2-1
  "pq": 16,
  // Rec. ITU-R BT.2100-2 perceptual quantization (PQ) system
  "hlg": 18
  // Rec. ITU-R BT.2100-2 hybrid loggamma (HLG) system
};
var TRANSFER_CHARACTERISTICS_MAP_INVERSE = /* @__PURE__ */ invertObject(TRANSFER_CHARACTERISTICS_MAP);
var MATRIX_COEFFICIENTS_MAP = {
  "rgb": 0,
  // Identity
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6,
  // SMPTE 170M
  "bt2020-ncl": 9
  // ITU-R BT.2020-2 (non-constant luminance)
};
var MATRIX_COEFFICIENTS_MAP_INVERSE = /* @__PURE__ */ invertObject(MATRIX_COEFFICIENTS_MAP);
var HEX_STRING_REGEX = /^[0-9a-fA-F]+$/;
var bytesToHexString = (bytes) => {
  return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
};
var hexStringToBytes = (hexString) => {
  assert(hexString.length % 2 === 0);
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  return bytes;
};
var reverseBitsU32 = (x) => {
  x = x >> 1 & 1431655765 | (x & 1431655765) << 1;
  x = x >> 2 & 858993459 | (x & 858993459) << 2;
  x = x >> 4 & 252645135 | (x & 252645135) << 4;
  x = x >> 8 & 16711935 | (x & 16711935) << 8;
  x = x >> 16 & 65535 | (x & 65535) << 16;
  return x >>> 0;
};
var binarySearchExact = (arr, key, valueGetter) => {
  let low = 0;
  let high = arr.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = low + high >> 1;
    const midVal = valueGetter(arr[mid]);
    if (midVal === key) {
      ans = mid;
      high = mid - 1;
    } else if (midVal < key) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
};
var binarySearchLessOrEqual = (arr, key, valueGetter) => {
  let low = 0;
  let high = arr.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = low + (high - low + 1) / 2 | 0;
    const midVal = valueGetter(arr[mid]);
    if (midVal <= key) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans;
};
var promiseWithResolvers = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
var removeItem = (arr, item) => {
  const index = arr.indexOf(item);
  if (index !== -1) {
    arr.splice(index, 1);
  }
};
var findLastIndex = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return i;
    }
  }
  return -1;
};
var assertNever = (x) => {
  throw new Error(`Unexpected value: ${x}`);
};
var getUint24 = (view, byteOffset, littleEndian) => {
  const byte1 = view.getUint8(byteOffset);
  const byte2 = view.getUint8(byteOffset + 1);
  const byte3 = view.getUint8(byteOffset + 2);
  if (littleEndian) {
    return byte1 | byte2 << 8 | byte3 << 16;
  } else {
    return byte1 << 16 | byte2 << 8 | byte3;
  }
};
var clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};
var UNDETERMINED_LANGUAGE = "und";
var roundIfAlmostInteger = (value) => {
  const rounded = Math.round(value);
  if (Math.abs(value / rounded - 1) < 10 * Number.EPSILON) {
    return rounded;
  } else {
    return value;
  }
};
var roundToMultiple = (value, multiple) => {
  return Math.round(value / multiple) * multiple;
};
var roundToDivisor = (value, multiple) => {
  return Math.round(value * multiple) / multiple;
};
var popcount = (value) => {
  let count = 0;
  while (value !== 0) {
    value &= value - 1;
    count++;
  }
  return count;
};
var ISO_639_2_REGEX = /^[a-z]{3}$/;
var isIso639Dash2LanguageCode = (x) => {
  return ISO_639_2_REGEX.test(x);
};
var SECOND_TO_MICROSECOND_FACTOR = 1e6 * (1 + Number.EPSILON);
var isChromiumCache = null;
var isChromium = () => {
  if (isChromiumCache !== null) {
    return isChromiumCache;
  }
  return isChromiumCache = !!(typeof navigator !== "undefined" && (navigator.vendor?.includes("Google Inc") || /Chrome/.test(navigator.userAgent)));
};
var chromiumVersionCache = null;
var getChromiumVersion = () => {
  if (chromiumVersionCache !== null) {
    return chromiumVersionCache;
  }
  if (typeof navigator === "undefined") {
    return null;
  }
  const match = /\bChrome\/(\d+)/.exec(navigator.userAgent);
  if (!match) {
    return null;
  }
  return chromiumVersionCache = Number(match[1]);
};
var NativePromiseConstructor = (async () => {
})().constructor;
var isThenable = (value) => {
  if (value instanceof NativePromiseConstructor || value instanceof Promise) {
    return true;
  }
  return typeof value?.then === "function";
};
var uint8ArraysAreEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
var polyfillSymbolDispose = () => {
  Symbol.dispose ??= /* @__PURE__ */ Symbol("Symbol.dispose");
};
var isNumber = (x) => {
  return typeof x === "number" && !Number.isNaN(x);
};
var arrayCount = (array, predicate) => {
  let count = 0;
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      count++;
    }
  }
  return count;
};
var arrayArgmin = (array, getValue) => {
  let minIndex = -1;
  let minValue = Infinity;
  for (let i = 0; i < array.length; i++) {
    const value = getValue(array[i]);
    if (value < minValue) {
      minValue = value;
      minIndex = i;
    }
  }
  return minIndex;
};
var simplifyRational = (rational) => {
  assert(Number.isInteger(rational.num));
  assert(Number.isInteger(rational.den));
  assert(rational.den !== 0);
  let a = Math.abs(rational.num);
  let b = Math.abs(rational.den);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  const gcd = a || 1;
  return {
    num: rational.num / gcd,
    den: rational.den / gcd
  };
};
var EventEmitter = class {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
  }
  /** Registers a listener for the given event. Returns a function that, when called, removes the listener again. */
  on(event, listener, options) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, /* @__PURE__ */ new Set());
    }
    const entry = { fn: listener, once: options?.once ?? false };
    this._listeners.get(event).add(entry);
    return () => {
      this._listeners.get(event)?.delete(entry);
    };
  }
  /** @internal */
  _emit(...args) {
    const [event, data] = args;
    const listeners = this._listeners.get(event);
    if (!listeners) {
      return;
    }
    for (const entry of listeners) {
      try {
        entry.fn(data);
      } catch (error) {
        console.error(error);
      }
      if (entry.once) {
        listeners.delete(entry);
      }
    }
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/logging.js
var LogLevel;
(function(LogLevel2) {
  LogLevel2[LogLevel2["Silent"] = 0] = "Silent";
  LogLevel2[LogLevel2["Errors"] = 1] = "Errors";
  LogLevel2[LogLevel2["Warnings"] = 2] = "Warnings";
  LogLevel2[LogLevel2["Info"] = 3] = "Info";
})(LogLevel || (LogLevel = {}));
var Logging = class _Logging {
  constructor() {
  }
  /** The current log level. Defaults to {@link LogLevel.Info}. */
  static get level() {
    return _Logging._level;
  }
  static set level(value) {
    if (value !== LogLevel.Silent && value !== LogLevel.Errors && value !== LogLevel.Warnings && value !== LogLevel.Info) {
      throw new TypeError("Invalid log level. Use one of the values of the LogLevel enum.");
    }
    _Logging._level = value;
  }
  /** @internal */
  static get _emitter() {
    return _Logging._emitterInstance ??= new EventEmitter();
  }
  /** Registers a listener for a log event. Returns a function that, when called, removes the listener again. */
  static on(event, listener, options) {
    return _Logging._emitter.on(event, listener, options);
  }
  /** @internal */
  static _error(...args) {
    _Logging._emitter._emit("error", args);
    if (_Logging._level >= LogLevel.Errors) {
      console.error(...args);
    }
  }
  /** @internal */
  static _warn(...args) {
    _Logging._emitter._emit("warn", args);
    if (_Logging._level >= LogLevel.Warnings) {
      console.warn(...args);
    }
  }
  /** @internal */
  static _info(...args) {
    _Logging._emitter._emit("info", args);
    if (_Logging._level >= LogLevel.Info) {
      console.info(...args);
    }
  }
};
Logging._level = LogLevel.Info;
Logging._emitterInstance = null;

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/metadata.js
var RichImageData = class {
  /** Creates a new {@link RichImageData}. */
  constructor(data, mimeType) {
    this.data = data;
    this.mimeType = mimeType;
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (typeof mimeType !== "string") {
      throw new TypeError("mimeType must be a string.");
    }
  }
};
var AttachedFile = class {
  /** Creates a new {@link AttachedFile}. */
  constructor(data, mimeType, name, description) {
    this.data = data;
    this.mimeType = mimeType;
    this.name = name;
    this.description = description;
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (mimeType !== void 0 && typeof mimeType !== "string") {
      throw new TypeError("mimeType, when provided, must be a string.");
    }
    if (name !== void 0 && typeof name !== "string") {
      throw new TypeError("name, when provided, must be a string.");
    }
    if (description !== void 0 && typeof description !== "string") {
      throw new TypeError("description, when provided, must be a string.");
    }
  }
};
var DEFAULT_TRACK_DISPOSITION = {
  default: true,
  primary: true,
  forced: false,
  original: false,
  commentary: false,
  hearingImpaired: false,
  visuallyImpaired: false
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/shared/bitstream.js
var Bitstream = class _Bitstream {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }
  seekToByte(byteOffset) {
    this.pos = 8 * byteOffset;
  }
  readBit() {
    const byteIndex = Math.floor(this.pos / 8);
    const byte = this.bytes[byteIndex] ?? 0;
    const bitIndex = 7 - (this.pos & 7);
    const bit = (byte & 1 << bitIndex) >> bitIndex;
    this.pos++;
    return bit;
  }
  readBits(n) {
    if (n === 1) {
      return this.readBit();
    }
    let result = 0;
    for (let i = 0; i < n; i++) {
      result <<= 1;
      result |= this.readBit();
    }
    return result;
  }
  writeBits(n, value) {
    const end = this.pos + n;
    for (let i = this.pos; i < end; i++) {
      const byteIndex = Math.floor(i / 8);
      let byte = this.bytes[byteIndex];
      const bitIndex = 7 - (i & 7);
      byte &= ~(1 << bitIndex);
      byte |= (value & 1 << end - i - 1) >> end - i - 1 << bitIndex;
      this.bytes[byteIndex] = byte;
    }
    this.pos = end;
  }
  readAlignedByte() {
    if (this.pos % 8 !== 0) {
      throw new Error("Bitstream is not byte-aligned.");
    }
    const byteIndex = this.pos / 8;
    const byte = this.bytes[byteIndex] ?? 0;
    this.pos += 8;
    return byte;
  }
  skipBits(n) {
    this.pos += n;
  }
  getBitsLeft() {
    return this.bytes.length * 8 - this.pos;
  }
  clone() {
    const clone = new _Bitstream(this.bytes);
    clone.pos = this.pos;
    return clone;
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/shared/aac-misc.js
var aacFrequencyTable = [
  96e3,
  88200,
  64e3,
  48e3,
  44100,
  32e3,
  24e3,
  22050,
  16e3,
  12e3,
  11025,
  8e3,
  7350
];
var aacChannelMap = [-1, 1, 2, 3, 4, 5, 6, 8];
var parseAacAudioSpecificConfig = (bytes) => {
  if (!bytes || bytes.byteLength < 2) {
    throw new TypeError("AAC description must be at least 2 bytes long.");
  }
  const bitstream = new Bitstream(bytes);
  const objectType = readAacObjectType(bitstream);
  const { frequencyIndex, sampleRate } = readAacSamplingFrequency(bitstream);
  const channelConfiguration = bitstream.readBits(4);
  let numberOfChannels = null;
  if (channelConfiguration >= 1 && channelConfiguration <= 7) {
    numberOfChannels = aacChannelMap[channelConfiguration];
  }
  let coreObjectType = objectType;
  let psPresent = false;
  let outputSampleRate = sampleRate;
  if (objectType === 5 || objectType === 29) {
    psPresent = objectType === 29;
    outputSampleRate = readAacSamplingFrequency(bitstream).sampleRate;
    coreObjectType = readAacObjectType(bitstream);
    if (coreObjectType === 22) {
      bitstream.skipBits(4);
    }
  } else {
    while (bitstream.getBitsLeft() > 15) {
      const searchStart = bitstream.pos;
      if (bitstream.readBits(11) !== 695) {
        bitstream.pos = searchStart + 1;
        continue;
      }
      if (readAacObjectType(bitstream) === 5 && bitstream.readBits(1)) {
        outputSampleRate = readAacSamplingFrequency(bitstream).sampleRate;
        if (bitstream.getBitsLeft() > 11 && bitstream.readBits(11) === 1352) {
          psPresent = !!bitstream.readBits(1);
        }
      }
      break;
    }
  }
  if (numberOfChannels !== null && numberOfChannels > 1) {
    psPresent = false;
  }
  return {
    objectType,
    coreObjectType,
    frequencyIndex,
    channelConfiguration,
    outputSampleRate,
    outputNumberOfChannels: psPresent && numberOfChannels === 1 ? 2 : numberOfChannels
  };
};
var readAacObjectType = (bitstream) => {
  const objectType = bitstream.readBits(5);
  return objectType === 31 ? 32 + bitstream.readBits(6) : objectType;
};
var readAacSamplingFrequency = (bitstream) => {
  const frequencyIndex = bitstream.readBits(4);
  if (frequencyIndex === 15) {
    return {
      frequencyIndex,
      sampleRate: bitstream.readBits(24)
    };
  }
  return {
    frequencyIndex,
    sampleRate: frequencyIndex < aacFrequencyTable.length ? aacFrequencyTable[frequencyIndex] : null
  };
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/codec.js
var PCM_AUDIO_CODECS = [
  "pcm-s16",
  // We don't prefix 'le' so we're compatible with the WebCodecs-registered PCM codec strings
  "pcm-s16be",
  "pcm-s24",
  "pcm-s24be",
  "pcm-s32",
  "pcm-s32be",
  "pcm-f32",
  "pcm-f32be",
  "pcm-f64",
  "pcm-f64be",
  "pcm-u8",
  "pcm-s8",
  "ulaw",
  "alaw"
];
var NON_PCM_AUDIO_CODECS = [
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "flac",
  "ac3",
  "eac3",
  "dts"
];
var AUDIO_CODECS = [
  ...NON_PCM_AUDIO_CODECS,
  ...PCM_AUDIO_CODECS
];
var AVC_LEVEL_TABLE = [
  { maxMacroblocks: 99, maxBitrate: 64e3, maxDpbMbs: 396, level: 10 },
  // Level 1
  { maxMacroblocks: 396, maxBitrate: 192e3, maxDpbMbs: 900, level: 11 },
  // Level 1.1
  { maxMacroblocks: 396, maxBitrate: 384e3, maxDpbMbs: 2376, level: 12 },
  // Level 1.2
  { maxMacroblocks: 396, maxBitrate: 768e3, maxDpbMbs: 2376, level: 13 },
  // Level 1.3
  { maxMacroblocks: 396, maxBitrate: 2e6, maxDpbMbs: 2376, level: 20 },
  // Level 2
  { maxMacroblocks: 792, maxBitrate: 4e6, maxDpbMbs: 4752, level: 21 },
  // Level 2.1
  { maxMacroblocks: 1620, maxBitrate: 4e6, maxDpbMbs: 8100, level: 22 },
  // Level 2.2
  { maxMacroblocks: 1620, maxBitrate: 1e7, maxDpbMbs: 8100, level: 30 },
  // Level 3
  { maxMacroblocks: 3600, maxBitrate: 14e6, maxDpbMbs: 18e3, level: 31 },
  // Level 3.1
  { maxMacroblocks: 5120, maxBitrate: 2e7, maxDpbMbs: 20480, level: 32 },
  // Level 3.2
  { maxMacroblocks: 8192, maxBitrate: 2e7, maxDpbMbs: 32768, level: 40 },
  // Level 4
  { maxMacroblocks: 8192, maxBitrate: 5e7, maxDpbMbs: 32768, level: 41 },
  // Level 4.1
  { maxMacroblocks: 8704, maxBitrate: 5e7, maxDpbMbs: 34816, level: 42 },
  // Level 4.2
  { maxMacroblocks: 22080, maxBitrate: 135e6, maxDpbMbs: 110400, level: 50 },
  // Level 5
  { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 51 },
  // Level 5.1
  { maxMacroblocks: 36864, maxBitrate: 24e7, maxDpbMbs: 184320, level: 52 },
  // Level 5.2
  { maxMacroblocks: 139264, maxBitrate: 24e7, maxDpbMbs: 696320, level: 60 },
  // Level 6
  { maxMacroblocks: 139264, maxBitrate: 48e7, maxDpbMbs: 696320, level: 61 },
  // Level 6.1
  { maxMacroblocks: 139264, maxBitrate: 8e8, maxDpbMbs: 696320, level: 62 }
  // Level 6.2
];
var VP9_LEVEL_TABLE = [
  { maxPictureSize: 36864, maxBitrate: 2e5, level: 10 },
  // Level 1
  { maxPictureSize: 73728, maxBitrate: 8e5, level: 11 },
  // Level 1.1
  { maxPictureSize: 122880, maxBitrate: 18e5, level: 20 },
  // Level 2
  { maxPictureSize: 245760, maxBitrate: 36e5, level: 21 },
  // Level 2.1
  { maxPictureSize: 552960, maxBitrate: 72e5, level: 30 },
  // Level 3
  { maxPictureSize: 983040, maxBitrate: 12e6, level: 31 },
  // Level 3.1
  { maxPictureSize: 2228224, maxBitrate: 18e6, level: 40 },
  // Level 4
  { maxPictureSize: 2228224, maxBitrate: 3e7, level: 41 },
  // Level 4.1
  { maxPictureSize: 8912896, maxBitrate: 6e7, level: 50 },
  // Level 5
  { maxPictureSize: 8912896, maxBitrate: 12e7, level: 51 },
  // Level 5.1
  { maxPictureSize: 8912896, maxBitrate: 18e7, level: 52 },
  // Level 5.2
  { maxPictureSize: 35651584, maxBitrate: 18e7, level: 60 },
  // Level 6
  { maxPictureSize: 35651584, maxBitrate: 24e7, level: 61 },
  // Level 6.1
  { maxPictureSize: 35651584, maxBitrate: 48e7, level: 62 }
  // Level 6.2
];
var VP9_DEFAULT_SUFFIX = ".01.01.01.01.00";
var AV1_DEFAULT_SUFFIX = ".0.110.01.01.01.0";
var PRORES_FOURCCS = [
  "ap4x",
  // ProRes 4444 XQ
  "ap4h",
  // ProRes 4444
  "apch",
  // ProRes 422 High Quality
  "apcn",
  // ProRes 422 Standard Definition
  "apcs",
  // ProRes 422 LT
  "apco"
  // ProRes 422 Proxy
];
var DTS_FOURCCS = [
  "dtsc",
  // DTS core
  "dtsh",
  // DTS-HD, core plus extension substreams
  "dtsl",
  // DTS-HD Lossless, no core
  "dtse"
  // DTS Express
];
var extractVideoCodecString = (trackInfo) => {
  const { codec, codecDescription, colorSpace, avcCodecInfo, hevcCodecInfo, vp9CodecInfo, av1CodecInfo, proresFormat } = trackInfo;
  if (codec === "avc") {
    assert(trackInfo.avcType !== null);
    if (avcCodecInfo) {
      const bytes = new Uint8Array([
        avcCodecInfo.avcProfileIndication,
        avcCodecInfo.profileCompatibility,
        avcCodecInfo.avcLevelIndication
      ]);
      return `avc${trackInfo.avcType}.${bytesToHexString(bytes)}`;
    }
    if (!codecDescription || codecDescription.byteLength < 4) {
      throw new TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
    }
    return `avc${trackInfo.avcType}.${bytesToHexString(codecDescription.subarray(1, 4))}`;
  } else if (codec === "hevc") {
    let generalProfileSpace;
    let generalProfileIdc;
    let compatibilityFlags;
    let generalTierFlag;
    let generalLevelIdc;
    let constraintFlags;
    if (hevcCodecInfo) {
      generalProfileSpace = hevcCodecInfo.generalProfileSpace;
      generalProfileIdc = hevcCodecInfo.generalProfileIdc;
      compatibilityFlags = reverseBitsU32(hevcCodecInfo.generalProfileCompatibilityFlags);
      generalTierFlag = hevcCodecInfo.generalTierFlag;
      generalLevelIdc = hevcCodecInfo.generalLevelIdc;
      constraintFlags = [...hevcCodecInfo.generalConstraintIndicatorFlags];
    } else {
      if (!codecDescription || codecDescription.byteLength < 23) {
        throw new TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
      }
      const view = toDataView(codecDescription);
      const profileByte = view.getUint8(1);
      generalProfileSpace = profileByte >> 6 & 3;
      generalProfileIdc = profileByte & 31;
      compatibilityFlags = reverseBitsU32(view.getUint32(2));
      generalTierFlag = profileByte >> 5 & 1;
      generalLevelIdc = view.getUint8(12);
      constraintFlags = [];
      for (let i = 0; i < 6; i++) {
        constraintFlags.push(view.getUint8(6 + i));
      }
    }
    let codecString = "hev1.";
    codecString += ["", "A", "B", "C"][generalProfileSpace] + generalProfileIdc;
    codecString += ".";
    codecString += compatibilityFlags.toString(16).toUpperCase();
    codecString += ".";
    codecString += generalTierFlag === 0 ? "L" : "H";
    codecString += generalLevelIdc;
    while (constraintFlags.length > 0 && constraintFlags[constraintFlags.length - 1] === 0) {
      constraintFlags.pop();
    }
    if (constraintFlags.length > 0) {
      codecString += ".";
      codecString += constraintFlags.map((x) => x.toString(16).toUpperCase()).join(".");
    }
    return codecString;
  } else if (codec === "vp8") {
    return "vp8";
  } else if (codec === "vp9") {
    if (!vp9CodecInfo) {
      const pictureSize = trackInfo.width * trackInfo.height;
      let level2 = last(VP9_LEVEL_TABLE).level;
      for (const entry of VP9_LEVEL_TABLE) {
        if (pictureSize <= entry.maxPictureSize) {
          level2 = entry.level;
          break;
        }
      }
      return `vp09.00.${level2.toString().padStart(2, "0")}.08`;
    }
    const profile = vp9CodecInfo.profile.toString().padStart(2, "0");
    const level = vp9CodecInfo.level.toString().padStart(2, "0");
    const bitDepth = vp9CodecInfo.bitDepth.toString().padStart(2, "0");
    const chromaSubsampling = vp9CodecInfo.chromaSubsampling.toString().padStart(2, "0");
    const colourPrimaries = vp9CodecInfo.colourPrimaries.toString().padStart(2, "0");
    const transferCharacteristics = vp9CodecInfo.transferCharacteristics.toString().padStart(2, "0");
    const matrixCoefficients = vp9CodecInfo.matrixCoefficients.toString().padStart(2, "0");
    const videoFullRangeFlag = vp9CodecInfo.videoFullRangeFlag.toString().padStart(2, "0");
    let string = `vp09.${profile}.${level}.${bitDepth}.${chromaSubsampling}`;
    string += `.${colourPrimaries}.${transferCharacteristics}.${matrixCoefficients}.${videoFullRangeFlag}`;
    if (string.endsWith(VP9_DEFAULT_SUFFIX)) {
      string = string.slice(0, -VP9_DEFAULT_SUFFIX.length);
    }
    return string;
  } else if (codec === "av1") {
    if (!av1CodecInfo) {
      const pictureSize = trackInfo.width * trackInfo.height;
      let level2 = last(VP9_LEVEL_TABLE).level;
      for (const entry of VP9_LEVEL_TABLE) {
        if (pictureSize <= entry.maxPictureSize) {
          level2 = entry.level;
          break;
        }
      }
      return `av01.0.${level2.toString().padStart(2, "0")}M.08`;
    }
    const profile = av1CodecInfo.profile;
    const level = av1CodecInfo.level.toString().padStart(2, "0");
    const tier = av1CodecInfo.tier ? "H" : "M";
    const bitDepth = av1CodecInfo.bitDepth.toString().padStart(2, "0");
    const monochrome = av1CodecInfo.monochrome ? "1" : "0";
    const chromaSubsampling = 100 * av1CodecInfo.chromaSubsamplingX + 10 * av1CodecInfo.chromaSubsamplingY + 1 * (av1CodecInfo.chromaSubsamplingX && av1CodecInfo.chromaSubsamplingY ? av1CodecInfo.chromaSamplePosition : 0);
    const colorPrimaries = colorSpace?.primaries ? COLOR_PRIMARIES_MAP[colorSpace.primaries] : 1;
    const transferCharacteristics = colorSpace?.transfer ? TRANSFER_CHARACTERISTICS_MAP[colorSpace.transfer] : 1;
    const matrixCoefficients = colorSpace?.matrix ? MATRIX_COEFFICIENTS_MAP[colorSpace.matrix] : 1;
    const videoFullRangeFlag = colorSpace?.fullRange ? 1 : 0;
    let string = `av01.${profile}.${level}${tier}.${bitDepth}`;
    string += `.${monochrome}.${chromaSubsampling.toString().padStart(3, "0")}`;
    string += `.${colorPrimaries.toString().padStart(2, "0")}`;
    string += `.${transferCharacteristics.toString().padStart(2, "0")}`;
    string += `.${matrixCoefficients.toString().padStart(2, "0")}`;
    string += `.${videoFullRangeFlag}`;
    if (string.endsWith(AV1_DEFAULT_SUFFIX)) {
      string = string.slice(0, -AV1_DEFAULT_SUFFIX.length);
    }
    return string;
  } else if (codec === "prores") {
    return proresFormat ?? "apch";
  } else if (codec !== null) {
    assertNever(codec);
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var extractAudioCodecString = (trackInfo) => {
  const { codec, codecDescription, aacCodecInfo, dtsFormat } = trackInfo;
  if (codec === "aac") {
    if (!aacCodecInfo) {
      throw new TypeError("AAC codec info must be provided.");
    }
    if (aacCodecInfo.isMpeg2) {
      return "mp4a.67";
    } else {
      let objectType;
      if (aacCodecInfo.objectType !== null) {
        objectType = aacCodecInfo.objectType;
      } else {
        const audioSpecificConfig = parseAacAudioSpecificConfig(codecDescription);
        objectType = audioSpecificConfig.objectType;
      }
      return `mp4a.40.${objectType}`;
    }
  } else if (codec === "mp3") {
    return "mp3";
  } else if (codec === "opus") {
    return "opus";
  } else if (codec === "vorbis") {
    return "vorbis";
  } else if (codec === "flac") {
    return "flac";
  } else if (codec === "ac3") {
    return "ac-3";
  } else if (codec === "eac3") {
    return "ec-3";
  } else if (codec === "dts") {
    return dtsFormat ?? "dtsc";
  } else if (codec && PCM_AUDIO_CODECS.includes(codec)) {
    return codec;
  }
  throw new TypeError(`Unhandled codec '${codec}'.`);
};
var OPUS_SAMPLE_RATE = 48e3;
var PCM_CODEC_REGEX = /^pcm-([usf])(\d+)(be)?$/;
var parsePcmCodec = (codec) => {
  assert(PCM_AUDIO_CODECS.includes(codec));
  if (codec === "ulaw") {
    return { dataType: "ulaw", sampleSize: 1, littleEndian: true, silentValue: 255 };
  } else if (codec === "alaw") {
    return { dataType: "alaw", sampleSize: 1, littleEndian: true, silentValue: 213 };
  }
  const match = PCM_CODEC_REGEX.exec(codec);
  assert(match);
  let dataType;
  if (match[1] === "u") {
    dataType = "unsigned";
  } else if (match[1] === "s") {
    dataType = "signed";
  } else {
    dataType = "float";
  }
  const sampleSize = Number(match[2]) / 8;
  const littleEndian = match[3] !== "be";
  const silentValue = codec === "pcm-u8" ? 2 ** 7 : 0;
  return { dataType, sampleSize, littleEndian, silentValue };
};
var VALID_VIDEO_CODEC_STRING_PREFIXES = ["avc1", "avc3", "hev1", "hvc1", "vp8", "vp09", "av01", ...PRORES_FOURCCS];

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/shared/ac3-misc.js
var AC3_SAMPLE_RATES = [48e3, 44100, 32e3];
var EAC3_REDUCED_SAMPLE_RATES = [24e3, 22050, 16e3];

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/codec-data.js
var AvcNalUnitType;
(function(AvcNalUnitType2) {
  AvcNalUnitType2[AvcNalUnitType2["NON_IDR_SLICE"] = 1] = "NON_IDR_SLICE";
  AvcNalUnitType2[AvcNalUnitType2["SLICE_DPA"] = 2] = "SLICE_DPA";
  AvcNalUnitType2[AvcNalUnitType2["SLICE_DPB"] = 3] = "SLICE_DPB";
  AvcNalUnitType2[AvcNalUnitType2["SLICE_DPC"] = 4] = "SLICE_DPC";
  AvcNalUnitType2[AvcNalUnitType2["IDR"] = 5] = "IDR";
  AvcNalUnitType2[AvcNalUnitType2["SEI"] = 6] = "SEI";
  AvcNalUnitType2[AvcNalUnitType2["SPS"] = 7] = "SPS";
  AvcNalUnitType2[AvcNalUnitType2["PPS"] = 8] = "PPS";
  AvcNalUnitType2[AvcNalUnitType2["AUD"] = 9] = "AUD";
  AvcNalUnitType2[AvcNalUnitType2["SPS_EXT"] = 13] = "SPS_EXT";
})(AvcNalUnitType || (AvcNalUnitType = {}));
var HevcNalUnitType;
(function(HevcNalUnitType2) {
  HevcNalUnitType2[HevcNalUnitType2["RASL_N"] = 8] = "RASL_N";
  HevcNalUnitType2[HevcNalUnitType2["RASL_R"] = 9] = "RASL_R";
  HevcNalUnitType2[HevcNalUnitType2["BLA_W_LP"] = 16] = "BLA_W_LP";
  HevcNalUnitType2[HevcNalUnitType2["RSV_IRAP_VCL23"] = 23] = "RSV_IRAP_VCL23";
  HevcNalUnitType2[HevcNalUnitType2["VPS_NUT"] = 32] = "VPS_NUT";
  HevcNalUnitType2[HevcNalUnitType2["SPS_NUT"] = 33] = "SPS_NUT";
  HevcNalUnitType2[HevcNalUnitType2["PPS_NUT"] = 34] = "PPS_NUT";
  HevcNalUnitType2[HevcNalUnitType2["AUD_NUT"] = 35] = "AUD_NUT";
  HevcNalUnitType2[HevcNalUnitType2["PREFIX_SEI_NUT"] = 39] = "PREFIX_SEI_NUT";
  HevcNalUnitType2[HevcNalUnitType2["SUFFIX_SEI_NUT"] = 40] = "SUFFIX_SEI_NUT";
})(HevcNalUnitType || (HevcNalUnitType = {}));
var iterateNalUnitsInAnnexB = function* (packetData) {
  let i = 0;
  let nalStart = -1;
  while (i < packetData.length - 2) {
    const zeroIndex = packetData.indexOf(0, i);
    if (zeroIndex === -1 || zeroIndex >= packetData.length - 2) {
      break;
    }
    i = zeroIndex;
    let startCodeLength = 0;
    if (i + 3 < packetData.length && packetData[i + 1] === 0 && packetData[i + 2] === 0 && packetData[i + 3] === 1) {
      startCodeLength = 4;
    } else if (packetData[i + 1] === 0 && packetData[i + 2] === 1) {
      startCodeLength = 3;
    }
    if (startCodeLength === 0) {
      i++;
      continue;
    }
    if (nalStart !== -1 && i > nalStart) {
      yield {
        offset: nalStart,
        length: i - nalStart
      };
    }
    nalStart = i + startCodeLength;
    i = nalStart;
  }
  if (nalStart !== -1 && nalStart < packetData.length) {
    yield {
      offset: nalStart,
      length: packetData.length - nalStart
    };
  }
};
var iterateNalUnitsInLengthPrefixed = function* (packetData, lengthSize) {
  let offset = 0;
  const dataView = new DataView(packetData.buffer, packetData.byteOffset, packetData.byteLength);
  while (offset + lengthSize <= packetData.length) {
    let nalUnitLength;
    if (lengthSize === 1) {
      nalUnitLength = dataView.getUint8(offset);
    } else if (lengthSize === 2) {
      nalUnitLength = dataView.getUint16(offset, false);
    } else if (lengthSize === 3) {
      nalUnitLength = getUint24(dataView, offset, false);
    } else {
      assert(lengthSize === 4);
      nalUnitLength = dataView.getUint32(offset, false);
    }
    offset += lengthSize;
    yield {
      offset,
      length: nalUnitLength
    };
    offset += nalUnitLength;
  }
};
var iterateAvcNalUnits = (packetData, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes[4] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return iterateNalUnitsInLengthPrefixed(packetData, lengthSize);
  } else {
    return iterateNalUnitsInAnnexB(packetData);
  }
};
var extractNalUnitTypeForAvc = (byte) => {
  return byte & 31;
};
var removeEmulationPreventionBytes = (data) => {
  const result = [];
  const len = data.length;
  for (let i = 0; i < len; i++) {
    if (i + 2 < len && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 3) {
      result.push(0, 0);
      i += 2;
    } else {
      result.push(data[i]);
    }
  }
  return new Uint8Array(result);
};
var ANNEX_B_START_CODE = new Uint8Array([0, 0, 0, 1]);
var extractAvcDecoderConfigurationRecord = (packetData) => {
  try {
    const spsUnits = [];
    const ppsUnits = [];
    const spsExtUnits = [];
    for (const loc of iterateNalUnitsInAnnexB(packetData)) {
      const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
      const type = extractNalUnitTypeForAvc(nalUnit[0]);
      if (type === AvcNalUnitType.SPS) {
        spsUnits.push(nalUnit);
      } else if (type === AvcNalUnitType.PPS) {
        ppsUnits.push(nalUnit);
      } else if (type === AvcNalUnitType.SPS_EXT) {
        spsExtUnits.push(nalUnit);
      }
    }
    if (spsUnits.length === 0) {
      return null;
    }
    if (ppsUnits.length === 0) {
      return null;
    }
    const spsData = spsUnits[0];
    const spsInfo = parseAvcSps(spsData);
    assert(spsInfo !== null);
    const hasExtendedData = spsInfo.profileIdc === 100 || spsInfo.profileIdc === 110 || spsInfo.profileIdc === 122 || spsInfo.profileIdc === 144;
    return {
      configurationVersion: 1,
      avcProfileIndication: spsInfo.profileIdc,
      profileCompatibility: spsInfo.constraintFlags,
      avcLevelIndication: spsInfo.levelIdc,
      lengthSizeMinusOne: 3,
      // Typically 4 bytes for length field
      sequenceParameterSets: spsUnits,
      pictureParameterSets: ppsUnits,
      chromaFormat: hasExtendedData ? spsInfo.chromaFormatIdc : null,
      bitDepthLumaMinus8: hasExtendedData ? spsInfo.bitDepthLumaMinus8 : null,
      bitDepthChromaMinus8: hasExtendedData ? spsInfo.bitDepthChromaMinus8 : null,
      sequenceParameterSetExt: hasExtendedData ? spsExtUnits : null
    };
  } catch (error) {
    Logging._error("Error building AVC Decoder Configuration Record:", error);
    return null;
  }
};
var AVC_HEVC_ASPECT_RATIO_IDC_TABLE = {
  1: { num: 1, den: 1 },
  2: { num: 12, den: 11 },
  3: { num: 10, den: 11 },
  4: { num: 16, den: 11 },
  5: { num: 40, den: 33 },
  6: { num: 24, den: 11 },
  7: { num: 20, den: 11 },
  8: { num: 32, den: 11 },
  9: { num: 80, den: 33 },
  10: { num: 18, den: 11 },
  11: { num: 15, den: 11 },
  12: { num: 64, den: 33 },
  13: { num: 160, den: 99 },
  14: { num: 4, den: 3 },
  15: { num: 3, den: 2 },
  16: { num: 2, den: 1 }
};
var parseAvcSps = (sps) => {
  try {
    const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
    bitstream.skipBits(1);
    bitstream.skipBits(2);
    const nalUnitType = bitstream.readBits(5);
    if (nalUnitType !== 7) {
      return null;
    }
    const profileIdc = bitstream.readAlignedByte();
    const constraintFlags = bitstream.readAlignedByte();
    const levelIdc = bitstream.readAlignedByte();
    readExpGolomb(bitstream);
    let chromaFormatIdc = 1;
    let bitDepthLumaMinus8 = 0;
    let bitDepthChromaMinus8 = 0;
    let separateColourPlaneFlag = 0;
    if (profileIdc === 100 || profileIdc === 110 || profileIdc === 122 || profileIdc === 244 || profileIdc === 44 || profileIdc === 83 || profileIdc === 86 || profileIdc === 118 || profileIdc === 128) {
      chromaFormatIdc = readExpGolomb(bitstream);
      if (chromaFormatIdc === 3) {
        separateColourPlaneFlag = bitstream.readBits(1);
      }
      bitDepthLumaMinus8 = readExpGolomb(bitstream);
      bitDepthChromaMinus8 = readExpGolomb(bitstream);
      bitstream.skipBits(1);
      const seqScalingMatrixPresentFlag = bitstream.readBits(1);
      if (seqScalingMatrixPresentFlag) {
        for (let i = 0; i < (chromaFormatIdc !== 3 ? 8 : 12); i++) {
          const seqScalingListPresentFlag = bitstream.readBits(1);
          if (seqScalingListPresentFlag) {
            const sizeOfScalingList = i < 6 ? 16 : 64;
            let lastScale = 8;
            let nextScale = 8;
            for (let j = 0; j < sizeOfScalingList; j++) {
              if (nextScale !== 0) {
                const deltaScale = readSignedExpGolomb(bitstream);
                nextScale = (lastScale + deltaScale + 256) % 256;
              }
              lastScale = nextScale === 0 ? lastScale : nextScale;
            }
          }
        }
      }
    }
    readExpGolomb(bitstream);
    const picOrderCntType = readExpGolomb(bitstream);
    if (picOrderCntType === 0) {
      readExpGolomb(bitstream);
    } else if (picOrderCntType === 1) {
      bitstream.skipBits(1);
      readSignedExpGolomb(bitstream);
      readSignedExpGolomb(bitstream);
      const numRefFramesInPicOrderCntCycle = readExpGolomb(bitstream);
      for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
        readSignedExpGolomb(bitstream);
      }
    }
    readExpGolomb(bitstream);
    bitstream.skipBits(1);
    const picWidthInMbsMinus1 = readExpGolomb(bitstream);
    const picHeightInMapUnitsMinus1 = readExpGolomb(bitstream);
    const codedWidth = 16 * (picWidthInMbsMinus1 + 1);
    const codedHeight = 16 * (picHeightInMapUnitsMinus1 + 1);
    let displayWidth = codedWidth;
    let displayHeight = codedHeight;
    const frameMbsOnlyFlag = bitstream.readBits(1);
    if (!frameMbsOnlyFlag) {
      bitstream.skipBits(1);
    }
    bitstream.skipBits(1);
    const frameCroppingFlag = bitstream.readBits(1);
    if (frameCroppingFlag) {
      const frameCropLeftOffset = readExpGolomb(bitstream);
      const frameCropRightOffset = readExpGolomb(bitstream);
      const frameCropTopOffset = readExpGolomb(bitstream);
      const frameCropBottomOffset = readExpGolomb(bitstream);
      let cropUnitX;
      let cropUnitY;
      const chromaArrayType = separateColourPlaneFlag === 0 ? chromaFormatIdc : 0;
      if (chromaArrayType === 0) {
        cropUnitX = 1;
        cropUnitY = 2 - frameMbsOnlyFlag;
      } else {
        const subWidthC = chromaFormatIdc === 3 ? 1 : 2;
        const subHeightC = chromaFormatIdc === 1 ? 2 : 1;
        cropUnitX = subWidthC;
        cropUnitY = subHeightC * (2 - frameMbsOnlyFlag);
      }
      displayWidth -= cropUnitX * (frameCropLeftOffset + frameCropRightOffset);
      displayHeight -= cropUnitY * (frameCropTopOffset + frameCropBottomOffset);
    }
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    let fullRangeFlag = 0;
    let pixelAspectRatio = { num: 1, den: 1 };
    let numReorderFrames = null;
    let maxDecFrameBuffering = null;
    const vuiParametersPresentFlag = bitstream.readBits(1);
    if (vuiParametersPresentFlag) {
      const aspectRatioInfoPresentFlag = bitstream.readBits(1);
      if (aspectRatioInfoPresentFlag) {
        const aspectRatioIdc = bitstream.readBits(8);
        if (aspectRatioIdc === 255) {
          pixelAspectRatio = {
            num: bitstream.readBits(16),
            den: bitstream.readBits(16)
          };
        } else {
          const aspectRatio = AVC_HEVC_ASPECT_RATIO_IDC_TABLE[aspectRatioIdc];
          if (aspectRatio) {
            pixelAspectRatio = aspectRatio;
          }
        }
      }
      const overscanInfoPresentFlag = bitstream.readBits(1);
      if (overscanInfoPresentFlag) {
        bitstream.skipBits(1);
      }
      const videoSignalTypePresentFlag = bitstream.readBits(1);
      if (videoSignalTypePresentFlag) {
        bitstream.skipBits(3);
        fullRangeFlag = bitstream.readBits(1);
        const colourDescriptionPresentFlag = bitstream.readBits(1);
        if (colourDescriptionPresentFlag) {
          colourPrimaries = bitstream.readBits(8);
          transferCharacteristics = bitstream.readBits(8);
          matrixCoefficients = bitstream.readBits(8);
        }
      }
      const chromaLocInfoPresentFlag = bitstream.readBits(1);
      if (chromaLocInfoPresentFlag) {
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
      }
      const timingInfoPresentFlag = bitstream.readBits(1);
      if (timingInfoPresentFlag) {
        bitstream.skipBits(32);
        bitstream.skipBits(32);
        bitstream.skipBits(1);
      }
      const nalHrdParametersPresentFlag = bitstream.readBits(1);
      if (nalHrdParametersPresentFlag) {
        skipAvcHrdParameters(bitstream);
      }
      const vclHrdParametersPresentFlag = bitstream.readBits(1);
      if (vclHrdParametersPresentFlag) {
        skipAvcHrdParameters(bitstream);
      }
      if (nalHrdParametersPresentFlag || vclHrdParametersPresentFlag) {
        bitstream.skipBits(1);
      }
      bitstream.skipBits(1);
      const bitstreamRestrictionFlag = bitstream.readBits(1);
      if (bitstreamRestrictionFlag) {
        bitstream.skipBits(1);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        readExpGolomb(bitstream);
        numReorderFrames = readExpGolomb(bitstream);
        maxDecFrameBuffering = readExpGolomb(bitstream);
      }
    }
    if (numReorderFrames === null) {
      assert(maxDecFrameBuffering === null);
      const constraintSet3Flag = constraintFlags & 16;
      if ((profileIdc === 44 || profileIdc === 86 || profileIdc === 100 || profileIdc === 110 || profileIdc === 122 || profileIdc === 244) && constraintSet3Flag) {
        numReorderFrames = 0;
        maxDecFrameBuffering = 0;
      } else {
        const picWidthInMbs = picWidthInMbsMinus1 + 1;
        const picHeightInMapUnits = picHeightInMapUnitsMinus1 + 1;
        const frameHeightInMbs = (2 - frameMbsOnlyFlag) * picHeightInMapUnits;
        const levelInfo = AVC_LEVEL_TABLE.find((x) => x.level >= levelIdc) ?? last(AVC_LEVEL_TABLE);
        const maxDpbFrames = Math.min(Math.floor(levelInfo.maxDpbMbs / (picWidthInMbs * frameHeightInMbs)), 16);
        numReorderFrames = maxDpbFrames;
        maxDecFrameBuffering = maxDpbFrames;
      }
    }
    assert(maxDecFrameBuffering !== null);
    return {
      profileIdc,
      constraintFlags,
      levelIdc,
      frameMbsOnlyFlag,
      chromaFormatIdc,
      bitDepthLumaMinus8,
      bitDepthChromaMinus8,
      codedWidth,
      codedHeight,
      displayWidth,
      displayHeight,
      pixelAspectRatio,
      colourPrimaries,
      matrixCoefficients,
      transferCharacteristics,
      fullRangeFlag,
      numReorderFrames,
      maxDecFrameBuffering
    };
  } catch (error) {
    Logging._error("Error parsing AVC SPS:", error);
    return null;
  }
};
var skipAvcHrdParameters = (bitstream) => {
  const cpb_cnt_minus1 = readExpGolomb(bitstream);
  bitstream.skipBits(4);
  bitstream.skipBits(4);
  for (let i = 0; i <= cpb_cnt_minus1; i++) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    bitstream.skipBits(1);
  }
  bitstream.skipBits(5);
  bitstream.skipBits(5);
  bitstream.skipBits(5);
  bitstream.skipBits(5);
};
var iterateHevcNalUnits = (packetData, decoderConfig) => {
  if (decoderConfig.description) {
    const bytes = toUint8Array(decoderConfig.description);
    const lengthSizeMinusOne = bytes[21] & 3;
    const lengthSize = lengthSizeMinusOne + 1;
    return iterateNalUnitsInLengthPrefixed(packetData, lengthSize);
  } else {
    return iterateNalUnitsInAnnexB(packetData);
  }
};
var extractNalUnitTypeForHevc = (byte) => {
  return byte >> 1 & 63;
};
var parseHevcSps = (sps) => {
  try {
    const bitstream = new Bitstream(removeEmulationPreventionBytes(sps));
    bitstream.skipBits(16);
    bitstream.readBits(4);
    const spsMaxSubLayersMinus1 = bitstream.readBits(3);
    const spsTemporalIdNestingFlag = bitstream.readBits(1);
    const { general_profile_space, general_tier_flag, general_profile_idc, general_profile_compatibility_flags, general_constraint_indicator_flags, general_level_idc } = parseProfileTierLevel(bitstream, spsMaxSubLayersMinus1);
    readExpGolomb(bitstream);
    const chromaFormatIdc = readExpGolomb(bitstream);
    let separateColourPlaneFlag = 0;
    if (chromaFormatIdc === 3) {
      separateColourPlaneFlag = bitstream.readBits(1);
    }
    const picWidthInLumaSamples = readExpGolomb(bitstream);
    const picHeightInLumaSamples = readExpGolomb(bitstream);
    let displayWidth = picWidthInLumaSamples;
    let displayHeight = picHeightInLumaSamples;
    if (bitstream.readBits(1)) {
      const confWinLeftOffset = readExpGolomb(bitstream);
      const confWinRightOffset = readExpGolomb(bitstream);
      const confWinTopOffset = readExpGolomb(bitstream);
      const confWinBottomOffset = readExpGolomb(bitstream);
      let subWidthC = 1;
      let subHeightC = 1;
      const chromaArrayType = separateColourPlaneFlag === 0 ? chromaFormatIdc : 0;
      if (chromaArrayType === 1) {
        subWidthC = 2;
        subHeightC = 2;
      } else if (chromaArrayType === 2) {
        subWidthC = 2;
        subHeightC = 1;
      }
      displayWidth -= (confWinLeftOffset + confWinRightOffset) * subWidthC;
      displayHeight -= (confWinTopOffset + confWinBottomOffset) * subHeightC;
    }
    const bitDepthLumaMinus8 = readExpGolomb(bitstream);
    const bitDepthChromaMinus8 = readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    const spsSubLayerOrderingInfoPresentFlag = bitstream.readBits(1);
    const startI = spsSubLayerOrderingInfoPresentFlag ? 0 : spsMaxSubLayersMinus1;
    let spsMaxNumReorderPics = 0;
    for (let i = startI; i <= spsMaxSubLayersMinus1; i++) {
      readExpGolomb(bitstream);
      spsMaxNumReorderPics = readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (bitstream.readBits(1)) {
      if (bitstream.readBits(1)) {
        skipScalingListData(bitstream);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    if (bitstream.readBits(1)) {
      bitstream.skipBits(4);
      bitstream.skipBits(4);
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
      bitstream.skipBits(1);
    }
    const numShortTermRefPicSets = readExpGolomb(bitstream);
    skipAllStRefPicSets(bitstream, numShortTermRefPicSets);
    if (bitstream.readBits(1)) {
      const numLongTermRefPicsSps = readExpGolomb(bitstream);
      for (let i = 0; i < numLongTermRefPicsSps; i++) {
        readExpGolomb(bitstream);
        bitstream.skipBits(1);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    let colourPrimaries = 2;
    let transferCharacteristics = 2;
    let matrixCoefficients = 2;
    let fullRangeFlag = 0;
    let minSpatialSegmentationIdc = 0;
    let pixelAspectRatio = { num: 1, den: 1 };
    if (bitstream.readBits(1)) {
      const vui = parseHevcVui(bitstream, spsMaxSubLayersMinus1);
      pixelAspectRatio = vui.pixelAspectRatio;
      colourPrimaries = vui.colourPrimaries;
      transferCharacteristics = vui.transferCharacteristics;
      matrixCoefficients = vui.matrixCoefficients;
      fullRangeFlag = vui.fullRangeFlag;
      minSpatialSegmentationIdc = vui.minSpatialSegmentationIdc;
    }
    return {
      displayWidth,
      displayHeight,
      pixelAspectRatio,
      colourPrimaries,
      transferCharacteristics,
      matrixCoefficients,
      fullRangeFlag,
      maxDecFrameBuffering: spsMaxNumReorderPics + 1,
      spsMaxSubLayersMinus1,
      spsTemporalIdNestingFlag,
      generalProfileSpace: general_profile_space,
      generalTierFlag: general_tier_flag,
      generalProfileIdc: general_profile_idc,
      generalProfileCompatibilityFlags: general_profile_compatibility_flags,
      generalConstraintIndicatorFlags: general_constraint_indicator_flags,
      generalLevelIdc: general_level_idc,
      chromaFormatIdc,
      bitDepthLumaMinus8,
      bitDepthChromaMinus8,
      minSpatialSegmentationIdc
    };
  } catch (error) {
    Logging._error("Error parsing HEVC SPS:", error);
    return null;
  }
};
var extractHevcDecoderConfigurationRecord = (packetData) => {
  try {
    const vpsUnits = [];
    const spsUnits = [];
    const ppsUnits = [];
    const seiUnits = [];
    for (const loc of iterateNalUnitsInAnnexB(packetData)) {
      const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
      const type = extractNalUnitTypeForHevc(nalUnit[0]);
      if (type === HevcNalUnitType.VPS_NUT) {
        vpsUnits.push(nalUnit);
      } else if (type === HevcNalUnitType.SPS_NUT) {
        spsUnits.push(nalUnit);
      } else if (type === HevcNalUnitType.PPS_NUT) {
        ppsUnits.push(nalUnit);
      } else if (type === HevcNalUnitType.PREFIX_SEI_NUT || type === HevcNalUnitType.SUFFIX_SEI_NUT) {
        seiUnits.push(nalUnit);
      }
    }
    if (spsUnits.length === 0 || ppsUnits.length === 0)
      return null;
    const spsInfo = parseHevcSps(spsUnits[0]);
    if (!spsInfo)
      return null;
    let parallelismType = 0;
    if (ppsUnits.length > 0) {
      const pps = ppsUnits[0];
      const ppsBitstream = new Bitstream(removeEmulationPreventionBytes(pps));
      ppsBitstream.skipBits(16);
      readExpGolomb(ppsBitstream);
      readExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(3);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      readExpGolomb(ppsBitstream);
      readExpGolomb(ppsBitstream);
      readSignedExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      if (ppsBitstream.readBits(1)) {
        readExpGolomb(ppsBitstream);
      }
      readSignedExpGolomb(ppsBitstream);
      readSignedExpGolomb(ppsBitstream);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      ppsBitstream.skipBits(1);
      const tiles_enabled_flag = ppsBitstream.readBits(1);
      const entropy_coding_sync_enabled_flag = ppsBitstream.readBits(1);
      if (!tiles_enabled_flag && !entropy_coding_sync_enabled_flag)
        parallelismType = 0;
      else if (tiles_enabled_flag && !entropy_coding_sync_enabled_flag)
        parallelismType = 2;
      else if (!tiles_enabled_flag && entropy_coding_sync_enabled_flag)
        parallelismType = 3;
      else
        parallelismType = 0;
    }
    const arrays = [
      ...vpsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: HevcNalUnitType.VPS_NUT,
          nalUnits: vpsUnits
        }
      ] : [],
      ...spsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: HevcNalUnitType.SPS_NUT,
          nalUnits: spsUnits
        }
      ] : [],
      ...ppsUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: HevcNalUnitType.PPS_NUT,
          nalUnits: ppsUnits
        }
      ] : [],
      ...seiUnits.length ? [
        {
          arrayCompleteness: 1,
          nalUnitType: extractNalUnitTypeForHevc(seiUnits[0][0]),
          nalUnits: seiUnits
        }
      ] : []
    ];
    const record = {
      configurationVersion: 1,
      generalProfileSpace: spsInfo.generalProfileSpace,
      generalTierFlag: spsInfo.generalTierFlag,
      generalProfileIdc: spsInfo.generalProfileIdc,
      generalProfileCompatibilityFlags: spsInfo.generalProfileCompatibilityFlags,
      generalConstraintIndicatorFlags: spsInfo.generalConstraintIndicatorFlags,
      generalLevelIdc: spsInfo.generalLevelIdc,
      minSpatialSegmentationIdc: spsInfo.minSpatialSegmentationIdc,
      parallelismType,
      chromaFormatIdc: spsInfo.chromaFormatIdc,
      bitDepthLumaMinus8: spsInfo.bitDepthLumaMinus8,
      bitDepthChromaMinus8: spsInfo.bitDepthChromaMinus8,
      avgFrameRate: 0,
      constantFrameRate: 0,
      numTemporalLayers: spsInfo.spsMaxSubLayersMinus1 + 1,
      temporalIdNested: spsInfo.spsTemporalIdNestingFlag,
      lengthSizeMinusOne: 3,
      arrays
    };
    return record;
  } catch (error) {
    Logging._error("Error building HEVC Decoder Configuration Record:", error);
    return null;
  }
};
var parseProfileTierLevel = (bitstream, maxNumSubLayersMinus1) => {
  const general_profile_space = bitstream.readBits(2);
  const general_tier_flag = bitstream.readBits(1);
  const general_profile_idc = bitstream.readBits(5);
  let general_profile_compatibility_flags = 0;
  for (let i = 0; i < 32; i++) {
    general_profile_compatibility_flags = general_profile_compatibility_flags << 1 | bitstream.readBits(1);
  }
  const general_constraint_indicator_flags = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    general_constraint_indicator_flags[i] = bitstream.readBits(8);
  }
  const general_level_idc = bitstream.readBits(8);
  const sub_layer_profile_present_flag = [];
  const sub_layer_level_present_flag = [];
  for (let i = 0; i < maxNumSubLayersMinus1; i++) {
    sub_layer_profile_present_flag.push(bitstream.readBits(1));
    sub_layer_level_present_flag.push(bitstream.readBits(1));
  }
  if (maxNumSubLayersMinus1 > 0) {
    for (let i = maxNumSubLayersMinus1; i < 8; i++) {
      bitstream.skipBits(2);
    }
  }
  for (let i = 0; i < maxNumSubLayersMinus1; i++) {
    if (sub_layer_profile_present_flag[i])
      bitstream.skipBits(88);
    if (sub_layer_level_present_flag[i])
      bitstream.skipBits(8);
  }
  return {
    general_profile_space,
    general_tier_flag,
    general_profile_idc,
    general_profile_compatibility_flags,
    general_constraint_indicator_flags,
    general_level_idc
  };
};
var skipScalingListData = (bitstream) => {
  for (let sizeId = 0; sizeId < 4; sizeId++) {
    for (let matrixId = 0; matrixId < (sizeId === 3 ? 2 : 6); matrixId++) {
      const scaling_list_pred_mode_flag = bitstream.readBits(1);
      if (!scaling_list_pred_mode_flag) {
        readExpGolomb(bitstream);
      } else {
        const coefNum = Math.min(64, 1 << 4 + (sizeId << 1));
        if (sizeId > 1) {
          readSignedExpGolomb(bitstream);
        }
        for (let i = 0; i < coefNum; i++) {
          readSignedExpGolomb(bitstream);
        }
      }
    }
  }
};
var skipAllStRefPicSets = (bitstream, num_short_term_ref_pic_sets) => {
  const NumDeltaPocs = [];
  for (let stRpsIdx = 0; stRpsIdx < num_short_term_ref_pic_sets; stRpsIdx++) {
    NumDeltaPocs[stRpsIdx] = skipStRefPicSet(bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs);
  }
};
var skipStRefPicSet = (bitstream, stRpsIdx, num_short_term_ref_pic_sets, NumDeltaPocs) => {
  let NumDeltaPocsThis = 0;
  let inter_ref_pic_set_prediction_flag = 0;
  let RefRpsIdx = 0;
  if (stRpsIdx !== 0) {
    inter_ref_pic_set_prediction_flag = bitstream.readBits(1);
  }
  if (inter_ref_pic_set_prediction_flag) {
    if (stRpsIdx === num_short_term_ref_pic_sets) {
      const delta_idx_minus1 = readExpGolomb(bitstream);
      RefRpsIdx = stRpsIdx - (delta_idx_minus1 + 1);
    } else {
      RefRpsIdx = stRpsIdx - 1;
    }
    bitstream.readBits(1);
    readExpGolomb(bitstream);
    const numDelta = NumDeltaPocs[RefRpsIdx] ?? 0;
    for (let j = 0; j <= numDelta; j++) {
      const used_by_curr_pic_flag = bitstream.readBits(1);
      if (!used_by_curr_pic_flag) {
        bitstream.readBits(1);
      }
    }
    NumDeltaPocsThis = NumDeltaPocs[RefRpsIdx];
  } else {
    const num_negative_pics = readExpGolomb(bitstream);
    const num_positive_pics = readExpGolomb(bitstream);
    for (let i = 0; i < num_negative_pics; i++) {
      readExpGolomb(bitstream);
      bitstream.readBits(1);
    }
    for (let i = 0; i < num_positive_pics; i++) {
      readExpGolomb(bitstream);
      bitstream.readBits(1);
    }
    NumDeltaPocsThis = num_negative_pics + num_positive_pics;
  }
  return NumDeltaPocsThis;
};
var parseHevcVui = (bitstream, sps_max_sub_layers_minus1) => {
  let colourPrimaries = 2;
  let transferCharacteristics = 2;
  let matrixCoefficients = 2;
  let fullRangeFlag = 0;
  let minSpatialSegmentationIdc = 0;
  let pixelAspectRatio = { num: 1, den: 1 };
  if (bitstream.readBits(1)) {
    const aspect_ratio_idc = bitstream.readBits(8);
    if (aspect_ratio_idc === 255) {
      pixelAspectRatio = {
        num: bitstream.readBits(16),
        den: bitstream.readBits(16)
      };
    } else {
      const aspectRatio = AVC_HEVC_ASPECT_RATIO_IDC_TABLE[aspect_ratio_idc];
      if (aspectRatio) {
        pixelAspectRatio = aspectRatio;
      }
    }
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(1);
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(3);
    fullRangeFlag = bitstream.readBits(1);
    if (bitstream.readBits(1)) {
      colourPrimaries = bitstream.readBits(8);
      transferCharacteristics = bitstream.readBits(8);
      matrixCoefficients = bitstream.readBits(8);
    }
  }
  if (bitstream.readBits(1)) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  bitstream.readBits(1);
  bitstream.readBits(1);
  bitstream.readBits(1);
  if (bitstream.readBits(1)) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(32);
    bitstream.readBits(32);
    if (bitstream.readBits(1)) {
      readExpGolomb(bitstream);
    }
    if (bitstream.readBits(1)) {
      skipHevcHrdParameters(bitstream, true, sps_max_sub_layers_minus1);
    }
  }
  if (bitstream.readBits(1)) {
    bitstream.readBits(1);
    bitstream.readBits(1);
    bitstream.readBits(1);
    minSpatialSegmentationIdc = readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
  }
  return {
    pixelAspectRatio,
    colourPrimaries,
    transferCharacteristics,
    matrixCoefficients,
    fullRangeFlag,
    minSpatialSegmentationIdc
  };
};
var skipHevcHrdParameters = (bitstream, commonInfPresentFlag, maxNumSubLayersMinus1) => {
  let nal_hrd_parameters_present_flag = false;
  let vcl_hrd_parameters_present_flag = false;
  let sub_pic_hrd_params_present_flag = false;
  if (commonInfPresentFlag) {
    nal_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
    vcl_hrd_parameters_present_flag = bitstream.readBits(1) === 1;
    if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
      sub_pic_hrd_params_present_flag = bitstream.readBits(1) === 1;
      if (sub_pic_hrd_params_present_flag) {
        bitstream.readBits(8);
        bitstream.readBits(5);
        bitstream.readBits(1);
        bitstream.readBits(5);
      }
      bitstream.readBits(4);
      bitstream.readBits(4);
      if (sub_pic_hrd_params_present_flag) {
        bitstream.readBits(4);
      }
      bitstream.readBits(5);
      bitstream.readBits(5);
      bitstream.readBits(5);
    }
  }
  for (let i = 0; i <= maxNumSubLayersMinus1; i++) {
    const fixed_pic_rate_general_flag = bitstream.readBits(1) === 1;
    let fixed_pic_rate_within_cvs_flag = true;
    if (!fixed_pic_rate_general_flag) {
      fixed_pic_rate_within_cvs_flag = bitstream.readBits(1) === 1;
    }
    let low_delay_hrd_flag = false;
    if (fixed_pic_rate_within_cvs_flag) {
      readExpGolomb(bitstream);
    } else {
      low_delay_hrd_flag = bitstream.readBits(1) === 1;
    }
    let CpbCnt = 1;
    if (!low_delay_hrd_flag) {
      const cpb_cnt_minus1 = readExpGolomb(bitstream);
      CpbCnt = cpb_cnt_minus1 + 1;
    }
    if (nal_hrd_parameters_present_flag) {
      skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
    }
    if (vcl_hrd_parameters_present_flag) {
      skipSubLayerHrdParameters(bitstream, CpbCnt, sub_pic_hrd_params_present_flag);
    }
  }
};
var skipSubLayerHrdParameters = (bitstream, CpbCnt, sub_pic_hrd_params_present_flag) => {
  for (let i = 0; i < CpbCnt; i++) {
    readExpGolomb(bitstream);
    readExpGolomb(bitstream);
    if (sub_pic_hrd_params_present_flag) {
      readExpGolomb(bitstream);
      readExpGolomb(bitstream);
    }
    bitstream.readBits(1);
  }
};
var HevcNaluOrderState;
(function(HevcNaluOrderState2) {
  HevcNaluOrderState2[HevcNaluOrderState2["audAllowed"] = 0] = "audAllowed";
  HevcNaluOrderState2[HevcNaluOrderState2["beforeFirstVcl"] = 1] = "beforeFirstVcl";
  HevcNaluOrderState2[HevcNaluOrderState2["afterFirstVcl"] = 2] = "afterFirstVcl";
  HevcNaluOrderState2[HevcNaluOrderState2["eoBitstreamAllowed"] = 3] = "eoBitstreamAllowed";
  HevcNaluOrderState2[HevcNaluOrderState2["noMoreDataAllowed"] = 4] = "noMoreDataAllowed";
})(HevcNaluOrderState || (HevcNaluOrderState = {}));
var extractVp9CodecInfoFromPacket = (packet) => {
  const bitstream = new Bitstream(packet);
  const frameMarker = bitstream.readBits(2);
  if (frameMarker !== 2) {
    return null;
  }
  const profileLowBit = bitstream.readBits(1);
  const profileHighBit = bitstream.readBits(1);
  const profile = (profileHighBit << 1) + profileLowBit;
  if (profile === 3) {
    bitstream.skipBits(1);
  }
  const showExistingFrame = bitstream.readBits(1);
  if (showExistingFrame === 1) {
    return null;
  }
  const frameType = bitstream.readBits(1);
  if (frameType !== 0) {
    return null;
  }
  bitstream.skipBits(2);
  const syncCode = bitstream.readBits(24);
  if (syncCode !== 4817730) {
    return null;
  }
  let bitDepth = 8;
  if (profile >= 2) {
    const tenOrTwelveBit = bitstream.readBits(1);
    bitDepth = tenOrTwelveBit ? 12 : 10;
  }
  const colorSpace = bitstream.readBits(3);
  let chromaSubsampling = 0;
  let videoFullRangeFlag = 0;
  if (colorSpace !== 7) {
    const colorRange = bitstream.readBits(1);
    videoFullRangeFlag = colorRange;
    if (profile === 1 || profile === 3) {
      const subsamplingX = bitstream.readBits(1);
      const subsamplingY = bitstream.readBits(1);
      chromaSubsampling = !subsamplingX && !subsamplingY ? 3 : subsamplingX && !subsamplingY ? 2 : 1;
      bitstream.skipBits(1);
    } else {
      chromaSubsampling = 1;
    }
  } else {
    chromaSubsampling = 3;
    videoFullRangeFlag = 1;
  }
  const widthMinusOne = bitstream.readBits(16);
  const heightMinusOne = bitstream.readBits(16);
  const width = widthMinusOne + 1;
  const height = heightMinusOne + 1;
  const pictureSize = width * height;
  let level = last(VP9_LEVEL_TABLE).level;
  for (const entry of VP9_LEVEL_TABLE) {
    if (pictureSize <= entry.maxPictureSize) {
      level = entry.level;
      break;
    }
  }
  const matrixCoefficients = colorSpace === 7 ? 0 : colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  const colourPrimaries = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  const transferCharacteristics = colorSpace === 2 ? 1 : colorSpace === 1 ? 6 : 2;
  return {
    profile,
    level,
    bitDepth,
    chromaSubsampling,
    videoFullRangeFlag,
    colourPrimaries,
    transferCharacteristics,
    matrixCoefficients
  };
};
var iterateAv1PacketObus = function* (packet) {
  const bitstream = new Bitstream(packet);
  const readLeb128 = () => {
    let value = 0;
    for (let i = 0; i < 8; i++) {
      const byte = bitstream.readAlignedByte();
      value |= (byte & 127) << i * 7;
      if (!(byte & 128)) {
        break;
      }
      if (i === 7 && byte & 128) {
        return null;
      }
    }
    if (value >= 2 ** 32 - 1) {
      return null;
    }
    return value;
  };
  while (bitstream.getBitsLeft() >= 8) {
    bitstream.skipBits(1);
    const obuType = bitstream.readBits(4);
    const obuExtension = bitstream.readBits(1);
    const obuHasSizeField = bitstream.readBits(1);
    bitstream.skipBits(1);
    if (obuExtension) {
      bitstream.skipBits(8);
    }
    let obuSize;
    if (obuHasSizeField) {
      const obuSizeValue = readLeb128();
      if (obuSizeValue === null)
        return;
      obuSize = obuSizeValue;
    } else {
      obuSize = Math.floor(bitstream.getBitsLeft() / 8);
    }
    assert(bitstream.pos % 8 === 0);
    yield {
      type: obuType,
      data: packet.subarray(bitstream.pos / 8, bitstream.pos / 8 + obuSize)
    };
    bitstream.skipBits(obuSize * 8);
  }
};
var extractAv1CodecInfoFromPacket = (packet) => {
  for (const { type, data } of iterateAv1PacketObus(packet)) {
    if (type !== 1) {
      continue;
    }
    const bitstream = new Bitstream(data);
    const seqProfile = bitstream.readBits(3);
    const stillPicture = bitstream.readBits(1);
    const reducedStillPictureHeader = bitstream.readBits(1);
    let seqLevel = 0;
    let seqTier = 0;
    let bufferDelayLengthMinus1 = 0;
    if (reducedStillPictureHeader) {
      seqLevel = bitstream.readBits(5);
    } else {
      const timingInfoPresentFlag = bitstream.readBits(1);
      if (timingInfoPresentFlag) {
        bitstream.skipBits(32);
        bitstream.skipBits(32);
        const equalPictureInterval = bitstream.readBits(1);
        if (equalPictureInterval) {
          return null;
        }
      }
      const decoderModelInfoPresentFlag = bitstream.readBits(1);
      if (decoderModelInfoPresentFlag) {
        bufferDelayLengthMinus1 = bitstream.readBits(5);
        bitstream.skipBits(32);
        bitstream.skipBits(5);
        bitstream.skipBits(5);
      }
      const operatingPointsCntMinus1 = bitstream.readBits(5);
      for (let i = 0; i <= operatingPointsCntMinus1; i++) {
        bitstream.skipBits(12);
        const seqLevelIdx = bitstream.readBits(5);
        if (i === 0) {
          seqLevel = seqLevelIdx;
        }
        if (seqLevelIdx > 7) {
          const seqTierTemp = bitstream.readBits(1);
          if (i === 0) {
            seqTier = seqTierTemp;
          }
        }
        if (decoderModelInfoPresentFlag) {
          const decoderModelPresentForThisOp = bitstream.readBits(1);
          if (decoderModelPresentForThisOp) {
            const n = bufferDelayLengthMinus1 + 1;
            bitstream.skipBits(n);
            bitstream.skipBits(n);
            bitstream.skipBits(1);
          }
        }
        const initialDisplayDelayPresentFlag = bitstream.readBits(1);
        if (initialDisplayDelayPresentFlag) {
          bitstream.skipBits(4);
        }
      }
    }
    const frameWidthBitsMinus1 = bitstream.readBits(4);
    const frameHeightBitsMinus1 = bitstream.readBits(4);
    const n1 = frameWidthBitsMinus1 + 1;
    bitstream.skipBits(n1);
    const n2 = frameHeightBitsMinus1 + 1;
    bitstream.skipBits(n2);
    let frameIdNumbersPresentFlag = 0;
    if (reducedStillPictureHeader) {
      frameIdNumbersPresentFlag = 0;
    } else {
      frameIdNumbersPresentFlag = bitstream.readBits(1);
    }
    if (frameIdNumbersPresentFlag) {
      bitstream.skipBits(4);
      bitstream.skipBits(3);
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    if (!reducedStillPictureHeader) {
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      bitstream.skipBits(1);
      const enableOrderHint = bitstream.readBits(1);
      if (enableOrderHint) {
        bitstream.skipBits(1);
        bitstream.skipBits(1);
      }
      const seqChooseScreenContentTools = bitstream.readBits(1);
      let seqForceScreenContentTools = 0;
      if (seqChooseScreenContentTools) {
        seqForceScreenContentTools = 2;
      } else {
        seqForceScreenContentTools = bitstream.readBits(1);
      }
      if (seqForceScreenContentTools > 0) {
        const seqChooseIntegerMv = bitstream.readBits(1);
        if (!seqChooseIntegerMv) {
          bitstream.skipBits(1);
        }
      }
      if (enableOrderHint) {
        bitstream.skipBits(3);
      }
    }
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    const highBitdepth = bitstream.readBits(1);
    let bitDepth = 8;
    if (seqProfile === 2 && highBitdepth) {
      const twelveBit = bitstream.readBits(1);
      bitDepth = twelveBit ? 12 : 10;
    } else if (seqProfile <= 2) {
      bitDepth = highBitdepth ? 10 : 8;
    }
    let monochrome = 0;
    if (seqProfile !== 1) {
      monochrome = bitstream.readBits(1);
    }
    let chromaSubsamplingX = 1;
    let chromaSubsamplingY = 1;
    let chromaSamplePosition = 0;
    if (!monochrome) {
      if (seqProfile === 0) {
        chromaSubsamplingX = 1;
        chromaSubsamplingY = 1;
      } else if (seqProfile === 1) {
        chromaSubsamplingX = 0;
        chromaSubsamplingY = 0;
      } else {
        if (bitDepth === 12) {
          chromaSubsamplingX = bitstream.readBits(1);
          if (chromaSubsamplingX) {
            chromaSubsamplingY = bitstream.readBits(1);
          }
        }
      }
      if (chromaSubsamplingX && chromaSubsamplingY) {
        chromaSamplePosition = bitstream.readBits(2);
      }
    }
    return {
      profile: seqProfile,
      level: seqLevel,
      tier: seqTier,
      bitDepth,
      monochrome,
      chromaSubsamplingX,
      chromaSubsamplingY,
      chromaSamplePosition
    };
  }
  return null;
};
var determineVideoPacketType = (codec, decoderConfig, packetData) => {
  switch (codec) {
    case "avc":
      {
        for (const loc of iterateAvcNalUnits(packetData, decoderConfig)) {
          const nalTypeByte = packetData[loc.offset];
          const type = extractNalUnitTypeForAvc(nalTypeByte);
          if (type >= AvcNalUnitType.NON_IDR_SLICE && type <= AvcNalUnitType.SLICE_DPC) {
            return "delta";
          }
          if (type === AvcNalUnitType.IDR) {
            return "key";
          }
          if (type === AvcNalUnitType.SEI && (!isChromium() || getChromiumVersion() >= 144)) {
            const nalUnit = packetData.subarray(loc.offset, loc.offset + loc.length);
            const bytes = removeEmulationPreventionBytes(nalUnit);
            let pos = 1;
            do {
              let payloadType = 0;
              while (true) {
                const nextByte = bytes[pos++];
                if (nextByte === void 0)
                  break;
                payloadType += nextByte;
                if (nextByte < 255) {
                  break;
                }
              }
              let payloadSize = 0;
              while (true) {
                const nextByte = bytes[pos++];
                if (nextByte === void 0)
                  break;
                payloadSize += nextByte;
                if (nextByte < 255) {
                  break;
                }
              }
              const PAYLOAD_TYPE_RECOVERY_POINT = 6;
              if (payloadType === PAYLOAD_TYPE_RECOVERY_POINT) {
                const bitstream = new Bitstream(bytes);
                bitstream.pos = 8 * pos;
                const recoveryFrameCount = readExpGolomb(bitstream);
                const exactMatchFlag = bitstream.readBits(1);
                if (recoveryFrameCount === 0 && exactMatchFlag === 1) {
                  return "key";
                }
              }
              pos += payloadSize;
            } while (pos < bytes.length - 1);
          }
        }
        return "delta";
      }
      ;
    case "hevc":
      {
        for (const loc of iterateHevcNalUnits(packetData, decoderConfig)) {
          const type = extractNalUnitTypeForHevc(packetData[loc.offset]);
          if (type < HevcNalUnitType.BLA_W_LP) {
            return "delta";
          }
          if (type <= HevcNalUnitType.RSV_IRAP_VCL23) {
            return "key";
          }
        }
        return "delta";
      }
      ;
    case "vp8":
      {
        const frameType = packetData[0] & 1;
        return frameType === 0 ? "key" : "delta";
      }
      ;
    case "vp9":
      {
        const bitstream = new Bitstream(packetData);
        if (bitstream.readBits(2) !== 2) {
          return null;
        }
        ;
        const profileLowBit = bitstream.readBits(1);
        const profileHighBit = bitstream.readBits(1);
        const profile = (profileHighBit << 1) + profileLowBit;
        if (profile === 3) {
          bitstream.skipBits(1);
        }
        const showExistingFrame = bitstream.readBits(1);
        if (showExistingFrame) {
          return null;
        }
        const frameType = bitstream.readBits(1);
        return frameType === 0 ? "key" : "delta";
      }
      ;
    case "av1":
      {
        let reducedStillPictureHeader = false;
        for (const { type, data } of iterateAv1PacketObus(packetData)) {
          if (type === 1) {
            const bitstream = new Bitstream(data);
            bitstream.skipBits(4);
            reducedStillPictureHeader = !!bitstream.readBits(1);
          } else if (type === 3 || type === 6 || type === 7) {
            if (reducedStillPictureHeader) {
              return "key";
            }
            const bitstream = new Bitstream(data);
            const showExistingFrame = bitstream.readBits(1);
            if (showExistingFrame) {
              return null;
            }
            const frameType = bitstream.readBits(2);
            return frameType === 0 ? "key" : "delta";
          }
        }
        return null;
      }
      ;
    case "prores":
      {
        return "key";
      }
      ;
    default:
      {
        assertNever(codec);
        assert(false);
      }
      ;
  }
};
var FlacBlockType;
(function(FlacBlockType2) {
  FlacBlockType2[FlacBlockType2["STREAMINFO"] = 0] = "STREAMINFO";
  FlacBlockType2[FlacBlockType2["VORBIS_COMMENT"] = 4] = "VORBIS_COMMENT";
  FlacBlockType2[FlacBlockType2["PICTURE"] = 6] = "PICTURE";
})(FlacBlockType || (FlacBlockType = {}));
var AC3_ACMOD_CHANNEL_COUNTS = [2, 1, 2, 3, 3, 4, 4, 5];
var AC3_FRAME_SIZES = [
  // frmsizecod, [48kHz, 44.1kHz, 32kHz] in bytes
  64 * 2,
  69 * 2,
  96 * 2,
  64 * 2,
  70 * 2,
  96 * 2,
  80 * 2,
  87 * 2,
  120 * 2,
  80 * 2,
  88 * 2,
  120 * 2,
  96 * 2,
  104 * 2,
  144 * 2,
  96 * 2,
  105 * 2,
  144 * 2,
  112 * 2,
  121 * 2,
  168 * 2,
  112 * 2,
  122 * 2,
  168 * 2,
  128 * 2,
  139 * 2,
  192 * 2,
  128 * 2,
  140 * 2,
  192 * 2,
  160 * 2,
  174 * 2,
  240 * 2,
  160 * 2,
  175 * 2,
  240 * 2,
  192 * 2,
  208 * 2,
  288 * 2,
  192 * 2,
  209 * 2,
  288 * 2,
  224 * 2,
  243 * 2,
  336 * 2,
  224 * 2,
  244 * 2,
  336 * 2,
  256 * 2,
  278 * 2,
  384 * 2,
  256 * 2,
  279 * 2,
  384 * 2,
  320 * 2,
  348 * 2,
  480 * 2,
  320 * 2,
  349 * 2,
  480 * 2,
  384 * 2,
  417 * 2,
  576 * 2,
  384 * 2,
  418 * 2,
  576 * 2,
  448 * 2,
  487 * 2,
  672 * 2,
  448 * 2,
  488 * 2,
  672 * 2,
  512 * 2,
  557 * 2,
  768 * 2,
  512 * 2,
  558 * 2,
  768 * 2,
  640 * 2,
  696 * 2,
  960 * 2,
  640 * 2,
  697 * 2,
  960 * 2,
  768 * 2,
  835 * 2,
  1152 * 2,
  768 * 2,
  836 * 2,
  1152 * 2,
  896 * 2,
  975 * 2,
  1344 * 2,
  896 * 2,
  976 * 2,
  1344 * 2,
  1024 * 2,
  1114 * 2,
  1536 * 2,
  1024 * 2,
  1115 * 2,
  1536 * 2,
  1152 * 2,
  1253 * 2,
  1728 * 2,
  1152 * 2,
  1254 * 2,
  1728 * 2,
  1280 * 2,
  1393 * 2,
  1920 * 2,
  1280 * 2,
  1394 * 2,
  1920 * 2
];
var AC3_REGISTRATION_DESCRIPTOR = new Uint8Array([5, 4, 65, 67, 45, 51]);
var EAC3_REGISTRATION_DESCRIPTOR = new Uint8Array([5, 4, 69, 65, 67, 51]);
var parseEac3Config = (data) => {
  if (data.length < 2) {
    return null;
  }
  const bitstream = new Bitstream(data);
  const dataRate = bitstream.readBits(13);
  const numIndSub = bitstream.readBits(3);
  const substreams = [];
  for (let i = 0; i <= numIndSub; i++) {
    if (Math.ceil(bitstream.pos / 8) + 3 > data.length) {
      break;
    }
    const fscod = bitstream.readBits(2);
    const bsid = bitstream.readBits(5);
    bitstream.skipBits(1);
    bitstream.skipBits(1);
    const bsmod = bitstream.readBits(3);
    const acmod = bitstream.readBits(3);
    const lfeon = bitstream.readBits(1);
    bitstream.skipBits(3);
    const numDepSub = bitstream.readBits(4);
    let chanLoc = 0;
    if (numDepSub > 0) {
      chanLoc = bitstream.readBits(9);
    } else {
      bitstream.skipBits(1);
    }
    substreams.push({
      fscod,
      fscod2: null,
      bsid,
      bsmod,
      acmod,
      lfeon,
      numDepSub,
      chanLoc
    });
  }
  if (substreams.length === 0) {
    return null;
  }
  return { dataRate, substreams };
};
var getEac3SampleRate = (config) => {
  const sub = config.substreams[0];
  assert(sub);
  if (sub.fscod < 3) {
    return AC3_SAMPLE_RATES[sub.fscod];
  } else if (sub.fscod2 !== null && sub.fscod2 < 3) {
    return EAC3_REDUCED_SAMPLE_RATES[sub.fscod2];
  }
  return null;
};
var getEac3ChannelCount = (config) => {
  const sub = config.substreams[0];
  assert(sub);
  let channels = AC3_ACMOD_CHANNEL_COUNTS[sub.acmod] + sub.lfeon;
  if (sub.numDepSub > 0) {
    const CHAN_LOC_COUNTS = [2, 2, 1, 1, 2, 2, 2, 1, 1];
    for (let bit = 0; bit < 9; bit++) {
      if (sub.chanLoc & 1 << 8 - bit) {
        channels += CHAN_LOC_COUNTS[bit];
      }
    }
  }
  return channels;
};
var DTS_EXSS_SYNC_WORD = 1683496997;
var DTS_CORE_FRAME_HEADER_SIZE = 18;
var DTS_EXSS_HEADER_PREFIX_SIZE = 10;
var DTS_PCM_BLOCK_SAMPLES = 32;
var DTS_SPECIFIC_BOX_SIZE = 20;
var DTS_SUBBAND_SAMPLES = 8;
var DTS_CORE_SAMPLE_RATES = [
  0,
  8e3,
  16e3,
  32e3,
  0,
  0,
  11025,
  22050,
  44100,
  0,
  0,
  12e3,
  24e3,
  48e3,
  96e3,
  192e3
];
var DTS_CORE_BIT_RATES = [
  32e3,
  56e3,
  64e3,
  96e3,
  112e3,
  128e3,
  192e3,
  224e3,
  256e3,
  32e4,
  384e3,
  448e3,
  512e3,
  576e3,
  64e4,
  768e3,
  96e4,
  1024e3,
  1152e3,
  128e4,
  1344e3,
  1408e3,
  1411200,
  1472e3,
  1536e3,
  192e4,
  2048e3,
  3072e3,
  384e4,
  0,
  0,
  0
];
var DTS_PCM_RESOLUTIONS = [16, 16, 20, 20, 0, 24, 24, 0];
var DTS_AMODE_CHANNEL_COUNTS = [1, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6, 6, 6, 7, 8, 8];
var DTS_AMODE_CHANNEL_LAYOUTS = [
  1,
  2,
  2,
  2,
  2,
  3,
  18,
  19,
  6,
  7,
  518,
  323,
  83,
  519,
  582,
  535
];
var DTS_CHANNEL_LAYOUT_LFE1 = 8;
var DTS_CHANNEL_LAYOUT_PAIR_MASK = 44646;
var DTS_EXSS_REF_CLOCKS = [32e3, 44100, 48e3, 0];
var DTS_EXSS_SAMPLE_RATES = [
  8e3,
  16e3,
  32e3,
  64e3,
  128e3,
  22050,
  44100,
  88200,
  176400,
  352800,
  12e3,
  24e3,
  48e3,
  96e3,
  192e3,
  384e3
];
var DTS_SPECIFIC_BOX_FRAME_DURATIONS = [512, 1024, 2048, 4096];
var parseDtsFrame = (data) => {
  const core = parseDtsCoreFrameHeader(data);
  const view = toDataView(data);
  let offset = core ? Math.ceil(core.frameSize / 4) * 4 : 0;
  let firstExss = null;
  while (offset + 4 <= data.length && view.getUint32(offset) === DTS_EXSS_SYNC_WORD) {
    const exss = parseDtsExssHeader(data.subarray(offset));
    if (!exss) {
      break;
    }
    firstExss ??= exss;
    offset += exss.frameSize;
  }
  if (core) {
    return {
      frameSize: firstExss ? offset : core.frameSize,
      sampleRate: core.sampleRate,
      numberOfChannels: core.numberOfChannels,
      sampleCount: core.sampleCount,
      channelLayout: core.channelLayout,
      pcmResolution: core.pcmResolution,
      bitRate: core.bitRate,
      core,
      hasExtensions: firstExss !== null
    };
  }
  if (!firstExss?.asset) {
    return null;
  }
  const { asset } = firstExss;
  return {
    frameSize: offset,
    sampleRate: asset.sampleRate,
    numberOfChannels: asset.numberOfChannels,
    sampleCount: asset.sampleCount,
    channelLayout: asset.channelLayout,
    pcmResolution: asset.pcmResolution,
    bitRate: 0,
    core: null,
    hasExtensions: true
  };
};
var extractDtsFourCcFromPacket = (data) => {
  const frameInfo = parseDtsFrame(data);
  if (!frameInfo?.core) {
    return null;
  }
  return frameInfo.hasExtensions ? "dtsh" : "dtsc";
};
var parseDtsCoreFrameHeader = (data) => {
  if (data.length < DTS_CORE_FRAME_HEADER_SIZE) {
    return null;
  }
  if (data[0] !== 127 || data[1] !== 254 || data[2] !== 128 || data[3] !== 1) {
    return null;
  }
  const bitstream = new Bitstream(data);
  bitstream.skipBits(32);
  bitstream.skipBits(1);
  if (bitstream.readBits(5) !== DTS_PCM_BLOCK_SAMPLES - 1) {
    return null;
  }
  const cpf = bitstream.readBits(1);
  const npcmblocks = bitstream.readBits(7) + 1;
  if (npcmblocks % DTS_SUBBAND_SAMPLES !== 0) {
    return null;
  }
  const frameSize = bitstream.readBits(14) + 1;
  if (frameSize < 96) {
    return null;
  }
  const amode = bitstream.readBits(6);
  if (amode >= DTS_AMODE_CHANNEL_COUNTS.length) {
    return null;
  }
  const sampleRate = DTS_CORE_SAMPLE_RATES[bitstream.readBits(4)];
  if (sampleRate === 0) {
    return null;
  }
  const bitRate = DTS_CORE_BIT_RATES[bitstream.readBits(5)];
  if (bitstream.readBits(1) !== 0) {
    return null;
  }
  bitstream.skipBits(1 + 1 + 1 + 1);
  bitstream.skipBits(3 + 1 + 1);
  const lff = bitstream.readBits(2);
  if (lff === 3) {
    return null;
  }
  bitstream.skipBits(1);
  if (cpf) {
    bitstream.skipBits(16);
  }
  bitstream.skipBits(1 + 4 + 2);
  const pcmResolution = DTS_PCM_RESOLUTIONS[bitstream.readBits(3)];
  if (pcmResolution === 0) {
    return null;
  }
  const lfePresent = lff !== 0;
  return {
    frameSize,
    sampleRate,
    numberOfChannels: DTS_AMODE_CHANNEL_COUNTS[amode] + (lfePresent ? 1 : 0),
    sampleCount: npcmblocks * DTS_PCM_BLOCK_SAMPLES,
    channelLayout: DTS_AMODE_CHANNEL_LAYOUTS[amode] | (lfePresent ? DTS_CHANNEL_LAYOUT_LFE1 : 0),
    amode,
    lfePresent,
    bitRate,
    pcmResolution
  };
};
var parseDtsExssHeader = (data) => {
  if (data.length < DTS_EXSS_HEADER_PREFIX_SIZE) {
    return null;
  }
  if (data[0] !== 100 || data[1] !== 88 || data[2] !== 32 || data[3] !== 37) {
    return null;
  }
  const bitstream = new Bitstream(data);
  bitstream.skipBits(32);
  bitstream.skipBits(8);
  const extSsIndex = bitstream.readBits(2);
  const wideHeader = bitstream.readBits(1);
  const headerSizeBits = 8 + 4 * wideHeader;
  const frameSizeBits = 16 + 4 * wideHeader;
  bitstream.skipBits(headerSizeBits);
  const frameSize = bitstream.readBits(frameSizeBits) + 1;
  const incomplete = { frameSize, asset: null };
  if (!bitstream.readBits(1)) {
    return incomplete;
  }
  const refClock = DTS_EXSS_REF_CLOCKS[bitstream.readBits(2)];
  const frameDurationCycles = 512 * (bitstream.readBits(3) + 1);
  if (bitstream.readBits(1)) {
    bitstream.skipBits(32 + 4);
  }
  const numAudioPresentations = bitstream.readBits(3) + 1;
  const numAssets = bitstream.readBits(3) + 1;
  const activeExssMasks = [];
  for (let i = 0; i < numAudioPresentations; i++) {
    activeExssMasks.push(bitstream.readBits(extSsIndex + 1));
  }
  for (const mask of activeExssMasks) {
    bitstream.skipBits(8 * popcount(mask));
  }
  if (bitstream.readBits(1)) {
    bitstream.skipBits(2);
    const spkrMaskBits = bitstream.readBits(2) + 1 << 2;
    const numMixOutConfigs = bitstream.readBits(2) + 1;
    bitstream.skipBits(numMixOutConfigs * spkrMaskBits);
  }
  for (let i = 0; i < numAssets; i++) {
    bitstream.skipBits(frameSizeBits);
  }
  bitstream.skipBits(9);
  bitstream.skipBits(3);
  if (bitstream.readBits(1)) {
    bitstream.skipBits(4);
  }
  if (bitstream.readBits(1)) {
    bitstream.skipBits(24);
  }
  if (bitstream.readBits(1)) {
    bitstream.skipBits(8 * (bitstream.readBits(10) + 1));
  }
  const pcmResolution = bitstream.readBits(5) + 1;
  const sampleRate = DTS_EXSS_SAMPLE_RATES[bitstream.readBits(4)];
  const numberOfChannels = bitstream.readBits(8) + 1;
  let channelLayout = 0;
  if (bitstream.readBits(1)) {
    if (numberOfChannels > 2) {
      bitstream.skipBits(1);
    }
    if (numberOfChannels > 6) {
      bitstream.skipBits(1);
    }
    if (bitstream.readBits(1)) {
      const spkrMaskBits = bitstream.readBits(2) + 1 << 2;
      channelLayout = bitstream.readBits(spkrMaskBits);
    }
  }
  if (refClock === 0 || bitstream.getBitsLeft() < 0) {
    return incomplete;
  }
  return {
    frameSize,
    asset: {
      sampleRate,
      numberOfChannels,
      sampleCount: Math.round(frameDurationCycles * sampleRate / refClock),
      channelLayout,
      pcmResolution
    }
  };
};
var parseDtsSpecificBox = (data) => {
  if (data.length < DTS_SPECIFIC_BOX_SIZE) {
    return null;
  }
  const view = toDataView(data);
  const sampleRate = view.getUint32(0);
  if (sampleRate === 0) {
    return null;
  }
  const bitstream = new Bitstream(data);
  bitstream.seekToByte(13);
  const frameDuration = bitstream.readBits(2);
  bitstream.skipBits(5);
  const coreLfePresent = bitstream.readBits(1);
  const coreLayout = bitstream.readBits(6);
  bitstream.skipBits(14);
  bitstream.skipBits(1);
  bitstream.skipBits(3);
  const channelLayout = bitstream.readBits(16);
  let numberOfChannels = null;
  if (channelLayout !== 0) {
    numberOfChannels = getDtsChannelCount(channelLayout);
  } else if (coreLayout < DTS_AMODE_CHANNEL_COUNTS.length) {
    numberOfChannels = DTS_AMODE_CHANNEL_COUNTS[coreLayout] + coreLfePresent;
  }
  return {
    sampleRate,
    maxBitrate: view.getUint32(4),
    avgBitrate: view.getUint32(8),
    pcmSampleDepth: data[12],
    sampleCount: DTS_SPECIFIC_BOX_FRAME_DURATIONS[frameDuration],
    channelLayout,
    numberOfChannels
  };
};
var getDtsChannelCount = (channelLayout) => {
  return popcount(channelLayout) + popcount(channelLayout & DTS_CHANNEL_LAYOUT_PAIR_MASK);
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/demuxer.js
var Demuxer = class {
  constructor(input) {
    this.input = input;
  }
  dispose() {
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/packet.js
var PLACEHOLDER_DATA = /* @__PURE__ */ new Uint8Array(0);
var EncodedPacket = class _EncodedPacket {
  /** Creates a new {@link EncodedPacket} from raw bytes and timing information. */
  constructor(data, type, timestamp, duration, sequenceNumber = -1, byteLength, sideData) {
    this.data = data;
    this.type = type;
    this.timestamp = timestamp;
    this.duration = duration;
    this.sequenceNumber = sequenceNumber;
    if (data === PLACEHOLDER_DATA && byteLength === void 0) {
      throw new Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
    }
    if (byteLength === void 0) {
      byteLength = data.byteLength;
    }
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError('type must be either "key" or "delta".');
    }
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("timestamp must be a number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("duration must be a non-negative number.");
    }
    if (!Number.isFinite(sequenceNumber)) {
      throw new TypeError("sequenceNumber must be a number.");
    }
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      throw new TypeError("byteLength must be a non-negative integer.");
    }
    if (sideData !== void 0 && (typeof sideData !== "object" || !sideData)) {
      throw new TypeError("sideData, when provided, must be an object.");
    }
    if (sideData?.alpha !== void 0 && !(sideData.alpha instanceof Uint8Array)) {
      throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");
    }
    if (sideData?.alphaByteLength !== void 0 && (!Number.isInteger(sideData.alphaByteLength) || sideData.alphaByteLength < 0)) {
      throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
    }
    this.byteLength = byteLength;
    this.sideData = sideData ?? {};
    if (this.sideData.alpha && this.sideData.alphaByteLength === void 0) {
      this.sideData.alphaByteLength = this.sideData.alpha.byteLength;
    }
  }
  /**
   * If this packet is a metadata-only packet. Metadata-only packets don't contain their packet data. They are the
   * result of retrieving packets with {@link PacketRetrievalOptions.metadataOnly} set to `true`.
   */
  get isMetadataOnly() {
    return this.data === PLACEHOLDER_DATA;
  }
  /** The timestamp of this packet in microseconds. */
  get microsecondTimestamp() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.timestamp);
  }
  /** The duration of this packet in microseconds. */
  get microsecondDuration() {
    return Math.trunc(SECOND_TO_MICROSECOND_FACTOR * this.duration);
  }
  /** Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API. */
  toEncodedVideoChunk() {
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    }
    if (typeof EncodedVideoChunk === "undefined") {
      throw new Error("EncodedVideoChunk is not available in this environment.");
    }
    return new EncodedVideoChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Converts this packet to an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) for use with the
   * WebCodecs API, using the alpha side data instead of the color data. Throws if no alpha side data is defined.
   */
  alphaToEncodedVideoChunk(type = this.type) {
    if (!this.sideData.alpha) {
      throw new TypeError("This packet does not contain alpha side data.");
    }
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
    }
    if (typeof EncodedVideoChunk === "undefined") {
      throw new Error("EncodedVideoChunk is not available in this environment.");
    }
    return new EncodedVideoChunk({
      data: this.sideData.alpha,
      type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /** Converts this packet to an
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk) for use with the
   * WebCodecs API. */
  toEncodedAudioChunk() {
    if (this.isMetadataOnly) {
      throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");
    }
    if (typeof EncodedAudioChunk === "undefined") {
      throw new Error("EncodedAudioChunk is not available in this environment.");
    }
    return new EncodedAudioChunk({
      data: this.data,
      type: this.type,
      timestamp: this.microsecondTimestamp,
      duration: this.microsecondDuration
    });
  }
  /**
   * Creates an {@link EncodedPacket} from an
   * [`EncodedVideoChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedVideoChunk) or
   * [`EncodedAudioChunk`](https://developer.mozilla.org/en-US/docs/Web/API/EncodedAudioChunk). This method is useful
   * for converting chunks from the WebCodecs API to `EncodedPacket` instances.
   */
  static fromEncodedChunk(chunk, sideData) {
    if (!(chunk instanceof EncodedVideoChunk || chunk instanceof EncodedAudioChunk)) {
      throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return new _EncodedPacket(data, chunk.type, chunk.timestamp / 1e6, (chunk.duration ?? 0) / 1e6, void 0, void 0, sideData);
  }
  /** Clones this packet while optionally modifying the new packet's data. */
  clone(options) {
    if (options !== void 0 && (typeof options !== "object" || options === null)) {
      throw new TypeError("options, when provided, must be an object.");
    }
    if (options?.data !== void 0 && !(options.data instanceof Uint8Array)) {
      throw new TypeError("options.data, when provided, must be a Uint8Array.");
    }
    if (options?.type !== void 0 && options.type !== "key" && options.type !== "delta") {
      throw new TypeError('options.type, when provided, must be either "key" or "delta".');
    }
    if (options?.timestamp !== void 0 && !Number.isFinite(options.timestamp)) {
      throw new TypeError("options.timestamp, when provided, must be a number.");
    }
    if (options?.duration !== void 0 && !Number.isFinite(options.duration)) {
      throw new TypeError("options.duration, when provided, must be a number.");
    }
    if (options?.sequenceNumber !== void 0 && !Number.isFinite(options.sequenceNumber)) {
      throw new TypeError("options.sequenceNumber, when provided, must be a number.");
    }
    if (options?.sideData !== void 0 && (typeof options.sideData !== "object" || options.sideData === null)) {
      throw new TypeError("options.sideData, when provided, must be an object.");
    }
    return new _EncodedPacket(options?.data ?? this.data, options?.type ?? this.type, options?.timestamp ?? this.timestamp, options?.duration ?? this.duration, options?.sequenceNumber ?? this.sequenceNumber, this.byteLength, options?.sideData ?? this.sideData);
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-misc.js
var buildIsobmffMimeType = (info) => {
  const base = info.hasVideo ? "video/" : info.hasAudio ? "audio/" : "application/";
  let string = base + (info.isQuickTime ? "quicktime" : "mp4");
  if (info.codecStrings.length > 0) {
    const uniqueCodecMimeTypes = [...new Set(info.codecStrings)];
    string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
  }
  return string;
};
var parsePsshBoxContents = (contents) => {
  const view = toDataView(contents);
  let pos = 0;
  const version = view.getUint8(pos);
  pos += 1;
  pos += 3;
  const systemId = bytesToHexString(contents.subarray(pos, pos + 16));
  pos += 16;
  let keyIds = null;
  if (version > 0) {
    const kidCount = view.getUint32(pos);
    pos += 4;
    if (kidCount > 0) {
      keyIds = [];
      for (let i = 0; i < kidCount; i++) {
        keyIds.push(bytesToHexString(contents.subarray(pos, pos + 16)));
        pos += 16;
      }
    }
  }
  const dataSize = view.getUint32(pos);
  pos += 4;
  return {
    systemId,
    keyIds,
    data: contents.slice(pos, pos + dataSize)
  };
};
var psshBoxesAreEqual = (a, b) => a.systemId === b.systemId && uint8ArraysAreEqual(a.data, b.data);

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-reader.js
var MIN_BOX_HEADER_SIZE = 8;
var MAX_BOX_HEADER_SIZE = 16;
var readBoxHeader = (slice) => {
  let totalSize = readU32Be(slice);
  const name = readAscii(slice, 4);
  let headerSize = 8;
  const hasLargeSize = totalSize === 1;
  if (hasLargeSize) {
    totalSize = readU64Be(slice);
    headerSize = 16;
  }
  const contentSize = totalSize - headerSize;
  if (contentSize < 0) {
    return null;
  }
  return { name, totalSize, headerSize, contentSize };
};
var readFixed_16_16 = (slice) => {
  return readI32Be(slice) / 65536;
};
var readFixed_2_30 = (slice) => {
  return readI32Be(slice) / 1073741824;
};
var readIsomVariableInteger = (slice) => {
  let result = 0;
  for (let i = 0; i < 4; i++) {
    result <<= 7;
    const nextByte = readU8(slice);
    result |= nextByte & 127;
    if ((nextByte & 128) === 0) {
      break;
    }
  }
  return result;
};
var readMetadataStringShort = (slice) => {
  let stringLength = readU16Be(slice);
  slice.skip(2);
  stringLength = Math.min(stringLength, slice.remainingLength);
  return textDecoder.decode(readBytes(slice, stringLength));
};
var readDataBox = (slice) => {
  const header = readBoxHeader(slice);
  if (!header || header.name !== "data") {
    return null;
  }
  if (slice.remainingLength < 8) {
    return null;
  }
  const typeIndicator = readU32Be(slice);
  slice.skip(4);
  const data = readBytes(slice, header.contentSize - 8);
  switch (typeIndicator) {
    case 1:
      return textDecoder.decode(data);
    // UTF-8
    case 2:
      return new TextDecoder("utf-16be").decode(data);
    // UTF-16-BE
    case 13:
      return new RichImageData(data, "image/jpeg");
    case 14:
      return new RichImageData(data, "image/png");
    case 27:
      return new RichImageData(data, "image/bmp");
    default:
      return data;
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/aes.js
var AES_128_BLOCK_SIZE = 16;
var Te4 = new Uint32Array(256);
var Td0 = new Uint32Array(256);
var Td1 = new Uint32Array(256);
var Td2 = new Uint32Array(256);
var Td3 = new Uint32Array(256);
var Td4 = new Uint32Array(256);
var rcon = new Uint32Array(10);
var tablesGenerated = false;
var generateAesTables = () => {
  const sbox = new Uint8Array(256);
  const log = new Uint8Array(256);
  const pow = new Uint8Array(256);
  for (let i = 0, p = 1; i < 256; i++) {
    pow[i] = p;
    log[p] = i;
    p = p ^ p << 1 ^ (p & 128 ? 283 : 0);
  }
  const mul = (a, b) => a && b ? pow[(log[a] + log[b]) % 255] : 0;
  sbox[0] = 99;
  for (let i = 1; i < 256; i++) {
    const x = pow[255 - log[i]];
    let s = x ^ x << 1 ^ x << 2 ^ x << 3 ^ x << 4;
    s = s >>> 8 ^ s & 255 ^ 99;
    sbox[i] = s;
  }
  for (let i = 0; i < 256; i++) {
    const s = sbox[i];
    const is = sbox.indexOf(i);
    Te4[i] = s << 24 | s << 16 | s << 8 | s;
    Td4[i] = is << 24 | is << 16 | is << 8 | is;
    const b0 = mul(is, 14);
    const b1 = mul(is, 9);
    const b2 = mul(is, 13);
    const b3 = mul(is, 11);
    const w = b0 << 24 | b1 << 16 | b2 << 8 | b3;
    Td0[i] = w;
    Td1[i] = w >>> 8 | w << 24;
    Td2[i] = w >>> 16 | w << 16;
    Td3[i] = w >>> 24 | w << 8;
  }
  let r = 1;
  for (let i = 0; i < 10; i++) {
    rcon[i] = r << 24;
    r = r << 1 ^ (r & 128 ? 283 : 0);
  }
  tablesGenerated = true;
};
var Aes128CbcContext = class {
  constructor() {
    this.roundkey = new Uint32Array(44);
    this.iv = new Uint32Array(AES_128_BLOCK_SIZE / Uint32Array.BYTES_PER_ELEMENT);
    this.in = new Uint8Array(AES_128_BLOCK_SIZE);
    this.out = new Uint8Array(AES_128_BLOCK_SIZE);
    this.inView = new DataView(this.in.buffer);
    this.outView = new DataView(this.out.buffer);
  }
  init({ key, iv }) {
    assert(key.byteLength === 16);
    assert(iv.byteLength === 16);
    if (!tablesGenerated) {
      generateAesTables();
    }
    const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
    const ivView = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);
    this.roundkey[0] = keyView.getUint32(0, false);
    this.roundkey[1] = keyView.getUint32(4, false);
    this.roundkey[2] = keyView.getUint32(8, false);
    this.roundkey[3] = keyView.getUint32(12, false);
    this.iv[0] = ivView.getUint32(0, false);
    this.iv[1] = ivView.getUint32(4, false);
    this.iv[2] = ivView.getUint32(8, false);
    this.iv[3] = ivView.getUint32(12, false);
    for (let index = 4; index < 44; index += 4) {
      const temp = this.roundkey[index - 1];
      this.roundkey[index] = this.roundkey[index - 4] ^ Te4[temp >>> 16 & 255] & 4278190080 ^ Te4[temp >>> 8 & 255] & 16711680 ^ Te4[temp >>> 0 & 255] & 65280 ^ Te4[temp >>> 24 & 255] & 255 ^ rcon[index / 4 - 1];
      this.roundkey[index + 1] = this.roundkey[index - 3] ^ this.roundkey[index];
      this.roundkey[index + 2] = this.roundkey[index - 2] ^ this.roundkey[index + 1];
      this.roundkey[index + 3] = this.roundkey[index - 1] ^ this.roundkey[index + 2];
    }
    for (let i = 0, j = 40; i < j; i += 4, j -= 4) {
      for (let k = 0; k < 4; k++) {
        const temp = this.roundkey[i + k];
        this.roundkey[i + k] = this.roundkey[j + k];
        this.roundkey[j + k] = temp;
      }
    }
    for (let index = 4; index < 40; index += 4) {
      for (let k = 0; k < 4; k++) {
        const rk = this.roundkey[index + k];
        this.roundkey[index + k] = Td0[Te4[rk >>> 24 & 255] & 255] ^ Td1[Te4[rk >>> 16 & 255] & 255] ^ Td2[Te4[rk >>> 8 & 255] & 255] ^ Td3[Te4[rk >>> 0 & 255] & 255];
      }
    }
  }
  decrypt() {
    let s0 = this.inView.getUint32(0, false) ^ this.roundkey[0];
    let s1 = this.inView.getUint32(4, false) ^ this.roundkey[1];
    let s2 = this.inView.getUint32(8, false) ^ this.roundkey[2];
    let s3 = this.inView.getUint32(12, false) ^ this.roundkey[3];
    const temp0 = this.inView.getUint32(0, false);
    const temp1 = this.inView.getUint32(4, false);
    const temp2 = this.inView.getUint32(8, false);
    const temp3 = this.inView.getUint32(12, false);
    let t0, t1, t2, t3;
    for (let round = 1; round < 10; round++) {
      const offset = round * 4;
      t0 = Td0[s0 >>> 24] ^ Td1[s3 >>> 16 & 255] ^ Td2[s2 >>> 8 & 255] ^ Td3[s1 & 255] ^ this.roundkey[offset];
      t1 = Td0[s1 >>> 24] ^ Td1[s0 >>> 16 & 255] ^ Td2[s3 >>> 8 & 255] ^ Td3[s2 & 255] ^ this.roundkey[offset + 1];
      t2 = Td0[s2 >>> 24] ^ Td1[s1 >>> 16 & 255] ^ Td2[s0 >>> 8 & 255] ^ Td3[s3 & 255] ^ this.roundkey[offset + 2];
      t3 = Td0[s3 >>> 24] ^ Td1[s2 >>> 16 & 255] ^ Td2[s1 >>> 8 & 255] ^ Td3[s0 & 255] ^ this.roundkey[offset + 3];
      s0 = t0;
      s1 = t1;
      s2 = t2;
      s3 = t3;
    }
    const f0 = Td4[s0 >>> 24 & 255] & 4278190080 ^ Td4[s3 >>> 16 & 255] & 16711680 ^ Td4[s2 >>> 8 & 255] & 65280 ^ Td4[s1 >>> 0 & 255] & 255 ^ this.roundkey[40];
    const f1 = Td4[s1 >>> 24 & 255] & 4278190080 ^ Td4[s0 >>> 16 & 255] & 16711680 ^ Td4[s3 >>> 8 & 255] & 65280 ^ Td4[s2 >>> 0 & 255] & 255 ^ this.roundkey[41];
    const f2 = Td4[s2 >>> 24 & 255] & 4278190080 ^ Td4[s1 >>> 16 & 255] & 16711680 ^ Td4[s0 >>> 8 & 255] & 65280 ^ Td4[s3 >>> 0 & 255] & 255 ^ this.roundkey[42];
    const f3 = Td4[s3 >>> 24 & 255] & 4278190080 ^ Td4[s2 >>> 16 & 255] & 16711680 ^ Td4[s1 >>> 8 & 255] & 65280 ^ Td4[s0 >>> 0 & 255] & 255 ^ this.roundkey[43];
    this.outView.setUint32(0, f0 ^ this.iv[0], false);
    this.outView.setUint32(4, f1 ^ this.iv[1], false);
    this.outView.setUint32(8, f2 ^ this.iv[2], false);
    this.outView.setUint32(12, f3 ^ this.iv[3], false);
    this.iv[0] = temp0;
    this.iv[1] = temp1;
    this.iv[2] = temp2;
    this.iv[3] = temp3;
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js
var IsobmffDemuxer = class _IsobmffDemuxer extends Demuxer {
  constructor(input) {
    super(input);
    this.moovSlice = null;
    this.currentTrack = null;
    this.tracks = [];
    this.metadataPromise = null;
    this.movieTimescale = -1;
    this.movieDurationInTimescale = -1;
    this.isQuickTime = false;
    this.metadataTags = {};
    this.currentMetadataKeys = null;
    this.isFragmented = false;
    this.fragmentTrackDefaults = [];
    this.psshBoxes = [];
    this.currentFragment = null;
    this.lastReadFragment = null;
    this.decryptionKeyCache = /* @__PURE__ */ new Map();
    this.reader = input._reader;
  }
  async getTrackBackings() {
    await this.readMetadata();
    return this.tracks.map((track) => track.trackBacking);
  }
  async getMimeType() {
    await this.readMetadata();
    const backings = await this.getTrackBackings();
    const codecStrings = await Promise.all(backings.map((x) => x.getDecoderConfig().then((c) => c?.codec ?? null)));
    return buildIsobmffMimeType({
      isQuickTime: this.isQuickTime,
      hasVideo: this.tracks.some((x) => x.info?.type === "video"),
      hasAudio: this.tracks.some((x) => x.info?.type === "audio"),
      codecStrings: codecStrings.filter(Boolean)
    });
  }
  async getMetadataTags() {
    await this.readMetadata();
    return this.metadataTags;
  }
  readMetadata() {
    return this.metadataPromise ??= (async () => {
      let currentPos = 0;
      let lookForMfraBox = false;
      let foundMovieBoxes = false;
      while (true) {
        let slice = this.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
        if (isThenable(slice))
          slice = await slice;
        if (!slice)
          break;
        const startPos = currentPos;
        const boxInfo = readBoxHeader(slice);
        if (!boxInfo) {
          break;
        }
        if (boxInfo.name === "ftyp" || boxInfo.name === "styp") {
          const majorBrand = readAscii(slice, 4);
          this.isQuickTime = majorBrand === "qt  ";
        } else if (boxInfo.name === "moov") {
          let moovSlice = this.reader.requestSlice(slice.filePos, boxInfo.contentSize);
          if (isThenable(moovSlice))
            moovSlice = await moovSlice;
          if (!moovSlice)
            break;
          this.moovSlice = moovSlice;
          this.readContiguousBoxes(this.moovSlice);
          for (const track of this.tracks) {
            const previousSegmentDurationsInSeconds = track.editListPreviousSegmentDurations / this.movieTimescale;
            track.editListOffset -= Math.round(previousSegmentDurationsInSeconds * track.timescale);
          }
          lookForMfraBox = this.isFragmented && this.reader.fileSize !== null && this.reader.fileSize > startPos + boxInfo.totalSize;
          foundMovieBoxes = true;
          break;
        } else if (boxInfo.name === "moof") {
          if (!this.input._initInput) {
            throw new Error('"moof" box encountered with no "moov" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a "moov" box is required to read this file, please provide it using InputOptions.initInput.');
          }
          await this.copyMetadataFromInitInput(this.input._initInput);
          lookForMfraBox = false;
          foundMovieBoxes = true;
          break;
        }
        currentPos = startPos + boxInfo.totalSize;
      }
      if (!foundMovieBoxes && this.input._initInput) {
        await this.copyMetadataFromInitInput(this.input._initInput);
      }
      if (lookForMfraBox) {
        assert(this.reader.fileSize !== null);
        let lastWordSlice = this.reader.requestSlice(this.reader.fileSize - 4, 4);
        if (isThenable(lastWordSlice))
          lastWordSlice = await lastWordSlice;
        assert(lastWordSlice);
        const lastWord = readU32Be(lastWordSlice);
        const potentialMfraPos = this.reader.fileSize - lastWord;
        if (potentialMfraPos >= 0 && potentialMfraPos <= this.reader.fileSize - MAX_BOX_HEADER_SIZE) {
          let mfraHeaderSlice = this.reader.requestSliceRange(potentialMfraPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
          if (isThenable(mfraHeaderSlice))
            mfraHeaderSlice = await mfraHeaderSlice;
          if (mfraHeaderSlice) {
            const boxInfo = readBoxHeader(mfraHeaderSlice);
            if (boxInfo && boxInfo.name === "mfra") {
              let mfraSlice = this.reader.requestSlice(mfraHeaderSlice.filePos, boxInfo.contentSize);
              if (isThenable(mfraSlice))
                mfraSlice = await mfraSlice;
              if (mfraSlice) {
                this.readContiguousBoxes(mfraSlice);
              }
            }
          }
        }
      }
    })();
  }
  async copyMetadataFromInitInput(initInput) {
    const initDemuxer = await initInput._getDemuxer();
    if (initDemuxer.constructor !== _IsobmffDemuxer) {
      throw new Error("Init input must match the input's format.");
    }
    await initDemuxer.readMetadata();
    this.movieTimescale = initDemuxer.movieTimescale;
    this.movieDurationInTimescale = initDemuxer.movieDurationInTimescale;
    this.metadataTags = initDemuxer.metadataTags;
    this.isFragmented = true;
    this.fragmentTrackDefaults = initDemuxer.fragmentTrackDefaults;
    this.psshBoxes = initDemuxer.psshBoxes;
    for (const foreignTrack of initDemuxer.tracks) {
      const track = {
        id: foreignTrack.id,
        demuxer: this,
        trackBacking: null,
        disposition: foreignTrack.disposition,
        timescale: foreignTrack.timescale,
        durationInMediaTimescale: foreignTrack.durationInMediaTimescale,
        durationInMovieTimescale: foreignTrack.durationInMovieTimescale,
        rotation: foreignTrack.rotation,
        internalCodecId: foreignTrack.internalCodecId,
        name: foreignTrack.name,
        languageCode: foreignTrack.languageCode,
        sampleTableByteOffset: null,
        sampleTable: null,
        fragmentLookupTable: [],
        currentFragmentState: null,
        fragmentPositionCache: [],
        editListPreviousSegmentDurations: foreignTrack.editListPreviousSegmentDurations,
        editListOffset: foreignTrack.editListOffset,
        encryptionInfo: foreignTrack.encryptionInfo,
        encryptionAuxInfo: null,
        frmaCodecString: null,
        info: foreignTrack.info
      };
      if (foreignTrack.trackBacking) {
        assert(track.info);
        if (track.info.type === "video" && track.info.width !== -1) {
          const videoTrack = track;
          track.trackBacking = new IsobmffVideoTrackBacking(videoTrack);
          this.tracks.push(track);
        } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
          const audioTrack = track;
          track.trackBacking = new IsobmffAudioTrackBacking(audioTrack);
          this.tracks.push(track);
        }
      } else {
      }
    }
  }
  getSampleTableForTrack(internalTrack) {
    if (internalTrack.sampleTable) {
      return internalTrack.sampleTable;
    }
    const sampleTable = {
      sampleTimingEntries: [],
      sampleCompositionTimeOffsets: [],
      sampleSizes: [],
      keySampleIndices: null,
      chunkOffsets: [],
      sampleToChunk: [],
      presentationTimestamps: null,
      presentationTimestampIndexMap: null
    };
    internalTrack.sampleTable = sampleTable;
    if (internalTrack.sampleTableByteOffset === null) {
      return sampleTable;
    }
    assert(this.moovSlice);
    const stblContainerSlice = this.moovSlice.slice(internalTrack.sampleTableByteOffset);
    this.currentTrack = internalTrack;
    this.traverseBox(stblContainerSlice);
    this.currentTrack = null;
    const isPcmCodec = internalTrack.info?.type === "audio" && internalTrack.info.codec && PCM_AUDIO_CODECS.includes(internalTrack.info.codec);
    if (isPcmCodec && sampleTable.sampleCompositionTimeOffsets.length === 0) {
      assert(internalTrack.info?.type === "audio");
      const pcmInfo = parsePcmCodec(internalTrack.info.codec);
      const newSampleTimingEntries = [];
      const newSampleSizes = [];
      for (let i = 0; i < sampleTable.sampleToChunk.length; i++) {
        const chunkEntry = sampleTable.sampleToChunk[i];
        const nextEntry = sampleTable.sampleToChunk[i + 1];
        const chunkCount = (nextEntry ? nextEntry.startChunkIndex : sampleTable.chunkOffsets.length) - chunkEntry.startChunkIndex;
        for (let j = 0; j < chunkCount; j++) {
          const startSampleIndex = chunkEntry.startSampleIndex + j * chunkEntry.samplesPerChunk;
          const endSampleIndex = startSampleIndex + chunkEntry.samplesPerChunk;
          const startTimingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, startSampleIndex, (x) => x.startIndex);
          const startTimingEntry = sampleTable.sampleTimingEntries[startTimingEntryIndex];
          const endTimingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, endSampleIndex, (x) => x.startIndex);
          const endTimingEntry = sampleTable.sampleTimingEntries[endTimingEntryIndex];
          const firstSampleTimestamp = startTimingEntry.startDecodeTimestamp + (startSampleIndex - startTimingEntry.startIndex) * startTimingEntry.delta;
          const lastSampleTimestamp = endTimingEntry.startDecodeTimestamp + (endSampleIndex - endTimingEntry.startIndex) * endTimingEntry.delta;
          const delta = lastSampleTimestamp - firstSampleTimestamp;
          const lastSampleTimingEntry = last(newSampleTimingEntries);
          if (lastSampleTimingEntry && lastSampleTimingEntry.delta === delta) {
            lastSampleTimingEntry.count++;
          } else {
            newSampleTimingEntries.push({
              startIndex: chunkEntry.startChunkIndex + j,
              startDecodeTimestamp: firstSampleTimestamp,
              count: 1,
              delta
            });
          }
          const chunkSize = chunkEntry.samplesPerChunk * pcmInfo.sampleSize * internalTrack.info.numberOfChannels;
          newSampleSizes.push(chunkSize);
        }
        chunkEntry.startSampleIndex = chunkEntry.startChunkIndex;
        chunkEntry.samplesPerChunk = 1;
      }
      sampleTable.sampleTimingEntries = newSampleTimingEntries;
      sampleTable.sampleSizes = newSampleSizes;
    }
    if (sampleTable.sampleCompositionTimeOffsets.length > 0) {
      sampleTable.presentationTimestamps = [];
      for (const entry of sampleTable.sampleTimingEntries) {
        for (let i = 0; i < entry.count; i++) {
          sampleTable.presentationTimestamps.push({
            presentationTimestamp: entry.startDecodeTimestamp + i * entry.delta,
            sampleIndex: entry.startIndex + i
          });
        }
      }
      for (const entry of sampleTable.sampleCompositionTimeOffsets) {
        for (let i = 0; i < entry.count; i++) {
          const sampleIndex = entry.startIndex + i;
          const sample = sampleTable.presentationTimestamps[sampleIndex];
          if (!sample) {
            continue;
          }
          sample.presentationTimestamp += entry.offset;
        }
      }
      sampleTable.presentationTimestamps.sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
      sampleTable.presentationTimestampIndexMap = Array(sampleTable.presentationTimestamps.length).fill(-1);
      for (let i = 0; i < sampleTable.presentationTimestamps.length; i++) {
        sampleTable.presentationTimestampIndexMap[sampleTable.presentationTimestamps[i].sampleIndex] = i;
      }
    } else {
    }
    return sampleTable;
  }
  async readFragment(startPos) {
    if (this.lastReadFragment?.moofOffset === startPos) {
      return this.lastReadFragment;
    }
    let headerSlice = this.reader.requestSliceRange(startPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
    if (isThenable(headerSlice))
      headerSlice = await headerSlice;
    assert(headerSlice);
    const moofBoxInfo = readBoxHeader(headerSlice);
    assert(moofBoxInfo?.name === "moof");
    let entireSlice = this.reader.requestSlice(startPos, moofBoxInfo.totalSize);
    if (isThenable(entireSlice))
      entireSlice = await entireSlice;
    assert(entireSlice);
    this.traverseBox(entireSlice);
    const fragment = this.lastReadFragment;
    assert(fragment && fragment.moofOffset === startPos);
    for (const [, trackData] of fragment.trackData) {
      const track = trackData.track;
      const { fragmentPositionCache } = track;
      if (!trackData.startTimestampIsFinal) {
        const lookupEntry = track.fragmentLookupTable.find((x) => x.moofOffset === fragment.moofOffset);
        if (lookupEntry) {
          offsetFragmentTrackDataByTimestamp(trackData, lookupEntry.timestamp);
        } else {
          const lastCacheIndex = binarySearchLessOrEqual(fragmentPositionCache, fragment.moofOffset - 1, (x) => x.moofOffset);
          if (lastCacheIndex !== -1) {
            const lastCache = fragmentPositionCache[lastCacheIndex];
            offsetFragmentTrackDataByTimestamp(trackData, lastCache.endTimestamp);
          } else {
          }
        }
        trackData.startTimestampIsFinal = true;
      }
      const insertionIndex = binarySearchLessOrEqual(fragmentPositionCache, trackData.startTimestamp, (x) => x.startTimestamp);
      if (insertionIndex === -1 || fragmentPositionCache[insertionIndex].moofOffset !== fragment.moofOffset) {
        fragmentPositionCache.splice(insertionIndex + 1, 0, {
          moofOffset: fragment.moofOffset,
          startTimestamp: trackData.startTimestamp,
          endTimestamp: trackData.endTimestamp
        });
      }
      if (trackData.encryptionAuxInfo && track.encryptionInfo) {
        const entries = await resolveEncryptionAuxInfo(this.reader, track.encryptionInfo, trackData.encryptionAuxInfo);
        for (let i = 0; i < Math.min(trackData.samples.length, entries.length); i++) {
          const entry = entries[i];
          trackData.samples[i].encryption = entry;
        }
      }
    }
    return fragment;
  }
  readContiguousBoxes(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
      const foundBox = this.traverseBox(slice);
      if (!foundBox) {
        break;
      }
    }
  }
  // eslint-disable-next-line @stylistic/generator-star-spacing
  *iterateContiguousBoxes(slice) {
    const startIndex = slice.filePos;
    while (slice.filePos - startIndex <= slice.length - MIN_BOX_HEADER_SIZE) {
      const startPos = slice.filePos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        break;
      }
      yield { boxInfo, slice };
      slice.filePos = startPos + boxInfo.totalSize;
    }
  }
  traverseBox(slice) {
    const startPos = slice.filePos;
    const boxInfo = readBoxHeader(slice);
    if (!boxInfo) {
      return false;
    }
    const contentStartPos = slice.filePos;
    const boxEndPos = startPos + boxInfo.totalSize;
    switch (boxInfo.name) {
      case "mdia":
      case "minf":
      case "dinf":
      case "mfra":
      case "edts":
      case "sinf":
      case "schi":
        {
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "mvhd":
        {
          const version = readU8(slice);
          slice.skip(3);
          if (version === 1) {
            slice.skip(8 + 8);
            this.movieTimescale = readU32Be(slice);
            this.movieDurationInTimescale = readU64Be(slice);
          } else {
            slice.skip(4 + 4);
            this.movieTimescale = readU32Be(slice);
            this.movieDurationInTimescale = readU32Be(slice);
          }
        }
        ;
        break;
      case "trak":
        {
          const track = {
            id: -1,
            demuxer: this,
            trackBacking: null,
            disposition: {
              ...DEFAULT_TRACK_DISPOSITION,
              primary: false
            },
            info: null,
            timescale: -1,
            durationInMovieTimescale: -1,
            durationInMediaTimescale: -1,
            rotation: 0,
            internalCodecId: null,
            name: null,
            languageCode: UNDETERMINED_LANGUAGE,
            sampleTableByteOffset: -1,
            sampleTable: null,
            fragmentLookupTable: [],
            currentFragmentState: null,
            fragmentPositionCache: [],
            editListPreviousSegmentDurations: 0,
            editListOffset: 0,
            encryptionInfo: null,
            encryptionAuxInfo: null,
            frmaCodecString: null
          };
          this.currentTrack = track;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          if (track.id !== -1 && track.timescale !== -1 && track.info !== null) {
            if (track.info.type === "video" && track.info.width !== -1) {
              const videoTrack = track;
              track.trackBacking = new IsobmffVideoTrackBacking(videoTrack);
              this.tracks.push(track);
            } else if (track.info.type === "audio" && track.info.numberOfChannels !== -1) {
              const audioTrack = track;
              track.trackBacking = new IsobmffAudioTrackBacking(audioTrack);
              this.tracks.push(track);
            }
          }
          this.currentTrack = null;
        }
        ;
        break;
      case "tkhd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          const flags = readU24Be(slice);
          const trackEnabled = !!(flags & 1);
          track.disposition.default = trackEnabled;
          if (version === 0) {
            slice.skip(8);
            track.id = readU32Be(slice);
            slice.skip(4);
            track.durationInMovieTimescale = readU32Be(slice);
          } else if (version === 1) {
            slice.skip(16);
            track.id = readU32Be(slice);
            slice.skip(4);
            track.durationInMovieTimescale = readU64Be(slice);
          } else {
            throw new Error(`Incorrect track header version ${version}.`);
          }
          slice.skip(2 * 4 + 2 + 2 + 2 + 2);
          const matrix = [
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice),
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice),
            readFixed_16_16(slice),
            readFixed_16_16(slice),
            readFixed_2_30(slice)
          ];
          const rotation = normalizeRotation(roundToMultiple(extractRotationFromMatrix(matrix), 90));
          assert(rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270);
          track.rotation = rotation;
        }
        ;
        break;
      case "elst":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          let relevantEntryFound = false;
          let previousSegmentDurations = 0;
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const segmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
            const mediaTime = version === 1 ? readI64Be(slice) : readI32Be(slice);
            const mediaRate = readFixed_16_16(slice);
            if (segmentDuration === 0) {
              continue;
            }
            if (relevantEntryFound) {
              Logging._warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");
              break;
            }
            if (mediaTime === -1) {
              previousSegmentDurations += segmentDuration;
              continue;
            }
            if (mediaRate !== 1) {
              Logging._warn("Unsupported edit list entry: media rate must be 1.");
              break;
            }
            track.editListPreviousSegmentDurations = previousSegmentDurations;
            track.editListOffset = mediaTime;
            relevantEntryFound = true;
          }
        }
        ;
        break;
      case "mdhd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          if (version === 0) {
            slice.skip(8);
            track.timescale = readU32Be(slice);
            track.durationInMediaTimescale = readU32Be(slice);
          } else if (version === 1) {
            slice.skip(16);
            track.timescale = readU32Be(slice);
            track.durationInMediaTimescale = readU64Be(slice);
          }
          let language = readU16Be(slice);
          if (language > 0) {
            track.languageCode = "";
            for (let i = 0; i < 3; i++) {
              track.languageCode = String.fromCharCode(96 + (language & 31)) + track.languageCode;
              language >>= 5;
            }
            if (!isIso639Dash2LanguageCode(track.languageCode)) {
              track.languageCode = UNDETERMINED_LANGUAGE;
            }
          }
        }
        ;
        break;
      case "hdlr":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          slice.skip(8);
          const handlerType = readAscii(slice, 4);
          if (handlerType === "vide") {
            track.info = {
              type: "video",
              width: -1,
              height: -1,
              squarePixelWidth: -1,
              squarePixelHeight: -1,
              codec: null,
              codecDescription: null,
              colorSpace: null,
              avcType: null,
              avcCodecInfo: null,
              hevcCodecInfo: null,
              vp9CodecInfo: null,
              av1CodecInfo: null,
              proresFormat: null
            };
          } else if (handlerType === "soun") {
            track.info = {
              type: "audio",
              numberOfChannels: -1,
              sampleRate: -1,
              codec: null,
              codecDescription: null,
              aacCodecInfo: null,
              dtsFormat: null,
              pcmLittleEndian: false,
              pcmSampleSize: null
            };
          }
        }
        ;
        break;
      case "stbl":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          track.sampleTableByteOffset = startPos;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "stsd":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (track.info === null || track.sampleTable) {
            break;
          }
          const stsdVersion = readU8(slice);
          slice.skip(3);
          const entries = readU32Be(slice);
          for (let i = 0; i < entries; i++) {
            const sampleBoxStartPos = slice.filePos;
            const sampleBoxInfo = readBoxHeader(slice);
            if (!sampleBoxInfo) {
              break;
            }
            track.internalCodecId = sampleBoxInfo.name;
            const lowercaseBoxName = sampleBoxInfo.name.toLowerCase();
            if (track.info.type === "video") {
              slice.skip(6 * 1 + 2 + 2 + 2 + 3 * 4);
              track.info.width = readU16Be(slice);
              track.info.height = readU16Be(slice);
              track.info.squarePixelWidth = track.info.width;
              track.info.squarePixelHeight = track.info.height;
              slice.skip(4 + 4 + 4 + 2 + 32 + 2 + 2);
              track.frmaCodecString = null;
              this.readContiguousBoxes(slice.slice(slice.filePos, sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos));
              const codecName = lowercaseBoxName === "encv" ? track.frmaCodecString : lowercaseBoxName;
              track.frmaCodecString = null;
              if (codecName === "avc1" || codecName === "avc3") {
                track.info.codec = "avc";
                track.info.avcType = codecName === "avc1" ? 1 : 3;
              } else if (codecName === "hvc1" || codecName === "hev1") {
                track.info.codec = "hevc";
              } else if (codecName === "vp08") {
                track.info.codec = "vp8";
              } else if (codecName === "vp09") {
                track.info.codec = "vp9";
              } else if (codecName === "av01") {
                track.info.codec = "av1";
              } else if (PRORES_FOURCCS.includes(lowercaseBoxName)) {
                track.info.codec = "prores";
                track.info.proresFormat = lowercaseBoxName;
              } else if (codecName === null) {
                Logging._warn(`Unknown encrypted video codec due to missing frma box.`);
              } else {
                Logging._warn(`Unsupported video codec (sample entry type '${sampleBoxInfo.name}').`);
              }
            } else {
              slice.skip(6 * 1 + 2);
              const version = readU16Be(slice);
              slice.skip(3 * 2);
              let channelCount = readU16Be(slice);
              let sampleSize = readU16Be(slice);
              slice.skip(2 * 2);
              let sampleRate = readU32Be(slice) / 65536;
              let lpcmFlags = null;
              if (stsdVersion === 0 && version > 0) {
                if (version === 1) {
                  slice.skip(4);
                  sampleSize = 8 * readU32Be(slice);
                  slice.skip(2 * 4);
                } else if (version === 2) {
                  slice.skip(4);
                  sampleRate = readF64Be(slice);
                  channelCount = readU32Be(slice);
                  slice.skip(4);
                  sampleSize = readU32Be(slice);
                  lpcmFlags = readU32Be(slice);
                  slice.skip(2 * 4);
                }
              }
              track.info.numberOfChannels = channelCount;
              track.info.sampleRate = sampleRate;
              track.frmaCodecString = null;
              this.readContiguousBoxes(slice.slice(slice.filePos, sampleBoxStartPos + sampleBoxInfo.totalSize - slice.filePos));
              const codecName = lowercaseBoxName === "enca" ? track.frmaCodecString : lowercaseBoxName;
              track.frmaCodecString = null;
              if (codecName === "mp4a") {
              } else if (codecName === "opus") {
                track.info.codec = "opus";
                track.info.sampleRate = OPUS_SAMPLE_RATE;
              } else if (codecName === "flac") {
                track.info.codec = "flac";
              } else if (codecName === "ulaw") {
                track.info.codec = "ulaw";
              } else if (codecName === "alaw") {
                track.info.codec = "alaw";
              } else if (codecName === "ac-3") {
                track.info.codec = "ac3";
              } else if (codecName === "ec-3") {
                track.info.codec = "eac3";
              } else if (DTS_FOURCCS.includes(codecName)) {
                track.info.codec = "dts";
                track.info.dtsFormat = codecName;
              } else if (codecName === "twos") {
                if (sampleSize === 8) {
                  track.info.codec = "pcm-s8";
                } else if (sampleSize === 16) {
                  track.info.codec = track.info.pcmLittleEndian ? "pcm-s16" : "pcm-s16be";
                } else {
                  Logging._warn(`Unsupported sample size ${sampleSize} for codec 'twos'.`);
                  track.info.codec = null;
                }
              } else if (codecName === "sowt") {
                if (sampleSize === 8) {
                  track.info.codec = "pcm-s8";
                } else if (sampleSize === 16) {
                  track.info.codec = "pcm-s16";
                } else {
                  Logging._warn(`Unsupported sample size ${sampleSize} for codec 'sowt'.`);
                  track.info.codec = null;
                }
              } else if (codecName === "raw ") {
                track.info.codec = "pcm-u8";
              } else if (codecName === "in24") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-s24" : "pcm-s24be";
              } else if (codecName === "in32") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-s32" : "pcm-s32be";
              } else if (codecName === "fl32") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-f32" : "pcm-f32be";
              } else if (codecName === "fl64") {
                track.info.codec = track.info.pcmLittleEndian ? "pcm-f64" : "pcm-f64be";
              } else if (codecName === "ipcm") {
                const pcmSampleSize = track.info.pcmSampleSize;
                if (track.info.pcmLittleEndian) {
                  if (pcmSampleSize === 16) {
                    track.info.codec = "pcm-s16";
                  } else if (pcmSampleSize === 24) {
                    track.info.codec = "pcm-s24";
                  } else if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-s32";
                  } else {
                    Logging._warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                } else {
                  if (pcmSampleSize === 16) {
                    track.info.codec = "pcm-s16be";
                  } else if (pcmSampleSize === 24) {
                    track.info.codec = "pcm-s24be";
                  } else if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-s32be";
                  } else {
                    Logging._warn(`Invalid ipcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                }
              } else if (codecName === "fpcm") {
                const pcmSampleSize = track.info.pcmSampleSize;
                if (track.info.pcmLittleEndian) {
                  if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-f32";
                  } else if (pcmSampleSize === 64) {
                    track.info.codec = "pcm-f64";
                  } else {
                    Logging._warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                } else {
                  if (pcmSampleSize === 32) {
                    track.info.codec = "pcm-f32be";
                  } else if (pcmSampleSize === 64) {
                    track.info.codec = "pcm-f64be";
                  } else {
                    Logging._warn(`Invalid fpcm sample size ${pcmSampleSize}.`);
                    track.info.codec = null;
                  }
                }
              } else if (codecName === "lpcm" && lpcmFlags !== null) {
                const bytesPerSample = sampleSize + 7 >> 3;
                const isFloat = Boolean(lpcmFlags & 1);
                const isBigEndian = Boolean(lpcmFlags & 2);
                const sFlags = lpcmFlags & 4 ? -1 : 0;
                if (sampleSize > 0 && sampleSize <= 64) {
                  if (isFloat) {
                    if (sampleSize === 32) {
                      track.info.codec = isBigEndian ? "pcm-f32be" : "pcm-f32";
                    }
                  } else {
                    if (sFlags & 1 << bytesPerSample - 1) {
                      if (bytesPerSample === 1) {
                        track.info.codec = "pcm-s8";
                      } else if (bytesPerSample === 2) {
                        track.info.codec = isBigEndian ? "pcm-s16be" : "pcm-s16";
                      } else if (bytesPerSample === 3) {
                        track.info.codec = isBigEndian ? "pcm-s24be" : "pcm-s24";
                      } else if (bytesPerSample === 4) {
                        track.info.codec = isBigEndian ? "pcm-s32be" : "pcm-s32";
                      }
                    } else {
                      if (bytesPerSample === 1) {
                        track.info.codec = "pcm-u8";
                      }
                    }
                  }
                }
                if (track.info.codec === null) {
                  Logging._warn("Unsupported PCM format.");
                }
              } else if (codecName === null) {
                Logging._warn(`Unknown encrypted audio codec due to missing frma box.`);
              } else {
                Logging._warn(`Unsupported audio codec (sample entry type '${sampleBoxInfo.name}').`);
              }
            }
            slice.filePos = sampleBoxStartPos + sampleBoxInfo.totalSize;
          }
        }
        ;
        break;
      case "frma":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          const format = readAscii(slice, 4);
          const lowercase = format.toLowerCase();
          track.frmaCodecString = lowercase;
        }
        ;
        break;
      case "schm":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          slice.skip(4);
          const schemeType = readAscii(slice, 4);
          if (schemeType === "cenc" || schemeType === "cens" || schemeType === "cbcs") {
            track.encryptionInfo = {
              scheme: schemeType,
              defaultKid: null,
              defaultIsProtected: null,
              defaultPerSampleIvSize: null,
              defaultConstantIv: null,
              defaultCryptByteBlock: null,
              defaultSkipByteBlock: null
            };
          } else {
            Logging._warn(`Unsupported encryption scheme '${schemeType}'.`);
          }
        }
        ;
        break;
      case "tenc":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          const version = readU8(slice);
          slice.skip(3);
          slice.skip(1);
          const patternByte = readU8(slice);
          if (version > 0) {
            track.encryptionInfo.defaultCryptByteBlock = patternByte >> 4;
            track.encryptionInfo.defaultSkipByteBlock = patternByte & 15;
          } else {
            track.encryptionInfo.defaultCryptByteBlock = 0;
            track.encryptionInfo.defaultSkipByteBlock = 0;
          }
          track.encryptionInfo.defaultIsProtected = readU8(slice) !== 0;
          track.encryptionInfo.defaultPerSampleIvSize = readU8(slice);
          track.encryptionInfo.defaultKid = bytesToHexString(readBytes(slice, 16));
          if (track.encryptionInfo.defaultIsProtected && track.encryptionInfo.defaultPerSampleIvSize === 0) {
            const constantIvSize = readU8(slice);
            const constantIv = new Uint8Array(16);
            constantIv.set(readBytes(slice, constantIvSize), 0);
            track.encryptionInfo.defaultConstantIv = constantIv;
          }
        }
        ;
        break;
      case "avcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info);
          if (boxInfo.contentSize === 0) {
            break;
          }
          track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
        }
        ;
        break;
      case "hvcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info);
          if (boxInfo.contentSize === 0) {
            break;
          }
          track.info.codecDescription = readBytes(slice, boxInfo.contentSize);
        }
        ;
        break;
      case "vpcC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          slice.skip(4);
          const profile = readU8(slice);
          const level = readU8(slice);
          const thirdByte = readU8(slice);
          const bitDepth = thirdByte >> 4;
          const chromaSubsampling = thirdByte >> 1 & 7;
          const videoFullRangeFlag = thirdByte & 1;
          const colourPrimaries = readU8(slice);
          const transferCharacteristics = readU8(slice);
          const matrixCoefficients = readU8(slice);
          track.info.vp9CodecInfo = {
            profile,
            level,
            bitDepth,
            chromaSubsampling,
            videoFullRangeFlag,
            colourPrimaries,
            transferCharacteristics,
            matrixCoefficients
          };
        }
        ;
        break;
      case "av1C":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          slice.skip(1);
          const secondByte = readU8(slice);
          const profile = secondByte >> 5;
          const level = secondByte & 31;
          const thirdByte = readU8(slice);
          const tier = thirdByte >> 7;
          const highBitDepth = thirdByte >> 6 & 1;
          const twelveBit = thirdByte >> 5 & 1;
          const monochrome = thirdByte >> 4 & 1;
          const chromaSubsamplingX = thirdByte >> 3 & 1;
          const chromaSubsamplingY = thirdByte >> 2 & 1;
          const chromaSamplePosition = thirdByte & 3;
          const bitDepth = profile === 2 && highBitDepth ? twelveBit ? 12 : 10 : highBitDepth ? 10 : 8;
          track.info.av1CodecInfo = {
            profile,
            level,
            tier,
            bitDepth,
            monochrome,
            chromaSubsamplingX,
            chromaSubsamplingY,
            chromaSamplePosition
          };
        }
        ;
        break;
      case "colr":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          const colourType = readAscii(slice, 4);
          if (colourType !== "nclx" && colourType !== "nclc") {
            break;
          }
          const colourPrimaries = readU16Be(slice);
          const transferCharacteristics = readU16Be(slice);
          const matrixCoefficients = readU16Be(slice);
          let fullRange = void 0;
          if (colourType === "nclx") {
            fullRange = Boolean(readU8(slice) & 128);
          }
          track.info.colorSpace = {
            primaries: COLOR_PRIMARIES_MAP_INVERSE[colourPrimaries],
            transfer: TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics],
            matrix: MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients],
            fullRange
          };
        }
        ;
        break;
      case "pasp":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "video");
          const num = readU32Be(slice);
          const den = readU32Be(slice);
          if (num > 0 && den > 0) {
            if (num > den) {
              track.info.squarePixelWidth = Math.round(track.info.width * num / den);
            } else {
              track.info.squarePixelHeight = Math.round(track.info.height * den / num);
            }
          }
        }
        ;
        break;
      case "wave":
        {
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "esds":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(4);
          const tag = readU8(slice);
          assert(tag === 3);
          readIsomVariableInteger(slice);
          slice.skip(2);
          const mixed = readU8(slice);
          const streamDependenceFlag = (mixed & 128) !== 0;
          const urlFlag = (mixed & 64) !== 0;
          const ocrStreamFlag = (mixed & 32) !== 0;
          if (streamDependenceFlag) {
            slice.skip(2);
          }
          if (urlFlag) {
            const urlLength = readU8(slice);
            slice.skip(urlLength);
          }
          if (ocrStreamFlag) {
            slice.skip(2);
          }
          const decoderConfigTag = readU8(slice);
          assert(decoderConfigTag === 4);
          const decoderConfigDescriptorLength = readIsomVariableInteger(slice);
          const payloadStart = slice.filePos;
          const objectTypeIndication = readU8(slice);
          if (objectTypeIndication === 64 || objectTypeIndication === 103) {
            track.info.codec = "aac";
            track.info.aacCodecInfo = {
              isMpeg2: objectTypeIndication === 103,
              objectType: null
            };
          } else if (objectTypeIndication === 105 || objectTypeIndication === 107) {
            track.info.codec = "mp3";
          } else if (objectTypeIndication === 221) {
            track.info.codec = "vorbis";
          } else if (objectTypeIndication === 169) {
            track.info.codec = "dts";
          } else {
            Logging._warn(`Unsupported audio codec (objectTypeIndication ${objectTypeIndication}) - discarding track.`);
          }
          slice.skip(1 + 3 + 4 + 4);
          if (decoderConfigDescriptorLength > slice.filePos - payloadStart) {
            const decoderSpecificInfoTag = readU8(slice);
            assert(decoderSpecificInfoTag === 5);
            const decoderSpecificInfoLength = readIsomVariableInteger(slice);
            track.info.codecDescription = readBytes(slice, decoderSpecificInfoLength);
            if (track.info.codec === "aac") {
              const audioSpecificConfig = parseAacAudioSpecificConfig(track.info.codecDescription);
              if (audioSpecificConfig.outputNumberOfChannels !== null) {
                track.info.numberOfChannels = audioSpecificConfig.outputNumberOfChannels;
              }
              if (audioSpecificConfig.outputSampleRate !== null) {
                track.info.sampleRate = audioSpecificConfig.outputSampleRate;
              }
            }
          }
        }
        ;
        break;
      case "enda":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          track.info.pcmLittleEndian = !!(readU16Be(slice) & 255);
        }
        ;
        break;
      case "pcmC":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(1 + 3);
          const formatFlags = readU8(slice);
          track.info.pcmLittleEndian = Boolean(formatFlags & 1);
          track.info.pcmSampleSize = readU8(slice);
        }
        ;
        break;
      case "dOps":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(1);
          const outputChannelCount = readU8(slice);
          const preSkip = readU16Be(slice);
          const inputSampleRate = readU32Be(slice);
          const outputGain = readI16Be(slice);
          const channelMappingFamily = readU8(slice);
          let channelMappingTable;
          if (channelMappingFamily !== 0) {
            channelMappingTable = readBytes(slice, 2 + outputChannelCount);
          } else {
            channelMappingTable = new Uint8Array(0);
          }
          const description = new Uint8Array(8 + 1 + 1 + 2 + 4 + 2 + 1 + channelMappingTable.byteLength);
          const view = new DataView(description.buffer);
          view.setUint32(0, 1332770163, false);
          view.setUint32(4, 1214603620, false);
          view.setUint8(8, 1);
          view.setUint8(9, outputChannelCount);
          view.setUint16(10, preSkip, true);
          view.setUint32(12, inputSampleRate, true);
          view.setInt16(16, outputGain, true);
          view.setUint8(18, channelMappingFamily);
          description.set(channelMappingTable, 19);
          track.info.codecDescription = description;
          track.info.numberOfChannels = outputChannelCount;
        }
        ;
        break;
      case "dfLa":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          slice.skip(4);
          const BLOCK_TYPE_MASK = 127;
          const LAST_METADATA_BLOCK_FLAG_MASK = 128;
          const startPos2 = slice.filePos;
          while (slice.filePos < boxEndPos) {
            const flagAndType = readU8(slice);
            const metadataBlockLength = readU24Be(slice);
            const type = flagAndType & BLOCK_TYPE_MASK;
            if (type === FlacBlockType.STREAMINFO) {
              slice.skip(10);
              const word = readU32Be(slice);
              const sampleRate = word >>> 12;
              const numberOfChannels = (word >> 9 & 7) + 1;
              track.info.sampleRate = sampleRate;
              track.info.numberOfChannels = numberOfChannels;
              slice.skip(20);
            } else {
              slice.skip(metadataBlockLength);
            }
            if (flagAndType & LAST_METADATA_BLOCK_FLAG_MASK) {
              break;
            }
          }
          const endPos = slice.filePos;
          slice.filePos = startPos2;
          const bytes = readBytes(slice, endPos - startPos2);
          const description = new Uint8Array(4 + bytes.byteLength);
          const view = new DataView(description.buffer);
          view.setUint32(0, 1716281667, false);
          description.set(bytes, 4);
          track.info.codecDescription = description;
        }
        ;
        break;
      case "dac3":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          const bytes = readBytes(slice, 3);
          const bitstream = new Bitstream(bytes);
          const fscod = bitstream.readBits(2);
          bitstream.skipBits(5 + 3);
          const acmod = bitstream.readBits(3);
          const lfeon = bitstream.readBits(1);
          if (fscod < 3) {
            track.info.sampleRate = AC3_SAMPLE_RATES[fscod];
          }
          track.info.numberOfChannels = AC3_ACMOD_CHANNEL_COUNTS[acmod] + lfeon;
        }
        ;
        break;
      case "dec3":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          const bytes = readBytes(slice, boxInfo.contentSize);
          const config = parseEac3Config(bytes);
          if (!config) {
            Logging._warn("Invalid dec3 box contents, ignoring.");
            break;
          }
          const sampleRate = getEac3SampleRate(config);
          if (sampleRate !== null) {
            track.info.sampleRate = sampleRate;
          }
          track.info.numberOfChannels = getEac3ChannelCount(config);
        }
        ;
        break;
      case "ddts":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.info?.type === "audio");
          const bytes = readBytes(slice, Math.min(boxInfo.contentSize, DTS_SPECIFIC_BOX_SIZE));
          const config = parseDtsSpecificBox(bytes);
          if (!config) {
            Logging._warn("Invalid ddts box contents, ignoring.");
            break;
          }
          track.info.sampleRate = config.sampleRate;
          if (config.numberOfChannels !== null) {
            track.info.numberOfChannels = config.numberOfChannels;
          }
        }
        ;
        break;
      case "stts":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          let currentIndex = 0;
          let currentTimestamp = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = readU32Be(slice);
            const sampleDelta = readU32Be(slice);
            track.sampleTable.sampleTimingEntries.push({
              startIndex: currentIndex,
              startDecodeTimestamp: currentTimestamp,
              count: sampleCount,
              delta: sampleDelta
            });
            currentIndex += sampleCount;
            currentTimestamp += sampleCount * sampleDelta;
          }
        }
        ;
        break;
      case "ctts":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(1 + 3);
          const entryCount = readU32Be(slice);
          let sampleIndex = 0;
          for (let i = 0; i < entryCount; i++) {
            const sampleCount = readU32Be(slice);
            const sampleOffset = readI32Be(slice);
            track.sampleTable.sampleCompositionTimeOffsets.push({
              startIndex: sampleIndex,
              count: sampleCount,
              offset: sampleOffset
            });
            sampleIndex += sampleCount;
          }
        }
        ;
        break;
      case "stsz":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const sampleSize = readU32Be(slice);
          const sampleCount = readU32Be(slice);
          if (sampleSize === 0) {
            for (let i = 0; i < sampleCount; i++) {
              const sampleSize2 = readU32Be(slice);
              track.sampleTable.sampleSizes.push(sampleSize2);
            }
          } else {
            track.sampleTable.sampleSizes.push(sampleSize);
          }
        }
        ;
        break;
      case "stz2":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          slice.skip(3);
          const fieldSize = readU8(slice);
          const sampleCount = readU32Be(slice);
          const bytes = readBytes(slice, Math.ceil(sampleCount * fieldSize / 8));
          const bitstream = new Bitstream(bytes);
          for (let i = 0; i < sampleCount; i++) {
            const sampleSize = bitstream.readBits(fieldSize);
            track.sampleTable.sampleSizes.push(sampleSize);
          }
        }
        ;
        break;
      case "stss":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          track.sampleTable.keySampleIndices = [];
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const sampleIndex = readU32Be(slice) - 1;
            track.sampleTable.keySampleIndices.push(sampleIndex);
          }
          if (track.sampleTable.keySampleIndices[0] !== 0) {
            track.sampleTable.keySampleIndices.unshift(0);
          }
        }
        ;
        break;
      case "stsc":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const startChunkIndex = readU32Be(slice) - 1;
            const samplesPerChunk = readU32Be(slice);
            const sampleDescriptionIndex = readU32Be(slice);
            track.sampleTable.sampleToChunk.push({
              startSampleIndex: -1,
              startChunkIndex,
              samplesPerChunk,
              sampleDescriptionIndex
            });
          }
          let startSampleIndex = 0;
          for (let i = 0; i < track.sampleTable.sampleToChunk.length; i++) {
            track.sampleTable.sampleToChunk[i].startSampleIndex = startSampleIndex;
            if (i < track.sampleTable.sampleToChunk.length - 1) {
              const nextChunk = track.sampleTable.sampleToChunk[i + 1];
              const chunkCount = nextChunk.startChunkIndex - track.sampleTable.sampleToChunk[i].startChunkIndex;
              startSampleIndex += chunkCount * track.sampleTable.sampleToChunk[i].samplesPerChunk;
            }
          }
        }
        ;
        break;
      case "stco":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = readU32Be(slice);
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "co64":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          if (!track.sampleTable) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const chunkOffset = readU64Be(slice);
            track.sampleTable.chunkOffsets.push(chunkOffset);
          }
        }
        ;
        break;
      case "mvex":
        {
          this.isFragmented = true;
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
        }
        ;
        break;
      case "mehd":
        {
          const version = readU8(slice);
          slice.skip(3);
          const fragmentDuration = version === 1 ? readU64Be(slice) : readU32Be(slice);
          this.movieDurationInTimescale = fragmentDuration;
        }
        ;
        break;
      case "trex":
        {
          slice.skip(4);
          const trackId = readU32Be(slice);
          const defaultSampleDescriptionIndex = readU32Be(slice);
          const defaultSampleDuration = readU32Be(slice);
          const defaultSampleSize = readU32Be(slice);
          const defaultSampleFlags = readU32Be(slice);
          this.fragmentTrackDefaults.push({
            trackId,
            defaultSampleDescriptionIndex,
            defaultSampleDuration,
            defaultSampleSize,
            defaultSampleFlags
          });
        }
        ;
        break;
      case "tfra":
        {
          const version = readU8(slice);
          slice.skip(3);
          const trackId = readU32Be(slice);
          const track = this.tracks.find((x) => x.id === trackId);
          if (!track) {
            break;
          }
          const word = readU32Be(slice);
          const lengthSizeOfTrafNum = (word & 48) >> 4;
          const lengthSizeOfTrunNum = (word & 12) >> 2;
          const lengthSizeOfSampleNum = word & 3;
          const functions = [readU8, readU16Be, readU24Be, readU32Be];
          const readTrafNum = functions[lengthSizeOfTrafNum];
          const readTrunNum = functions[lengthSizeOfTrunNum];
          const readSampleNum = functions[lengthSizeOfSampleNum];
          const numberOfEntries = readU32Be(slice);
          for (let i = 0; i < numberOfEntries; i++) {
            const time = version === 1 ? readU64Be(slice) : readU32Be(slice);
            const moofOffset = version === 1 ? readU64Be(slice) : readU32Be(slice);
            readTrafNum(slice);
            readTrunNum(slice);
            readSampleNum(slice);
            track.fragmentLookupTable.push({
              timestamp: time,
              moofOffset
            });
          }
          track.fragmentLookupTable.sort((a, b) => a.timestamp - b.timestamp);
          for (let i = 0; i < track.fragmentLookupTable.length - 1; i++) {
            const entry1 = track.fragmentLookupTable[i];
            const entry2 = track.fragmentLookupTable[i + 1];
            if (entry1.timestamp === entry2.timestamp) {
              track.fragmentLookupTable.splice(i + 1, 1);
              i--;
            }
          }
        }
        ;
        break;
      case "moof":
        {
          this.currentFragment = {
            moofOffset: startPos,
            moofSize: boxInfo.totalSize,
            implicitBaseDataOffset: startPos,
            trackData: /* @__PURE__ */ new Map(),
            psshBoxes: []
          };
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          this.lastReadFragment = this.currentFragment;
          this.currentFragment = null;
        }
        ;
        break;
      case "traf":
        {
          assert(this.currentFragment);
          this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          if (this.currentTrack) {
            const trackData = this.currentFragment.trackData.get(this.currentTrack.id);
            cond: if (trackData) {
              if (trackData.samples.length === 0) {
                this.currentFragment.trackData.delete(this.currentTrack.id);
                break cond;
              }
              trackData.presentationTimestamps = trackData.samples.map((x, i) => ({ presentationTimestamp: x.presentationTimestamp, sampleIndex: i })).sort((a, b) => a.presentationTimestamp - b.presentationTimestamp);
              for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
                const currentEntry = trackData.presentationTimestamps[i];
                const currentSample = trackData.samples[currentEntry.sampleIndex];
                if (trackData.firstKeyFrameTimestamp === null && currentSample.isKeyFrame) {
                  trackData.firstKeyFrameTimestamp = currentSample.presentationTimestamp;
                }
                if (i < trackData.presentationTimestamps.length - 1) {
                  const nextEntry = trackData.presentationTimestamps[i + 1];
                  const duration = nextEntry.presentationTimestamp - currentEntry.presentationTimestamp;
                  currentSample.duration = duration;
                }
              }
              const firstSample = trackData.samples[trackData.presentationTimestamps[0].sampleIndex];
              const lastSample = trackData.samples[last(trackData.presentationTimestamps).sampleIndex];
              trackData.startTimestamp = firstSample.presentationTimestamp;
              trackData.endTimestamp = lastSample.presentationTimestamp + lastSample.duration;
              const { currentFragmentState } = this.currentTrack;
              assert(currentFragmentState);
              if (currentFragmentState.startTimestamp !== null) {
                offsetFragmentTrackDataByTimestamp(trackData, currentFragmentState.startTimestamp);
                trackData.startTimestampIsFinal = true;
              }
              if (currentFragmentState.encryptionAuxInfo && !trackData.samples[0].encryption) {
                trackData.encryptionAuxInfo = currentFragmentState.encryptionAuxInfo;
              }
            }
            this.currentTrack.currentFragmentState = null;
            this.currentTrack = null;
          }
        }
        ;
        break;
      case "pssh":
        {
          if (this.input._formatOptions.isobmff?._suppressPsshParsing) {
            break;
          }
          const psshBox = parsePsshBoxContents(readBytes(slice, boxInfo.contentSize));
          if (this.currentFragment) {
            this.currentFragment.psshBoxes.push(psshBox);
          } else if (!this.currentTrack) {
            this.psshBoxes.push(psshBox);
          }
        }
        ;
        break;
      case "tfhd":
        {
          assert(this.currentFragment);
          slice.skip(1);
          const flags = readU24Be(slice);
          const baseDataOffsetPresent = Boolean(flags & 1);
          const sampleDescriptionIndexPresent = Boolean(flags & 2);
          const defaultSampleDurationPresent = Boolean(flags & 8);
          const defaultSampleSizePresent = Boolean(flags & 16);
          const defaultSampleFlagsPresent = Boolean(flags & 32);
          const durationIsEmpty = Boolean(flags & 65536);
          const defaultBaseIsMoof = Boolean(flags & 131072);
          const trackId = readU32Be(slice);
          const track = this.tracks.find((x) => x.id === trackId);
          if (!track) {
            break;
          }
          const defaults = this.fragmentTrackDefaults.find((x) => x.trackId === trackId);
          this.currentTrack = track;
          track.currentFragmentState = {
            baseDataOffset: this.currentFragment.implicitBaseDataOffset,
            sampleDescriptionIndex: defaults?.defaultSampleDescriptionIndex ?? null,
            defaultSampleDuration: defaults?.defaultSampleDuration ?? null,
            defaultSampleSize: defaults?.defaultSampleSize ?? null,
            defaultSampleFlags: defaults?.defaultSampleFlags ?? null,
            startTimestamp: null,
            encryptionAuxInfo: null
          };
          if (baseDataOffsetPresent) {
            track.currentFragmentState.baseDataOffset = readU64Be(slice);
          } else if (defaultBaseIsMoof) {
            track.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset;
          }
          if (sampleDescriptionIndexPresent) {
            track.currentFragmentState.sampleDescriptionIndex = readU32Be(slice);
          }
          if (defaultSampleDurationPresent) {
            track.currentFragmentState.defaultSampleDuration = readU32Be(slice);
          }
          if (defaultSampleSizePresent) {
            track.currentFragmentState.defaultSampleSize = readU32Be(slice);
          }
          if (defaultSampleFlagsPresent) {
            track.currentFragmentState.defaultSampleFlags = readU32Be(slice);
          }
          if (durationIsEmpty) {
            track.currentFragmentState.defaultSampleDuration = 0;
          }
        }
        ;
        break;
      case "tfdt":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(track.currentFragmentState);
          const version = readU8(slice);
          slice.skip(3);
          const baseMediaDecodeTime = version === 0 ? readU32Be(slice) : readU64Be(slice);
          track.currentFragmentState.startTimestamp = baseMediaDecodeTime;
        }
        ;
        break;
      case "trun":
        {
          const track = this.currentTrack;
          if (!track) {
            break;
          }
          assert(this.currentFragment);
          assert(track.currentFragmentState);
          const version = readU8(slice);
          const flags = readU24Be(slice);
          const dataOffsetPresent = Boolean(flags & 1);
          const firstSampleFlagsPresent = Boolean(flags & 4);
          const sampleDurationPresent = Boolean(flags & 256);
          const sampleSizePresent = Boolean(flags & 512);
          const sampleFlagsPresent = Boolean(flags & 1024);
          const sampleCompositionTimeOffsetsPresent = Boolean(flags & 2048);
          const sampleCount = readU32Be(slice);
          let dataOffset = null;
          if (dataOffsetPresent) {
            dataOffset = readI32Be(slice);
          }
          let firstSampleFlags = null;
          if (firstSampleFlagsPresent) {
            firstSampleFlags = readU32Be(slice);
          }
          let trackData;
          if (this.currentFragment.trackData.has(track.id)) {
            trackData = this.currentFragment.trackData.get(track.id);
            if (dataOffset !== null) {
              trackData.currentOffset = track.currentFragmentState.baseDataOffset + dataOffset;
            } else {
            }
          } else {
            trackData = {
              track,
              currentTimestamp: 0,
              currentOffset: track.currentFragmentState.baseDataOffset + (dataOffset ?? 0),
              startTimestamp: 0,
              endTimestamp: 0,
              firstKeyFrameTimestamp: null,
              samples: [],
              presentationTimestamps: [],
              startTimestampIsFinal: false,
              encryptionAuxInfo: null
            };
            this.currentFragment.trackData.set(track.id, trackData);
          }
          for (let i = 0; i < sampleCount; i++) {
            let sampleDuration;
            if (sampleDurationPresent) {
              sampleDuration = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleDuration !== null);
              sampleDuration = track.currentFragmentState.defaultSampleDuration;
            }
            let sampleSize;
            if (sampleSizePresent) {
              sampleSize = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleSize !== null);
              sampleSize = track.currentFragmentState.defaultSampleSize;
            }
            let sampleFlags;
            if (sampleFlagsPresent) {
              sampleFlags = readU32Be(slice);
            } else {
              assert(track.currentFragmentState.defaultSampleFlags !== null);
              sampleFlags = track.currentFragmentState.defaultSampleFlags;
            }
            if (i === 0 && firstSampleFlags !== null) {
              sampleFlags = firstSampleFlags;
            }
            let sampleCompositionTimeOffset = 0;
            if (sampleCompositionTimeOffsetsPresent) {
              if (version === 0) {
                sampleCompositionTimeOffset = readU32Be(slice);
              } else {
                sampleCompositionTimeOffset = readI32Be(slice);
              }
            }
            const isKeyFrame = !(sampleFlags & 65536);
            trackData.samples.push({
              presentationTimestamp: trackData.currentTimestamp + sampleCompositionTimeOffset,
              duration: sampleDuration,
              byteOffset: trackData.currentOffset,
              byteSize: sampleSize,
              isKeyFrame,
              encryption: null
            });
            trackData.currentOffset += sampleSize;
            trackData.currentTimestamp += sampleDuration;
          }
          this.currentFragment.implicitBaseDataOffset = trackData.currentOffset;
        }
        ;
        break;
      case "saiz":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          slice.skip(1);
          const flags = readU24Be(slice);
          if (flags & 1) {
            const auxInfoType = readAscii(slice, 4);
            const auxInfoTypeParam = readU32Be(slice);
            if (auxInfoType !== track.encryptionInfo.scheme || auxInfoTypeParam !== 0) {
              break;
            }
          }
          const defaultSampleInfoSize = readU8(slice);
          const sampleCount = readU32Be(slice);
          let sampleSizes = null;
          if (defaultSampleInfoSize === 0 && sampleCount > 0) {
            sampleSizes = readBytes(slice, sampleCount);
          }
          const aux = getOrCreateEncryptionAuxInfo(track);
          aux.defaultSampleInfoSize = defaultSampleInfoSize;
          aux.sampleSizes = sampleSizes;
          aux.sampleCount = sampleCount;
        }
        ;
        break;
      case "saio":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          const version = readU8(slice);
          const flags = readU24Be(slice);
          if (flags & 1) {
            const auxInfoType = readAscii(slice, 4);
            const auxInfoTypeParam = readU32Be(slice);
            if (auxInfoType !== track.encryptionInfo.scheme || auxInfoTypeParam !== 0) {
              break;
            }
          }
          const entryCount = readU32Be(slice);
          if (entryCount === 0) {
            break;
          }
          if (entryCount > 1) {
            Logging._warn("Multiple saio entries are not supported; using the first offset only.");
          }
          let offset = version === 0 ? readU32Be(slice) : Number(readU64Be(slice));
          if (this.currentFragment) {
            offset += this.currentFragment.moofOffset;
          }
          const aux = getOrCreateEncryptionAuxInfo(track);
          aux.offset = offset;
        }
        ;
        break;
      case "senc":
        {
          const track = this.currentTrack;
          if (!track || !track.encryptionInfo) {
            break;
          }
          assert(this.currentFragment);
          const trackData = this.currentFragment.trackData.get(track.id);
          if (!trackData) {
            break;
          }
          slice.skip(1);
          const flags = readU24Be(slice);
          const useSubsamples = Boolean(flags & 2);
          const sampleCount = readU32Be(slice);
          const ivSize = track.encryptionInfo.defaultPerSampleIvSize;
          assert(ivSize !== null);
          for (let i = 0; i < Math.min(sampleCount, trackData.samples.length); i++) {
            const iv = new Uint8Array(16);
            if (ivSize > 0) {
              iv.set(readBytes(slice, ivSize), 0);
            } else {
              iv.set(track.encryptionInfo.defaultConstantIv, 0);
            }
            let subsamples = null;
            if (useSubsamples) {
              const subsampleCount = readU16Be(slice);
              subsamples = [];
              for (let j = 0; j < subsampleCount; j++) {
                const clearLen = readU16Be(slice);
                const protectedLen = readU32Be(slice);
                subsamples.push({ clearLen, protectedLen });
              }
            }
            const sample = trackData.samples[i];
            sample.encryption = { iv, subsamples };
          }
        }
        ;
        break;
      // Metadata section
      // https://exiftool.org/TagNames/QuickTime.html
      // https://mp4workshop.com/about
      case "udta":
        {
          const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
            if (boxInfo2.name !== "meta" && !this.currentTrack) {
              const startPos2 = slice2.filePos;
              this.metadataTags.raw ??= {};
              if (boxInfo2.name[0] === "\xA9") {
                this.metadataTags.raw[boxInfo2.name] ??= readMetadataStringShort(slice2);
              } else {
                this.metadataTags.raw[boxInfo2.name] ??= readBytes(slice2, boxInfo2.contentSize);
              }
              slice2.filePos = startPos2;
            }
            switch (boxInfo2.name) {
              case "meta":
                {
                  slice2.skip(-boxInfo2.headerSize);
                  this.traverseBox(slice2);
                }
                ;
                break;
              case "\xA9nam":
              case "name":
                {
                  if (this.currentTrack) {
                    this.currentTrack.name = textDecoder.decode(readBytes(slice2, boxInfo2.contentSize));
                  } else {
                    this.metadataTags.title ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9des":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.description ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9ART":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.artist ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9alb":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.album ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "albr":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.albumArtist ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9gen":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.genre ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9day":
                {
                  if (!this.currentTrack) {
                    const date = new Date(readMetadataStringShort(slice2));
                    if (!Number.isNaN(date.getTime())) {
                      this.metadataTags.date ??= date;
                    }
                  }
                }
                ;
                break;
              case "\xA9cmt":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.comment ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
              case "\xA9lyr":
                {
                  if (!this.currentTrack) {
                    this.metadataTags.lyrics ??= readMetadataStringShort(slice2);
                  }
                }
                ;
                break;
            }
          }
        }
        ;
        break;
      case "meta":
        {
          if (this.currentTrack) {
            break;
          }
          const word = readU32Be(slice);
          const isQuickTime = word !== 0;
          this.currentMetadataKeys = /* @__PURE__ */ new Map();
          if (isQuickTime) {
            this.readContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          } else {
            this.readContiguousBoxes(slice.slice(contentStartPos + 4, boxInfo.contentSize - 4));
          }
          this.currentMetadataKeys = null;
        }
        ;
        break;
      case "keys":
        {
          if (!this.currentMetadataKeys) {
            break;
          }
          slice.skip(4);
          const entryCount = readU32Be(slice);
          for (let i = 0; i < entryCount; i++) {
            const keySize = readU32Be(slice);
            slice.skip(4);
            const keyName = textDecoder.decode(readBytes(slice, keySize - 8));
            this.currentMetadataKeys.set(i + 1, keyName);
          }
        }
        ;
        break;
      case "ilst":
        {
          if (!this.currentMetadataKeys) {
            break;
          }
          const iterator = this.iterateContiguousBoxes(slice.slice(contentStartPos, boxInfo.contentSize));
          for (const { boxInfo: boxInfo2, slice: slice2 } of iterator) {
            let metadataKey = boxInfo2.name;
            const nameAsNumber = (metadataKey.charCodeAt(0) << 24) + (metadataKey.charCodeAt(1) << 16) + (metadataKey.charCodeAt(2) << 8) + metadataKey.charCodeAt(3);
            if (this.currentMetadataKeys.has(nameAsNumber)) {
              metadataKey = this.currentMetadataKeys.get(nameAsNumber);
            }
            const data = readDataBox(slice2);
            this.metadataTags.raw ??= {};
            this.metadataTags.raw[metadataKey] ??= data;
            switch (metadataKey) {
              case "\xA9nam":
              case "titl":
              case "com.apple.quicktime.title":
              case "title":
                {
                  if (typeof data === "string") {
                    this.metadataTags.title ??= data;
                  }
                }
                ;
                break;
              case "\xA9des":
              case "desc":
              case "dscp":
              case "com.apple.quicktime.description":
              case "description":
                {
                  if (typeof data === "string") {
                    this.metadataTags.description ??= data;
                  }
                }
                ;
                break;
              case "\xA9ART":
              case "com.apple.quicktime.artist":
              case "artist":
                {
                  if (typeof data === "string") {
                    this.metadataTags.artist ??= data;
                  }
                }
                ;
                break;
              case "\xA9alb":
              case "albm":
              case "com.apple.quicktime.album":
              case "album":
                {
                  if (typeof data === "string") {
                    this.metadataTags.album ??= data;
                  }
                }
                ;
                break;
              case "aART":
              case "album_artist":
                {
                  if (typeof data === "string") {
                    this.metadataTags.albumArtist ??= data;
                  }
                }
                ;
                break;
              case "\xA9cmt":
              case "com.apple.quicktime.comment":
              case "comment":
                {
                  if (typeof data === "string") {
                    this.metadataTags.comment ??= data;
                  }
                }
                ;
                break;
              case "\xA9gen":
              case "gnre":
              case "com.apple.quicktime.genre":
              case "genre":
                {
                  if (typeof data === "string") {
                    this.metadataTags.genre ??= data;
                  }
                }
                ;
                break;
              case "\xA9lyr":
              case "lyrics":
                {
                  if (typeof data === "string") {
                    this.metadataTags.lyrics ??= data;
                  }
                }
                ;
                break;
              case "\xA9day":
              case "rldt":
              case "com.apple.quicktime.creationdate":
              case "date":
                {
                  if (typeof data === "string") {
                    const date = new Date(data);
                    if (!Number.isNaN(date.getTime())) {
                      this.metadataTags.date ??= date;
                    }
                  }
                }
                ;
                break;
              case "covr":
              case "com.apple.quicktime.artwork":
                {
                  if (data instanceof RichImageData) {
                    this.metadataTags.images ??= [];
                    this.metadataTags.images.push({
                      data: data.data,
                      kind: "coverFront",
                      mimeType: data.mimeType
                    });
                  } else if (data instanceof Uint8Array) {
                    this.metadataTags.images ??= [];
                    this.metadataTags.images.push({
                      data,
                      kind: "coverFront",
                      mimeType: "image/*"
                    });
                  }
                }
                ;
                break;
              case "track":
                {
                  if (typeof data === "string") {
                    const parts = data.split("/");
                    const trackNum = Number.parseInt(parts[0], 10);
                    const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
                    if (Number.isInteger(trackNum) && trackNum > 0) {
                      this.metadataTags.trackNumber ??= trackNum;
                    }
                    if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
                      this.metadataTags.tracksTotal ??= tracksTotal;
                    }
                  }
                }
                ;
                break;
              case "trkn":
                {
                  if (data instanceof Uint8Array && data.length >= 6) {
                    const view = toDataView(data);
                    const trackNumber = view.getUint16(2, false);
                    const tracksTotal = view.getUint16(4, false);
                    if (trackNumber > 0) {
                      this.metadataTags.trackNumber ??= trackNumber;
                    }
                    if (tracksTotal > 0) {
                      this.metadataTags.tracksTotal ??= tracksTotal;
                    }
                  }
                }
                ;
                break;
              case "disc":
              case "disk":
                {
                  if (data instanceof Uint8Array && data.length >= 6) {
                    const view = toDataView(data);
                    const discNumber = view.getUint16(2, false);
                    const discNumberMax = view.getUint16(4, false);
                    if (discNumber > 0) {
                      this.metadataTags.discNumber ??= discNumber;
                    }
                    if (discNumberMax > 0) {
                      this.metadataTags.discsTotal ??= discNumberMax;
                    }
                  }
                }
                ;
                break;
            }
          }
        }
        ;
        break;
    }
    slice.filePos = boxEndPos;
    return true;
  }
};
var IsobmffTrackBacking = class {
  constructor(internalTrack) {
    this.internalTrack = internalTrack;
    this.packetToSampleIndex = /* @__PURE__ */ new WeakMap();
    this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
  }
  getId() {
    return this.internalTrack.id;
  }
  getNumber() {
    const demuxer = this.internalTrack.demuxer;
    const trackType = this.internalTrack.trackBacking.getType();
    let number = 0;
    for (const track of demuxer.tracks) {
      if (track.trackBacking.getType() === trackType) {
        number++;
      }
      if (track === this.internalTrack) {
        break;
      }
    }
    return number;
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  getInternalCodecId() {
    return this.internalTrack.internalCodecId;
  }
  getName() {
    return this.internalTrack.name;
  }
  getLanguageCode() {
    return this.internalTrack.languageCode;
  }
  getTimeResolution() {
    return this.internalTrack.timescale;
  }
  isRelativeToUnixEpoch() {
    return false;
  }
  getUnixTimeForTimestamp() {
    return null;
  }
  getDisposition() {
    return this.internalTrack.disposition;
  }
  getPairingMask() {
    return 1n;
  }
  getBitrate() {
    return null;
  }
  getAverageBitrate() {
    return null;
  }
  async getDurationFromMetadata() {
    const track = this.internalTrack;
    if (track.durationInMediaTimescale <= 0) {
      return null;
    }
    assert(track.trackBacking);
    const firstPacket = await track.trackBacking.getFirstPacket({ metadataOnly: true });
    return (firstPacket?.timestamp ?? 0) + track.durationInMediaTimescale / track.timescale;
  }
  async getLiveRefreshInterval() {
    return null;
  }
  async getFirstPacket(options) {
    const regularPacket = await this.fetchPacketForSampleIndex(0, options);
    if (regularPacket || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(
      null,
      (fragment) => {
        const trackData = fragment.trackData.get(this.internalTrack.id);
        if (trackData) {
          return {
            sampleIndex: 0,
            correctSampleFound: true
          };
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  mapTimestampIntoTimescale(timestamp) {
    return roundIfAlmostInteger(timestamp * this.internalTrack.timescale) + this.internalTrack.editListOffset;
  }
  async getPacket(timestamp, options) {
    const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
    if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(null, (fragment) => {
      const trackData = fragment.trackData.get(this.internalTrack.id);
      if (!trackData) {
        return { sampleIndex: -1, correctSampleFound: false };
      }
      const index = binarySearchLessOrEqual(trackData.presentationTimestamps, timestampInTimescale, (x) => x.presentationTimestamp);
      const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
      const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
      return { sampleIndex: sampleIndex2, correctSampleFound };
    }, timestampInTimescale, timestampInTimescale, options);
  }
  async getNextPacket(packet, options) {
    const regularSampleIndex = this.packetToSampleIndex.get(packet);
    if (regularSampleIndex !== void 0) {
      return this.fetchPacketForSampleIndex(regularSampleIndex + 1, options);
    }
    const locationInFragment = this.packetToFragmentLocation.get(packet);
    if (locationInFragment === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performFragmentedLookup(
      locationInFragment.fragment,
      (fragment) => {
        if (fragment === locationInFragment.fragment) {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (locationInFragment.sampleIndex + 1 < trackData.samples.length) {
            return {
              sampleIndex: locationInFragment.sampleIndex + 1,
              correctSampleFound: true
            };
          }
        } else {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData) {
            return {
              sampleIndex: 0,
              correctSampleFound: true
            };
          }
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  async getKeyPacket(timestamp, options) {
    const timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleIndex = getKeyframeSampleIndexForTimestamp(sampleTable, timestampInTimescale);
    const regularPacket = await this.fetchPacketForSampleIndex(sampleIndex, options);
    if (!sampleTableIsEmpty(sampleTable) || !this.internalTrack.demuxer.isFragmented) {
      return regularPacket;
    }
    return this.performFragmentedLookup(null, (fragment) => {
      const trackData = fragment.trackData.get(this.internalTrack.id);
      if (!trackData) {
        return { sampleIndex: -1, correctSampleFound: false };
      }
      const index = findLastIndex(trackData.presentationTimestamps, (x) => {
        const sample = trackData.samples[x.sampleIndex];
        return sample.isKeyFrame && x.presentationTimestamp <= timestampInTimescale;
      });
      const sampleIndex2 = index !== -1 ? trackData.presentationTimestamps[index].sampleIndex : -1;
      const correctSampleFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
      return { sampleIndex: sampleIndex2, correctSampleFound };
    }, timestampInTimescale, timestampInTimescale, options);
  }
  async getNextKeyPacket(packet, options) {
    const regularSampleIndex = this.packetToSampleIndex.get(packet);
    if (regularSampleIndex !== void 0) {
      const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
      const nextKeyFrameSampleIndex = getNextKeyframeIndexForSample(sampleTable, regularSampleIndex);
      return this.fetchPacketForSampleIndex(nextKeyFrameSampleIndex, options);
    }
    const locationInFragment = this.packetToFragmentLocation.get(packet);
    if (locationInFragment === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performFragmentedLookup(
      locationInFragment.fragment,
      (fragment) => {
        if (fragment === locationInFragment.fragment) {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          const nextKeyFrameIndex = trackData.samples.findIndex((x, i) => x.isKeyFrame && i > locationInFragment.sampleIndex);
          if (nextKeyFrameIndex !== -1) {
            return {
              sampleIndex: nextKeyFrameIndex,
              correctSampleFound: true
            };
          }
        } else {
          const trackData = fragment.trackData.get(this.internalTrack.id);
          if (trackData && trackData.firstKeyFrameTimestamp !== null) {
            const keyFrameIndex = trackData.samples.findIndex((x) => x.isKeyFrame);
            assert(keyFrameIndex !== -1);
            return {
              sampleIndex: keyFrameIndex,
              correctSampleFound: true
            };
          }
        }
        return {
          sampleIndex: -1,
          correctSampleFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the lookup entries
      Infinity,
      options
    );
  }
  async fetchPacketForSampleIndex(sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
    const sampleInfo = getSampleInfo(sampleTable, sampleIndex);
    if (!sampleInfo) {
      return null;
    }
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.internalTrack.demuxer.reader.requestSlice(sampleInfo.sampleOffset, sampleInfo.sampleSize);
      if (isThenable(slice))
        slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, sampleInfo.sampleSize);
      if (this.internalTrack.encryptionInfo) {
        let sampleEncryption = null;
        if (this.internalTrack.encryptionAuxInfo) {
          const entries = await resolveEncryptionAuxInfo(this.internalTrack.demuxer.reader, this.internalTrack.encryptionInfo, this.internalTrack.encryptionAuxInfo);
          if (sampleIndex < entries.length) {
            sampleEncryption = entries[sampleIndex];
          }
        }
        sampleEncryption ??= getDefaultSampleEncryption(this.internalTrack.encryptionInfo);
        if (sampleEncryption) {
          data = await decryptSample(this.internalTrack, sampleEncryption, data, null);
        }
      }
    }
    const timestamp = (sampleInfo.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
    const duration = sampleInfo.duration / this.internalTrack.timescale;
    const packet = new EncodedPacket(data, sampleInfo.isKeyFrame ? "key" : "delta", timestamp, duration, sampleIndex, sampleInfo.sampleSize);
    this.packetToSampleIndex.set(packet, sampleIndex);
    return packet;
  }
  async fetchPacketInFragment(fragment, sampleIndex, options) {
    if (sampleIndex === -1) {
      return null;
    }
    const trackData = fragment.trackData.get(this.internalTrack.id);
    const fragmentSample = trackData.samples[sampleIndex];
    assert(fragmentSample);
    let data;
    if (options.metadataOnly) {
      data = PLACEHOLDER_DATA;
    } else {
      let slice = this.internalTrack.demuxer.reader.requestSlice(fragmentSample.byteOffset, fragmentSample.byteSize);
      if (isThenable(slice))
        slice = await slice;
      if (!slice) {
        return null;
      }
      data = readBytes(slice, fragmentSample.byteSize);
      if (this.internalTrack.encryptionInfo) {
        const sampleEncryption = fragmentSample.encryption ?? getDefaultSampleEncryption(this.internalTrack.encryptionInfo);
        if (sampleEncryption) {
          data = await decryptSample(this.internalTrack, sampleEncryption, data, fragment);
        }
      }
    }
    const timestamp = (fragmentSample.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale;
    const duration = fragmentSample.duration / this.internalTrack.timescale;
    const packet = new EncodedPacket(data, fragmentSample.isKeyFrame ? "key" : "delta", timestamp, duration, fragment.moofOffset + sampleIndex, fragmentSample.byteSize);
    this.packetToFragmentLocation.set(packet, { fragment, sampleIndex });
    return packet;
  }
  /** Looks for a packet in the fragments while trying to load as few fragments as possible to retrieve it. */
  async performFragmentedLookup(startFragment, getMatchInFragment, searchTimestamp, latestTimestamp, options) {
    const demuxer = this.internalTrack.demuxer;
    let currentFragment = null;
    let bestFragment = null;
    let bestSampleIndex = -1;
    if (startFragment) {
      const { sampleIndex, correctSampleFound } = getMatchInFragment(startFragment);
      if (correctSampleFound) {
        return this.fetchPacketInFragment(startFragment, sampleIndex, options);
      }
      if (sampleIndex !== -1) {
        bestFragment = startFragment;
        bestSampleIndex = sampleIndex;
      }
    }
    const lookupEntryIndex = binarySearchLessOrEqual(this.internalTrack.fragmentLookupTable, searchTimestamp, (x) => x.timestamp);
    const lookupEntry = lookupEntryIndex !== -1 ? this.internalTrack.fragmentLookupTable[lookupEntryIndex] : null;
    const positionCacheIndex = binarySearchLessOrEqual(this.internalTrack.fragmentPositionCache, searchTimestamp, (x) => x.startTimestamp);
    const positionCacheEntry = positionCacheIndex !== -1 ? this.internalTrack.fragmentPositionCache[positionCacheIndex] : null;
    const lookupEntryPosition = Math.max(lookupEntry?.moofOffset ?? 0, positionCacheEntry?.moofOffset ?? 0) || null;
    let currentPos;
    if (!startFragment) {
      currentPos = lookupEntryPosition ?? 0;
    } else {
      if (lookupEntryPosition === null || startFragment.moofOffset >= lookupEntryPosition) {
        currentPos = startFragment.moofOffset + startFragment.moofSize;
        currentFragment = startFragment;
      } else {
        currentPos = lookupEntryPosition;
      }
    }
    while (true) {
      if (currentFragment) {
        const trackData = currentFragment.trackData.get(this.internalTrack.id);
        if (trackData && trackData.startTimestamp > latestTimestamp) {
          break;
        }
      }
      let slice = demuxer.reader.requestSliceRange(currentPos, MIN_BOX_HEADER_SIZE, MAX_BOX_HEADER_SIZE);
      if (isThenable(slice))
        slice = await slice;
      if (!slice)
        break;
      const boxStartPos = currentPos;
      const boxInfo = readBoxHeader(slice);
      if (!boxInfo) {
        break;
      }
      if (boxInfo.name === "moof") {
        currentFragment = await demuxer.readFragment(boxStartPos);
        const { sampleIndex, correctSampleFound } = getMatchInFragment(currentFragment);
        if (correctSampleFound) {
          return this.fetchPacketInFragment(currentFragment, sampleIndex, options);
        }
        if (sampleIndex !== -1) {
          bestFragment = currentFragment;
          bestSampleIndex = sampleIndex;
        }
      }
      currentPos = boxStartPos + boxInfo.totalSize;
    }
    if (lookupEntry && (!bestFragment || bestFragment.moofOffset < lookupEntry.moofOffset)) {
      const previousLookupEntry = this.internalTrack.fragmentLookupTable[lookupEntryIndex - 1];
      assert(!previousLookupEntry || previousLookupEntry.timestamp < lookupEntry.timestamp);
      const newSearchTimestamp = previousLookupEntry?.timestamp ?? -Infinity;
      return this.performFragmentedLookup(null, getMatchInFragment, newSearchTimestamp, latestTimestamp, options);
    }
    if (bestFragment) {
      return this.fetchPacketInFragment(bestFragment, bestSampleIndex, options);
    }
    return null;
  }
};
var IsobmffVideoTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getType() {
    return "video";
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodedWidth() {
    return this.internalTrack.info.width;
  }
  getCodedHeight() {
    return this.internalTrack.info.height;
  }
  getSquarePixelWidth() {
    return this.internalTrack.info.squarePixelWidth;
  }
  getSquarePixelHeight() {
    return this.internalTrack.info.squarePixelHeight;
  }
  getRotation() {
    return this.internalTrack.rotation;
  }
  async getColorSpace() {
    return {
      primaries: this.internalTrack.info.colorSpace?.primaries,
      transfer: this.internalTrack.info.colorSpace?.transfer,
      matrix: this.internalTrack.info.colorSpace?.matrix,
      fullRange: this.internalTrack.info.colorSpace?.fullRange
    };
  }
  async canBeTransparent() {
    return this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      if (this.internalTrack.info.codec === "avc" && !this.internalTrack.info.codecDescription) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.avcCodecInfo = firstPacket && extractAvcDecoderConfigurationRecord(firstPacket.data);
      } else if (this.internalTrack.info.codec === "hevc" && !this.internalTrack.info.codecDescription) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.hevcCodecInfo = firstPacket && extractHevcDecoderConfigurationRecord(firstPacket.data);
      } else if (this.internalTrack.info.codec === "vp9" && !this.internalTrack.info.vp9CodecInfo) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.vp9CodecInfo = firstPacket && extractVp9CodecInfoFromPacket(firstPacket.data);
      } else if (this.internalTrack.info.codec === "av1" && !this.internalTrack.info.av1CodecInfo) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.av1CodecInfo = firstPacket && extractAv1CodecInfoFromPacket(firstPacket.data);
      }
      const config = {
        codec: extractVideoCodecString(this.internalTrack.info),
        codedWidth: this.internalTrack.info.width,
        codedHeight: this.internalTrack.info.height,
        description: this.internalTrack.info.codecDescription ?? void 0,
        colorSpace: this.internalTrack.info.colorSpace ?? void 0
      };
      if (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) {
        config.displayAspectWidth = this.internalTrack.info.squarePixelWidth;
        config.displayAspectHeight = this.internalTrack.info.squarePixelHeight;
      }
      return config;
    })();
  }
};
var IsobmffAudioTrackBacking = class extends IsobmffTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getType() {
    return "audio";
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getNumberOfChannels() {
    return this.internalTrack.info.numberOfChannels;
  }
  getSampleRate() {
    return this.internalTrack.info.sampleRate;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      if (this.internalTrack.info.codec === "dts" && !this.internalTrack.info.dtsFormat) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.dtsFormat = firstPacket && extractDtsFourCcFromPacket(firstPacket.data);
      }
      return {
        codec: extractAudioCodecString(this.internalTrack.info),
        numberOfChannels: this.internalTrack.info.numberOfChannels,
        sampleRate: this.internalTrack.info.sampleRate,
        description: this.internalTrack.info.codecDescription ?? void 0
      };
    })();
  }
};
var getSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
  if (sampleTable.presentationTimestamps) {
    const index = binarySearchLessOrEqual(sampleTable.presentationTimestamps, timescaleUnits, (x) => x.presentationTimestamp);
    if (index === -1) {
      return -1;
    }
    return sampleTable.presentationTimestamps[index].sampleIndex;
  } else {
    const index = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, timescaleUnits, (x) => x.startDecodeTimestamp);
    if (index === -1) {
      return -1;
    }
    const entry = sampleTable.sampleTimingEntries[index];
    return entry.startIndex + Math.min(Math.floor((timescaleUnits - entry.startDecodeTimestamp) / entry.delta), entry.count - 1);
  }
};
var getKeyframeSampleIndexForTimestamp = (sampleTable, timescaleUnits) => {
  if (!sampleTable.keySampleIndices) {
    return getSampleIndexForTimestamp(sampleTable, timescaleUnits);
  }
  if (sampleTable.presentationTimestamps) {
    const index = binarySearchLessOrEqual(sampleTable.presentationTimestamps, timescaleUnits, (x) => x.presentationTimestamp);
    if (index === -1) {
      return -1;
    }
    for (let i = index; i >= 0; i--) {
      const sampleIndex = sampleTable.presentationTimestamps[i].sampleIndex;
      const isKeyFrame = binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1;
      if (isKeyFrame) {
        return sampleIndex;
      }
    }
    return -1;
  } else {
    const sampleIndex = getSampleIndexForTimestamp(sampleTable, timescaleUnits);
    const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
    return sampleTable.keySampleIndices[index] ?? -1;
  }
};
var getSampleInfo = (sampleTable, sampleIndex) => {
  const timingEntryIndex = binarySearchLessOrEqual(sampleTable.sampleTimingEntries, sampleIndex, (x) => x.startIndex);
  const timingEntry = sampleTable.sampleTimingEntries[timingEntryIndex];
  if (!timingEntry || timingEntry.startIndex + timingEntry.count <= sampleIndex) {
    return null;
  }
  const decodeTimestamp = timingEntry.startDecodeTimestamp + (sampleIndex - timingEntry.startIndex) * timingEntry.delta;
  let presentationTimestamp = decodeTimestamp;
  const offsetEntryIndex = binarySearchLessOrEqual(sampleTable.sampleCompositionTimeOffsets, sampleIndex, (x) => x.startIndex);
  const offsetEntry = sampleTable.sampleCompositionTimeOffsets[offsetEntryIndex];
  if (offsetEntry && sampleIndex - offsetEntry.startIndex < offsetEntry.count) {
    presentationTimestamp += offsetEntry.offset;
  }
  const sampleSize = sampleTable.sampleSizes[Math.min(sampleIndex, sampleTable.sampleSizes.length - 1)];
  const chunkEntryIndex = binarySearchLessOrEqual(sampleTable.sampleToChunk, sampleIndex, (x) => x.startSampleIndex);
  const chunkEntry = sampleTable.sampleToChunk[chunkEntryIndex];
  assert(chunkEntry);
  const chunkIndex = chunkEntry.startChunkIndex + Math.floor((sampleIndex - chunkEntry.startSampleIndex) / chunkEntry.samplesPerChunk);
  const chunkOffset = sampleTable.chunkOffsets[chunkIndex];
  const startSampleIndexOfChunk = chunkEntry.startSampleIndex + (chunkIndex - chunkEntry.startChunkIndex) * chunkEntry.samplesPerChunk;
  let chunkSize = 0;
  let sampleOffset = chunkOffset;
  if (sampleTable.sampleSizes.length === 1) {
    sampleOffset += sampleSize * (sampleIndex - startSampleIndexOfChunk);
    chunkSize += sampleSize * chunkEntry.samplesPerChunk;
  } else {
    for (let i = startSampleIndexOfChunk; i < startSampleIndexOfChunk + chunkEntry.samplesPerChunk; i++) {
      const sampleSize2 = sampleTable.sampleSizes[i];
      if (i < sampleIndex) {
        sampleOffset += sampleSize2;
      }
      chunkSize += sampleSize2;
    }
  }
  let duration = timingEntry.delta;
  if (sampleTable.presentationTimestamps) {
    const presentationIndex = sampleTable.presentationTimestampIndexMap[sampleIndex];
    assert(presentationIndex !== void 0);
    if (presentationIndex < sampleTable.presentationTimestamps.length - 1) {
      const nextEntry = sampleTable.presentationTimestamps[presentationIndex + 1];
      const nextPresentationTimestamp = nextEntry.presentationTimestamp;
      duration = nextPresentationTimestamp - presentationTimestamp;
    }
  }
  return {
    presentationTimestamp,
    duration,
    sampleOffset,
    sampleSize,
    chunkOffset,
    chunkSize,
    isKeyFrame: sampleTable.keySampleIndices ? binarySearchExact(sampleTable.keySampleIndices, sampleIndex, (x) => x) !== -1 : true
  };
};
var getNextKeyframeIndexForSample = (sampleTable, sampleIndex) => {
  if (!sampleTable.keySampleIndices) {
    return sampleIndex + 1;
  }
  const index = binarySearchLessOrEqual(sampleTable.keySampleIndices, sampleIndex, (x) => x);
  return sampleTable.keySampleIndices[index + 1] ?? -1;
};
var offsetFragmentTrackDataByTimestamp = (trackData, timestamp) => {
  trackData.startTimestamp += timestamp;
  trackData.endTimestamp += timestamp;
  for (const sample of trackData.samples) {
    sample.presentationTimestamp += timestamp;
  }
  for (const entry of trackData.presentationTimestamps) {
    entry.presentationTimestamp += timestamp;
  }
};
var extractRotationFromMatrix = (matrix) => {
  const [a, b] = matrix;
  const radians = Math.atan2(b, a);
  if (!Number.isFinite(radians)) {
    return 0;
  }
  return radians * (180 / Math.PI);
};
var sampleTableIsEmpty = (sampleTable) => {
  return sampleTable.sampleSizes.length === 0;
};
var getOrCreateEncryptionAuxInfo = (track) => {
  if (track.currentFragmentState) {
    return track.currentFragmentState.encryptionAuxInfo ??= {
      defaultSampleInfoSize: 0,
      sampleSizes: null,
      sampleCount: 0,
      offset: null,
      resolved: null
    };
  } else {
    return track.encryptionAuxInfo ??= {
      defaultSampleInfoSize: 0,
      sampleSizes: null,
      sampleCount: 0,
      offset: null,
      resolved: null
    };
  }
};
var resolveEncryptionAuxInfo = async (reader, encryptionInfo, aux) => {
  if (aux.resolved) {
    return aux.resolved;
  }
  if (aux.offset === null || aux.sampleCount === 0) {
    throw new Error("Incomplete saiz/saio info; cannot resolve encryption data.");
  }
  let totalSize = 0;
  if (aux.defaultSampleInfoSize > 0) {
    totalSize = aux.defaultSampleInfoSize * aux.sampleCount;
  } else {
    assert(aux.sampleSizes);
    for (let i = 0; i < aux.sampleCount; i++) {
      totalSize += aux.sampleSizes[i];
    }
  }
  let slice = reader.requestSlice(aux.offset, totalSize);
  if (isThenable(slice))
    slice = await slice;
  if (!slice) {
    throw new Error("Failed to read auxiliary encryption info.");
  }
  const ivSize = encryptionInfo.defaultPerSampleIvSize;
  assert(ivSize !== null);
  const entries = [];
  for (let i = 0; i < aux.sampleCount; i++) {
    const entrySize = aux.defaultSampleInfoSize > 0 ? aux.defaultSampleInfoSize : aux.sampleSizes[i];
    const iv = new Uint8Array(16);
    if (ivSize > 0) {
      iv.set(readBytes(slice, ivSize), 0);
    } else {
      iv.set(encryptionInfo.defaultConstantIv, 0);
    }
    let subsamples = null;
    if (entrySize > ivSize) {
      const subsampleCount = readU16Be(slice);
      subsamples = [];
      for (let j = 0; j < subsampleCount; j++) {
        const clearLen = readU16Be(slice);
        const protectedLen = readU32Be(slice);
        subsamples.push({ clearLen, protectedLen });
      }
    }
    entries.push({ iv, subsamples });
  }
  aux.resolved = entries;
  return entries;
};
var getDefaultSampleEncryption = (encryptionInfo) => {
  if (!encryptionInfo.defaultConstantIv) {
    return null;
  }
  return {
    iv: encryptionInfo.defaultConstantIv,
    subsamples: null
  };
};
var decryptSample = async (track, sampleEncryption, data, fragment) => {
  assert(track.encryptionInfo);
  const encryptionInfo = track.encryptionInfo;
  assert(encryptionInfo.defaultKid !== null);
  const keyId = encryptionInfo.defaultKid;
  let keyBytes;
  const cacheEntry = track.demuxer.decryptionKeyCache.get(keyId);
  if (cacheEntry) {
    keyBytes = await cacheEntry;
  } else {
    if (!track.demuxer.input._formatOptions.isobmff?.resolveKeyId) {
      throw new Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");
    }
    const promise = (async () => {
      let psshBoxes = track.demuxer.psshBoxes;
      if (fragment) {
        psshBoxes = [
          ...psshBoxes,
          ...fragment.psshBoxes
        ].filter((x) => x.keyIds === null || x.keyIds.includes(keyId));
        for (let i = 0; i < psshBoxes.length - 1; i++) {
          for (let j = i + 1; j < psshBoxes.length; j++) {
            if (psshBoxesAreEqual(psshBoxes[i], psshBoxes[j])) {
              psshBoxes.splice(j, 1);
              j--;
            }
          }
        }
      }
      const keyResult = await track.demuxer.input._formatOptions.isobmff.resolveKeyId({ keyId, psshBoxes });
      if (!(typeof keyResult === "string" && keyResult.length === 32 && HEX_STRING_REGEX.test(keyResult) || keyResult instanceof Uint8Array && keyResult.byteLength === 16)) {
        throw new TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");
      }
      return keyResult instanceof Uint8Array ? keyResult : hexStringToBytes(keyResult);
    })();
    track.demuxer.decryptionKeyCache.set(keyId, promise);
    keyBytes = await promise;
  }
  if (encryptionInfo.scheme === "cenc" || encryptionInfo.scheme === "cens") {
    return decryptCtr(keyBytes, encryptionInfo, sampleEncryption, data);
  } else {
    return decryptCbcs(keyBytes, encryptionInfo, sampleEncryption, data);
  }
};
var decryptCtr = async (key, encryptionInfo, sampleEncryption, data) => {
  const counter = new Uint8Array(16);
  counter.set(sampleEncryption.iv, 0);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-CTR" }, false, ["decrypt"]);
  const cryptApply = async (input) => {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-CTR", counter, length: 64 }, cryptoKey, input);
    return new Uint8Array(plaintext);
  };
  if (!sampleEncryption.subsamples) {
    return cryptApply(data);
  }
  assert(encryptionInfo.defaultCryptByteBlock !== null && encryptionInfo.defaultSkipByteBlock !== null);
  const cryptRanges = collectCryptRanges(sampleEncryption.subsamples, encryptionInfo.defaultCryptByteBlock, encryptionInfo.defaultSkipByteBlock);
  let totalCryptLen = 0;
  for (const range of cryptRanges) {
    for (const seg of range.perSubsample) {
      totalCryptLen += seg.length;
    }
  }
  const cryptBuffer = new Uint8Array(totalCryptLen);
  let writePos = 0;
  for (const range of cryptRanges) {
    for (const seg of range.perSubsample) {
      cryptBuffer.set(data.subarray(seg.offset, seg.offset + seg.length), writePos);
      writePos += seg.length;
    }
  }
  const plain = await cryptApply(cryptBuffer);
  const output = new Uint8Array(data);
  let readPos = 0;
  for (const range of cryptRanges) {
    for (const seg of range.perSubsample) {
      output.set(plain.subarray(readPos, readPos + seg.length), seg.offset);
      readPos += seg.length;
    }
  }
  return output;
};
var decryptCbcs = (key, encryptionInfo, sampleEncryption, data) => {
  const ctx = new Aes128CbcContext();
  ctx.init({ key, iv: sampleEncryption.iv });
  const cryptByteBlock = encryptionInfo.defaultCryptByteBlock;
  const skipByteBlock = encryptionInfo.defaultSkipByteBlock;
  assert(cryptByteBlock !== null && skipByteBlock !== null);
  if (!sampleEncryption.subsamples) {
    const output2 = new Uint8Array(data);
    const numBlocks = Math.floor(data.length / 16);
    for (let b = 0; b < numBlocks; b++) {
      const off = b * 16;
      ctx.in.set(data.subarray(off, off + 16));
      ctx.decrypt();
      output2.set(ctx.out, off);
    }
    return output2;
  }
  if (cryptByteBlock === 0 && skipByteBlock === 0) {
    throw new Error("cbcs with subsamples requires pattern encryption.");
  }
  const output = new Uint8Array(data);
  const cryptRanges = collectCryptRanges(sampleEncryption.subsamples, cryptByteBlock, skipByteBlock);
  const ivView = new DataView(sampleEncryption.iv.buffer, sampleEncryption.iv.byteOffset, 16);
  for (const range of cryptRanges) {
    ctx.iv[0] = ivView.getUint32(0, false);
    ctx.iv[1] = ivView.getUint32(4, false);
    ctx.iv[2] = ivView.getUint32(8, false);
    ctx.iv[3] = ivView.getUint32(12, false);
    for (const seg of range.perSubsample) {
      const numBlocks = seg.length / 16;
      for (let b = 0; b < numBlocks; b++) {
        const offset = seg.offset + b * 16;
        ctx.in.set(data.subarray(offset, offset + 16));
        ctx.decrypt();
        output.set(ctx.out, offset);
      }
    }
  }
  return output;
};
var collectCryptRanges = (subsamples, cryptByteBlock, skipByteBlock) => {
  const ranges = [];
  const hasPattern = cryptByteBlock !== 0 || skipByteBlock !== 0;
  let cursor = 0;
  for (const subsample of subsamples) {
    cursor += subsample.clearLen;
    const perSubsample = [];
    if (!hasPattern) {
      if (subsample.protectedLen > 0) {
        perSubsample.push({ offset: cursor, length: subsample.protectedLen });
      }
      cursor += subsample.protectedLen;
    } else {
      let remaining = subsample.protectedLen;
      let pos = cursor;
      while (remaining > 0) {
        if (remaining < 16 * cryptByteBlock) {
          break;
        }
        const cryptBytes = 16 * cryptByteBlock;
        perSubsample.push({ offset: pos, length: cryptBytes });
        pos += cryptBytes;
        remaining -= cryptBytes;
        const skipBytes = Math.min(16 * skipByteBlock, remaining);
        pos += skipBytes;
        remaining -= skipBytes;
      }
      cursor += subsample.protectedLen;
    }
    ranges.push({ perSubsample });
  }
  return ranges;
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/matroska/ebml.js
var EBMLId;
(function(EBMLId2) {
  EBMLId2[EBMLId2["EBML"] = 440786851] = "EBML";
  EBMLId2[EBMLId2["EBMLVersion"] = 17030] = "EBMLVersion";
  EBMLId2[EBMLId2["EBMLReadVersion"] = 17143] = "EBMLReadVersion";
  EBMLId2[EBMLId2["EBMLMaxIDLength"] = 17138] = "EBMLMaxIDLength";
  EBMLId2[EBMLId2["EBMLMaxSizeLength"] = 17139] = "EBMLMaxSizeLength";
  EBMLId2[EBMLId2["DocType"] = 17026] = "DocType";
  EBMLId2[EBMLId2["DocTypeVersion"] = 17031] = "DocTypeVersion";
  EBMLId2[EBMLId2["DocTypeReadVersion"] = 17029] = "DocTypeReadVersion";
  EBMLId2[EBMLId2["Void"] = 236] = "Void";
  EBMLId2[EBMLId2["Segment"] = 408125543] = "Segment";
  EBMLId2[EBMLId2["SeekHead"] = 290298740] = "SeekHead";
  EBMLId2[EBMLId2["Seek"] = 19899] = "Seek";
  EBMLId2[EBMLId2["SeekID"] = 21419] = "SeekID";
  EBMLId2[EBMLId2["SeekPosition"] = 21420] = "SeekPosition";
  EBMLId2[EBMLId2["Duration"] = 17545] = "Duration";
  EBMLId2[EBMLId2["Info"] = 357149030] = "Info";
  EBMLId2[EBMLId2["TimestampScale"] = 2807729] = "TimestampScale";
  EBMLId2[EBMLId2["MuxingApp"] = 19840] = "MuxingApp";
  EBMLId2[EBMLId2["WritingApp"] = 22337] = "WritingApp";
  EBMLId2[EBMLId2["Tracks"] = 374648427] = "Tracks";
  EBMLId2[EBMLId2["TrackEntry"] = 174] = "TrackEntry";
  EBMLId2[EBMLId2["TrackNumber"] = 215] = "TrackNumber";
  EBMLId2[EBMLId2["TrackUID"] = 29637] = "TrackUID";
  EBMLId2[EBMLId2["TrackType"] = 131] = "TrackType";
  EBMLId2[EBMLId2["FlagEnabled"] = 185] = "FlagEnabled";
  EBMLId2[EBMLId2["FlagDefault"] = 136] = "FlagDefault";
  EBMLId2[EBMLId2["FlagForced"] = 21930] = "FlagForced";
  EBMLId2[EBMLId2["FlagOriginal"] = 21934] = "FlagOriginal";
  EBMLId2[EBMLId2["FlagHearingImpaired"] = 21931] = "FlagHearingImpaired";
  EBMLId2[EBMLId2["FlagVisualImpaired"] = 21932] = "FlagVisualImpaired";
  EBMLId2[EBMLId2["FlagCommentary"] = 21935] = "FlagCommentary";
  EBMLId2[EBMLId2["FlagLacing"] = 156] = "FlagLacing";
  EBMLId2[EBMLId2["Name"] = 21358] = "Name";
  EBMLId2[EBMLId2["Language"] = 2274716] = "Language";
  EBMLId2[EBMLId2["LanguageBCP47"] = 2274717] = "LanguageBCP47";
  EBMLId2[EBMLId2["CodecID"] = 134] = "CodecID";
  EBMLId2[EBMLId2["CodecPrivate"] = 25506] = "CodecPrivate";
  EBMLId2[EBMLId2["CodecDelay"] = 22186] = "CodecDelay";
  EBMLId2[EBMLId2["SeekPreRoll"] = 22203] = "SeekPreRoll";
  EBMLId2[EBMLId2["DefaultDuration"] = 2352003] = "DefaultDuration";
  EBMLId2[EBMLId2["Video"] = 224] = "Video";
  EBMLId2[EBMLId2["PixelWidth"] = 176] = "PixelWidth";
  EBMLId2[EBMLId2["PixelHeight"] = 186] = "PixelHeight";
  EBMLId2[EBMLId2["DisplayWidth"] = 21680] = "DisplayWidth";
  EBMLId2[EBMLId2["DisplayHeight"] = 21690] = "DisplayHeight";
  EBMLId2[EBMLId2["DisplayUnit"] = 21682] = "DisplayUnit";
  EBMLId2[EBMLId2["AlphaMode"] = 21440] = "AlphaMode";
  EBMLId2[EBMLId2["Audio"] = 225] = "Audio";
  EBMLId2[EBMLId2["SamplingFrequency"] = 181] = "SamplingFrequency";
  EBMLId2[EBMLId2["Channels"] = 159] = "Channels";
  EBMLId2[EBMLId2["BitDepth"] = 25188] = "BitDepth";
  EBMLId2[EBMLId2["SimpleBlock"] = 163] = "SimpleBlock";
  EBMLId2[EBMLId2["BlockGroup"] = 160] = "BlockGroup";
  EBMLId2[EBMLId2["Block"] = 161] = "Block";
  EBMLId2[EBMLId2["BlockAdditions"] = 30113] = "BlockAdditions";
  EBMLId2[EBMLId2["BlockMore"] = 166] = "BlockMore";
  EBMLId2[EBMLId2["BlockAdditional"] = 165] = "BlockAdditional";
  EBMLId2[EBMLId2["BlockAddID"] = 238] = "BlockAddID";
  EBMLId2[EBMLId2["BlockDuration"] = 155] = "BlockDuration";
  EBMLId2[EBMLId2["ReferenceBlock"] = 251] = "ReferenceBlock";
  EBMLId2[EBMLId2["Cluster"] = 524531317] = "Cluster";
  EBMLId2[EBMLId2["Timestamp"] = 231] = "Timestamp";
  EBMLId2[EBMLId2["Cues"] = 475249515] = "Cues";
  EBMLId2[EBMLId2["CuePoint"] = 187] = "CuePoint";
  EBMLId2[EBMLId2["CueTime"] = 179] = "CueTime";
  EBMLId2[EBMLId2["CueTrackPositions"] = 183] = "CueTrackPositions";
  EBMLId2[EBMLId2["CueTrack"] = 247] = "CueTrack";
  EBMLId2[EBMLId2["CueClusterPosition"] = 241] = "CueClusterPosition";
  EBMLId2[EBMLId2["Colour"] = 21936] = "Colour";
  EBMLId2[EBMLId2["MatrixCoefficients"] = 21937] = "MatrixCoefficients";
  EBMLId2[EBMLId2["TransferCharacteristics"] = 21946] = "TransferCharacteristics";
  EBMLId2[EBMLId2["Primaries"] = 21947] = "Primaries";
  EBMLId2[EBMLId2["Range"] = 21945] = "Range";
  EBMLId2[EBMLId2["Projection"] = 30320] = "Projection";
  EBMLId2[EBMLId2["ProjectionType"] = 30321] = "ProjectionType";
  EBMLId2[EBMLId2["ProjectionPoseRoll"] = 30325] = "ProjectionPoseRoll";
  EBMLId2[EBMLId2["Attachments"] = 423732329] = "Attachments";
  EBMLId2[EBMLId2["AttachedFile"] = 24999] = "AttachedFile";
  EBMLId2[EBMLId2["FileDescription"] = 18046] = "FileDescription";
  EBMLId2[EBMLId2["FileName"] = 18030] = "FileName";
  EBMLId2[EBMLId2["FileMediaType"] = 18016] = "FileMediaType";
  EBMLId2[EBMLId2["FileData"] = 18012] = "FileData";
  EBMLId2[EBMLId2["FileUID"] = 18094] = "FileUID";
  EBMLId2[EBMLId2["Chapters"] = 272869232] = "Chapters";
  EBMLId2[EBMLId2["Tags"] = 307544935] = "Tags";
  EBMLId2[EBMLId2["Tag"] = 29555] = "Tag";
  EBMLId2[EBMLId2["Targets"] = 25536] = "Targets";
  EBMLId2[EBMLId2["TargetTypeValue"] = 26826] = "TargetTypeValue";
  EBMLId2[EBMLId2["TargetType"] = 25546] = "TargetType";
  EBMLId2[EBMLId2["TagTrackUID"] = 25541] = "TagTrackUID";
  EBMLId2[EBMLId2["TagEditionUID"] = 25545] = "TagEditionUID";
  EBMLId2[EBMLId2["TagChapterUID"] = 25540] = "TagChapterUID";
  EBMLId2[EBMLId2["TagAttachmentUID"] = 25542] = "TagAttachmentUID";
  EBMLId2[EBMLId2["SimpleTag"] = 26568] = "SimpleTag";
  EBMLId2[EBMLId2["TagName"] = 17827] = "TagName";
  EBMLId2[EBMLId2["TagLanguage"] = 17530] = "TagLanguage";
  EBMLId2[EBMLId2["TagString"] = 17543] = "TagString";
  EBMLId2[EBMLId2["TagBinary"] = 17541] = "TagBinary";
  EBMLId2[EBMLId2["ContentEncodings"] = 28032] = "ContentEncodings";
  EBMLId2[EBMLId2["ContentEncoding"] = 25152] = "ContentEncoding";
  EBMLId2[EBMLId2["ContentEncodingOrder"] = 20529] = "ContentEncodingOrder";
  EBMLId2[EBMLId2["ContentEncodingScope"] = 20530] = "ContentEncodingScope";
  EBMLId2[EBMLId2["ContentCompression"] = 20532] = "ContentCompression";
  EBMLId2[EBMLId2["ContentCompAlgo"] = 16980] = "ContentCompAlgo";
  EBMLId2[EBMLId2["ContentCompSettings"] = 16981] = "ContentCompSettings";
  EBMLId2[EBMLId2["ContentEncryption"] = 20533] = "ContentEncryption";
})(EBMLId || (EBMLId = {}));
var LEVEL_0_EBML_IDS = [
  EBMLId.EBML,
  EBMLId.Segment
];
var LEVEL_1_EBML_IDS = [
  EBMLId.SeekHead,
  EBMLId.Info,
  EBMLId.Cluster,
  EBMLId.Tracks,
  EBMLId.Cues,
  EBMLId.Attachments,
  EBMLId.Chapters,
  EBMLId.Tags
];
var LEVEL_0_AND_1_EBML_IDS = [
  ...LEVEL_0_EBML_IDS,
  ...LEVEL_1_EBML_IDS
];
var MAX_VAR_INT_SIZE = 8;
var MIN_HEADER_SIZE = 2;
var MAX_HEADER_SIZE = 2 * MAX_VAR_INT_SIZE;
var readVarIntSize = (slice) => {
  if (slice.remainingLength < 1) {
    return null;
  }
  const firstByte = readU8(slice);
  slice.skip(-1);
  if (firstByte === 0) {
    return null;
  }
  let width = 1;
  let mask = 128;
  while ((firstByte & mask) === 0) {
    width++;
    mask >>= 1;
  }
  if (slice.remainingLength < width) {
    return null;
  }
  return width;
};
var readVarInt = (slice) => {
  if (slice.remainingLength < 1) {
    return null;
  }
  const firstByte = readU8(slice);
  if (firstByte === 0) {
    return null;
  }
  let width = 1;
  let mask = 1 << 7;
  while ((firstByte & mask) === 0) {
    width++;
    mask >>= 1;
  }
  if (slice.remainingLength < width - 1) {
    return null;
  }
  let value = firstByte & mask - 1;
  for (let i = 1; i < width; i++) {
    value *= 1 << 8;
    value += readU8(slice);
  }
  return value;
};
var readUnsignedInt = (slice, width) => {
  if (width < 1 || width > 8) {
    throw new Error("Bad unsigned int size " + width);
  }
  let value = 0;
  for (let i = 0; i < width; i++) {
    value *= 1 << 8;
    value += readU8(slice);
  }
  return value;
};
var readUnsignedBigInt = (slice, width) => {
  if (width < 1) {
    throw new Error("Bad unsigned int size " + width);
  }
  let value = 0n;
  for (let i = 0; i < width; i++) {
    value <<= 8n;
    value += BigInt(readU8(slice));
  }
  return value;
};
var readElementId = (slice) => {
  const size = readVarIntSize(slice);
  if (size === null) {
    return null;
  }
  if (slice.remainingLength < size) {
    return null;
  }
  const id = readUnsignedInt(slice, size);
  return id;
};
var readElementSize = (slice) => {
  if (slice.remainingLength < 1) {
    return null;
  }
  const firstByte = readU8(slice);
  if (firstByte === 255) {
    return void 0;
  }
  slice.skip(-1);
  const size = readVarInt(slice);
  if (size === null) {
    return null;
  }
  if (size === 72057594037927940) {
    return void 0;
  }
  return size;
};
var readElementHeader = (slice) => {
  assert(slice.remainingLength >= MIN_HEADER_SIZE);
  const id = readElementId(slice);
  if (id === null) {
    return null;
  }
  const size = readElementSize(slice);
  if (size === null) {
    return null;
  }
  return { id, size };
};
var readAsciiString = (slice, length) => {
  const bytes = readBytes(slice, length);
  let strLength = 0;
  while (strLength < length && bytes[strLength] !== 0) {
    strLength += 1;
  }
  return String.fromCharCode(...bytes.subarray(0, strLength));
};
var readUnicodeString = (slice, length) => {
  const bytes = readBytes(slice, length);
  let strLength = 0;
  while (strLength < length && bytes[strLength] !== 0) {
    strLength += 1;
  }
  return textDecoder.decode(bytes.subarray(0, strLength));
};
var readFloat = (slice, width) => {
  if (width === 0) {
    return 0;
  }
  if (width !== 4 && width !== 8) {
    throw new Error("Bad float size " + width);
  }
  return width === 4 ? readF32Be(slice) : readF64Be(slice);
};
var searchForNextElementId = async (reader, startPos, ids, until) => {
  const idsSet = new Set(ids);
  let currentPos = startPos;
  while (until === null || currentPos < until) {
    let slice = reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
    if (isThenable(slice))
      slice = await slice;
    if (!slice)
      break;
    const elementHeader = readElementHeader(slice);
    if (!elementHeader) {
      break;
    }
    if (idsSet.has(elementHeader.id)) {
      return { pos: currentPos, found: true };
    }
    assertDefinedSize(elementHeader.size);
    currentPos = slice.filePos + elementHeader.size;
  }
  return { pos: until !== null && until > currentPos ? until : currentPos, found: false };
};
var resync = async (reader, startPos, ids, until) => {
  const CHUNK_SIZE = 2 ** 16;
  const idsSet = new Set(ids);
  let currentPos = startPos;
  while (currentPos < until) {
    let slice = reader.requestSliceRange(currentPos, 0, Math.min(CHUNK_SIZE, until - currentPos));
    if (isThenable(slice))
      slice = await slice;
    if (!slice)
      break;
    if (slice.length < MAX_VAR_INT_SIZE)
      break;
    for (let i = 0; i < slice.length - MAX_VAR_INT_SIZE; i++) {
      slice.filePos = currentPos;
      const elementId = readElementId(slice);
      if (elementId !== null && idsSet.has(elementId)) {
        return currentPos;
      }
      currentPos++;
    }
  }
  return null;
};
var CODEC_STRING_MAP = {
  "avc": "V_MPEG4/ISO/AVC",
  "hevc": "V_MPEGH/ISO/HEVC",
  "vp8": "V_VP8",
  "vp9": "V_VP9",
  "av1": "V_AV1",
  "prores": "V_PRORES",
  "aac": "A_AAC",
  "mp3": "A_MPEG/L3",
  "opus": "A_OPUS",
  "vorbis": "A_VORBIS",
  "flac": "A_FLAC",
  "ac3": "A_AC3",
  "eac3": "A_EAC3",
  "dts": "A_DTS",
  "pcm-u8": "A_PCM/INT/LIT",
  "pcm-s16": "A_PCM/INT/LIT",
  "pcm-s16be": "A_PCM/INT/BIG",
  "pcm-s24": "A_PCM/INT/LIT",
  "pcm-s24be": "A_PCM/INT/BIG",
  "pcm-s32": "A_PCM/INT/LIT",
  "pcm-s32be": "A_PCM/INT/BIG",
  "pcm-f32": "A_PCM/FLOAT/IEEE",
  "pcm-f64": "A_PCM/FLOAT/IEEE",
  "webvtt": "S_TEXT/WEBVTT"
};
function assertDefinedSize(size) {
  if (size === void 0) {
    throw new Error("Undefined element size is used in a place where it is not supported.");
  }
}

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/matroska/matroska-misc.js
var buildMatroskaMimeType = (info) => {
  const base = info.hasVideo ? "video/" : info.hasAudio ? "audio/" : "application/";
  let string = base + (info.isWebM ? "webm" : "x-matroska");
  if (info.codecStrings.length > 0) {
    const uniqueCodecMimeTypes = [...new Set(info.codecStrings.filter(Boolean))];
    string += `; codecs="${uniqueCodecMimeTypes.join(", ")}"`;
  }
  return string;
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/matroska/matroska-demuxer.js
var BlockLacing;
(function(BlockLacing2) {
  BlockLacing2[BlockLacing2["None"] = 0] = "None";
  BlockLacing2[BlockLacing2["Xiph"] = 1] = "Xiph";
  BlockLacing2[BlockLacing2["FixedSize"] = 2] = "FixedSize";
  BlockLacing2[BlockLacing2["Ebml"] = 3] = "Ebml";
})(BlockLacing || (BlockLacing = {}));
var ContentEncodingScope;
(function(ContentEncodingScope2) {
  ContentEncodingScope2[ContentEncodingScope2["Block"] = 1] = "Block";
  ContentEncodingScope2[ContentEncodingScope2["Private"] = 2] = "Private";
  ContentEncodingScope2[ContentEncodingScope2["Next"] = 4] = "Next";
})(ContentEncodingScope || (ContentEncodingScope = {}));
var ContentCompAlgo;
(function(ContentCompAlgo2) {
  ContentCompAlgo2[ContentCompAlgo2["Zlib"] = 0] = "Zlib";
  ContentCompAlgo2[ContentCompAlgo2["Bzlib"] = 1] = "Bzlib";
  ContentCompAlgo2[ContentCompAlgo2["lzo1x"] = 2] = "lzo1x";
  ContentCompAlgo2[ContentCompAlgo2["HeaderStripping"] = 3] = "HeaderStripping";
})(ContentCompAlgo || (ContentCompAlgo = {}));
var METADATA_ELEMENTS = [
  { id: EBMLId.SeekHead, flag: "seekHeadSeen" },
  { id: EBMLId.Info, flag: "infoSeen" },
  { id: EBMLId.Tracks, flag: "tracksSeen" },
  { id: EBMLId.Cues, flag: "cuesSeen" }
];
var MAX_RESYNC_LENGTH = 10 * 2 ** 20;
var MatroskaDemuxer = class extends Demuxer {
  constructor(input) {
    super(input);
    this.readMetadataPromise = null;
    this.segments = [];
    this.currentSegment = null;
    this.currentTrack = null;
    this.currentCluster = null;
    this.currentBlock = null;
    this.currentBlockAdditional = null;
    this.currentCueTime = null;
    this.currentDecodingInstruction = null;
    this.currentTagTargetIsMovie = true;
    this.currentSimpleTagName = null;
    this.currentAttachedFile = null;
    this.isWebM = false;
    this.reader = input._reader;
  }
  async getTrackBackings() {
    await this.readMetadata();
    return this.segments.flatMap((segment) => segment.tracks.map((track) => track.trackBacking));
  }
  async getMimeType() {
    await this.readMetadata();
    const backings = await this.getTrackBackings();
    const codecStrings = await Promise.all(backings.map((x) => x.getDecoderConfig().then((c) => c?.codec ?? null)));
    return buildMatroskaMimeType({
      isWebM: this.isWebM,
      hasVideo: this.segments.some((segment) => segment.tracks.some((x) => x.info?.type === "video")),
      hasAudio: this.segments.some((segment) => segment.tracks.some((x) => x.info?.type === "audio")),
      codecStrings: codecStrings.filter(Boolean)
    });
  }
  async getMetadataTags() {
    await this.readMetadata();
    for (const segment of this.segments) {
      if (!segment.metadataTagsCollected) {
        if (this.reader.fileSize !== null) {
          await this.loadSegmentMetadata(segment);
        } else {
        }
        segment.metadataTagsCollected = true;
      }
    }
    let metadataTags = {};
    for (const segment of this.segments) {
      metadataTags = { ...metadataTags, ...segment.metadataTags };
    }
    return metadataTags;
  }
  readMetadata() {
    return this.readMetadataPromise ??= (async () => {
      let currentPos = 0;
      while (true) {
        let slice = this.reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
        if (isThenable(slice))
          slice = await slice;
        if (!slice)
          break;
        const header = readElementHeader(slice);
        if (!header) {
          break;
        }
        const id = header.id;
        let size = header.size;
        const dataStartPos = slice.filePos;
        if (id === EBMLId.EBML) {
          assertDefinedSize(size);
          let slice2 = this.reader.requestSlice(dataStartPos, size);
          if (isThenable(slice2))
            slice2 = await slice2;
          if (!slice2)
            break;
          this.readContiguousElements(slice2);
        } else if (id === EBMLId.Segment) {
          await this.readSegment(dataStartPos, size);
          if (size === void 0) {
            break;
          }
          if (this.reader.fileSize === null) {
            break;
          }
        } else if (id === EBMLId.Cluster) {
          if (this.reader.fileSize === null) {
            break;
          }
          if (size === void 0) {
            const nextElementPos = await searchForNextElementId(this.reader, dataStartPos, LEVEL_0_AND_1_EBML_IDS, this.reader.fileSize);
            size = nextElementPos.pos - dataStartPos;
          }
          const lastSegment = last(this.segments);
          if (lastSegment) {
            lastSegment.elementEndPos = dataStartPos + size;
          }
        }
        assertDefinedSize(size);
        currentPos = dataStartPos + size;
      }
    })();
  }
  async readSegment(segmentDataStart, dataSize) {
    this.currentSegment = {
      seekHeadSeen: false,
      infoSeen: false,
      tracksSeen: false,
      cuesSeen: false,
      tagsSeen: false,
      attachmentsSeen: false,
      timestampScale: -1,
      timestampFactor: -1,
      duration: -1,
      seekEntries: [],
      tracks: [],
      cuePoints: [],
      dataStartPos: segmentDataStart,
      elementEndPos: dataSize === void 0 ? null : segmentDataStart + dataSize,
      clusterSeekStartPos: segmentDataStart,
      lastReadCluster: null,
      metadataTags: {},
      metadataTagsCollected: false
    };
    this.segments.push(this.currentSegment);
    let currentPos = segmentDataStart;
    while (this.currentSegment.elementEndPos === null || currentPos < this.currentSegment.elementEndPos) {
      let slice = this.reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
      if (isThenable(slice))
        slice = await slice;
      if (!slice)
        break;
      const elementStartPos = currentPos;
      const header = readElementHeader(slice);
      if (!header || !LEVEL_1_EBML_IDS.includes(header.id) && header.id !== EBMLId.Void) {
        const nextPos = await resync(this.reader, elementStartPos, LEVEL_1_EBML_IDS, Math.min(this.currentSegment.elementEndPos ?? Infinity, elementStartPos + MAX_RESYNC_LENGTH));
        if (nextPos) {
          currentPos = nextPos;
          continue;
        } else {
          break;
        }
      }
      const { id, size } = header;
      const dataStartPos = slice.filePos;
      const metadataElementIndex = METADATA_ELEMENTS.findIndex((x) => x.id === id);
      if (metadataElementIndex !== -1) {
        const field = METADATA_ELEMENTS[metadataElementIndex].flag;
        this.currentSegment[field] = true;
        assertDefinedSize(size);
        let slice2 = this.reader.requestSlice(dataStartPos, size);
        if (isThenable(slice2))
          slice2 = await slice2;
        if (slice2) {
          this.readContiguousElements(slice2);
        }
      } else if (id === EBMLId.Tags || id === EBMLId.Attachments) {
        if (id === EBMLId.Tags) {
          this.currentSegment.tagsSeen = true;
        } else {
          this.currentSegment.attachmentsSeen = true;
        }
        assertDefinedSize(size);
        let slice2 = this.reader.requestSlice(dataStartPos, size);
        if (isThenable(slice2))
          slice2 = await slice2;
        if (slice2) {
          this.readContiguousElements(slice2);
        }
      } else if (id === EBMLId.Cluster) {
        this.currentSegment.clusterSeekStartPos = elementStartPos;
        break;
      }
      if (size === void 0) {
        break;
      } else {
        currentPos = dataStartPos + size;
      }
    }
    this.currentSegment.seekEntries.sort((a, b) => a.segmentPosition - b.segmentPosition);
    if (this.reader.fileSize !== null) {
      for (const seekEntry of this.currentSegment.seekEntries) {
        const target = METADATA_ELEMENTS.find((x) => x.id === seekEntry.id);
        if (!target) {
          continue;
        }
        if (this.currentSegment[target.flag])
          continue;
        let slice = this.reader.requestSliceRange(segmentDataStart + seekEntry.segmentPosition, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
        if (isThenable(slice))
          slice = await slice;
        if (!slice)
          continue;
        const header = readElementHeader(slice);
        if (!header)
          continue;
        const { id, size } = header;
        if (id !== target.id)
          continue;
        assertDefinedSize(size);
        this.currentSegment[target.flag] = true;
        let dataSlice = this.reader.requestSlice(slice.filePos, size);
        if (isThenable(dataSlice))
          dataSlice = await dataSlice;
        if (!dataSlice)
          continue;
        this.readContiguousElements(dataSlice);
      }
    }
    if (this.currentSegment.timestampScale === -1) {
      this.currentSegment.timestampScale = 1e6;
      this.currentSegment.timestampFactor = 1e9 / 1e6;
    }
    for (const track of this.currentSegment.tracks) {
      if (track.defaultDurationNs !== null) {
        track.defaultDuration = this.currentSegment.timestampFactor * track.defaultDurationNs / 1e9;
      }
    }
    const idToTrack = new Map(this.currentSegment.tracks.map((x) => [x.id, x]));
    for (const cuePoint of this.currentSegment.cuePoints) {
      const track = idToTrack.get(cuePoint.trackId);
      if (track) {
        track.cuePoints.push(cuePoint);
      }
    }
    for (const track of this.currentSegment.tracks) {
      track.cuePoints.sort((a, b) => a.time - b.time);
      for (let i = 0; i < track.cuePoints.length - 1; i++) {
        const cuePoint1 = track.cuePoints[i];
        const cuePoint2 = track.cuePoints[i + 1];
        if (cuePoint1.time === cuePoint2.time) {
          track.cuePoints.splice(i + 1, 1);
          i--;
        }
      }
    }
    let trackWithMostCuePoints = null;
    let maxCuePointCount = -Infinity;
    for (const track of this.currentSegment.tracks) {
      if (track.cuePoints.length > maxCuePointCount) {
        maxCuePointCount = track.cuePoints.length;
        trackWithMostCuePoints = track;
      }
    }
    for (const track of this.currentSegment.tracks) {
      if (track.cuePoints.length === 0) {
        track.cuePoints = trackWithMostCuePoints.cuePoints;
      }
    }
    this.currentSegment = null;
  }
  async readCluster(startPos, segment) {
    if (segment.lastReadCluster?.elementStartPos === startPos) {
      return segment.lastReadCluster;
    }
    let headerSlice = this.reader.requestSliceRange(startPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
    if (isThenable(headerSlice))
      headerSlice = await headerSlice;
    assert(headerSlice);
    const elementStartPos = startPos;
    const elementHeader = readElementHeader(headerSlice);
    assert(elementHeader);
    const id = elementHeader.id;
    assert(id === EBMLId.Cluster);
    let size = elementHeader.size;
    const dataStartPos = headerSlice.filePos;
    if (size === void 0) {
      const nextElementPos = await searchForNextElementId(this.reader, dataStartPos, LEVEL_0_AND_1_EBML_IDS, segment.elementEndPos);
      size = nextElementPos.pos - dataStartPos;
    }
    let dataSlice = this.reader.requestSlice(dataStartPos, size);
    if (isThenable(dataSlice))
      dataSlice = await dataSlice;
    const cluster = {
      segment,
      elementStartPos,
      elementEndPos: dataStartPos + size,
      dataStartPos,
      timestamp: -1,
      trackData: /* @__PURE__ */ new Map()
    };
    this.currentCluster = cluster;
    if (dataSlice) {
      const endPos = this.readContiguousElements(dataSlice, LEVEL_0_AND_1_EBML_IDS);
      cluster.elementEndPos = endPos;
    }
    for (const [, trackData] of cluster.trackData) {
      const track = trackData.track;
      assert(trackData.blocks.length > 0);
      let hasLacedBlocks = false;
      for (let i = 0; i < trackData.blocks.length; i++) {
        const block = trackData.blocks[i];
        block.timestamp += cluster.timestamp;
        hasLacedBlocks ||= block.lacing !== BlockLacing.None;
      }
      trackData.presentationTimestamps = trackData.blocks.map((block, i) => ({ timestamp: block.timestamp, blockIndex: i })).sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < trackData.presentationTimestamps.length; i++) {
        const currentEntry = trackData.presentationTimestamps[i];
        const currentBlock = trackData.blocks[currentEntry.blockIndex];
        if (trackData.firstKeyFrameTimestamp === null && currentBlock.isKeyFrame) {
          trackData.firstKeyFrameTimestamp = currentBlock.timestamp;
        }
        if (i < trackData.presentationTimestamps.length - 1) {
          const nextEntry = trackData.presentationTimestamps[i + 1];
          currentBlock.duration = nextEntry.timestamp - currentBlock.timestamp;
        } else if (currentBlock.duration === 0) {
          if (track.defaultDuration != null) {
            if (currentBlock.lacing === BlockLacing.None) {
              currentBlock.duration = track.defaultDuration;
            } else {
            }
          }
        }
      }
      if (hasLacedBlocks) {
        this.expandLacedBlocks(trackData.blocks, track);
        trackData.presentationTimestamps = trackData.blocks.map((block, i) => ({ timestamp: block.timestamp, blockIndex: i })).sort((a, b) => a.timestamp - b.timestamp);
      }
      const firstBlock = trackData.blocks[trackData.presentationTimestamps[0].blockIndex];
      const lastBlock = trackData.blocks[last(trackData.presentationTimestamps).blockIndex];
      trackData.startTimestamp = firstBlock.timestamp;
      trackData.endTimestamp = lastBlock.timestamp + lastBlock.duration;
      const insertionIndex = binarySearchLessOrEqual(track.clusterPositionCache, trackData.startTimestamp, (x) => x.startTimestamp);
      if (insertionIndex === -1 || track.clusterPositionCache[insertionIndex].elementStartPos !== elementStartPos) {
        track.clusterPositionCache.splice(insertionIndex + 1, 0, {
          elementStartPos: cluster.elementStartPos,
          startTimestamp: trackData.startTimestamp
        });
      }
    }
    segment.lastReadCluster = cluster;
    return cluster;
  }
  getTrackDataInCluster(cluster, trackNumber) {
    let trackData = cluster.trackData.get(trackNumber);
    if (!trackData) {
      const track = cluster.segment.tracks.find((x) => x.id === trackNumber);
      if (!track) {
        return null;
      }
      trackData = {
        track,
        startTimestamp: 0,
        endTimestamp: 0,
        firstKeyFrameTimestamp: null,
        blocks: [],
        presentationTimestamps: []
      };
      cluster.trackData.set(trackNumber, trackData);
    }
    return trackData;
  }
  expandLacedBlocks(blocks, track) {
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const originalBlock = blocks[blockIndex];
      if (originalBlock.lacing === BlockLacing.None) {
        continue;
      }
      if (!originalBlock.decoded) {
        originalBlock.data = this.decodeBlockData(track, originalBlock.data);
        originalBlock.decoded = true;
      }
      const slice = FileSlice.tempFromBytes(originalBlock.data);
      const frameSizes = [];
      const frameCount = readU8(slice) + 1;
      switch (originalBlock.lacing) {
        case BlockLacing.Xiph:
          {
            let totalUsedSize = 0;
            for (let i = 0; i < frameCount - 1; i++) {
              let frameSize = 0;
              while (slice.bufferPos < slice.length) {
                const value = readU8(slice);
                frameSize += value;
                if (value < 255) {
                  frameSizes.push(frameSize);
                  totalUsedSize += frameSize;
                  break;
                }
              }
            }
            frameSizes.push(slice.length - (slice.bufferPos + totalUsedSize));
          }
          ;
          break;
        case BlockLacing.FixedSize:
          {
            const totalDataSize = slice.length - 1;
            const frameSize = Math.floor(totalDataSize / frameCount);
            for (let i = 0; i < frameCount; i++) {
              frameSizes.push(frameSize);
            }
          }
          ;
          break;
        case BlockLacing.Ebml:
          {
            const firstResult = readVarInt(slice);
            assert(firstResult !== null);
            let currentSize = firstResult;
            frameSizes.push(currentSize);
            let totalUsedSize = currentSize;
            for (let i = 1; i < frameCount - 1; i++) {
              const startPos = slice.bufferPos;
              const diffResult = readVarInt(slice);
              assert(diffResult !== null);
              const unsignedDiff = diffResult;
              const width = slice.bufferPos - startPos;
              const bias = (1 << width * 7 - 1) - 1;
              const diff = unsignedDiff - bias;
              currentSize += diff;
              frameSizes.push(currentSize);
              totalUsedSize += currentSize;
            }
            frameSizes.push(slice.length - (slice.bufferPos + totalUsedSize));
          }
          ;
          break;
        default:
          assert(false);
      }
      assert(frameSizes.length === frameCount);
      blocks.splice(blockIndex, 1);
      const blockDuration = originalBlock.duration || frameCount * (track.defaultDuration ?? 0);
      for (let i = 0; i < frameCount; i++) {
        const frameSize = frameSizes[i];
        const frameData = readBytes(slice, frameSize);
        const frameTimestamp = originalBlock.timestamp + blockDuration * i / frameCount;
        const frameDuration = blockDuration / frameCount;
        blocks.splice(blockIndex + i, 0, {
          timestamp: frameTimestamp,
          duration: frameDuration,
          isKeyFrame: originalBlock.isKeyFrame,
          data: frameData,
          lacing: BlockLacing.None,
          decoded: true,
          postProcessed: false,
          mainAdditional: originalBlock.mainAdditional
        });
      }
      blockIndex += frameCount;
      blockIndex--;
    }
  }
  async loadSegmentMetadata(segment) {
    for (const seekEntry of segment.seekEntries) {
      if (seekEntry.id === EBMLId.Tags && !segment.tagsSeen) {
      } else if (seekEntry.id === EBMLId.Attachments && !segment.attachmentsSeen) {
      } else {
        continue;
      }
      let slice = this.reader.requestSliceRange(segment.dataStartPos + seekEntry.segmentPosition, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
      if (isThenable(slice))
        slice = await slice;
      if (!slice)
        continue;
      const header = readElementHeader(slice);
      if (!header || header.id !== seekEntry.id)
        continue;
      const { size } = header;
      assertDefinedSize(size);
      assert(!this.currentSegment);
      this.currentSegment = segment;
      let dataSlice = this.reader.requestSlice(slice.filePos, size);
      if (isThenable(dataSlice))
        dataSlice = await dataSlice;
      if (dataSlice) {
        this.readContiguousElements(dataSlice);
      }
      this.currentSegment = null;
      if (seekEntry.id === EBMLId.Tags) {
        segment.tagsSeen = true;
      } else if (seekEntry.id === EBMLId.Attachments) {
        segment.attachmentsSeen = true;
      }
    }
  }
  readContiguousElements(slice, stopIds) {
    while (slice.remainingLength >= MIN_HEADER_SIZE) {
      const startPos = slice.filePos;
      const foundElement = this.traverseElement(slice, stopIds);
      if (!foundElement) {
        return startPos;
      }
    }
    return slice.filePos;
  }
  traverseElement(slice, stopIds) {
    const header = readElementHeader(slice);
    if (!header) {
      return false;
    }
    if (stopIds && stopIds.includes(header.id)) {
      return false;
    }
    const { id, size } = header;
    const dataStartPos = slice.filePos;
    assertDefinedSize(size);
    switch (id) {
      case EBMLId.DocType:
        {
          this.isWebM = readAsciiString(slice, size) === "webm";
        }
        ;
        break;
      case EBMLId.Seek:
        {
          if (!this.currentSegment)
            break;
          const seekEntry = { id: -1, segmentPosition: -1 };
          this.currentSegment.seekEntries.push(seekEntry);
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (seekEntry.id === -1 || seekEntry.segmentPosition === -1) {
            this.currentSegment.seekEntries.pop();
          }
        }
        ;
        break;
      case EBMLId.SeekID:
        {
          const lastSeekEntry = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
          if (!lastSeekEntry)
            break;
          lastSeekEntry.id = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.SeekPosition:
        {
          const lastSeekEntry = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
          if (!lastSeekEntry)
            break;
          lastSeekEntry.segmentPosition = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.TimestampScale:
        {
          if (!this.currentSegment)
            break;
          this.currentSegment.timestampScale = readUnsignedInt(slice, size);
          this.currentSegment.timestampFactor = 1e9 / this.currentSegment.timestampScale;
        }
        ;
        break;
      case EBMLId.Duration:
        {
          if (!this.currentSegment)
            break;
          this.currentSegment.duration = readFloat(slice, size);
        }
        ;
        break;
      case EBMLId.TrackEntry:
        {
          if (!this.currentSegment)
            break;
          this.currentTrack = {
            id: -1,
            segment: this.currentSegment,
            demuxer: this,
            clusterPositionCache: [],
            cuePoints: [],
            disposition: {
              ...DEFAULT_TRACK_DISPOSITION,
              primary: false
            },
            trackBacking: null,
            codecId: null,
            codecPrivate: null,
            defaultDuration: null,
            defaultDurationNs: null,
            name: null,
            languageCode: "eng",
            // The default in Matroska
            hasLanguageBcp47: false,
            decodingInstructions: [],
            info: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (!this.currentTrack) {
            break;
          }
          if (this.currentTrack.decodingInstructions.some((instruction) => {
            return instruction.data?.type !== "decompress" || instruction.scope !== ContentEncodingScope.Block || instruction.data.algorithm !== ContentCompAlgo.HeaderStripping;
          })) {
            Logging._warn(`Track #${this.currentTrack.id} has an unsupported content encoding; dropping.`);
            this.currentTrack = null;
          }
          if (this.currentTrack && this.currentTrack.id !== -1 && this.currentTrack.codecId && this.currentTrack.info) {
            const slashIndex = this.currentTrack.codecId.indexOf("/");
            const codecIdWithoutSuffix = slashIndex === -1 ? this.currentTrack.codecId : this.currentTrack.codecId.slice(0, slashIndex);
            if (this.currentTrack.info.type === "video" && this.currentTrack.info.width !== -1 && this.currentTrack.info.height !== -1) {
              this.currentTrack.info.squarePixelWidth = this.currentTrack.info.width;
              this.currentTrack.info.squarePixelHeight = this.currentTrack.info.height;
              if (this.currentTrack.info.displayWidth !== null && this.currentTrack.info.displayHeight !== null) {
                const num = this.currentTrack.info.displayWidth * this.currentTrack.info.height;
                const den = this.currentTrack.info.displayHeight * this.currentTrack.info.width;
                if (num > 0 && den > 0) {
                  if (num > den) {
                    this.currentTrack.info.squarePixelWidth = Math.round(this.currentTrack.info.width * num / den);
                  } else {
                    this.currentTrack.info.squarePixelHeight = Math.round(this.currentTrack.info.height * den / num);
                  }
                }
              }
              if (this.currentTrack.codecId === CODEC_STRING_MAP.avc) {
                this.currentTrack.info.codec = "avc";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (this.currentTrack.codecId === CODEC_STRING_MAP.hevc) {
                this.currentTrack.info.codec = "hevc";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vp8) {
                this.currentTrack.info.codec = "vp8";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vp9) {
                this.currentTrack.info.codec = "vp9";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.av1) {
                this.currentTrack.info.codec = "av1";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.prores) {
                const format = this.currentTrack.codecPrivate ? textDecoder.decode(this.currentTrack.codecPrivate) : "";
                if (PRORES_FOURCCS.includes(format)) {
                  this.currentTrack.info.codec = "prores";
                  this.currentTrack.info.proresFormat = format;
                } else {
                }
              }
              const videoTrack = this.currentTrack;
              this.currentTrack.trackBacking = new MatroskaVideoTrackBacking(videoTrack);
              this.currentSegment.tracks.push(this.currentTrack);
            } else if (this.currentTrack.info.type === "audio") {
              if (codecIdWithoutSuffix === CODEC_STRING_MAP.aac) {
                this.currentTrack.info.codec = "aac";
                this.currentTrack.info.aacCodecInfo = {
                  isMpeg2: this.currentTrack.codecId.includes("MPEG2"),
                  objectType: null
                };
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (this.currentTrack.codecId === CODEC_STRING_MAP.mp3) {
                this.currentTrack.info.codec = "mp3";
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.opus) {
                this.currentTrack.info.codec = "opus";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
                this.currentTrack.info.sampleRate = OPUS_SAMPLE_RATE;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.vorbis) {
                this.currentTrack.info.codec = "vorbis";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.flac) {
                this.currentTrack.info.codec = "flac";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.ac3) {
                this.currentTrack.info.codec = "ac3";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.eac3) {
                this.currentTrack.info.codec = "eac3";
                this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
              } else if (codecIdWithoutSuffix === CODEC_STRING_MAP.dts) {
                this.currentTrack.info.codec = "dts";
                if (this.currentTrack.codecId === "A_DTS/EXPRESS") {
                  this.currentTrack.info.dtsFormat = "dtse";
                } else if (this.currentTrack.codecId === "A_DTS/LOSSLESS") {
                  this.currentTrack.info.dtsFormat = "dtsl";
                }
              } else if (this.currentTrack.codecId === "A_PCM/INT/LIT") {
                if (this.currentTrack.info.bitDepth === 8) {
                  this.currentTrack.info.codec = "pcm-u8";
                } else if (this.currentTrack.info.bitDepth === 16) {
                  this.currentTrack.info.codec = "pcm-s16";
                } else if (this.currentTrack.info.bitDepth === 24) {
                  this.currentTrack.info.codec = "pcm-s24";
                } else if (this.currentTrack.info.bitDepth === 32) {
                  this.currentTrack.info.codec = "pcm-s32";
                }
              } else if (this.currentTrack.codecId === "A_PCM/INT/BIG") {
                if (this.currentTrack.info.bitDepth === 8) {
                  this.currentTrack.info.codec = "pcm-u8";
                } else if (this.currentTrack.info.bitDepth === 16) {
                  this.currentTrack.info.codec = "pcm-s16be";
                } else if (this.currentTrack.info.bitDepth === 24) {
                  this.currentTrack.info.codec = "pcm-s24be";
                } else if (this.currentTrack.info.bitDepth === 32) {
                  this.currentTrack.info.codec = "pcm-s32be";
                }
              } else if (this.currentTrack.codecId === "A_PCM/FLOAT/IEEE") {
                if (this.currentTrack.info.bitDepth === 32) {
                  this.currentTrack.info.codec = "pcm-f32";
                } else if (this.currentTrack.info.bitDepth === 64) {
                  this.currentTrack.info.codec = "pcm-f64";
                }
              }
              const audioTrack = this.currentTrack;
              this.currentTrack.trackBacking = new MatroskaAudioTrackBacking(audioTrack);
              this.currentSegment.tracks.push(this.currentTrack);
            }
          }
          this.currentTrack = null;
        }
        ;
        break;
      case EBMLId.TrackNumber:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.id = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.TrackType:
        {
          if (!this.currentTrack)
            break;
          const type = readUnsignedInt(slice, size);
          if (type === 1) {
            this.currentTrack.info = {
              type: "video",
              width: -1,
              height: -1,
              displayWidth: null,
              displayHeight: null,
              displayUnit: null,
              squarePixelWidth: -1,
              squarePixelHeight: -1,
              rotation: 0,
              codec: null,
              codecDescription: null,
              colorSpace: null,
              alphaMode: false,
              proresFormat: null
            };
          } else if (type === 2) {
            this.currentTrack.info = {
              type: "audio",
              numberOfChannels: 1,
              // Default value
              sampleRate: 8e3,
              // Default value
              bitDepth: -1,
              codec: null,
              codecDescription: null,
              aacCodecInfo: null,
              dtsFormat: null
            };
          }
        }
        ;
        break;
      case EBMLId.FlagEnabled:
        {
          if (!this.currentTrack)
            break;
          const enabled = readUnsignedInt(slice, size);
          if (!enabled) {
            this.currentTrack = null;
          }
        }
        ;
        break;
      case EBMLId.FlagDefault:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.disposition.default = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.FlagForced:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.disposition.forced = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.FlagOriginal:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.disposition.original = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.FlagHearingImpaired:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.disposition.hearingImpaired = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.FlagVisualImpaired:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.disposition.visuallyImpaired = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.FlagCommentary:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.disposition.commentary = !!readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.CodecID:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.codecId = readAsciiString(slice, size);
        }
        ;
        break;
      case EBMLId.CodecPrivate:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.codecPrivate = readBytes(slice, size);
        }
        ;
        break;
      case EBMLId.DefaultDuration:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.defaultDurationNs = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.Name:
        {
          if (!this.currentTrack)
            break;
          this.currentTrack.name = readUnicodeString(slice, size);
        }
        ;
        break;
      case EBMLId.Language:
        {
          if (!this.currentTrack)
            break;
          if (this.currentTrack.hasLanguageBcp47) {
            break;
          }
          this.currentTrack.languageCode = readAsciiString(slice, size);
          if (!isIso639Dash2LanguageCode(this.currentTrack.languageCode)) {
            this.currentTrack.languageCode = UNDETERMINED_LANGUAGE;
          }
        }
        ;
        break;
      case EBMLId.LanguageBCP47:
        {
          if (!this.currentTrack)
            break;
          const bcp47 = readAsciiString(slice, size);
          const languageSubtag = bcp47.split("-")[0];
          if (languageSubtag) {
            this.currentTrack.languageCode = languageSubtag;
          } else {
            this.currentTrack.languageCode = UNDETERMINED_LANGUAGE;
          }
          this.currentTrack.hasLanguageBcp47 = true;
        }
        ;
        break;
      case EBMLId.Video:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.PixelWidth:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.width = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.PixelHeight:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.height = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.DisplayWidth:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.displayWidth = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.DisplayHeight:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.displayHeight = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.DisplayUnit:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.displayUnit = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.AlphaMode:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.alphaMode = readUnsignedInt(slice, size) === 1;
        }
        ;
        break;
      case EBMLId.Colour:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.currentTrack.info.colorSpace = {};
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.MatrixCoefficients:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace)
            break;
          const matrixCoefficients = readUnsignedInt(slice, size);
          const mapped = MATRIX_COEFFICIENTS_MAP_INVERSE[matrixCoefficients] ?? null;
          this.currentTrack.info.colorSpace.matrix = mapped;
        }
        ;
        break;
      case EBMLId.Range:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace)
            break;
          this.currentTrack.info.colorSpace.fullRange = readUnsignedInt(slice, size) === 2;
        }
        ;
        break;
      case EBMLId.TransferCharacteristics:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace)
            break;
          const transferCharacteristics = readUnsignedInt(slice, size);
          const mapped = TRANSFER_CHARACTERISTICS_MAP_INVERSE[transferCharacteristics] ?? null;
          this.currentTrack.info.colorSpace.transfer = mapped;
        }
        ;
        break;
      case EBMLId.Primaries:
        {
          if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace)
            break;
          const primaries = readUnsignedInt(slice, size);
          const mapped = COLOR_PRIMARIES_MAP_INVERSE[primaries] ?? null;
          this.currentTrack.info.colorSpace.primaries = mapped;
        }
        ;
        break;
      case EBMLId.Projection:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.ProjectionPoseRoll:
        {
          if (this.currentTrack?.info?.type !== "video")
            break;
          const rotation = readFloat(slice, size);
          const flippedRotation = -rotation;
          try {
            this.currentTrack.info.rotation = normalizeRotation(flippedRotation);
          } catch {
          }
        }
        ;
        break;
      case EBMLId.Audio:
        {
          if (this.currentTrack?.info?.type !== "audio")
            break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.SamplingFrequency:
        {
          if (this.currentTrack?.info?.type !== "audio")
            break;
          this.currentTrack.info.sampleRate = readFloat(slice, size);
        }
        ;
        break;
      case EBMLId.Channels:
        {
          if (this.currentTrack?.info?.type !== "audio")
            break;
          this.currentTrack.info.numberOfChannels = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.BitDepth:
        {
          if (this.currentTrack?.info?.type !== "audio")
            break;
          this.currentTrack.info.bitDepth = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.CuePoint:
        {
          if (!this.currentSegment)
            break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
          this.currentCueTime = null;
        }
        ;
        break;
      case EBMLId.CueTime:
        {
          this.currentCueTime = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.CueTrackPositions:
        {
          if (this.currentCueTime === null)
            break;
          assert(this.currentSegment);
          const cuePoint = { time: this.currentCueTime, trackId: -1, clusterPosition: -1 };
          this.currentSegment.cuePoints.push(cuePoint);
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (cuePoint.trackId === -1 || cuePoint.clusterPosition === -1) {
            this.currentSegment.cuePoints.pop();
          }
        }
        ;
        break;
      case EBMLId.CueTrack:
        {
          const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
          if (!lastCuePoint)
            break;
          lastCuePoint.trackId = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.CueClusterPosition:
        {
          const lastCuePoint = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
          if (!lastCuePoint)
            break;
          assert(this.currentSegment);
          lastCuePoint.clusterPosition = this.currentSegment.dataStartPos + readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.Timestamp:
        {
          if (!this.currentCluster)
            break;
          this.currentCluster.timestamp = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.SimpleBlock:
        {
          if (!this.currentCluster)
            break;
          const trackNumber = readVarInt(slice);
          if (trackNumber === null)
            break;
          const trackData = this.getTrackDataInCluster(this.currentCluster, trackNumber);
          if (!trackData)
            break;
          const relativeTimestamp = readI16Be(slice);
          const flags = readU8(slice);
          const lacing = flags >> 1 & 3;
          let isKeyFrame = !!(flags & 128);
          if (trackData.track.info?.type === "audio" && trackData.track.info.codec) {
            isKeyFrame = true;
          }
          const blockData = readBytes(slice, size - (slice.filePos - dataStartPos));
          const hasDecodingInstructions = trackData.track.decodingInstructions.length > 0;
          trackData.blocks.push({
            timestamp: relativeTimestamp,
            // We'll add the cluster's timestamp to this later
            duration: 0,
            // Will set later
            isKeyFrame,
            data: blockData,
            lacing,
            decoded: !hasDecodingInstructions,
            postProcessed: false,
            mainAdditional: null
          });
        }
        ;
        break;
      case EBMLId.BlockGroup:
        {
          if (!this.currentCluster)
            break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
          this.currentBlock = null;
        }
        ;
        break;
      case EBMLId.Block:
        {
          if (!this.currentCluster)
            break;
          const trackNumber = readVarInt(slice);
          if (trackNumber === null)
            break;
          const trackData = this.getTrackDataInCluster(this.currentCluster, trackNumber);
          if (!trackData)
            break;
          const relativeTimestamp = readI16Be(slice);
          const flags = readU8(slice);
          const lacing = flags >> 1 & 3;
          const blockData = readBytes(slice, size - (slice.filePos - dataStartPos));
          const hasDecodingInstructions = trackData.track.decodingInstructions.length > 0;
          this.currentBlock = {
            timestamp: relativeTimestamp,
            // We'll add the cluster's timestamp to this later
            duration: 0,
            // Will set later
            isKeyFrame: true,
            data: blockData,
            lacing,
            decoded: !hasDecodingInstructions,
            postProcessed: false,
            mainAdditional: null
          };
          trackData.blocks.push(this.currentBlock);
        }
        ;
        break;
      case EBMLId.BlockAdditions:
        {
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.BlockMore:
        {
          if (!this.currentBlock)
            break;
          this.currentBlockAdditional = {
            addId: 1,
            data: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (this.currentBlockAdditional.data && this.currentBlockAdditional.addId === 1) {
            this.currentBlock.mainAdditional = this.currentBlockAdditional.data;
          }
          this.currentBlockAdditional = null;
        }
        ;
        break;
      case EBMLId.BlockAdditional:
        {
          if (!this.currentBlockAdditional)
            break;
          this.currentBlockAdditional.data = readBytes(slice, size);
        }
        ;
        break;
      case EBMLId.BlockAddID:
        {
          if (!this.currentBlockAdditional)
            break;
          this.currentBlockAdditional.addId = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.BlockDuration:
        {
          if (!this.currentBlock)
            break;
          this.currentBlock.duration = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.ReferenceBlock:
        {
          if (!this.currentBlock)
            break;
          this.currentBlock.isKeyFrame = false;
        }
        ;
        break;
      case EBMLId.Tag:
        {
          this.currentTagTargetIsMovie = true;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.Targets:
        {
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.TargetTypeValue:
        {
          const targetTypeValue = readUnsignedInt(slice, size);
          if (targetTypeValue !== 50) {
            this.currentTagTargetIsMovie = false;
          }
        }
        ;
        break;
      case EBMLId.TagTrackUID:
      case EBMLId.TagEditionUID:
      case EBMLId.TagChapterUID:
      case EBMLId.TagAttachmentUID:
        {
          this.currentTagTargetIsMovie = false;
        }
        ;
        break;
      case EBMLId.SimpleTag:
        {
          if (!this.currentTagTargetIsMovie)
            break;
          this.currentSimpleTagName = null;
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.TagName:
        {
          this.currentSimpleTagName = readUnicodeString(slice, size);
        }
        ;
        break;
      case EBMLId.TagString:
        {
          if (!this.currentSimpleTagName)
            break;
          const value = readUnicodeString(slice, size);
          this.processTagValue(this.currentSimpleTagName, value);
        }
        ;
        break;
      case EBMLId.TagBinary:
        {
          if (!this.currentSimpleTagName)
            break;
          const value = readBytes(slice, size);
          this.processTagValue(this.currentSimpleTagName, value);
        }
        ;
        break;
      case EBMLId.AttachedFile:
        {
          if (!this.currentSegment)
            break;
          this.currentAttachedFile = {
            fileUid: null,
            fileName: null,
            fileMediaType: null,
            fileData: null,
            fileDescription: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          const tags = this.currentSegment.metadataTags;
          if (this.currentAttachedFile.fileUid && this.currentAttachedFile.fileData) {
            tags.raw ??= {};
            tags.raw[this.currentAttachedFile.fileUid.toString()] = new AttachedFile(this.currentAttachedFile.fileData, this.currentAttachedFile.fileMediaType ?? void 0, this.currentAttachedFile.fileName ?? void 0, this.currentAttachedFile.fileDescription ?? void 0);
          }
          if (this.currentAttachedFile.fileMediaType?.startsWith("image/") && this.currentAttachedFile.fileData) {
            const fileName = this.currentAttachedFile.fileName;
            let kind = "unknown";
            if (fileName) {
              const lowerName = fileName.toLowerCase();
              if (lowerName.startsWith("cover.")) {
                kind = "coverFront";
              } else if (lowerName.startsWith("back.")) {
                kind = "coverBack";
              }
            }
            tags.images ??= [];
            tags.images.push({
              data: this.currentAttachedFile.fileData,
              mimeType: this.currentAttachedFile.fileMediaType,
              kind,
              name: this.currentAttachedFile.fileName ?? void 0,
              description: this.currentAttachedFile.fileDescription ?? void 0
            });
          }
          this.currentAttachedFile = null;
        }
        ;
        break;
      case EBMLId.FileUID:
        {
          if (!this.currentAttachedFile)
            break;
          this.currentAttachedFile.fileUid = readUnsignedBigInt(slice, size);
        }
        ;
        break;
      case EBMLId.FileName:
        {
          if (!this.currentAttachedFile)
            break;
          this.currentAttachedFile.fileName = readUnicodeString(slice, size);
        }
        ;
        break;
      case EBMLId.FileMediaType:
        {
          if (!this.currentAttachedFile)
            break;
          this.currentAttachedFile.fileMediaType = readAsciiString(slice, size);
        }
        ;
        break;
      case EBMLId.FileData:
        {
          if (!this.currentAttachedFile)
            break;
          this.currentAttachedFile.fileData = readBytes(slice, size);
        }
        ;
        break;
      case EBMLId.FileDescription:
        {
          if (!this.currentAttachedFile)
            break;
          this.currentAttachedFile.fileDescription = readUnicodeString(slice, size);
        }
        ;
        break;
      case EBMLId.ContentEncodings:
        {
          if (!this.currentTrack)
            break;
          this.readContiguousElements(slice.slice(dataStartPos, size));
          this.currentTrack.decodingInstructions.sort((a, b) => b.order - a.order);
        }
        ;
        break;
      case EBMLId.ContentEncoding:
        {
          this.currentDecodingInstruction = {
            order: 0,
            scope: ContentEncodingScope.Block,
            data: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
          if (this.currentDecodingInstruction.data) {
            this.currentTrack.decodingInstructions.push(this.currentDecodingInstruction);
          }
          this.currentDecodingInstruction = null;
        }
        ;
        break;
      case EBMLId.ContentEncodingOrder:
        {
          if (!this.currentDecodingInstruction)
            break;
          this.currentDecodingInstruction.order = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.ContentEncodingScope:
        {
          if (!this.currentDecodingInstruction)
            break;
          this.currentDecodingInstruction.scope = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.ContentCompression:
        {
          if (!this.currentDecodingInstruction)
            break;
          this.currentDecodingInstruction.data = {
            type: "decompress",
            algorithm: ContentCompAlgo.Zlib,
            settings: null
          };
          this.readContiguousElements(slice.slice(dataStartPos, size));
        }
        ;
        break;
      case EBMLId.ContentCompAlgo:
        {
          if (this.currentDecodingInstruction?.data?.type !== "decompress")
            break;
          this.currentDecodingInstruction.data.algorithm = readUnsignedInt(slice, size);
        }
        ;
        break;
      case EBMLId.ContentCompSettings:
        {
          if (this.currentDecodingInstruction?.data?.type !== "decompress")
            break;
          this.currentDecodingInstruction.data.settings = readBytes(slice, size);
        }
        ;
        break;
      case EBMLId.ContentEncryption:
        {
          if (!this.currentDecodingInstruction)
            break;
          this.currentDecodingInstruction.data = {
            type: "decrypt"
          };
        }
        ;
        break;
    }
    slice.filePos = dataStartPos + size;
    return true;
  }
  decodeBlockData(track, rawData) {
    assert(track.decodingInstructions.length > 0);
    let currentData = rawData;
    for (const instruction of track.decodingInstructions) {
      assert(instruction.data);
      switch (instruction.data.type) {
        case "decompress":
          {
            switch (instruction.data.algorithm) {
              case ContentCompAlgo.HeaderStripping:
                {
                  if (instruction.data.settings && instruction.data.settings.length > 0) {
                    const prefix = instruction.data.settings;
                    const newData = new Uint8Array(prefix.length + currentData.length);
                    newData.set(prefix, 0);
                    newData.set(currentData, prefix.length);
                    currentData = newData;
                  }
                }
                ;
                break;
              default:
                {
                }
                ;
            }
          }
          ;
          break;
        default:
          {
          }
          ;
      }
    }
    return currentData;
  }
  processTagValue(name, value) {
    if (!this.currentSegment?.metadataTags)
      return;
    const metadataTags = this.currentSegment.metadataTags;
    metadataTags.raw ??= {};
    metadataTags.raw[name] ??= value;
    if (typeof value === "string") {
      switch (name.toLowerCase()) {
        case "title":
          {
            metadataTags.title ??= value;
          }
          ;
          break;
        case "description":
          {
            metadataTags.description ??= value;
          }
          ;
          break;
        case "artist":
          {
            metadataTags.artist ??= value;
          }
          ;
          break;
        case "album":
          {
            metadataTags.album ??= value;
          }
          ;
          break;
        case "album_artist":
          {
            metadataTags.albumArtist ??= value;
          }
          ;
          break;
        case "genre":
          {
            metadataTags.genre ??= value;
          }
          ;
          break;
        case "comment":
          {
            metadataTags.comment ??= value;
          }
          ;
          break;
        case "lyrics":
          {
            metadataTags.lyrics ??= value;
          }
          ;
          break;
        case "date":
          {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
              metadataTags.date ??= date;
            }
          }
          ;
          break;
        case "track_number":
        case "part_number":
          {
            const parts = value.split("/");
            const trackNum = Number.parseInt(parts[0], 10);
            const tracksTotal = parts[1] && Number.parseInt(parts[1], 10);
            if (Number.isInteger(trackNum) && trackNum > 0) {
              metadataTags.trackNumber ??= trackNum;
            }
            if (tracksTotal && Number.isInteger(tracksTotal) && tracksTotal > 0) {
              metadataTags.tracksTotal ??= tracksTotal;
            }
          }
          ;
          break;
        case "disc_number":
        case "disc":
          {
            const discParts = value.split("/");
            const discNum = Number.parseInt(discParts[0], 10);
            const discsTotal = discParts[1] && Number.parseInt(discParts[1], 10);
            if (Number.isInteger(discNum) && discNum > 0) {
              metadataTags.discNumber ??= discNum;
            }
            if (discsTotal && Number.isInteger(discsTotal) && discsTotal > 0) {
              metadataTags.discsTotal ??= discsTotal;
            }
          }
          ;
          break;
      }
    }
  }
};
var MatroskaTrackBacking = class {
  constructor(internalTrack) {
    this.internalTrack = internalTrack;
    this.packetToClusterLocation = /* @__PURE__ */ new WeakMap();
  }
  getId() {
    return this.internalTrack.id;
  }
  getNumber() {
    const demuxer = this.internalTrack.demuxer;
    const trackType = this.internalTrack.trackBacking.getType();
    let number = 0;
    for (const segment of demuxer.segments) {
      for (const track of segment.tracks) {
        if (track.trackBacking.getType() === trackType) {
          number++;
        }
        if (track === this.internalTrack) {
          break;
        }
      }
    }
    return number;
  }
  getCodec() {
    throw new Error("Not implemented on base class.");
  }
  getInternalCodecId() {
    return this.internalTrack.codecId;
  }
  getName() {
    return this.internalTrack.name;
  }
  getLanguageCode() {
    return this.internalTrack.languageCode;
  }
  getTimeResolution() {
    return this.internalTrack.segment.timestampFactor;
  }
  isRelativeToUnixEpoch() {
    return false;
  }
  getUnixTimeForTimestamp() {
    return null;
  }
  getDisposition() {
    return this.internalTrack.disposition;
  }
  getPairingMask() {
    return 1n;
  }
  getBitrate() {
    return null;
  }
  getAverageBitrate() {
    return null;
  }
  async getDurationFromMetadata() {
    const segment = this.internalTrack.segment;
    if (segment.duration <= 0) {
      return null;
    }
    let endTimestamp = segment.duration / segment.timestampFactor;
    const firstPacket = await this.getFirstPacket({ metadataOnly: true });
    endTimestamp += firstPacket?.timestamp ?? 0;
    return endTimestamp;
  }
  async getLiveRefreshInterval() {
    return null;
  }
  async getFirstPacket(options) {
    return this.performClusterLookup(
      null,
      (cluster) => {
        const trackData = cluster.trackData.get(this.internalTrack.id);
        if (trackData) {
          return {
            blockIndex: 0,
            correctBlockFound: true
          };
        }
        return {
          blockIndex: -1,
          correctBlockFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the cues
      Infinity,
      options
    );
  }
  intoTimescale(timestamp) {
    return roundIfAlmostInteger(timestamp * this.internalTrack.segment.timestampFactor);
  }
  async getPacket(timestamp, options) {
    const timestampInTimescale = this.intoTimescale(timestamp);
    return this.performClusterLookup(null, (cluster) => {
      const trackData = cluster.trackData.get(this.internalTrack.id);
      if (!trackData) {
        return { blockIndex: -1, correctBlockFound: false };
      }
      const index = binarySearchLessOrEqual(trackData.presentationTimestamps, timestampInTimescale, (x) => x.timestamp);
      const blockIndex = index !== -1 ? trackData.presentationTimestamps[index].blockIndex : -1;
      const correctBlockFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
      return { blockIndex, correctBlockFound };
    }, timestampInTimescale, timestampInTimescale, options);
  }
  async getNextPacket(packet, options) {
    const locationInCluster = this.packetToClusterLocation.get(packet);
    if (locationInCluster === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performClusterLookup(
      locationInCluster.cluster,
      (cluster) => {
        if (cluster === locationInCluster.cluster) {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          if (locationInCluster.blockIndex + 1 < trackData.blocks.length) {
            return {
              blockIndex: locationInCluster.blockIndex + 1,
              correctBlockFound: true
            };
          }
        } else {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          if (trackData) {
            return {
              blockIndex: 0,
              correctBlockFound: true
            };
          }
        }
        return {
          blockIndex: -1,
          correctBlockFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the cues
      Infinity,
      options
    );
  }
  async getKeyPacket(timestamp, options) {
    const timestampInTimescale = this.intoTimescale(timestamp);
    return this.performClusterLookup(null, (cluster) => {
      const trackData = cluster.trackData.get(this.internalTrack.id);
      if (!trackData) {
        return { blockIndex: -1, correctBlockFound: false };
      }
      const index = findLastIndex(trackData.presentationTimestamps, (x) => {
        const block = trackData.blocks[x.blockIndex];
        return block.isKeyFrame && x.timestamp <= timestampInTimescale;
      });
      const blockIndex = index !== -1 ? trackData.presentationTimestamps[index].blockIndex : -1;
      const correctBlockFound = index !== -1 && timestampInTimescale < trackData.endTimestamp;
      return { blockIndex, correctBlockFound };
    }, timestampInTimescale, timestampInTimescale, options);
  }
  async getNextKeyPacket(packet, options) {
    const locationInCluster = this.packetToClusterLocation.get(packet);
    if (locationInCluster === void 0) {
      throw new Error("Packet was not created from this track.");
    }
    return this.performClusterLookup(
      locationInCluster.cluster,
      (cluster) => {
        if (cluster === locationInCluster.cluster) {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          const nextKeyFrameIndex = trackData.blocks.findIndex((x, i) => x.isKeyFrame && i > locationInCluster.blockIndex);
          if (nextKeyFrameIndex !== -1) {
            return {
              blockIndex: nextKeyFrameIndex,
              correctBlockFound: true
            };
          }
        } else {
          const trackData = cluster.trackData.get(this.internalTrack.id);
          if (trackData && trackData.firstKeyFrameTimestamp !== null) {
            const keyFrameIndex = trackData.blocks.findIndex((x) => x.isKeyFrame);
            assert(keyFrameIndex !== -1);
            return {
              blockIndex: keyFrameIndex,
              correctBlockFound: true
            };
          }
        }
        return {
          blockIndex: -1,
          correctBlockFound: false
        };
      },
      -Infinity,
      // Use -Infinity as a search timestamp to avoid using the cues
      Infinity,
      options
    );
  }
  async fetchPacketInCluster(cluster, blockIndex, options) {
    if (blockIndex === -1) {
      return null;
    }
    const trackData = cluster.trackData.get(this.internalTrack.id);
    const block = trackData.blocks[blockIndex];
    assert(block);
    if (!block.decoded) {
      block.data = this.internalTrack.demuxer.decodeBlockData(this.internalTrack, block.data);
      block.decoded = true;
    }
    if (!block.postProcessed) {
      if (this.internalTrack.info?.codec === "prores") {
        const hasFrameContainer = block.data.length >= 8 && block.data[4] === 105 && block.data[5] === 99 && block.data[6] === 112 && block.data[7] === 102;
        if (!hasFrameContainer) {
          const newData = new Uint8Array(block.data.length + 8);
          const newDataView = toDataView(newData);
          newDataView.setUint32(0, newData.length, false);
          newData[4] = 105;
          newData[5] = 99;
          newData[6] = 112;
          newData[7] = 102;
          newData.set(block.data, 8);
          block.data = newData;
        }
      }
      block.postProcessed = true;
    }
    const data = options.metadataOnly ? PLACEHOLDER_DATA : block.data;
    const timestamp = block.timestamp / this.internalTrack.segment.timestampFactor;
    const duration = block.duration / this.internalTrack.segment.timestampFactor;
    const sideData = {};
    if (block.mainAdditional && this.internalTrack.info?.type === "video" && this.internalTrack.info.alphaMode) {
      sideData.alpha = options.metadataOnly ? PLACEHOLDER_DATA : block.mainAdditional;
      sideData.alphaByteLength = block.mainAdditional.byteLength;
    }
    const packet = new EncodedPacket(data, block.isKeyFrame ? "key" : "delta", timestamp, duration, cluster.dataStartPos + blockIndex, block.data.byteLength, sideData);
    this.packetToClusterLocation.set(packet, { cluster, blockIndex });
    return packet;
  }
  /** Looks for a packet in the clusters while trying to load as few clusters as possible to retrieve it. */
  async performClusterLookup(startCluster, getMatchInCluster, searchTimestamp, latestTimestamp, options) {
    const { demuxer, segment } = this.internalTrack;
    let currentCluster = null;
    let bestCluster = null;
    let bestBlockIndex = -1;
    if (startCluster) {
      const { blockIndex, correctBlockFound } = getMatchInCluster(startCluster);
      if (correctBlockFound) {
        return this.fetchPacketInCluster(startCluster, blockIndex, options);
      }
      if (blockIndex !== -1) {
        bestCluster = startCluster;
        bestBlockIndex = blockIndex;
      }
    }
    const cuePointIndex = binarySearchLessOrEqual(this.internalTrack.cuePoints, searchTimestamp, (x) => x.time);
    const cuePoint = cuePointIndex !== -1 ? this.internalTrack.cuePoints[cuePointIndex] : null;
    const positionCacheIndex = binarySearchLessOrEqual(this.internalTrack.clusterPositionCache, searchTimestamp, (x) => x.startTimestamp);
    const positionCacheEntry = positionCacheIndex !== -1 ? this.internalTrack.clusterPositionCache[positionCacheIndex] : null;
    const lookupEntryPosition = Math.max(cuePoint?.clusterPosition ?? 0, positionCacheEntry?.elementStartPos ?? 0) || null;
    let currentPos;
    if (!startCluster) {
      currentPos = lookupEntryPosition ?? segment.clusterSeekStartPos;
    } else {
      if (lookupEntryPosition === null || startCluster.elementStartPos >= lookupEntryPosition) {
        currentPos = startCluster.elementEndPos;
        currentCluster = startCluster;
      } else {
        currentPos = lookupEntryPosition;
      }
    }
    while (segment.elementEndPos === null || currentPos <= segment.elementEndPos - MIN_HEADER_SIZE) {
      if (currentCluster) {
        const trackData = currentCluster.trackData.get(this.internalTrack.id);
        if (trackData && trackData.startTimestamp > latestTimestamp) {
          break;
        }
      }
      let slice = demuxer.reader.requestSliceRange(currentPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
      if (isThenable(slice))
        slice = await slice;
      if (!slice)
        break;
      const elementStartPos = currentPos;
      const elementHeader = readElementHeader(slice);
      if (!elementHeader || !LEVEL_1_EBML_IDS.includes(elementHeader.id) && elementHeader.id !== EBMLId.Void) {
        const nextPos = await resync(demuxer.reader, elementStartPos, LEVEL_1_EBML_IDS, Math.min(segment.elementEndPos ?? Infinity, elementStartPos + MAX_RESYNC_LENGTH));
        if (nextPos) {
          currentPos = nextPos;
          continue;
        } else {
          break;
        }
      }
      const id = elementHeader.id;
      let size = elementHeader.size;
      const dataStartPos = slice.filePos;
      if (id === EBMLId.Cluster) {
        currentCluster = await demuxer.readCluster(elementStartPos, segment);
        size = currentCluster.elementEndPos - dataStartPos;
        const { blockIndex, correctBlockFound } = getMatchInCluster(currentCluster);
        if (correctBlockFound) {
          return this.fetchPacketInCluster(currentCluster, blockIndex, options);
        }
        if (blockIndex !== -1) {
          bestCluster = currentCluster;
          bestBlockIndex = blockIndex;
        }
      }
      if (size === void 0) {
        assert(id !== EBMLId.Cluster);
        const nextElementPos = await searchForNextElementId(demuxer.reader, dataStartPos, LEVEL_0_AND_1_EBML_IDS, segment.elementEndPos);
        size = nextElementPos.pos - dataStartPos;
      }
      const endPos = dataStartPos + size;
      if (segment.elementEndPos === null) {
        let slice2 = demuxer.reader.requestSliceRange(endPos, MIN_HEADER_SIZE, MAX_HEADER_SIZE);
        if (isThenable(slice2))
          slice2 = await slice2;
        if (!slice2)
          break;
        const elementId = readElementId(slice2);
        if (elementId === EBMLId.Segment) {
          segment.elementEndPos = endPos;
          break;
        }
      }
      currentPos = endPos;
    }
    if (cuePoint && (!bestCluster || bestCluster.elementStartPos < cuePoint.clusterPosition)) {
      const previousCuePoint = this.internalTrack.cuePoints[cuePointIndex - 1];
      assert(!previousCuePoint || previousCuePoint.time < cuePoint.time);
      const newSearchTimestamp = previousCuePoint?.time ?? -Infinity;
      return this.performClusterLookup(null, getMatchInCluster, newSearchTimestamp, latestTimestamp, options);
    }
    if (bestCluster) {
      return this.fetchPacketInCluster(bestCluster, bestBlockIndex, options);
    }
    return null;
  }
};
var MatroskaVideoTrackBacking = class extends MatroskaTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getType() {
    return "video";
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getCodedWidth() {
    return this.internalTrack.info.width;
  }
  getCodedHeight() {
    return this.internalTrack.info.height;
  }
  getSquarePixelWidth() {
    return this.internalTrack.info.squarePixelWidth;
  }
  getSquarePixelHeight() {
    return this.internalTrack.info.squarePixelHeight;
  }
  getRotation() {
    return this.internalTrack.info.rotation;
  }
  async getColorSpace() {
    return {
      primaries: this.internalTrack.info.colorSpace?.primaries,
      transfer: this.internalTrack.info.colorSpace?.transfer,
      matrix: this.internalTrack.info.colorSpace?.matrix,
      fullRange: this.internalTrack.info.colorSpace?.fullRange
    };
  }
  async canBeTransparent() {
    return this.internalTrack.info.alphaMode || this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      let firstPacket = null;
      const needsPacketForAdditionalInfo = this.internalTrack.info.codec === "vp9" || this.internalTrack.info.codec === "av1" || this.internalTrack.info.codec === "avc" && !this.internalTrack.info.codecDescription || this.internalTrack.info.codec === "hevc" && !this.internalTrack.info.codecDescription;
      if (needsPacketForAdditionalInfo) {
        firstPacket = await this.getFirstPacket({});
      }
      const config = {
        codec: extractVideoCodecString({
          width: this.internalTrack.info.width,
          height: this.internalTrack.info.height,
          codec: this.internalTrack.info.codec,
          codecDescription: this.internalTrack.info.codecDescription,
          colorSpace: this.internalTrack.info.colorSpace,
          avcType: 1,
          // We don't know better (or do we?) so just assume 'avc1'
          avcCodecInfo: this.internalTrack.info.codec === "avc" && firstPacket ? extractAvcDecoderConfigurationRecord(firstPacket.data) : null,
          hevcCodecInfo: this.internalTrack.info.codec === "hevc" && firstPacket ? extractHevcDecoderConfigurationRecord(firstPacket.data) : null,
          vp9CodecInfo: this.internalTrack.info.codec === "vp9" && firstPacket ? extractVp9CodecInfoFromPacket(firstPacket.data) : null,
          av1CodecInfo: this.internalTrack.info.codec === "av1" && firstPacket ? extractAv1CodecInfoFromPacket(firstPacket.data) : null,
          proresFormat: this.internalTrack.info.proresFormat
        }),
        codedWidth: this.internalTrack.info.width,
        codedHeight: this.internalTrack.info.height,
        description: this.internalTrack.info.codecDescription ?? void 0,
        colorSpace: this.internalTrack.info.colorSpace ?? void 0
      };
      if (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) {
        config.displayAspectWidth = this.internalTrack.info.squarePixelWidth;
        config.displayAspectHeight = this.internalTrack.info.squarePixelHeight;
      }
      return config;
    })();
  }
};
var MatroskaAudioTrackBacking = class extends MatroskaTrackBacking {
  constructor(internalTrack) {
    super(internalTrack);
    this.decoderConfigPromise = null;
    this.internalTrack = internalTrack;
  }
  getType() {
    return "audio";
  }
  getCodec() {
    return this.internalTrack.info.codec;
  }
  getNumberOfChannels() {
    return this.internalTrack.info.numberOfChannels;
  }
  getSampleRate() {
    return this.internalTrack.info.sampleRate;
  }
  async getDecoderConfig() {
    if (!this.internalTrack.info.codec) {
      return null;
    }
    return this.decoderConfigPromise ??= (async () => {
      if (this.internalTrack.info.codec === "dts" && !this.internalTrack.info.dtsFormat) {
        const firstPacket = await this.getFirstPacket({});
        this.internalTrack.info.dtsFormat = firstPacket && extractDtsFourCcFromPacket(firstPacket.data);
      }
      return {
        codec: extractAudioCodecString({
          codec: this.internalTrack.info.codec,
          codecDescription: this.internalTrack.info.codecDescription,
          aacCodecInfo: this.internalTrack.info.aacCodecInfo,
          dtsFormat: this.internalTrack.info.dtsFormat
        }),
        numberOfChannels: this.internalTrack.info.numberOfChannels,
        sampleRate: this.internalTrack.info.sampleRate,
        description: this.internalTrack.info.codecDescription ?? void 0
      };
    })();
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/source.js
polyfillSymbolDispose();
var DEFAULT_MIN_READ_POSITION = 0;
var DEFAULT_MAX_READ_POSITION = Infinity;
var sourceFinalizationRegistry = null;
if (typeof FinalizationRegistry !== "undefined") {
  sourceFinalizationRegistry = new FinalizationRegistry((cleanup) => {
    cleanup();
  });
}
var Source = class extends EventEmitter {
  constructor() {
    super();
    this._disposed = false;
    this._refCount = 0;
    this._usedForHls = false;
    this._refFinalizationRegistry = null;
    this._sizePromise = null;
    this.onread = null;
    if (typeof FinalizationRegistry !== "undefined") {
      this._refFinalizationRegistry = new FinalizationRegistry((source) => {
        source._decrementRefCount();
      });
    }
  }
  /**
   * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
   * will retrieve the size.
   *
   * Returns null if the source is unsized.
   */
  async getSizeOrNull() {
    if (this._disposed) {
      throw new InputDisposedError();
    }
    return this._sizePromise ??= (async () => {
      let size = this._getFileSize();
      if (size !== void 0) {
        return size;
      }
      await this._read(0, 1, DEFAULT_MIN_READ_POSITION, DEFAULT_MAX_READ_POSITION);
      size = this._getFileSize();
      assert(size !== void 0);
      return size;
    })();
  }
  /**
   * Resolves with the total size of the file in bytes. This function is memoized, meaning only the first call
   * will retrieve the size.
   *
   * Throws an error if the source is unsized.
   */
  async getSize() {
    if (this._disposed) {
      throw new InputDisposedError();
    }
    const result = await this.getSizeOrNull();
    if (result === null) {
      throw new Error("Cannot determine the size of an unsized source.");
    }
    return result;
  }
  /**
   * Returns a new {@link RangedSource} that maps data onto this source using the given offset and length. If a length
   * is not provided, the ranged source spans until the end of this source's data.
   *
   * Useful for reading files that are embedded within larger files.
   */
  slice(offset, length) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new TypeError("offset must be a non-negative integer.");
    }
    if (length !== void 0 && (!Number.isInteger(length) || length < 0)) {
      throw new TypeError("length, when provided, must be a non-negative integer.");
    }
    return new RangedSource(this, offset, length);
  }
  /** @internal */
  _dispatchRead(start, end) {
    this.onread?.(start, end);
    this._emit("read", { start, end });
  }
  /**
   * Creates a new `SourceRef` pointing to this source. You are expected to call `.free()` on said `SourceRef` when
   * you're done with it.
   */
  ref() {
    return new SourceRef(this);
  }
  /** @internal */
  _incrementRefCount() {
    this._refCount++;
  }
  /** @internal */
  _decrementRefCount() {
    this._refCount--;
    if (this._refCount === 0) {
      this._dispose();
      this._disposed = true;
    }
  }
};
var SourceRef = class {
  /** @internal */
  constructor(source) {
    this._freed = false;
    if (source._disposed) {
      throw new Error("Cannot ref a disposed source.");
    }
    source._incrementRefCount();
    source._refFinalizationRegistry?.register(this, source, this);
    this._source = source;
  }
  /** The {@link Source} this ref references. Accessing this field throws an error after having freed the ref. */
  get source() {
    if (!this._source) {
      throw new Error("Can't get source; ref has already been freed.");
    }
    return this._source;
  }
  /** Whether or not this reference has been freed via {@link SourceRef.free}. */
  get freed() {
    return this._freed;
  }
  /**
   * Frees the ref, decrementing the source's internal reference count. If the source's internal reference count
   * reaches zero, it gets disposed. To catch bugs, this method throws if the ref is already freed.
   */
  free() {
    if (this._freed) {
      throw new Error("Illegal operation: double free on SourceRef.");
    }
    const source = this.source;
    assert(source._refCount > 0);
    source._decrementRefCount();
    source._refFinalizationRegistry?.unregister(this);
    this._freed = true;
    this._source = null;
  }
  /**
   * Calls {@link SourceRef.free}.
   */
  [Symbol.dispose]() {
    if (!this.freed) {
      this.free();
    }
  }
};
var PathedSource = class extends Source {
  constructor(rootPath, requestHandler) {
    if (typeof rootPath !== "string") {
      throw new TypeError("rootPath must be a string.");
    }
    if (typeof requestHandler !== "function") {
      throw new TypeError("requestHandler must be a function.");
    }
    super();
    this.rootPath = rootPath;
    this.requestHandler = requestHandler;
  }
  /** @internal */
  _resolveRequest(request) {
    const result = this.requestHandler(request);
    const handle = (result2) => {
      if (!(result2 instanceof Source || result2 instanceof SourceRef)) {
        throw new TypeError("requestHandler must return or resolve to a Source or SourceRef.");
      }
      const ref = result2 instanceof Source ? result2.ref() : result2;
      ref.source._usedForHls ||= this._usedForHls;
      return ref;
    };
    if (isThenable(result)) {
      return result.then(handle);
    } else {
      return handle(result);
    }
  }
};
var sourceRequestsAreEqual = (a, b) => {
  return a.path === b.path;
};
var BufferSource = class extends Source {
  /**
   * Creates a new {@link BufferSource} backed by the specified `ArrayBuffer`, `SharedArrayBuffer`,
   * or `ArrayBufferView`.
   */
  constructor(buffer) {
    if (!(buffer instanceof ArrayBuffer) && !(typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) && !ArrayBuffer.isView(buffer)) {
      throw new TypeError("buffer must be an ArrayBuffer, SharedArrayBuffer, or ArrayBufferView.");
    }
    super();
    this._onreadCalled = false;
    this._bytes = toUint8Array(buffer);
    this._view = toDataView(buffer);
  }
  /** @internal */
  _getFileSize() {
    return this._bytes.byteLength;
  }
  /** @internal */
  _read() {
    if (!this._onreadCalled) {
      this._dispatchRead(0, this._bytes.byteLength);
      this._onreadCalled = true;
    }
    return {
      bytes: this._bytes,
      view: this._view,
      offset: 0
    };
  }
  /** @internal */
  _dispose() {
  }
};
var URL_SOURCE_MIN_LOAD_AMOUNT = 0.5 * 2 ** 20;
var RangedSource = class extends Source {
  /** @internal */
  constructor(baseSource, offset, length) {
    super();
    this._ref = null;
    if (baseSource._disposed) {
      throw new Error("Cannot create a slice of a disposed source.");
    }
    this._baseSource = baseSource;
    this._offset = offset;
    this._length = length ?? null;
  }
  /** @internal */
  _getFileSize() {
    const baseSize = this._baseSource._getFileSize();
    if (baseSize === void 0) {
      return this._length !== null ? this._length : void 0;
    }
    if (baseSize === null) {
      if (this._length !== null) {
        return this._length;
      } else {
        return null;
      }
    }
    return clamp(baseSize - this._offset, 0, this._length ?? Infinity);
  }
  /** @internal */
  _read(start, end, minReadPosition, maxReadPosition) {
    if (this._length !== null && end > this._length) {
      return null;
    }
    const result = this._baseSource._read(this._offset + start, this._offset + end, this._offset + minReadPosition, this._offset + maxReadPosition);
    const processResult = (result2) => {
      if (!result2) {
        return null;
      }
      result2.offset -= this._offset;
      return result2;
    };
    if (isThenable(result)) {
      return result.then(processResult);
    } else {
      return processResult(result);
    }
  }
  /** @internal */
  _dispose() {
    this._ref?.free();
  }
  ref() {
    this._ref ??= this._baseSource.ref();
    return super.ref();
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/input-format.js
var InputFormat = class {
  constructor() {
    this._isIsobmff = false;
  }
};
var IsobmffInputFormat = class extends InputFormat {
  constructor() {
    super(...arguments);
    this._isIsobmff = true;
  }
  /** @internal */
  async _getMajorBrand(input) {
    let slice = input._reader.requestSlice(0, 12);
    if (isThenable(slice))
      slice = await slice;
    if (!slice)
      return null;
    slice.skip(4);
    const fourCc = readAscii(slice, 4);
    if (fourCc !== "ftyp" && fourCc !== "styp") {
      return null;
    }
    return readAscii(slice, 4);
  }
  /** @internal */
  _createDemuxer(input) {
    return new IsobmffDemuxer(input);
  }
};
var Mp4InputFormat = class extends IsobmffInputFormat {
  /** @internal */
  async _canReadInput(input) {
    const majorBrand = await this._getMajorBrand(input);
    if (majorBrand !== null) {
      return majorBrand !== "qt  ";
    }
    let pos = 0;
    for (let iter = 0; iter < 10; iter++) {
      let slice = input._reader.requestSlice(pos, 8);
      if (isThenable(slice))
        slice = await slice;
      if (!slice)
        return false;
      let size = readU32Be(slice);
      let headerSize = 8;
      if (size === 1) {
        let sizeExtensionSlice = input._reader.requestSlice(pos + 8, 8);
        if (isThenable(sizeExtensionSlice))
          sizeExtensionSlice = await sizeExtensionSlice;
        if (!sizeExtensionSlice)
          return false;
        size = readU64Be(sizeExtensionSlice);
        headerSize = 16;
      }
      if (size < headerSize) {
        return false;
      }
      const fourCc = readAscii(slice, 4);
      if (fourCc === "moof" || fourCc === "sidx") {
        return true;
      } else if (fourCc === "emsg" || fourCc === "prft" || fourCc === "free") {
        pos += size;
      } else {
        return false;
      }
    }
    return false;
  }
  get name() {
    return "MP4";
  }
  get mimeType() {
    return "video/mp4";
  }
};
var QuickTimeInputFormat = class extends IsobmffInputFormat {
  /** @internal */
  async _canReadInput(input) {
    const majorBrand = await this._getMajorBrand(input);
    return majorBrand === "qt  ";
  }
  get name() {
    return "QuickTime File Format";
  }
  get mimeType() {
    return "video/quicktime";
  }
};
var MatroskaInputFormat = class extends InputFormat {
  /** @internal */
  async isSupportedEBMLOfDocType(input, desiredDocType) {
    let headerSlice = input._reader.requestSlice(0, MAX_HEADER_SIZE);
    if (isThenable(headerSlice))
      headerSlice = await headerSlice;
    if (!headerSlice)
      return false;
    const varIntSize = readVarIntSize(headerSlice);
    if (varIntSize === null) {
      return false;
    }
    if (varIntSize < 1 || varIntSize > 8) {
      return false;
    }
    const id = readUnsignedInt(headerSlice, varIntSize);
    if (id !== EBMLId.EBML) {
      return false;
    }
    const dataSize = readElementSize(headerSlice);
    if (typeof dataSize !== "number") {
      return false;
    }
    let dataSlice = input._reader.requestSlice(headerSlice.filePos, dataSize);
    if (isThenable(dataSlice))
      dataSlice = await dataSlice;
    if (!dataSlice)
      return false;
    const startPos = headerSlice.filePos;
    while (dataSlice.filePos <= startPos + dataSize - MIN_HEADER_SIZE) {
      const header = readElementHeader(dataSlice);
      if (!header)
        break;
      const { id: id2, size } = header;
      const dataStartPos = dataSlice.filePos;
      if (size === void 0)
        return false;
      switch (id2) {
        case EBMLId.EBMLVersion:
          {
            const ebmlVersion = readUnsignedInt(dataSlice, size);
            if (ebmlVersion !== 1) {
              return false;
            }
          }
          ;
          break;
        case EBMLId.EBMLReadVersion:
          {
            const ebmlReadVersion = readUnsignedInt(dataSlice, size);
            if (ebmlReadVersion !== 1) {
              return false;
            }
          }
          ;
          break;
        case EBMLId.DocType:
          {
            const docType = readAsciiString(dataSlice, size);
            if (docType !== desiredDocType) {
              return false;
            }
          }
          ;
          break;
        case EBMLId.DocTypeVersion:
          {
            const docTypeVersion = readUnsignedInt(dataSlice, size);
            if (docTypeVersion > 4) {
              return false;
            }
          }
          ;
          break;
      }
      dataSlice.filePos = dataStartPos + size;
    }
    return true;
  }
  /** @internal */
  _canReadInput(input) {
    return this.isSupportedEBMLOfDocType(input, "matroska");
  }
  /** @internal */
  _createDemuxer(input) {
    return new MatroskaDemuxer(input);
  }
  get name() {
    return "Matroska";
  }
  get mimeType() {
    return "video/x-matroska";
  }
};
var WebMInputFormat = class extends MatroskaInputFormat {
  /** @internal */
  _canReadInput(input) {
    return this.isSupportedEBMLOfDocType(input, "webm");
  }
  get name() {
    return "WebM";
  }
  get mimeType() {
    return "video/webm";
  }
};
var MP4 = /* @__PURE__ */ new Mp4InputFormat();
var QTFF = /* @__PURE__ */ new QuickTimeInputFormat();
var WEBM = /* @__PURE__ */ new WebMInputFormat();
var validateInputFormatOptions = (options, prefix) => {
  if (!options || typeof options !== "object") {
    throw new TypeError(`${prefix}, when provided, must be an object.`);
  }
  if (options.isobmff !== void 0) {
    if (!options.isobmff || typeof options.isobmff !== "object") {
      throw new TypeError(`${prefix}.isobmff, when provided, must be an object.`);
    }
    if (options.isobmff.resolveKeyId !== void 0 && typeof options.isobmff.resolveKeyId !== "function") {
      throw new TypeError(`${prefix}.isobmff.resolveKeyId, when provided, must be a function.`);
    }
  }
  if (options.hls !== void 0) {
    if (!options.hls || typeof options.hls !== "object") {
      throw new TypeError(`${prefix}.hls, when provided, must be an object.`);
    }
    if (options.hls.offsetTimestampsByDateTime !== void 0 && typeof options.hls.offsetTimestampsByDateTime !== "boolean") {
      throw new TypeError(`${prefix}.hls.offsetTimestampsByDateTime, when provided, must be a boolean.`);
    }
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/custom-coder.js
var customVideoDecoders = [];
var customAudioDecoders = [];

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/media-sink.js
var validatePacketRetrievalOptions = (options) => {
  if (!options || typeof options !== "object") {
    throw new TypeError("options must be an object.");
  }
  if (options.metadataOnly !== void 0 && typeof options.metadataOnly !== "boolean") {
    throw new TypeError("options.metadataOnly, when defined, must be a boolean.");
  }
  if (options.verifyKeyPackets !== void 0 && typeof options.verifyKeyPackets !== "boolean") {
    throw new TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
  }
  if (options.verifyKeyPackets && options.metadataOnly) {
    throw new TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
  }
  if (options.skipLiveWait !== void 0 && typeof options.skipLiveWait !== "boolean") {
    throw new TypeError("options.skipLiveWait, when defined, must be a boolean.");
  }
};
var validateTimestamp = (timestamp) => {
  if (!isNumber(timestamp)) {
    throw new TypeError("timestamp must be a number.");
  }
};
var maybeFixPacketType = (track, promise, options) => {
  if (options.verifyKeyPackets) {
    return promise.then(async (packet) => {
      if (!packet || packet.type === "delta") {
        return packet;
      }
      const determinedType = await track.determinePacketType(packet);
      if (determinedType) {
        packet.type = determinedType;
      }
      return packet;
    });
  } else {
    return promise;
  }
};
var EncodedPacketSink = class {
  /** Creates a new {@link EncodedPacketSink} for the given {@link InputTrack}. */
  constructor(track) {
    if (!(track instanceof InputTrack)) {
      throw new TypeError("track must be an InputTrack.");
    }
    this._track = track;
  }
  /**
   * Retrieves the track's first packet (in decode order), or null if it has no packets. The first packet is very
   * likely to be a key packet, but it doesn't have to be.
   */
  async getFirstPacket(options = {}) {
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getFirstPacket(options), options);
  }
  /** Retrieves the track's first key packet (in decode order), or null if it has no key packets. */
  async getFirstKeyPacket(options = {}) {
    validatePacketRetrievalOptions(options);
    const firstPacket = await this.getFirstPacket(options);
    if (!firstPacket) {
      return null;
    }
    if (firstPacket.type === "key") {
      return firstPacket;
    }
    return this.getNextKeyPacket(firstPacket, options);
  }
  /**
   * Retrieves the packet corresponding to the given timestamp, in seconds. More specifically, returns the last packet
   * (in presentation order) with a start timestamp less than or equal to the given timestamp. This method can be
   * used to retrieve a track's last packet using `getPacket(Infinity)`. The method returns null if the timestamp
   * is before the first packet in the track.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getPacket(timestamp, options = {}) {
    validateTimestamp(timestamp);
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getPacket(timestamp, options), options);
  }
  /**
   * Retrieves the packet following the given packet (in decode order), or null if the given packet is the
   * last packet.
   */
  async getNextPacket(packet, options = {}) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    return maybeFixPacketType(this._track, this._track._backing.getNextPacket(packet, options), options);
  }
  /**
   * Retrieves the key packet corresponding to the given timestamp, in seconds. More specifically, returns the last
   * key packet (in presentation order) with a start timestamp less than or equal to the given timestamp. A key packet
   * is a packet that doesn't require previous packets to be decoded. This method can be used to retrieve a track's
   * last key packet using `getKeyPacket(Infinity)`. The method returns null if the timestamp is before the first
   * key packet in the track.
   *
   * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
   *
   * @param timestamp - The timestamp used for retrieval, in seconds.
   */
  async getKeyPacket(timestamp, options = {}) {
    validateTimestamp(timestamp);
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    if (!options.verifyKeyPackets) {
      return this._track._backing.getKeyPacket(timestamp, options);
    }
    const packet = await this._track._backing.getKeyPacket(timestamp, options);
    if (!packet) {
      return packet;
    }
    assert(packet.type === "key");
    const determinedType = await this._track.determinePacketType(packet);
    if (determinedType === "delta") {
      return this.getKeyPacket(packet.timestamp - 1 / await this._track.getTimeResolution(), options);
    }
    return packet;
  }
  /**
   * Retrieves the key packet following the given packet (in decode order), or null if the given packet is the last
   * key packet.
   *
   * To ensure that the returned packet is guaranteed to be a real key frame, enable `options.verifyKeyPackets`.
   */
  async getNextKeyPacket(packet, options = {}) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    if (!options.verifyKeyPackets) {
      return this._track._backing.getNextKeyPacket(packet, options);
    }
    const nextPacket = await this._track._backing.getNextKeyPacket(packet, options);
    if (!nextPacket) {
      return nextPacket;
    }
    assert(nextPacket.type === "key");
    const determinedType = await this._track.determinePacketType(nextPacket);
    if (determinedType === "delta") {
      return this.getNextKeyPacket(nextPacket, options);
    }
    return nextPacket;
  }
  /**
   * Creates an async iterator that yields the packets in this track in decode order. To enable fast iteration, this
   * method will intelligently preload packets based on the speed of the consumer.
   *
   * @param startPacket - (optional) The packet from which iteration should begin. This packet will also be yielded.
   * @param endPacket - (optional) The packet at which iteration should end. This packet will _not_ be yielded.
   */
  packets(startPacket, endPacket, options = {}) {
    if (startPacket !== void 0 && !(startPacket instanceof EncodedPacket)) {
      throw new TypeError("startPacket must be an EncodedPacket.");
    }
    if (startPacket !== void 0 && startPacket.isMetadataOnly && !options?.metadataOnly) {
      throw new TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
    }
    if (endPacket !== void 0 && !(endPacket instanceof EncodedPacket)) {
      throw new TypeError("endPacket must be an EncodedPacket.");
    }
    validatePacketRetrievalOptions(options);
    if (this._track.input._disposed) {
      throw new InputDisposedError();
    }
    const packetQueue = [];
    let { promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers();
    let { promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers();
    let ended = false;
    let terminated = false;
    let outOfBandError = null;
    let hasOutOfBandError = false;
    const timestamps = [];
    const maxQueueSize = () => Math.max(2, timestamps.length);
    (async () => {
      let packet = startPacket ?? await this.getFirstPacket(options);
      while (packet && !terminated && !this._track.input._disposed) {
        if (endPacket && packet.sequenceNumber >= endPacket?.sequenceNumber) {
          break;
        }
        if (packetQueue.length > maxQueueSize()) {
          ({ promise: queueDequeue, resolve: onQueueDequeue } = promiseWithResolvers());
          await queueDequeue;
          continue;
        }
        packetQueue.push(packet);
        onQueueNotEmpty();
        ({ promise: queueNotEmpty, resolve: onQueueNotEmpty } = promiseWithResolvers());
        packet = await this.getNextPacket(packet, options);
      }
      ended = true;
      onQueueNotEmpty();
    })().catch((error) => {
      if (!hasOutOfBandError) {
        outOfBandError = error;
        hasOutOfBandError = true;
        onQueueNotEmpty();
      }
    });
    const track = this._track;
    return {
      async next() {
        while (true) {
          if (track.input._disposed) {
            throw new InputDisposedError();
          } else if (terminated) {
            return { value: void 0, done: true };
          } else if (hasOutOfBandError) {
            throw outOfBandError;
          } else if (packetQueue.length > 0) {
            const value = packetQueue.shift();
            const now = performance.now();
            timestamps.push(now);
            while (timestamps.length > 0 && now - timestamps[0] >= 1e3) {
              timestamps.shift();
            }
            onQueueDequeue();
            return { value, done: false };
          } else if (ended) {
            return { value: void 0, done: true };
          } else {
            await queueNotEmpty;
          }
        }
      },
      async return() {
        terminated = true;
        onQueueDequeue();
        onQueueNotEmpty();
        return { value: void 0, done: true };
      },
      async throw(error) {
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/input-track.js
var InputTrack = class _InputTrack {
  /** @internal */
  constructor(input, backing) {
    this.input = input;
    this._backing = backing;
  }
  /** Returns true if and only if this track is a video track. */
  isVideoTrack() {
    return this instanceof InputVideoTrack;
  }
  /** Returns true if and only if this track is an audio track. */
  isAudioTrack() {
    return this instanceof InputAudioTrack;
  }
  /** The unique ID of this track in the input file. */
  get id() {
    return this._backing.getId();
  }
  /**
   * The 1-based index of this track among all tracks of the same type in the input file. For example, the first
   * video track has number 1, the second video track has number 2, and so on. The index refers to the order in
   * which the tracks are returned by {@link Input.getTracks}.
   */
  get number() {
    return this._backing.getNumber();
  }
  /**
   * Returns the identifier of the codec used internally by the container. It is not homogenized by Mediabunny
   * and depends entirely on the container format.
   *
   * This method can be used to determine the codec of a track in case Mediabunny doesn't know that codec.
   *
   * - For ISOBMFF files, this resolves to the name of the Sample Description Box (e.g. `'avc1'`).
   * - For Matroska files, this resolves to the value of the `CodecID` element.
   * - For WAVE files, this resolves to the value of the format tag in the `'fmt '` chunk.
   * - For ADTS files, this resolves to the `MPEG-4 Audio Object Type`.
   * - For MPEG-TS files, this resolves to the `streamType` value from the Program Map Table.
   * - In all other cases, this resolves to `null`.
   */
  async getInternalCodecId() {
    return this._backing.getInternalCodecId();
  }
  /**
   * See {@link InputTrack.getInternalCodecId}.
   * @deprecated Use {@link InputTrack.getInternalCodecId} instead.
   */
  get internalCodecId() {
    return requireSync(this._backing.getInternalCodecId(), "internalCodecId", "getInternalCodecId");
  }
  /**
   * Returns the ISO 639-2/T language code for this track. If the language is unknown, this resolves to `'und'`
   * (undetermined).
   */
  async getLanguageCode() {
    return this._backing.getLanguageCode();
  }
  /**
   * The ISO 639-2/T language code for this track. If the language is unknown, this field is `'und'` (undetermined).
   * @deprecated Use {@link InputTrack.getLanguageCode} instead.
   */
  get languageCode() {
    return requireSync(this._backing.getLanguageCode(), "languageCode", "getLanguageCode");
  }
  /** Returns the user-defined name for this track. */
  async getName() {
    return this._backing.getName();
  }
  /**
   * A user-defined name for this track.
   * @deprecated Use {@link InputTrack.getName} instead.
   */
  get name() {
    return requireSync(this._backing.getName(), "name", "getName");
  }
  /**
   * Returns a positive number x such that all timestamps and durations of all packets of this track are
   * integer multiples of 1/x.
   */
  async getTimeResolution() {
    return this._backing.getTimeResolution();
  }
  /**
   * A positive number x such that all timestamps and durations of all packets of this track are
   * integer multiples of 1/x.
   * @deprecated Use {@link InputTrack.getTimeResolution} instead.
   */
  get timeResolution() {
    return requireSync(this._backing.getTimeResolution(), "timeResolution", "getTimeResolution");
  }
  /**
   * Returns whether the timestamps of this track are relative to the Unix epoch (January 1, 1970 00:00:00 UTC).
   * When `true`, each timestamp maps to a definitive point in time.
   */
  async isRelativeToUnixEpoch() {
    return this._backing.isRelativeToUnixEpoch();
  }
  /**
   * Returns the Unix time (in seconds since January 1, 1970 00:00:00 UTC) that the given track timestamp (in seconds)
   * maps to, or `null` if there is no such mapping. This provides a piecewise-continuous mapping from this track's
   * timestamp space into wall-clock time. Such mapping exists, for example, for HLS playlists with
   * `#EXT-X-PROGRAM-DATE-TIME` tags present.
   *
   * This mapping can be available even when {@link InputTrack.isRelativeToUnixEpoch} is `false`, for example for HLS
   * streams with program date time information but with {@link HlsInputFormatOptions.offsetTimestampsByDateTime}
   * set to `false`.
   */
  async getUnixTimeForTimestamp(timestamp) {
    return this._backing.getUnixTimeForTimestamp(timestamp);
  }
  /**
   * Whether the track's timestamps can be mapped to Unix wall clock time via
   * {@link InputTrack.getUnixTimeForTimestamp}.
   */
  async hasUnixTimeMapping() {
    return await this._backing.getUnixTimeForTimestamp(await this.getFirstTimestamp()) !== null;
  }
  /** Returns the track's disposition, i.e. information about its intended usage. */
  async getDisposition() {
    return this._backing.getDisposition();
  }
  /**
   * The track's disposition, i.e. information about its intended usage.
   * @deprecated Use {@link InputTrack.getDisposition} instead.
   */
  get disposition() {
    return requireSync(this._backing.getDisposition(), "disposition", "getDisposition");
  }
  /**
   * Returns the peak bitrate of the track in bits per second, as specified in the track's metadata. This might not
   * match the actual media data's bitrate.
   */
  async getBitrate() {
    return this._backing.getBitrate();
  }
  /**
   * Returns the average bitrate of the track in bits per second, as specified in the track's metadata. This might
   * not match the actual media data's bitrate.
   */
  async getAverageBitrate() {
    return this._backing.getAverageBitrate();
  }
  /**
   * Returns the start timestamp of the first packet of this track, in seconds. While often near zero, this value
   * may be positive or even negative. A negative starting timestamp means the track's timing has been offset. Samples
   * with a negative timestamp should not be presented.
   */
  async getFirstTimestamp() {
    const firstPacket = await this._backing.getFirstPacket({ metadataOnly: true });
    return firstPacket?.timestamp ?? 0;
  }
  /**
   * Returns the end timestamp of the last packet of this track, in seconds.
   *
   * By default, when the underlying media is live, this method will only resolve once the live stream ends. If you
   * want to query the current end timestamp of the stream, set {@link PacketRetrievalOptions.skipLiveWait} to `true`
   * in the options.
   */
  async computeDuration(options) {
    const lastPacket = await this._backing.getPacket(Infinity, { metadataOnly: true, ...options });
    const result = (lastPacket?.timestamp ?? 0) + (lastPacket?.duration ?? 0);
    return roundToDivisor(result, await this.getTimeResolution());
  }
  /**
   * Gets the duration (end timestamp) in seconds of this track from metadata stored in the file. This value may be
   * approximate or diverge from the actual, precise duration returned by `.computeDuration()`, but compared to that
   * method, this method is cheaper. When the duration cannot be determined from the file metadata, `null`
   * is returned.
   *
   * By default, when the underlying media is live, this method will only resolve once the live stream
   * ends. If you want to query the current duration of the media, set
   * {@link DurationMetadataRequestOptions.skipLiveWait} to `true` in the options.
   */
  async getDurationFromMetadata(options = {}) {
    return this._backing.getDurationFromMetadata(options);
  }
  /**
   * Computes aggregate packet statistics for this track, such as average packet rate or bitrate.
   *
   * @param targetPacketCount - This optional parameter sets a target for how many packets this method must have
   * looked at before it can return early; this means, you can use it to aggregate only a subset (prefix) of all
   * packets. This is very useful for getting a great estimate of video frame rate without having to scan through the
   * entire file.
   *
   * By default, when the underlying media is live and `targetPacketCount` is not set, this method will only resolve
   * once the live stream ends. If you want to query the current packet statistics of the stream, set
   * {@link PacketRetrievalOptions.skipLiveWait} to `true` in the options.
   */
  async computePacketStats(targetPacketCount = Infinity, options) {
    const sink = new EncodedPacketSink(this);
    let startTimestamp = Infinity;
    let endTimestamp = -Infinity;
    let packetCount = 0;
    let totalPacketBytes = 0;
    for await (const packet of sink.packets(void 0, void 0, { metadataOnly: true, ...options })) {
      if (packetCount >= targetPacketCount && packet.timestamp >= endTimestamp) {
        break;
      }
      startTimestamp = Math.min(startTimestamp, packet.timestamp);
      endTimestamp = Math.max(endTimestamp, packet.timestamp + packet.duration);
      packetCount++;
      totalPacketBytes += packet.byteLength;
    }
    return {
      packetCount,
      averagePacketRate: packetCount ? Number((packetCount / (endTimestamp - startTimestamp)).toPrecision(16)) : 0,
      averageBitrate: packetCount ? Number((8 * totalPacketBytes / (endTimestamp - startTimestamp)).toPrecision(16)) : 0
    };
  }
  /**
   * Whether or not this track is currently live, meaning the media's end is still unknown.
   *
   * The value returned by this method may change over time as the track stops being live. To keep track of the
   * track's live status, poll this method at the track's refresh interval
   * via {@link InputTrack.getLiveRefreshInterval}.
   */
  async isLive() {
    return await this._backing.getLiveRefreshInterval() !== null;
  }
  /**
   * Returns the track's live refresh interval in seconds, or `null` if the track is not live. This interval describes
   * the time it takes, on average, for new live media data to become available.
   */
  async getLiveRefreshInterval() {
    return this._backing.getLiveRefreshInterval();
  }
  /**
   * Returns `true` if this track can be paired with the given track. Two tracks being pairable means they can be
   * presented (displayed) together.
   *
   * Returns `false` if `other` equals `this`.
   */
  canBePairedWith(other) {
    if (!(other instanceof _InputTrack)) {
      throw new TypeError("other must be an InputTrack.");
    }
    if (this.input !== other.input || this === other) {
      return false;
    }
    return (this._backing.getPairingMask() & other._backing.getPairingMask()) !== 0n;
  }
  /**
   * Gets the list of other tracks that can be paired with this track. An optional query can be provided to narrow
   * down the results.
   */
  async getPairableTracks(query) {
    return this.input.getTracks(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /**
   * Gets the list of other video tracks that can be paired with this track. An optional query can be provided to
   * narrow down the results.
   */
  async getPairableVideoTracks(query) {
    return this.input.getVideoTracks(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /**
   * Gets the list of other audio tracks that can be paired with this track. An optional query can be provided to
   * narrow down the results.
   */
  async getPairableAudioTracks(query) {
    return this.input.getAudioTracks(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /** Returns the primary track that can be paired with this track, optionally steered by the provided query. */
  async getPrimaryPairableVideoTrack(query) {
    return this.input.getPrimaryVideoTrack(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /** Returns the primary track that can be paired with this track, optionally steered by the provided query. */
  async getPrimaryPairableAudioTrack(query) {
    return this.input.getPrimaryAudioTrack(mergeInputTrackQueries({
      filter: (t) => t.canBePairedWith(this)
    }, query));
  }
  /** Returns `true` if there is another track that can be paired with this track. */
  async hasPairableTrack(predicate) {
    predicate &&= toValidatedPredicate(predicate);
    const tracks = await this.input.getTracks();
    for (const track of tracks) {
      if (!this.canBePairedWith(track)) {
        continue;
      }
      if (!predicate || await predicate(track)) {
        return true;
      }
    }
    return false;
  }
  /** Returns `true` if there is a video track that can be paired with this track. */
  hasPairableVideoTrack(predicate) {
    predicate &&= toValidatedPredicate(predicate);
    return this.hasPairableTrack(async (x) => x.isVideoTrack() && (!predicate || await predicate(x)));
  }
  /** Returns `true` if there is an audio track that can be paired with this track. */
  hasPairableAudioTrack(predicate) {
    predicate &&= toValidatedPredicate(predicate);
    return this.hasPairableTrack(async (x) => x.isAudioTrack() && (!predicate || await predicate(x)));
  }
};
var requireSync = (value, getterName, asyncName) => {
  if (isThenable(value)) {
    throw new Error(`'${getterName}' is deprecated and not available synchronously for this track. Use the preferred '${asyncName}()' instead.`);
  }
  return value;
};
var toValidatedPredicate = (predicate) => {
  if (predicate !== void 0 && typeof predicate !== "function") {
    throw new TypeError("predicate, when provided, must be a function.");
  }
  return predicate ? (track) => {
    const handle = (result2) => {
      if (typeof result2 !== "boolean") {
        throw new TypeError("predicate must return or resolve to a boolean value.");
      }
      return result2;
    };
    const result = predicate(track);
    if (isThenable(result)) {
      return result.then(handle);
    }
    return handle(result);
  } : void 0;
};
var InputVideoTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._pixelAspectRatioCache = null;
    this._backing = backing;
  }
  get type() {
    return "video";
  }
  /** The codec of the track's packets. */
  async getCodec() {
    return this._backing.getCodec();
  }
  /**
   * The codec of the track's packets.
   * @deprecated Use {@link InputVideoTrack.getCodec} instead.
   */
  get codec() {
    return requireSync(this._backing.getCodec(), "codec", "getCodec");
  }
  async hasOnlyKeyPackets() {
    return await this._backing.getHasOnlyKeyPackets?.() ?? await this._backing.getCodec() === "prores";
  }
  /** Returns the width in pixels of the track's coded samples, before any transformations or rotations. */
  async getCodedWidth() {
    return this._backing.getCodedWidth();
  }
  /**
   * The width in pixels of the track's coded samples, before any transformations or rotations.
   * @deprecated Use {@link InputVideoTrack.getCodedWidth} instead.
   */
  get codedWidth() {
    return requireSync(this._backing.getCodedWidth(), "codedWidth", "getCodedWidth");
  }
  /** Returns the height in pixels of the track's coded samples, before any transformations or rotations. */
  async getCodedHeight() {
    return this._backing.getCodedHeight();
  }
  /**
   * The height in pixels of the track's coded samples, before any transformations or rotations.
   * @deprecated Use {@link InputVideoTrack.getCodedHeight} instead.
   */
  get codedHeight() {
    return requireSync(this._backing.getCodedHeight(), "codedHeight", "getCodedHeight");
  }
  /** Returns the angle in degrees by which the track's frames should be rotated (clockwise). */
  async getRotation() {
    return this._backing.getRotation();
  }
  /**
   * The angle in degrees by which the track's frames should be rotated (clockwise).
   * @deprecated Use {@link InputVideoTrack.getRotation} instead.
   */
  get rotation() {
    return requireSync(this._backing.getRotation(), "rotation", "getRotation");
  }
  /**
   * Returns the width of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   */
  async getSquarePixelWidth() {
    return this._backing.getSquarePixelWidth();
  }
  /**
   * The width of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   * @deprecated Use {@link InputVideoTrack.getSquarePixelWidth} instead.
   */
  get squarePixelWidth() {
    return requireSync(this._backing.getSquarePixelWidth(), "squarePixelWidth", "getSquarePixelWidth");
  }
  /**
   * Returns the height of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   */
  async getSquarePixelHeight() {
    return this._backing.getSquarePixelHeight();
  }
  /**
   * The height of the track's frames in square pixels, adjusted for pixel aspect ratio but before rotation.
   * @deprecated Use {@link InputVideoTrack.getSquarePixelHeight} instead.
   */
  get squarePixelHeight() {
    return requireSync(this._backing.getSquarePixelHeight(), "squarePixelHeight", "getSquarePixelHeight");
  }
  /**
   * Returns the pixel aspect ratio of the track's frames as a rational number in its reduced form. Most videos use
   * square pixels (1:1).
   */
  async getPixelAspectRatio() {
    return this._pixelAspectRatioCache ??= simplifyRational({
      num: await this.getSquarePixelWidth() * await this.getCodedHeight(),
      den: await this.getSquarePixelHeight() * await this.getCodedWidth()
    });
  }
  /**
   * The pixel aspect ratio of the track's frames, as a rational number in its reduced form. Most videos use
   * square pixels (1:1).
   * @deprecated Use {@link InputVideoTrack.getPixelAspectRatio} instead.
   */
  get pixelAspectRatio() {
    return this._pixelAspectRatioCache ??= simplifyRational({
      num: requireSync(this._backing.getSquarePixelWidth(), "pixelAspectRatio", "getPixelAspectRatio") * requireSync(this._backing.getCodedHeight(), "pixelAspectRatio", "getPixelAspectRatio"),
      den: requireSync(this._backing.getSquarePixelHeight(), "pixelAspectRatio", "getPixelAspectRatio") * requireSync(this._backing.getCodedWidth(), "pixelAspectRatio", "getPixelAspectRatio")
    });
  }
  /** Returns the display width of the track's frames in pixels, after aspect ratio adjustment and rotation. */
  async getDisplayWidth() {
    const metadata = await this._backing.getMetadataDisplayWidth?.();
    if (metadata != null) {
      return metadata;
    }
    const rotation = await this.getRotation();
    return rotation % 180 === 0 ? this.getSquarePixelWidth() : this.getSquarePixelHeight();
  }
  /**
   * The display width of the track's frames in pixels, after aspect ratio adjustment and rotation.
   * @deprecated Use {@link InputVideoTrack.getDisplayWidth} instead.
   */
  get displayWidth() {
    const metadataRaw = this._backing.getMetadataDisplayWidth?.();
    if (metadataRaw !== void 0) {
      const metadata = requireSync(metadataRaw, "displayWidth", "getDisplayWidth");
      if (metadata !== null) {
        return metadata;
      }
    }
    const rotation = requireSync(this._backing.getRotation(), "displayWidth", "getDisplayWidth");
    const value = rotation % 180 === 0 ? this._backing.getSquarePixelWidth() : this._backing.getSquarePixelHeight();
    return requireSync(value, "displayWidth", "getDisplayWidth");
  }
  /** Returns the display height of the track's frames in pixels, after aspect ratio adjustment and rotation. */
  async getDisplayHeight() {
    const metadata = await this._backing.getMetadataDisplayHeight?.();
    if (metadata != null) {
      return metadata;
    }
    const rotation = await this.getRotation();
    return rotation % 180 === 0 ? this.getSquarePixelHeight() : this.getSquarePixelWidth();
  }
  /**
   * The display height of the track's frames in pixels, after aspect ratio adjustment and rotation.
   * @deprecated Use {@link InputVideoTrack.getDisplayHeight} instead.
   */
  get displayHeight() {
    const metadataRaw = this._backing.getMetadataDisplayHeight?.();
    if (metadataRaw !== void 0) {
      const metadata = requireSync(metadataRaw, "displayHeight", "getDisplayHeight");
      if (metadata !== null) {
        return metadata;
      }
    }
    const rotation = requireSync(this._backing.getRotation(), "displayHeight", "getDisplayHeight");
    const value = rotation % 180 === 0 ? this._backing.getSquarePixelHeight() : this._backing.getSquarePixelWidth();
    return requireSync(value, "displayHeight", "getDisplayHeight");
  }
  /** Returns the color space of the track's samples. */
  async getColorSpace() {
    return this._backing.getColorSpace();
  }
  /** If this method returns true, the track's samples use a high dynamic range (HDR). */
  async hasHighDynamicRange() {
    const colorSpace = await this._backing.getColorSpace();
    return colorSpace.primaries === "bt2020" || colorSpace.primaries === "smpte432" || colorSpace.transfer === "pq" || colorSpace.transfer === "hlg" || colorSpace.matrix === "bt2020-ncl";
  }
  /** Checks if this track may contain transparent samples with alpha data. */
  async canBeTransparent() {
    return this._backing.canBeTransparent();
  }
  /**
   * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#video-decoder-config) for decoding the
   * track's packets using a [`VideoDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder). Returns
   * null if the track's codec is unknown.
   */
  async getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecParameterString() {
    const fromMetadata = await this._backing.getMetadataCodecParameterString?.();
    if (fromMetadata != null) {
      return fromMetadata;
    }
    const decoderConfig = await this._backing.getDecoderConfig();
    return decoderConfig?.codec ?? null;
  }
  async canDecode() {
    try {
      const decoderConfig = await this._backing.getDecoderConfig();
      if (!decoderConfig) {
        return false;
      }
      const codec = await this._backing.getCodec();
      assert(codec !== null);
      if (customVideoDecoders.some((x) => x.supports(codec, decoderConfig))) {
        return true;
      }
      if (typeof VideoDecoder === "undefined") {
        return false;
      }
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      return support.supported === true;
    } catch (error) {
      Logging._error("Error during decodability check:", error);
      return false;
    }
  }
  async determinePacketType(packet) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (packet.isMetadataOnly) {
      throw new TypeError("packet must not be metadata-only to determine its type.");
    }
    const codec = await this.getCodec();
    if (codec === null) {
      return null;
    }
    const decoderConfig = await this.getDecoderConfig();
    assert(decoderConfig);
    return determineVideoPacketType(codec, decoderConfig, packet.data);
  }
  /**
   * Computes frame rate metrics for this video track, i.e. estimates the video's frame rate. Frame rate is never
   * determined from file metadata (which is unreliable) but is always deduced directly from the actual frame
   * timestamps.
   */
  async computeFrameRateMetrics(options = {}) {
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (options.targetPacketCount !== void 0 && (!Number.isFinite(options.targetPacketCount) || options.targetPacketCount < 0)) {
      throw new TypeError("options.targetPacketCount must be a non-negative number.");
    }
    const timeResolution = await this.getTimeResolution();
    const targetPacketCount = options.targetPacketCount ?? 256;
    const sink = new EncodedPacketSink(this);
    const timestamps = [];
    let maxTimestamp = -Infinity;
    let probedPacketCount = 0;
    for await (const packet of sink.packets(void 0, void 0, { metadataOnly: true })) {
      if (timestamps.length >= targetPacketCount && packet.timestamp >= maxTimestamp) {
        break;
      }
      timestamps.push(packet.timestamp);
      maxTimestamp = Math.max(maxTimestamp, packet.timestamp);
      probedPacketCount++;
    }
    const ticks = new Float64Array(timestamps.length);
    for (let i = 0; i < timestamps.length; i++) {
      ticks[i] = Math.round(timestamps[i] * timeResolution);
    }
    ticks.sort();
    let n = 1;
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i] !== ticks[n - 1]) {
        ticks[n++] = ticks[i];
      }
    }
    if (n < 2) {
      return {
        underlyingFrameRate: null,
        bestGuessFrameRate: timeResolution,
        minFrameRate: timeResolution,
        maxFrameRate: timeResolution,
        averageFrameRate: timeResolution,
        medianFrameRate: timeResolution,
        frameRateIsConstant: true,
        probedPacketCount
      };
    }
    const activeTicks = ticks.subarray(0, n);
    const underlyingFrameRate = findUnderlyingFrameRate(activeTicks, timeResolution);
    const unitRate = underlyingFrameRate ?? timeResolution;
    const ticksPerFrame = underlyingFrameRate !== null ? timeResolution / underlyingFrameRate : null;
    const histogram = /* @__PURE__ */ new Map();
    let minDifference = Infinity;
    let maxDifference = -Infinity;
    let totalDifference = 0;
    for (let i = 1; i < n; i++) {
      const tickDifference = activeTicks[i] - activeTicks[i - 1];
      const difference = ticksPerFrame !== null ? Math.max(1, Math.round(tickDifference / ticksPerFrame)) : tickDifference;
      histogram.set(difference, (histogram.get(difference) ?? 0) + 1);
      minDifference = Math.min(minDifference, difference);
      maxDifference = Math.max(maxDifference, difference);
      totalDifference += difference;
    }
    const differenceCount = n - 1;
    const sortedDifferences = [...histogram.keys()].sort((a, b) => a - b);
    const middleA = differenceCount - 1 >> 1;
    const middleB = differenceCount >> 1;
    let medianDifferenceA = 0;
    let medianDifferenceB = 0;
    let cumulativeCount = 0;
    for (const difference of sortedDifferences) {
      cumulativeCount += histogram.get(difference);
      if (medianDifferenceA === 0 && cumulativeCount > middleA) {
        medianDifferenceA = difference;
      }
      if (cumulativeCount > middleB) {
        medianDifferenceB = difference;
        break;
      }
    }
    const medianFrameRate = (unitRate / medianDifferenceA + unitRate / medianDifferenceB) / 2;
    return {
      underlyingFrameRate,
      bestGuessFrameRate: underlyingFrameRate !== null ? underlyingFrameRate : getBestGuessFrameRate(medianFrameRate),
      minFrameRate: unitRate / maxDifference,
      maxFrameRate: unitRate / minDifference,
      averageFrameRate: unitRate * differenceCount / totalDifference,
      medianFrameRate,
      frameRateIsConstant: underlyingFrameRate !== null && minDifference === 1 && maxDifference === 1,
      probedPacketCount
    };
  }
};
var InputAudioTrack = class extends InputTrack {
  /** @internal */
  constructor(input, backing) {
    super(input, backing);
    this._backing = backing;
  }
  get type() {
    return "audio";
  }
  /** The codec of the track's packets. */
  async getCodec() {
    return this._backing.getCodec();
  }
  /**
   * The codec of the track's packets.
   * @deprecated Use {@link InputAudioTrack.getCodec} instead.
   */
  get codec() {
    return requireSync(this._backing.getCodec(), "codec", "getCodec");
  }
  async hasOnlyKeyPackets() {
    return await this._backing.getHasOnlyKeyPackets?.() ?? true;
  }
  /** Returns the number of audio channels in the track. */
  async getNumberOfChannels() {
    return this._backing.getNumberOfChannels();
  }
  /**
   * The number of audio channels in the track.
   * @deprecated Use {@link InputAudioTrack.getNumberOfChannels} instead.
   */
  get numberOfChannels() {
    return requireSync(this._backing.getNumberOfChannels(), "numberOfChannels", "getNumberOfChannels");
  }
  /** Returns the track's audio sample rate in hertz. */
  async getSampleRate() {
    return this._backing.getSampleRate();
  }
  /**
   * The track's audio sample rate in hertz.
   * @deprecated Use {@link InputAudioTrack.getSampleRate} instead.
   */
  get sampleRate() {
    return requireSync(this._backing.getSampleRate(), "sampleRate", "getSampleRate");
  }
  /**
   * Returns the [decoder configuration](https://www.w3.org/TR/webcodecs/#audio-decoder-config) for decoding the
   * track's packets using an [`AudioDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/AudioDecoder). Returns
   * null if the track's codec is unknown.
   */
  async getDecoderConfig() {
    return this._backing.getDecoderConfig();
  }
  async getCodecParameterString() {
    const fromMetadata = await this._backing.getMetadataCodecParameterString?.();
    if (fromMetadata != null) {
      return fromMetadata;
    }
    const decoderConfig = await this._backing.getDecoderConfig();
    return decoderConfig?.codec ?? null;
  }
  async canDecode() {
    try {
      const decoderConfig = await this._backing.getDecoderConfig();
      if (!decoderConfig) {
        return false;
      }
      const codec = await this._backing.getCodec();
      assert(codec !== null);
      if (customAudioDecoders.some((x) => x.supports(codec, decoderConfig))) {
        return true;
      }
      if (decoderConfig.codec.startsWith("pcm-")) {
        return true;
      } else {
        if (typeof AudioDecoder === "undefined") {
          return false;
        }
        const support = await AudioDecoder.isConfigSupported(decoderConfig);
        return support.supported === true;
      }
    } catch (error) {
      Logging._error("Error during decodability check:", error);
      return false;
    }
  }
  async determinePacketType(packet) {
    if (!(packet instanceof EncodedPacket)) {
      throw new TypeError("packet must be an EncodedPacket.");
    }
    if (await this.getCodec() === null) {
      return null;
    }
    return "key";
  }
};
var desc = (value) => {
  return -(value ?? -Infinity);
};
var prefer = (value) => {
  return -value;
};
var toValidatedInputTrackQuery = (query) => {
  if (typeof query !== "object" || !query) {
    throw new TypeError("query must be an object.");
  }
  if (query.filter !== void 0 && typeof query.filter !== "function") {
    throw new TypeError("query.filter, when provided, must be a function.");
  }
  if (query.sortBy !== void 0 && typeof query.sortBy !== "function") {
    throw new TypeError("query.sortBy, when provided, must be a function.");
  }
  return {
    filter: query.filter ? (track) => {
      const handle = (bool) => {
        if (typeof bool !== "boolean") {
          throw new TypeError("query.filter must return or resolve to a boolean.");
        }
        return bool;
      };
      const result = query.filter(track);
      if (isThenable(result)) {
        return result.then(handle);
      } else {
        return handle(result);
      }
    } : void 0,
    sortBy: query.sortBy ? (track) => {
      const handle = (value) => {
        if (typeof value !== "number" && (!Array.isArray(value) || !value.every((x) => typeof x === "number"))) {
          throw new TypeError("query.sortBy must return or resolve to a number or an array of numbers.");
        }
        return value;
      };
      const result = query.sortBy(track);
      if (isThenable(result)) {
        return result.then(handle);
      } else {
        return handle(result);
      }
    } : void 0
  };
};
var mergeInputTrackQueries = (queryA, queryB) => {
  return {
    filter: queryA?.filter || queryB?.filter ? (track) => {
      const resultA = queryA?.filter?.(track) ?? true;
      const handleResultA = (resultA2) => {
        if (resultA2 === false) {
          return false;
        }
        return queryB?.filter?.(track) ?? true;
      };
      if (isThenable(resultA)) {
        return resultA.then(handleResultA);
      } else {
        return handleResultA(resultA);
      }
    } : void 0,
    sortBy: queryA?.sortBy || queryB?.sortBy ? (track) => {
      const resultA = queryA?.sortBy?.(track) ?? [];
      const resultB = queryB?.sortBy?.(track) ?? [];
      const join = (resultA2, resultB2) => {
        return [
          ...Array.isArray(resultA2) ? resultA2 : [resultA2],
          ...Array.isArray(resultB2) ? resultB2 : [resultB2]
        ];
      };
      if (isThenable(resultA) || isThenable(resultB)) {
        return Promise.all([resultA, resultB]).then(([resultA2, resultB2]) => {
          return join(resultA2, resultB2);
        });
      } else {
        return join(resultA, resultB);
      }
    } : void 0
  };
};
var queryInputTracks = async (tracks, query) => {
  let matched = tracks;
  if (query?.filter) {
    const filterMatches = tracks.map((t) => query.filter(t));
    const hasAsyncFilter = filterMatches.some((x) => isThenable(x));
    if (hasAsyncFilter) {
      const resolvedFilterMatches = await Promise.all(filterMatches);
      matched = tracks.filter((_, i) => resolvedFilterMatches[i]);
    } else {
      matched = tracks.filter((_, i) => filterMatches[i]);
    }
  }
  if (!query?.sortBy) {
    return matched;
  }
  const sortValues = matched.map((t) => query.sortBy(t));
  const hasAsyncSort = sortValues.some((x) => isThenable(x));
  const resolvedSortValues = hasAsyncSort ? await Promise.all(sortValues) : sortValues;
  return matched.map((track, i) => ({ track, sortValue: resolvedSortValues[i] })).sort((a, b) => {
    const aValues = Array.isArray(a.sortValue) ? a.sortValue : [a.sortValue];
    const bValues = Array.isArray(b.sortValue) ? b.sortValue : [b.sortValue];
    const maxLength = Math.max(aValues.length, bValues.length);
    for (let i = 0; i < maxLength; i++) {
      const aValue = aValues[i] ?? 0;
      const bValue = bValues[i] ?? 0;
      if (aValue === bValue) {
        continue;
      }
      return aValue - bValue;
    }
    return 0;
  }).map((x) => x.track);
};
var findUnderlyingFrameRate = (ticks, resolution) => {
  const MAX_DENOMINATOR = 1e6;
  const MIN_INLIER_RATIO = 0.98;
  const DELTA_TOLERANCE = 1 + 1e-9;
  const MAX_EFFECTIVE_FRAME_SPAN = 1e3;
  const KNOWN_FRAME_RATES = [
    12,
    15,
    20,
    24e3 / 1001,
    24,
    25,
    3e4 / 1001,
    30,
    48,
    50,
    6e4 / 1001,
    60,
    100,
    12e4 / 1001,
    120,
    144,
    240
  ];
  if (ticks.length < 2) {
    return null;
  }
  const gaps = new Float64Array(ticks.length - 1);
  for (let i = 1; i < ticks.length; i++) {
    const gap = ticks[i] - ticks[i - 1];
    if (!(gap > 0)) {
      return null;
    }
    gaps[i - 1] = gap;
  }
  const sortedGaps = gaps.slice();
  sortedGaps.sort();
  let period = sortedGaps[Math.floor(sortedGaps.length * 0.05)];
  for (let iteration = 0; iteration < 6; iteration++) {
    let totalTicks2 = 0;
    let totalFrames2 = 0;
    for (const gap of gaps) {
      const multiple = Math.max(1, Math.round(gap / period));
      if (Math.abs(gap - multiple * period) >= DELTA_TOLERANCE) {
        continue;
      }
      totalTicks2 += gap;
      totalFrames2 += multiple;
    }
    if (totalFrames2 === 0) {
      return null;
    }
    const refinedPeriod = totalTicks2 / totalFrames2;
    if (Math.abs(refinedPeriod - period) <= 1e-12 * Math.max(1, period)) {
      period = refinedPeriod;
      break;
    }
    period = refinedPeriod;
  }
  let inlierCount = 0;
  let totalTicks = 0;
  let totalFrames = 0;
  for (const gap of gaps) {
    const multiple = Math.max(1, Math.round(gap / period));
    if (Math.abs(gap - multiple * period) >= DELTA_TOLERANCE) {
      continue;
    }
    inlierCount++;
    totalTicks += gap;
    totalFrames += multiple;
  }
  if (inlierCount / gaps.length < MIN_INLIER_RATIO) {
    return null;
  }
  period = totalTicks / totalFrames;
  const uncertainty = 1 / Math.min(totalFrames, MAX_EFFECTIVE_FRAME_SPAN);
  const periodLo = Math.max(Number.EPSILON, period - uncertainty);
  const periodHi = period + uncertainty;
  const fpsLo = resolution / periodHi;
  const fpsHi = resolution / periodLo;
  const fittedFps = resolution / period;
  let fps = null;
  let bestKnownError = Infinity;
  for (const candidate of KNOWN_FRAME_RATES) {
    if (candidate < fpsLo || candidate > fpsHi) {
      continue;
    }
    const error = Math.abs(candidate / fittedFps - 1);
    if (error < bestKnownError) {
      fps = candidate;
      bestKnownError = error;
    }
  }
  if (fps === null) {
    const periodFraction = simplestFractionBetween(periodLo, periodHi, MAX_DENOMINATOR);
    const fpsFraction = simplestFractionBetween(fpsLo, fpsHi, MAX_DENOMINATOR);
    if (fpsFraction && (!periodFraction || fpsFraction.den < periodFraction.den || fpsFraction.den === periodFraction.den && fpsFraction.num <= periodFraction.num)) {
      fps = fpsFraction.num / fpsFraction.den;
    } else if (periodFraction) {
      fps = resolution * periodFraction.den / periodFraction.num;
    } else {
      return null;
    }
  }
  const finalPeriod = resolution / fps;
  let finalInlierCount = 0;
  for (const gap of gaps) {
    const multiple = Math.max(1, Math.round(gap / finalPeriod));
    if (Math.abs(gap - multiple * finalPeriod) < DELTA_TOLERANCE) {
      finalInlierCount++;
    }
  }
  if (finalInlierCount / gaps.length < MIN_INLIER_RATIO) {
    return null;
  }
  return fps;
};
var simplestFractionBetween = (lo, hi, maxDenominator) => {
  for (let den = 1; den <= maxDenominator; den++) {
    const num = Math.floor(lo * den) + 1;
    if (num / den < hi) {
      return simplifyRational({ num, den });
    }
  }
  return null;
};
var getBestGuessFrameRate = (frameRate) => {
  const SPECIAL_FRAME_RATES = [
    24 / 1.001,
    30 / 1.001,
    60 / 1.001,
    120 / 1.001
  ];
  const COMMON_FRAME_RATES = [
    12,
    15,
    20,
    24,
    25,
    30,
    48,
    50,
    60,
    100,
    120,
    144,
    240
  ];
  const SPECIAL_TOLERANCE = 5e-4;
  const COMMON_TOLERANCE = 0.025;
  for (const candidate of SPECIAL_FRAME_RATES) {
    if (Math.abs(candidate / frameRate - 1) <= SPECIAL_TOLERANCE) {
      return candidate;
    }
  }
  let best = frameRate;
  let bestError = Infinity;
  for (const candidate of COMMON_FRAME_RATES) {
    const error = Math.abs(candidate / frameRate - 1);
    if (error <= COMMON_TOLERANCE && error < bestError) {
      best = candidate;
      bestError = error;
    }
  }
  return best;
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/input.js
polyfillSymbolDispose();
var DEFAULT_SOURCE_CACHE_GROUP = 1;
var Input = class _Input extends EventEmitter {
  /** True if the input has been disposed. */
  get disposed() {
    return this._disposed;
  }
  /**
   * Creates a new input file from the specified options. No reading operations will be performed until methods are
   * called on this instance.
   */
  constructor(options) {
    super();
    this._demuxerPromise = null;
    this._format = null;
    this._trackBackingsCache = null;
    this._backingToTrack = /* @__PURE__ */ new Map();
    this._disposed = false;
    this._nextSourceCacheAge = 0;
    this._sourceRefs = [];
    this._sourceCache = [];
    this._sourceCachePromises = [];
    this._onFormatDetermined = null;
    if (!options || typeof options !== "object") {
      throw new TypeError("options must be an object.");
    }
    if (!Array.isArray(options.formats) || options.formats.some((x) => !(x instanceof InputFormat))) {
      throw new TypeError("options.formats must be an array of InputFormat.");
    }
    if (!(options.source instanceof Source || options.source instanceof SourceRef)) {
      throw new TypeError("options.source must be a Source or SourceRef.");
    }
    if (options.source instanceof Source && options.source._disposed) {
      throw new TypeError("options.source must not be a disposed Source.");
    }
    if (options.initInput !== void 0 && !(options.initInput instanceof _Input)) {
      throw new TypeError("options.initInput, when provided, must be an Input.");
    }
    if (options.formatOptions !== void 0) {
      validateInputFormatOptions(options.formatOptions, "formatOptions");
    }
    this._formats = options.formats;
    this._initInput = options.initInput ?? null;
    this._formatOptions = options.formatOptions ?? {};
    if (options.source instanceof Source) {
      this._rootRef = options.source.ref();
    } else {
      this._rootRef = options.source;
    }
    this._sourceRefs.push(this._rootRef);
  }
  /** @internal */
  get _rootSource() {
    return this._rootRef.source;
  }
  /** @internal */
  async _getSourceUncached(request) {
    assert(this._rootSource instanceof PathedSource);
    const ref = await this._rootSource._resolveRequest(request);
    this._emit("source", { source: ref.source, request, isRoot: request.isRoot });
    return ref;
  }
  /** @internal */
  _getSourceCached(request, cacheGroup = DEFAULT_SOURCE_CACHE_GROUP) {
    const cachedEntry = this._sourceCache.find((x) => x.cacheGroup === cacheGroup && sourceRequestsAreEqual(x.request, request));
    if (cachedEntry) {
      cachedEntry.age++;
      return Promise.resolve(cachedEntry.sourceRef.source.ref());
    }
    const cachedPromiseEntry = this._sourceCachePromises.find((x) => x.cacheGroup === cacheGroup && sourceRequestsAreEqual(x.request, request));
    if (cachedPromiseEntry) {
      return cachedPromiseEntry.promise.then((x) => x.sourceRef.source.ref());
    }
    const promise = (async () => {
      const sourceRef = await this._getSourceUncached(request);
      const MAX_SOURCE_CACHE_SIZE = 4;
      const count = arrayCount(this._sourceCache, (x) => x.cacheGroup === cacheGroup && x.sourceRef.source._refCount === 1);
      if (count >= MAX_SOURCE_CACHE_SIZE) {
        const minAgeIndex = arrayArgmin(this._sourceCache, (x) => x.cacheGroup === cacheGroup && x.sourceRef.source._refCount === 1 ? x.age : Infinity);
        assert(minAgeIndex !== -1);
        const entry = this._sourceCache[minAgeIndex];
        this._sourceCache.splice(minAgeIndex, 1);
        entry.sourceRef.free();
        removeItem(this._sourceRefs, entry.sourceRef);
      }
      this._sourceRefs.push(sourceRef);
      const promiseIndex = this._sourceCachePromises.findIndex((x) => x.request === request);
      assert(promiseIndex !== -1);
      this._sourceCachePromises.splice(promiseIndex, 1);
      const cacheEntry = {
        request,
        sourceRef,
        age: this._nextSourceCacheAge++,
        cacheGroup
      };
      return cacheEntry;
    })();
    this._sourceCachePromises.push({
      request,
      cacheGroup,
      promise
    });
    return promise.then((entry) => {
      const ref = entry.sourceRef.source.ref();
      this._sourceCache.push(entry);
      return ref;
    });
  }
  /** @internal */
  _getDemuxer() {
    return this._demuxerPromise ??= (async () => {
      this._reader = new Reader(this._rootSource);
      this._emit("source", { source: this._rootSource, request: null, isRoot: true });
      for (const format of this._formats) {
        const canRead = await format._canReadInput(this);
        if (canRead) {
          this._format = format;
          this._onFormatDetermined?.(format);
          return format._createDemuxer(this);
        }
      }
      throw new UnsupportedInputFormatError();
    })();
  }
  /**
   * Returns the source from which this input file reads data for the root path.
   */
  get source() {
    return this._rootSource;
  }
  /**
   * Returns the format of the input file. You can compare this result directly to the {@link InputFormat} singletons
   * or use `instanceof` checks for subset-aware logic (for example, `format instanceof MatroskaInputFormat` is true
   * for both MKV and WebM).
   */
  async getFormat() {
    await this._getDemuxer();
    assert(this._format);
    return this._format;
  }
  /** Returns `true` if the format of the input file is known and the file can be read, `false` otherwise. */
  async canRead() {
    try {
      await this._getDemuxer();
      return true;
    } catch (error) {
      if (error instanceof UnsupportedInputFormatError) {
        return false;
      }
      throw error;
    }
  }
  /**
   * Returns the timestamp at which the input file starts. More precisely, returns the smallest starting timestamp
   * among all tracks.
   *
   * Optionally, you can pass in the list of tracks for which you want to compute the starting timestamp.
   *
   * Note that this method is potentially expensive for inputs with many tracks (such as HLS manifests), since it
   * probes every track.
   */
  async getFirstTimestamp(tracks) {
    tracks ??= await this.getTracks();
    const filtered = tracks.filter((x) => x !== null);
    if (filtered.length === 0) {
      return 0;
    }
    const firstPackets = await Promise.all(filtered.map((x) => x._backing.getFirstPacket({ metadataOnly: true })));
    const result = Math.min(...firstPackets.map((x) => x?.timestamp ?? Infinity));
    return result === Infinity ? 0 : result;
  }
  /**
   * Computes the duration of the input file, in seconds. More precisely, returns the largest end timestamp among
   * all tracks.
   *
   * Optionally, you can pass in the list of tracks for which you want to compute the duration.
   *
   * This method can be potentially expensive depending on the underlying file format, because it returns the most
   * accurate duration possible and must check all tracks. Use {@link Input.getDurationFromMetadata} for a faster but
   * less accurate estimate of duration.
   *
   * By default, when any track in the underlying media is live, this method will only resolve once the live stream
   * ends. If you want to query the current duration of the media, set {@link PacketRetrievalOptions.skipLiveWait}
   * to `true` in the options.
   */
  async computeDuration(tracks, options) {
    tracks ??= await this.getTracks();
    const filtered = tracks.filter((x) => x !== null);
    if (filtered.length === 0) {
      return 0;
    }
    const tracksDurations = await Promise.all(filtered.map((x) => x.computeDuration(options)));
    return Math.max(...tracksDurations);
  }
  /**
   * Gets the duration (end timestamp) in seconds of the input file from metadata stored in the file. This value may
   * be approximate or diverge from the actual, precise duration returned by `.computeDuration()`, but compared to
   * that method, this method is cheaper. When the duration cannot be determined from the file metadata, `null`
   * is returned.
   *
   * Optionally, you can pass in the list of tracks for which you want to get the duration from metadata.
   *
   * By default, when the underlying media is live, this method will only resolve once the live stream
   * ends. If you want to query the current duration of the media, set
   * {@link DurationMetadataRequestOptions.skipLiveWait} to `true` in the options.
   */
  async getDurationFromMetadata(tracks, options) {
    tracks ??= await this.getTracks();
    const filtered = tracks.filter((x) => x !== null);
    const tracksDurations = await Promise.all(filtered.map((x) => x.getDurationFromMetadata(options)));
    const nonNullDurations = tracksDurations.filter((x) => x !== null);
    if (nonNullDurations.length === 0) {
      return null;
    }
    return Math.max(...nonNullDurations);
  }
  /**
   * Returns the list of all tracks of this input file in the order in which they appear in the file. An optional
   * query can be provided.
   */
  async getTracks(query) {
    query &&= toValidatedInputTrackQuery(query);
    const backings = await this._getTrackBackings();
    const tracks = backings.map((backing) => this._wrapBackingAsTrack(backing));
    return queryInputTracks(tracks, query);
  }
  /** Returns the list of all video tracks of this input file. An optional query can be provided. */
  async getVideoTracks(query) {
    query &&= toValidatedInputTrackQuery(query);
    const tracks = await this.getTracks();
    const videoTracks = tracks.filter((x) => x.isVideoTrack());
    return queryInputTracks(videoTracks, query);
  }
  /** Returns the list of all audio tracks of this input file. An optional query can be provided. */
  async getAudioTracks(query) {
    query &&= toValidatedInputTrackQuery(query);
    const tracks = await this.getTracks();
    const audioTracks = tracks.filter((x) => x.isAudioTrack());
    return queryInputTracks(audioTracks, query);
  }
  /**
   * Returns the primary video track of this input file, or null if there are no video tracks.
   *
   * Multiple factors determine which track is considered primary, including its position in the file, disposition,
   * bitrate (higher bitrate is preferred), and if it can be paired with an audio track.
   */
  async getPrimaryVideoTrack(query) {
    query &&= toValidatedInputTrackQuery(query);
    const merged = mergeInputTrackQueries(query, {
      sortBy: async (t) => [
        prefer((await t.getDisposition()).default),
        prefer(await t.hasPairableAudioTrack()),
        prefer(!await t.hasOnlyKeyPackets()),
        desc(await t.getBitrate())
      ]
    });
    const sorted = await this.getVideoTracks(merged);
    return sorted[0] ?? null;
  }
  /**
   * Returns the primary audio track of this input file, or null if there are no audio tracks.
   *
   * Multiple factors determine which track is considered primary, including its position in the file, disposition,
   * bitrate (higher bitrate is preferred), and if it can be paired with the primary video track.
   */
  async getPrimaryAudioTrack(query) {
    query &&= toValidatedInputTrackQuery(query);
    const primaryVideoTrack = await this.getPrimaryVideoTrack();
    const merged = mergeInputTrackQueries(query, {
      sortBy: async (t) => [
        prefer(!primaryVideoTrack || t.canBePairedWith(primaryVideoTrack)),
        prefer((await t.getDisposition()).default),
        desc(await t.getBitrate())
      ]
    });
    const sorted = await this.getAudioTracks(merged);
    return sorted[0] ?? null;
  }
  /** @internal */
  async _getTrackBackings() {
    const demuxer = await this._getDemuxer();
    return this._trackBackingsCache ??= await demuxer.getTrackBackings();
  }
  /** @internal */
  _wrapBackingAsTrack(backing) {
    const existing = this._backingToTrack.get(backing);
    if (existing) {
      return existing;
    }
    const type = backing.getType();
    const track = type === "video" ? new InputVideoTrack(this, backing) : new InputAudioTrack(this, backing);
    this._backingToTrack.set(backing, track);
    return track;
  }
  /** Returns the full MIME type of this input file, including track codecs. */
  async getMimeType() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMimeType();
  }
  /**
   * Returns descriptive metadata tags about the media file, such as title, author, date, cover art, or other
   * attached files.
   */
  async getMetadataTags() {
    const demuxer = await this._getDemuxer();
    return demuxer.getMetadataTags();
  }
  /**
   * Disposes this input and frees connected resources. When an input is disposed, ongoing read operations will be
   * canceled, all future read operations will fail, any open decoders will be closed, and all ongoing media sink
   * operations will be canceled. Disallowed and canceled operations will throw an {@link InputDisposedError}.
   *
   * You are expected not to use an input after disposing it. While some operations may still work, it is not
   * specified and may change in any future update.
   */
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (const ref of this._sourceRefs) {
      ref.free();
    }
    this._sourceRefs.length = 0;
    if (this._demuxerPromise) {
      void this._demuxerPromise.then((demuxer) => demuxer.dispose()).catch(() => {
      });
    }
  }
  /**
   * Calls `.dispose()` on the input, implementing the `Disposable` interface for use with
   * JavaScript Explicit Resource Management features.
   */
  [Symbol.dispose]() {
    this.dispose();
  }
};
var UnsupportedInputFormatError = class extends Error {
  /** Creates a new {@link UnsupportedInputFormatError}. */
  constructor(message = "Input has an unsupported or unrecognizable format.") {
    super(message);
    this.name = "UnsupportedInputFormatError";
  }
};
var InputDisposedError = class extends Error {
  /** Creates a new {@link InputDisposedError}. */
  constructor(message = "Input has been disposed.") {
    super(message);
    this.name = "InputDisposedError";
  }
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/reader.js
var Reader = class {
  constructor(source) {
    this.source = source;
  }
  get fileSize() {
    const size = this.source._getFileSize();
    if (size === void 0) {
      throw new Error("Reading file size too early; read required first.");
    }
    return size;
  }
  get fileSizeNonStrict() {
    return this.source._getFileSize() ?? null;
  }
  requestSlice(start, length) {
    if (this.source._disposed) {
      throw new InputDisposedError();
    }
    if (start < 0) {
      return null;
    }
    if (this.fileSizeNonStrict !== null && start + length > this.fileSizeNonStrict) {
      return null;
    }
    if (length === 0) {
      const buffer = new Uint8Array(0);
      return new FileSlice(buffer, toDataView(buffer), 0, start, start);
    }
    const end = start + length;
    const result = this.source._read(start, end, DEFAULT_MIN_READ_POSITION, DEFAULT_MAX_READ_POSITION);
    if (isThenable(result)) {
      return result.then((x) => {
        if (!x) {
          return null;
        }
        return new FileSlice(x.bytes, x.view, x.offset, start, end);
      });
    } else {
      if (!result) {
        return null;
      }
      return new FileSlice(result.bytes, result.view, result.offset, start, end);
    }
  }
  requestSliceRange(start, minLength, maxLength) {
    if (this.source._disposed) {
      throw new InputDisposedError();
    }
    if (start < 0) {
      return null;
    }
    if (this.fileSizeNonStrict !== null) {
      return this.requestSlice(start, clamp(this.fileSizeNonStrict - start, minLength, maxLength));
    } else {
      const promisedAttempt = this.requestSlice(start, maxLength);
      const handleAttempt = (attempt) => {
        if (attempt) {
          return attempt;
        }
        assert(this.fileSizeNonStrict !== null);
        return this.requestSlice(start, clamp(this.fileSizeNonStrict - start, minLength, maxLength));
      };
      if (isThenable(promisedAttempt)) {
        return promisedAttempt.then(handleAttempt);
      } else {
        return handleAttempt(promisedAttempt);
      }
    }
  }
  requestEntireFile() {
    if (this.fileSizeNonStrict !== null) {
      return this.requestSlice(0, this.fileSizeNonStrict);
    }
    const CHUNK_SIZE = 1024;
    return (async () => {
      const chunks = [];
      let currentSize = 0;
      while (true) {
        if (chunks.length === 1 && this.fileSizeNonStrict !== null) {
          return this.requestSlice(0, this.fileSizeNonStrict);
        }
        let slice = this.requestSliceRange(currentSize, 0, CHUNK_SIZE);
        if (isThenable(slice))
          slice = await slice;
        if (!slice || slice.length === 0) {
          break;
        }
        const chunk = readBytes(slice, slice.length);
        chunks.push(chunk);
        currentSize += slice.length;
      }
      const joined = new Uint8Array(currentSize);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.length;
      }
      return new FileSlice(joined, toDataView(joined), 0, 0, currentSize);
    })();
  }
};
var FileSlice = class _FileSlice {
  constructor(bytes, view, offset, start, end) {
    this.bytes = bytes;
    this.view = view;
    this.offset = offset;
    this.start = start;
    this.end = end;
    this.bufferPos = start - offset;
  }
  static tempFromBytes(bytes) {
    return new _FileSlice(bytes, toDataView(bytes), 0, 0, bytes.length);
  }
  get length() {
    return this.end - this.start;
  }
  get filePos() {
    return this.offset + this.bufferPos;
  }
  set filePos(value) {
    this.bufferPos = value - this.offset;
  }
  /** The number of bytes left from the current pos to the end of the slice. */
  get remainingLength() {
    return Math.max(this.end - this.filePos, 0);
  }
  skip(byteCount) {
    this.bufferPos += byteCount;
  }
  /** Creates a new subslice of this slice whose byte range must be contained within this slice. */
  slice(filePos, length = this.end - filePos) {
    if (filePos < this.start || filePos + length > this.end) {
      throw new RangeError("Slicing outside of original slice.");
    }
    return new _FileSlice(this.bytes, this.view, this.offset, filePos, filePos + length);
  }
};
var checkIsInRange = (slice, bytesToRead) => {
  if (slice.filePos < slice.start || slice.filePos + bytesToRead > slice.end) {
    throw new RangeError(`Tried reading [${slice.filePos}, ${slice.filePos + bytesToRead}), but slice is [${slice.start}, ${slice.end}). This is likely an internal error, please report it alongside the file that caused it.`);
  }
};
var readBytes = (slice, length) => {
  checkIsInRange(slice, length);
  const bytes = slice.bytes.subarray(slice.bufferPos, slice.bufferPos + length);
  slice.bufferPos += length;
  return bytes;
};
var readU8 = (slice) => {
  checkIsInRange(slice, 1);
  return slice.view.getUint8(slice.bufferPos++);
};
var readU16Be = (slice) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getUint16(slice.bufferPos, false);
  slice.bufferPos += 2;
  return value;
};
var readU24Be = (slice) => {
  checkIsInRange(slice, 3);
  const value = getUint24(slice.view, slice.bufferPos, false);
  slice.bufferPos += 3;
  return value;
};
var readI16Be = (slice) => {
  checkIsInRange(slice, 2);
  const value = slice.view.getInt16(slice.bufferPos, false);
  slice.bufferPos += 2;
  return value;
};
var readU32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getUint32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readI32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getInt32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readU64Be = (slice) => {
  const high = readU32Be(slice);
  const low = readU32Be(slice);
  return high * 4294967296 + low;
};
var readI64Be = (slice) => {
  const high = readI32Be(slice);
  const low = readU32Be(slice);
  return high * 4294967296 + low;
};
var readF32Be = (slice) => {
  checkIsInRange(slice, 4);
  const value = slice.view.getFloat32(slice.bufferPos, false);
  slice.bufferPos += 4;
  return value;
};
var readF64Be = (slice) => {
  checkIsInRange(slice, 8);
  const value = slice.view.getFloat64(slice.bufferPos, false);
  slice.bufferPos += 8;
  return value;
};
var readAscii = (slice, length) => {
  checkIsInRange(slice, length);
  let str = "";
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(slice.bytes[slice.bufferPos++]);
  }
  return str;
};

// ../../../../node_modules/.pnpm/mediabunny@1.55.3/node_modules/mediabunny/dist/modules/src/index.js
var MEDIABUNNY_LOADED_SYMBOL = /* @__PURE__ */ Symbol.for("mediabunny loaded");
if (globalThis[MEDIABUNNY_LOADED_SYMBOL]) {
  Logging._error("[WARNING]\nMediabunny was loaded twice. This will likely cause Mediabunny not to work correctly. Check if multiple dependencies are importing different versions of Mediabunny, or if something is being bundled incorrectly.");
}
globalThis[MEDIABUNNY_LOADED_SYMBOL] = true;

// src/errors/channel-classifier.js
var CHANNEL_PATTERNS = [
  /无可用渠道/,
  /可用渠道不存在/,
  /get_channel_failed/i,
  /\(distributor\)/,
  /分组\s+\S+\s+下模型/
];
var GROUP_SWITCH_PATTERNS = [
  ...CHANNEL_PATTERNS,
  /无权访问.*分组/,
  /model[_\s-]*not[_\s-]*found/i
];

// src/media/errors.js
var OmnimuxError = class extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {ErrorOptions & { status?: number, details?: unknown, retryable?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "OmnimuxError";
    this.code = code;
    if (typeof options.status === "number") this.status = options.status;
    if (options.details !== void 0) this.details = options.details;
    if (options.retryable !== void 0) this.retryable = options.retryable;
  }
};

// src/media/video-inspect.js
async function inspectVideoBytes(bytes) {
  const input = new Input({ formats: [MP4, QTFF, WEBM], source: new BufferSource(bytes) });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new OmnimuxError("omnimux-invalid-request", "\u6587\u4EF6\u6CA1\u6709\u6709\u6548\u89C6\u9891\u8F68\u9053");
    const tracks = await input.getVideoTracks();
    if (tracks.length !== 1) throw new OmnimuxError("omnimux-invalid-request", "\u53C2\u8003\u89C6\u9891\u9700\u8981\u5355\u4E00\u89C6\u9891\u8F68\u9053");
    const codec = await video.getCodec();
    const duration = await input.computeDuration();
    const width = await video.getDisplayWidth();
    const height = await video.getDisplayHeight();
    const stats = await video.computePacketStats(256);
    const audio = await input.getAudioTracks();
    return {
      codec,
      duration,
      width,
      height,
      frameRate: stats.averagePacketRate,
      packetCount: stats.packetCount,
      audioCodecs: await Promise.all(audio.map((track) => track.getCodec()))
    };
  } finally {
    input.dispose();
  }
}
export {
  inspectVideoBytes
};
/*! Bundled license information:

mediabunny/dist/modules/src/misc.js:
mediabunny/dist/modules/src/logging.js:
mediabunny/dist/modules/src/metadata.js:
mediabunny/dist/modules/shared/bitstream.js:
mediabunny/dist/modules/shared/aac-misc.js:
mediabunny/dist/modules/src/codec.js:
mediabunny/dist/modules/shared/ac3-misc.js:
mediabunny/dist/modules/src/codec-data.js:
mediabunny/dist/modules/src/demuxer.js:
mediabunny/dist/modules/src/packet.js:
mediabunny/dist/modules/src/isobmff/isobmff-misc.js:
mediabunny/dist/modules/src/isobmff/isobmff-reader.js:
mediabunny/dist/modules/src/aes.js:
mediabunny/dist/modules/src/isobmff/isobmff-demuxer.js:
mediabunny/dist/modules/src/matroska/ebml.js:
mediabunny/dist/modules/src/matroska/matroska-misc.js:
mediabunny/dist/modules/src/matroska/matroska-demuxer.js:
mediabunny/dist/modules/src/source.js:
mediabunny/dist/modules/src/input-format.js:
mediabunny/dist/modules/src/custom-coder.js:
mediabunny/dist/modules/src/media-sink.js:
mediabunny/dist/modules/src/input-track.js:
mediabunny/dist/modules/src/input.js:
mediabunny/dist/modules/src/reader.js:
mediabunny/dist/modules/src/index.js:
  (*!
   * Copyright (c) 2026-present, Vanilagy and contributors
   *
   * This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/.
   *)
*/
