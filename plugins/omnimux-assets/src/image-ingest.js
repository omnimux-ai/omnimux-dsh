/**
 * 浏览器图片真实入库 Seam（Issue #3052）。
 *
 * 这是 assets 插件自己拥有的窄写入面：调用方（omnimux-browser Host）只能给出
 * 已经过宿主真实解码校验的图片字节与确定的 raster MIME，再带一个去 fragment
 * 的来源摘要 sourceKey。物化、登记、changed 事件全部由本模块在同一活跃
 * LibraryStore 上完成 —— 不产生第二个库，不接受路径，不写入灵感库。
 *
 * 不变量：
 *  - 字节先落本次独占的暂存片（.image-ingest/<scope>/），再经同一个
 *    library.add() 复制进 data/files/<assetId>/，finally 只清自己的那片；
 *  - 同 sourceKey 的完整既有资产直接 duplicate；旧记录文件缺失不算成功，
 *    但缺文件也不授权销毁记录：旧条目保留，本次保存另建新条目；
 *    同 sourceKey 并发合并为一个进行中的操作；
 *  - 提交后要求恰好一个可预览的非空图片文件，否则回滚资产并把失败上抛；
 *    persist 失败由 library.add() 的事务修正兜底，不残留幽灵资产；
 *  - 暂存片名只由本模块生成（0700 / 文件 0600），清理不越出该命名空间。
 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AssetsError } from './mappings.js'
import { assertDiskSpace, isInsideDir } from './ingest.js'

/** 首版只接收 JPEG/PNG/WebP/GIF 与宿主可验证集的交集内的确定性 MIME。 */
const EXT_FOR_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/** 产品字典（UI-Spec `image.defaultName`）：名称缺失时的宿主资产默认名。 */
const DEFAULT_DISPLAY_NAME = '网页图片'
const DISPLAY_NAME_MAX = 40
const DESCRIPTION_MAX = 4000

const SUPPORTED_MIMES = new Set(Object.keys(EXT_FOR_MIME))

const SOURCE_PREFIX = 'browser-image:'
const STAGING_ROOT_NAME = '.image-ingest'
const STAGING_SCOPE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
/** 一片暂存超过该时长视为崩溃残留，下次保存时清扫；运行中的保存远早于此。 */
const STAGING_STALE_MS = 30 * 60 * 1000

const DEFAULT_FS = { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync }

/** 既有 ledger 的 source 值：精确来源摘要的持久化形态。 */
export function imageAssetSource(sourceKey) {
  return `${SOURCE_PREFIX}${sourceKey}`
}

/**
 * 展示名清理：控制字符与路径分隔归一为空格、折叠空白、去掉尾随点/空格，
 * 截断 40 字；最终为空回落产品默认名。与 normalizeName 的硬校验分开 ——
 * 这里先清洗到合法，而不是拒绝用户可见的脏标题。
 * @param {unknown} value
 */
export function sanitizeDisplayName(value) {
  const raw = typeof value === 'string' ? value : ''
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
  const named = cleaned === '' ? DEFAULT_DISPLAY_NAME : cleaned
  const clipped = named.slice(0, DISPLAY_NAME_MAX).replace(/[.\s]+$/, '')
  return clipped === '' ? DEFAULT_DISPLAY_NAME : clipped
}

/**
 * @param {{
 *   library: ReturnType<import('./library.js').createLibraryStore>,
 *   vaultRoot: string,
 *   emitChanged?: (asset: unknown) => void,
 *   fs?: Partial<typeof DEFAULT_FS>,
 * }} options
 */
export function createImageIngest(options = {}) {
  const library = options.library
  const vaultRoot = String(options.vaultRoot ?? '').trim()
  if (!library || typeof library.add !== 'function' || !vaultRoot) {
    throw new AssetsError('internal', 'image ingest requires a live library and vault root')
  }
  const emitChanged = typeof options.emitChanged === 'function' ? options.emitChanged : () => {}
  const fs = { ...DEFAULT_FS, ...(options.fs ?? {}) }
  /** @type {Map<string, Promise<object>>} sourceKey → in-flight save */
  const inFlight = new Map()
  /** 名称预约 + add 提交的串行队列：跨来源同名并发不得产生重名 handle。 */
  let commitTail = Promise.resolve()
  let stagingSeq = 0

  /**
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function enqueueCommit(task) {
    const run = commitTail.then(task, task)
    commitTail = run.then(() => undefined, () => undefined)
    return run
  }

  function stagingRoot() {
    return join(vaultRoot, STAGING_ROOT_NAME)
  }

  function newStagingScope() {
    stagingSeq += 1
    return `${Date.now().toString(36)}-${stagingSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  function removeDir(dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // 暂存清理尽力而为：残留文件无害，由过期清扫兜底。
    }
  }

  function isDirEmpty(dir) {
    try {
      return fs.readdirSync(dir).length === 0
    } catch {
      return false
    }
  }

  function removeDirIfEmpty(dir) {
    if (isDirEmpty(dir)) removeDir(dir)
  }

  /**
   * 暂存根的安全闸（先于一切写入与清扫）。`.image-ingest` 若是 symlink —
   * 哪怕指向看起来无害的目录 —— 跟随它写入或递归删除都会越过 vault 边界
   * 落到外部目录，因此只接受「真实目录且 realpath 恰为 vault 内该名」。
   * 暂存区尚不存在返回 null；越界形态一律拒绝，让保存诚实失败。
   * @returns {string | null} 暂存根的真实路径，或 null（尚未创建）。
   */
  function realStagingRoot() {
    let vaultReal
    try {
      vaultReal = fs.realpathSync(vaultRoot)
    } catch {
      // vault 尚未创建（首次保存由 mkdir 建立）；此时暂存根不可能存在。
      return null
    }
    const root = stagingRoot()
    let info
    try {
      info = fs.lstatSync(root)
    } catch {
      return null
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new AssetsError('path-denied', 'staging root must be a real directory inside the vault')
    }
    if (fs.realpathSync(root) !== join(vaultReal, STAGING_ROOT_NAME)) {
      throw new AssetsError('path-denied', 'staging root resolves outside the assets vault')
    }
    return root
  }

  /** 清理路径用的非抛出版本：根不安全时不清，留残留也不能碰外部目录。 */
  function isSafeStagingRoot() {
    try {
      realStagingRoot()
      return true
    } catch {
      return false
    }
  }

  /**
   * 清本次保存自己的暂存片。scope 只能来自 newStagingScope —— 模式不符的
   * 输入永远不被当成路径跟随。根是 symlink 时整体跳过，不跟随。
   * @param {string} scope
   */
  function clearStagingSlice(scope) {
    const root = stagingRoot()
    if (!isSafeStagingRoot()) return
    if (STAGING_SCOPE_PATTERN.test(scope)) {
      const slice = join(root, scope)
      // 片本身也须是真实目录：symlink 片不递归跟随。
      let sliceInfo
      try {
        sliceInfo = fs.lstatSync(slice)
      } catch {
        sliceInfo = null
      }
      if (sliceInfo && !sliceInfo.isSymbolicLink()) removeDir(slice)
    }
    removeDirIfEmpty(root)
  }

  /**
   * 启动期清扫：只收本模块命名的过期片，不碰运行中的保存或其他目录。
   * runSave 开头的 root 校验不能担保到这里的间隔 —— 枚举与每一次删除
   * 之前都重新验证 root：若它已被换成 symlink/外部目录，宁可留残留也
   * 绝不跟随。这是可测试的保护边界，不是对 FD 级竞态的穷尽证明。
   */
  function sweepStaleSlices() {
    if (!isSafeStagingRoot()) return
    const root = stagingRoot()
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return
    }
    const cutoff = Date.now() - STAGING_STALE_MS
    for (const entry of entries) {
      if (!entry.isDirectory() || !STAGING_SCOPE_PATTERN.test(entry.name)) continue
      // 每次递归删除之前重检：读目录与 rm 之间 root 仍可能被换出。
      if (!isSafeStagingRoot()) return
      const dir = join(root, entry.name)
      if (isDirEmpty(dir)) {
        removeDir(dir)
        continue
      }
      try {
        if (fs.statSync(dir).mtimeMs < cutoff) removeDir(dir)
      } catch {
        // ignore
      }
    }
  }

  /**
   * 建立暂存根并确认它是真实目录。root 创建（非递归）与 scope 创建分开：
   * 缺席时只 mkdir 一层再立即 lstat/realpath 验证 —— 若在 mkdir 间隙被
   * 换成 symlink/文件，path-denied 在任何外部写入之前抛出。EEXIST 并发
   * 抢建同样回到验证路径，由验证判定它是什么。这收窄但不消除竞态窗口；
   * 可断言边界是「mkdir 前验证到的 null 不授权递归写入」，不加 native 依赖。
   * @returns {string} 验证过的真实暂存根路径。
   */
  function ensureStagingRoot() {
    const existing = realStagingRoot()
    if (existing !== null) return existing
    const root = stagingRoot()
    try {
      fs.mkdirSync(root, { recursive: false, mode: 0o700 })
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'EEXIST') {
        // 并发抢建或刚被换出的实体：交给下面的统一验证判定。
        return realStagingRoot()
      }
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        // vault 目录自身缺席（库尚未物化）：建立 vault 后重走验证，而不是
        // 递归 mkdir —— 那会把「root 是 symlink」与「父目录缺席」混为一谈。
        fs.mkdirSync(vaultRoot, { recursive: true })
        fs.mkdirSync(root, { recursive: false, mode: 0o700 })
      } else {
        throw error
      }
    }
    return realStagingRoot()
  }

  /**
   * 完整可读的既有同来源资产；文件缺失的旧记录不能当成功证据。
   * 同来源可能同时存在缺文件的旧条目与完整的新条目 —— 完整行优先，
   * 不能让靠前的烂记录挡住后面真正可用的资产。
   * @param {string} source
   */
  function completeExistingAsset(source) {
    const rows = library.list()
    let staleId
    for (const row of rows) {
      if (row.source !== source) continue
      const file = Array.isArray(row.files) && row.files.find((entry) => entry.kind === 'image' && (entry.size ?? 0) > 0)
      if (file) return { assetId: row.id, fileId: file.id }
      staleId ??= row.id
    }
    return staleId ? { staleId } : null
  }

  /**
   * 撤掉「本次提交声明了、但提交闸判定不完整」的新资产。只对本次新 id
   * 使用 —— 缺文件的旧记录不是本次保存的残骸，绝不进入此路径。
   * @param {string} assetId
   */
  function rollbackAddedAsset(assetId) {
    try {
      library.remove(assetId)
    } catch (error) {
      // 原失败照样向上抛；回滚失败必须留痕，不能吞成「好像已回滚」。
      console.warn('[omnimux-assets] asset rollback after failed commit did not complete', error)
    }
  }

  function uniqueDisplayName(baseName) {
    let candidate = baseName
    let suffix = 2
    while (typeof library.get === 'function' && library.get(candidate)) {
      const suffixText = ` (${suffix})`
      // 追加后缀不得超过 40 字上限：先给后缀预留长度，再去尾部点/空白。
      const head = baseName.slice(0, DISPLAY_NAME_MAX - suffixText.length).replace(/[.\s]+$/, '')
      candidate = `${head}${suffixText}`
      suffix += 1
    }
    return candidate
  }

  /**
   * @param {{ bytes: Uint8Array, mime: string, displayName?: string, sourceKey: string, description?: string }} input
   */
  async function runSave(input) {
    // 安全先于任何副作用：暂存根是 symlink（指向 vault 外）时在第一次
    // mkdir/清扫之前就拒绝，否则清扫会递归删除被指向的外部目录。
    realStagingRoot()
    sweepStaleSlices()
    const source = imageAssetSource(input.sourceKey)
    const existing = completeExistingAsset(source)
    if (existing && existing.assetId) {
      return {
        status: 'duplicate',
        assetId: existing.assetId,
        fileId: existing.fileId,
        lrev: library.revision(),
      }
    }
    // existing.staleId 是文件缺失的旧记录：它不能当成功证据，但也不授权
    // 销毁 —— 记录、assetId 与元信息保留在账本里，本次保存另建新条目；
    // 后续同来源保存会由 completeExistingAsset 优先命中新的完整资产。

    const ext = EXT_FOR_MIME[input.mime]
    const scope = newStagingScope()
    // root 建立+验证与 slice 建立分两步：唯一一次 slice mkdir 只对已验证的
    // 真实 root 做非递归创建 —— 不再用一次递归 mkdir 顺带建 root。
    const root = ensureStagingRoot()
    const slice = join(root, scope)
    try {
      try {
        fs.mkdirSync(slice, { recursive: false, mode: 0o700 })
      } catch (mkdirError) {
        // 片名由本模块生成，EEXIST 只能是预先落位的实体 —— 不豁免，交给
        // 下面的 lstat/realpath 验证判定它是什么（symlink 片照样拒绝）。
        if (!(mkdirError && typeof mkdirError === 'object' && mkdirError.code === 'EEXIST')) {
          throw mkdirError
        }
      }
      if (!isInsideDir(slice, vaultRoot)) {
        throw new AssetsError('path-denied', 'staging slice escapes assets vault')
      }
      // mkdir 跟随 symlink：词法检查之后用 lstat/realpath 再验一次，根或片
      // 是 symlink（或 mkdir 间隙被换成 symlink）都不能继续写入。
      const sliceInfo = fs.lstatSync(slice)
      if (sliceInfo.isSymbolicLink() || !sliceInfo.isDirectory()) {
        throw new AssetsError('path-denied', 'staging slice must be a real directory')
      }
      const vaultReal = fs.realpathSync(vaultRoot)
      const sliceReal = fs.realpathSync(slice)
      if (sliceReal !== join(vaultReal, STAGING_ROOT_NAME, scope) || !isInsideDir(sliceReal, vaultReal)) {
        throw new AssetsError('path-denied', 'staging slice resolves outside the assets vault')
      }
      // 暂存一份 + 受管副本一份：两份实际开销计入磁盘预检。
      assertDiskSpace(vaultRoot, input.bytes.byteLength * 2)
      const digest = createHash('sha256').update(input.bytes).digest('hex').slice(0, 16)
      const stagedFile = join(slice, `image-${digest}${ext}`)
      const tmpFile = `${stagedFile}.tmp`
      fs.writeFileSync(tmpFile, input.bytes, { mode: 0o600 })
      fs.renameSync(tmpFile, stagedFile)

      // 不同来源的同名片段在 copyIntoVault 的异步空档里会同时通过名称
      // 冲突检查（Q3）：名称预约与 add 提交放进同一串行队列，第二个保存
      // 看到第一个已落的名字再取 (2)。下载与暂存仍并行，只串行这一段。
      const asset = await enqueueCommit(() => library.add({
        name: uniqueDisplayName(sanitizeDisplayName(input.displayName)),
        type: 'custom',
        description: String(input.description ?? '').slice(0, DESCRIPTION_MAX),
        files: [{ real_path: stagedFile, original_name: `image-${digest}${ext}` }],
        source,
      }))

      // 提交完成性闸：恰好一个可读回的非空图片文件才算保存成功。
      const file = Array.isArray(asset?.files) && asset.files.length === 1 ? asset.files[0] : null
      if (!file || (file.size ?? 0) <= 0 || file.kind !== 'image') {
        rollbackAddedAsset(asset?.id)
        throw new AssetsError('internal', 'saved asset is missing its image file')
      }
      try {
        const preview = library.resolvePreview(asset.id, file.id)
        if (!preview || (preview.size ?? 0) <= 0 || preview.mime !== input.mime) {
          throw new AssetsError('internal', 'saved asset file does not preview')
        }
      } catch (error) {
        rollbackAddedAsset(asset.id)
        throw error instanceof AssetsError ? error : new AssetsError('internal', 'saved asset file does not preview')
      }

      emitChanged(asset)
      return {
        status: 'saved',
        assetId: asset.id,
        fileId: file.id,
        lrev: library.revision(),
      }
    } finally {
      clearStagingSlice(scope)
    }
  }

  /**
   * 保存一张已经过宿主解码校验的图片。
   * @param {{
   *   bytes: Uint8Array,
   *   mime: string,
   *   displayName?: string,
   *   sourceKey: string,
   *   description?: string,
   * }} input
   * @returns {Promise<{ status: 'saved' | 'duplicate', assetId: string, fileId: string, lrev: number }>}
   */
  async function ingestDownloadedImage(input) {
    const bytes = input?.bytes
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new AssetsError('invalid-argument', 'validated image bytes are required')
    }
    const mime = String(input.mime ?? '')
    if (!SUPPORTED_MIMES.has(mime)) {
      throw new AssetsError('invalid-argument', 'only verified raster image types are ingested')
    }
    const sourceKey = String(input.sourceKey ?? '').trim()
    // sourceKey 是宿主生成的规范 URL 摘要：严格的 64 位小写 hex。trim 后的
    // 值同时用于 in-flight 归并与持久化 —— 不能把带空白原值写进账本。
    if (!/^[0-9a-f]{64}$/.test(sourceKey)) {
      throw new AssetsError('invalid-argument', 'a normalized source key is required')
    }

    let pending = inFlight.get(sourceKey)
    if (!pending) {
      pending = runSave({ ...input, sourceKey }).finally(() => {
        if (inFlight.get(sourceKey) === pending) inFlight.delete(sourceKey)
      })
      inFlight.set(sourceKey, pending)
    }
    return pending
  }

  return { ingestDownloadedImage }
}
