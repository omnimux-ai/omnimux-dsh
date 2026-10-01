/**
 * 素材卡槽的槽位计算。
 *
 * 只读当前模型在执行中枢登记的 operations[].inputs，
 * 不在界面里另写张数、格式或时长。读不到契约时返回空，调用方不显示卡槽。
 */

/**
 * 图像生成模式与契约操作对应：按 PM 规范统一收敛为 文生图、参考、编辑，彻底废除多图参考分裂
 */
export const IMAGE_MODE_OPTIONS = Object.freeze([
  { id: 'text_to_image', label: '文生图' },
  { id: 'multi_reference', label: '参考' },
  { id: 'image_edit', label: '编辑' },
]);

/** 视频生成模式与契约操作的对应。文案沿用输入框里已有的四个，再补契约里的「视频编辑」。 */
export const VIDEO_MODE_OPTIONS = Object.freeze([
  { id: 'text_to_video', label: '文生视频' },
  { id: 'first_frame', label: '首帧' },
  { id: 'first_last_frame', label: '首尾帧' },
  { id: 'video_multi_ref', label: '全能参考' },
  { id: 'video_edit', label: '编辑' },
]);

/**
 * 规范解析 bucketKey，提取出真正的 slotKey（消除裸 slice(2)）
 * bucketKey 格式通常为 `${mode}:${modelId}:${slotKey}`，例如 `video:kling:video:first_frame:0`
 * @param {string} key
 * @returns {string}
 */
export function extractSlotKeyFromBucketKey(key) {
  if (!key || typeof key !== 'string') return '';
  const firstColon = key.indexOf(':');
  if (firstColon === -1) return key;
  const secondColon = key.indexOf(':', firstColon + 1);
  if (secondColon === -1) return key;
  return key.slice(secondColon + 1);
}

/**
 * 统一卡槽存储 Key 生成器，避免硬编码模板字符串发散
 * @param {string} mode
 * @param {string} [modelId]
 * @param {string} [slotKey]
 * @returns {string}
 */
export function makeBucketKey(mode, modelId, slotKey) {
  return `${mode}:${modelId ?? ''}:${slotKey ?? ''}`;
}

/**
 * 精简前缀清洗纯函数：剥离打点前缀及残缺片段
 * @param {string} val
 * @param {Array<{ index: number, text: string }>} [savedAnnotations]
 * @returns {string}
 */
export function cleanAnnotationPrefix(val, savedAnnotations = []) {
  if (!savedAnnotations || savedAnnotations.length === 0) return val.trim();
  const prefix = savedAnnotations.map((a) => `标记 ${a.index}：${a.text}`).join('；');
  let rawSuffix = '';
  if (val.startsWith(prefix)) {
    rawSuffix = val.substring(prefix.length);
  } else {
    let temp = val.replace(/^(?:[^\S\r\n]*标记\s*\d+\s*[：:][^；;\n]*[；;\n])+/g, '');
    for (const a of savedAnnotations) {
      if (a.text) {
        const header = `标记 ${a.index}：${a.text}`;
        if (temp.startsWith(header)) {
          temp = temp.slice(header.length);
          break;
        }
        const headerTight = `标记 ${a.index}:${a.text}`;
        if (temp.startsWith(headerTight)) {
          temp = temp.slice(headerTight.length);
          break;
        }
      }
    }
    temp = temp.replace(/^[^\S\r\n]*标记\s*\d+\s*[：:]\s*/, '');
    rawSuffix = temp;
  }
  return rawSuffix
    .replace(/^(?:[；;\s]|标记\s*\d+\s*[：:])+/g, '')
    .trim();
}

const IMAGE_MODE_ORDER = ['multi_reference', 'image_edit', 'text_to_image'];

/** 一个操作里，同类型同角色的输入槽（首帧、尾帧各自独立，不合并）。 */
function slotGroups(operation) {
  const groups = [];
  for (const input of operation?.inputs ?? []) {
    if (!input || input.type === 'text' || input.role === 'prompt') continue;
    if (!['image', 'video', 'audio'].includes(input.type)) continue;
    const role = input.role ?? 'reference';
    const rawSlot = input.slot ?? role;
    let slotKeyPart = rawSlot;
    if (input.type === 'image') {
      if (role === 'reference' && (rawSlot === 'reference_images' || rawSlot === 'reference' || rawSlot === 'reference_image')) {
        slotKeyPart = 'reference';
      } else if (role === 'first_frame' || rawSlot === 'first_frame') {
        slotKeyPart = 'first_frame';
      } else if (role === 'last_frame' || rawSlot === 'last_frame') {
        slotKeyPart = 'last_frame';
      }
    }
    const key = `${input.type}:${role}:${slotKeyPart}`;
    const found = groups.find((group) => group.key === key);
    if (found) {
      found.max = mergeMax(found.max, input.max);
      found.durationMax = firstNumber(found.durationMax, input.maxDurationSec, input.totalMaxDurationSec);
      continue;
    }
    groups.push({
      key,
      slot: rawSlot,
      type: input.type,
      role,
      max: finiteMax(input.max),
      durationMax: firstNumber(input.maxDurationSec, input.totalMaxDurationSec),
      allowedMimes: Array.isArray(input.allowedMimes) ? [...input.allowedMimes] : [],
    });
  }
  return groups.filter((group) => group.max === null || group.max > 0);
}

function finiteMax(value) {
  if (value === null) return null;
  return Number.isFinite(value) ? value : 0;
}

function mergeMax(left, right) {
  const next = finiteMax(right);
  if (left === null || next === null) return null;
  return Math.max(left, next);
}

function firstNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

/** 模型原始记录上、输出类型匹配的操作。 */
export function operationsOf(model, kind) {
  if (!model) return [];
  const raw = model?.raw ?? model;
  const direct = (raw?.operations ?? model?.operations ?? []).filter(
    (operation) => !operation?.output?.type || operation.output.type === kind
  );
  if (direct.length > 0) return direct;
  // 当模型未显式携带 operations 时，为合法图像模型提供标准契约兜底
  if (kind === 'image' && model.id && model.id !== 'unknown') {
    return [
      { id: 'text_to_image', label: '文生图', output: { type: 'image' }, inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }] },
      {
        id: 'image_edit',
        label: '垫图参考',
        output: { type: 'image' },
        inputs: [
          { slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 },
          { slot: 'reference_image', type: 'image', role: 'reference', min: 0, max: 1 },
        ],
      },
      {
        id: 'multi_reference',
        label: '多图参考',
        output: { type: 'image' },
        inputs: [
          { slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 },
          { slot: 'reference_images', type: 'image', role: 'reference', min: 0, max: 4 },
        ],
      },
    ];
  }
  return [];
}

/**
 * 根据图像卡槽中的素材数量自动推导生成方式标签（保持历史兼容）
 * 0 张图 -> 文生图
 * 1 张图 -> 图片编辑
 * 多张图 -> 多图参考
 * @param {number} imageCount
 * @returns {'文生图' | '图片编辑' | '多图参考'}
 */
export function deriveImageOpModeFromCount(imageCount) {
  if (!imageCount || imageCount <= 0) return '文生图';
  if (imageCount === 1) return '图片编辑';
  return '多图参考';
}

/**
 * 方案 C 双轨打点自适应机制：根据当前模型与已入槽素材自适应推导最佳契约操作。
 * @param {object} model
 * @param {'image' | 'video'} kind
 * @param {object | Array} [buckets]
 * @returns {object | null}
 */
export function deriveAdaptiveOperation(model, kind, buckets = {}) {
  const operations = operationsOf(model, kind);
  if (operations.length === 0) return null;

  let allItems = [];
  let hasFirstFrame = false;
  let hasLastFrame = false;
  let refVideosCount = 0;

  if (Array.isArray(buckets)) {
    allItems = buckets;
  } else if (buckets && typeof buckets === 'object') {
    if (buckets.firstFrame) hasFirstFrame = true;
    if (buckets.lastFrame) hasLastFrame = true;
    if (Array.isArray(buckets.refVideos)) {
      allItems.push(...buckets.refVideos.map((it) => (it && !it.type ? { ...it, type: 'video' } : it)));
    }
    if (Array.isArray(buckets.imageAssets)) {
      allItems.push(...buckets.imageAssets);
    }

    for (const [key, val] of Object.entries(buckets)) {
      if (['firstFrame', 'lastFrame', 'refVideos', 'imageAssets'].includes(key)) continue;
      if (Array.isArray(val) && val.length > 0) {
        const slotKey = extractSlotKeyFromBucketKey(key).toLowerCase();
        const isFirstFrame = slotKey.includes('first_frame') || slotKey.includes('firstframe');
        const isLastFrame = slotKey.includes('last_frame') || slotKey.includes('lastframe');
        const isVideoSlot = !isFirstFrame && !isLastFrame && slotKey.includes('video');
        if (isFirstFrame) {
          hasFirstFrame = true;
        } else if (isLastFrame) {
          hasLastFrame = true;
        }
        for (const item of val) {
          if (isVideoSlot && item && !item.type) {
            allItems.push({ ...item, type: 'video' });
          } else {
            allItems.push(item);
          }
        }
      }
    }
  }

  for (const item of allItems) {
    if (item?.role === 'first_frame' || item?.slot === 'first_frame') hasFirstFrame = true;
    if (item?.role === 'last_frame' || item?.slot === 'last_frame') hasLastFrame = true;
    if (item?.type === 'video' || item?.role === 'video') refVideosCount++;
  }

  const imageCount = allItems.filter((item) => !item?.type || item.type === 'image').length;

  let targetId = null;

  if (kind === 'image') {
    if (imageCount === 0) {
      targetId = 'text_to_image';
    } else if (imageCount === 1) {
      if (operations.some((op) => op.id === 'image_edit')) {
        targetId = 'image_edit';
      } else if (operations.some((op) => op.id === 'multi_reference')) {
        targetId = 'multi_reference';
      } else {
        targetId = 'text_to_image';
      }
    } else {
      if (operations.some((op) => op.id === 'multi_reference')) {
        targetId = 'multi_reference';
      } else if (operations.some((op) => op.id === 'image_edit')) {
        targetId = 'image_edit';
      } else {
        targetId = 'text_to_image';
      }
    }
  } else {
    // kind === 'video'
    if (!hasFirstFrame && !hasLastFrame && refVideosCount === 0) {
      targetId = 'text_to_video';
    } else if (hasFirstFrame && !hasLastFrame && refVideosCount === 0) {
      targetId = 'first_frame';
    } else if (hasFirstFrame && hasLastFrame && refVideosCount === 0) {
      targetId = 'first_last_frame';
    } else if (!hasFirstFrame && hasLastFrame && refVideosCount === 0) {
      // 孤立尾帧因模型不支持单尾帧，优雅降级为 text_to_video 或合适操作，不映射到强制双帧的 first_last_frame
      targetId = operations.some((op) => op.id === 'text_to_video') ? 'text_to_video' : (operations[0]?.id ?? null);
    } else if (refVideosCount > 0 && !hasFirstFrame && !hasLastFrame) {
      targetId = operations.some((op) => op.id === 'video_edit') ? 'video_edit' : 'video_multi_ref';
    } else {
      targetId = 'video_multi_ref';
    }
  }

  const matched = operations.find((op) => op.id === targetId);
  return matched || operations[0] || null;
}

/**
 * 当前该用哪个操作。
 * 图像优先用带参考图的操作；视频用调用方选中的模式，选中的不存在就用第一个。
 */
export function activeOperation(model, kind, selectedId) {
  const operations = operationsOf(model, kind);
  if (operations.length === 0) return null;
  if (selectedId) {
    const selected = operations.find((operation) => operation.id === selectedId);
    if (selected) return selected;
  }
  if (kind === 'video') return operations[0];
  for (const id of IMAGE_MODE_ORDER) {
    const found = operations.find((operation) => operation.id === id);
    if (found && (id === 'text_to_image' || slotGroups(found).length > 0)) return found;
  }
  return operations.find((operation) => slotGroups(operation).length > 0) ?? operations[0];
}

/**
 * 当前输入框要渲染的卡槽。
 * 为图像模式纯文生图常驻提供 1 个 1:1 虚线空卡槽，为视频模式提供首尾帧引导槽。
 * @returns {Array<{ key: string, slot: string, type: 'image'|'video'|'audio', role: string, max: number|null, durationMax: number|null, label: string }>}
 */
export function slotPlan(model, kind, selectedOperationId) {
  const operations = operationsOf(model, kind);
  if (operations.length === 0) return [];

  const operation = activeOperation(model, kind, selectedOperationId);
  const groups = slotGroups(operation);

  if (kind === 'image') {
    // 纯文生图常驻提供 1 个 1:1 虚线空卡槽
    if (groups.length === 0) {
      return [{
        key: 'image:reference:reference',
        slot: 'reference',
        type: 'image',
        role: 'reference',
        max: 1,
        durationMax: null,
        allowedMimes: [],
        guidedOnly: true,
        label: '',
      }];
    }
    return groups.map((group) => ({
      ...group,
      label: slotLabel(group),
    }));
  }

  if (kind === 'video') {
    // 仅在 groups.length === 0 时启用引导槽降级，不强行覆盖模型已有合法 slots
    if (groups.length === 0) {
      return [
        {
          key: 'image:first_frame:first_frame',
          slot: 'first_frame',
          type: 'image',
          role: 'first_frame',
          max: 1,
          durationMax: null,
          allowedMimes: [],
          guidedOnly: true,
          label: '首帧',
        },
        {
          key: 'image:last_frame:last_frame',
          slot: 'last_frame',
          type: 'image',
          role: 'last_frame',
          max: 1,
          durationMax: null,
          allowedMimes: [],
          guidedOnly: true,
          label: '尾帧',
        },
      ];
    }
    return groups.map((group) => ({
      ...group,
      label: slotLabel(group),
    }));
  }

  return groups.map((group) => ({
    ...group,
    label: slotLabel(group),
  }));
}

function slotLabel(group) {
  if (group.role === 'first_frame') return '首帧';
  if (group.role === 'last_frame') return '尾帧';
  if (group.role === 'source') return '视频';
  if (group.type === 'video') return '';
  if (group.type === 'audio') return '';
  return '';
}

/**
 * 根据素材对象及其元数据、URL、文件名等精确推断具体 MIME 子类型
 * @param {object} asset
 * @returns {string} 精确 MIME，如 'image/svg+xml'、'image/jpeg'、'image/png' 等，推断不出返回空字符串
 */
export function inferMimeType(asset) {
  if (!asset || typeof asset !== 'object') return '';
  const directMime = asset.file?.type || asset.mime || asset.mimeType || asset.type;
  if (typeof directMime === 'string' && directMime.includes('/') && !directMime.endsWith('/')) {
    return directMime.toLowerCase();
  }

  const url = typeof asset.url === 'string' ? asset.url : '';
  const dataMatch = url.match(/^data:([^;,]+)/i);
  if (dataMatch && dataMatch[1] && dataMatch[1].includes('/') && !dataMatch[1].endsWith('/')) {
    return dataMatch[1].toLowerCase();
  }

  const urlCandidate = url && !url.startsWith('blob:') ? url.split('?')[0].split('#')[0] : '';
  const candidate = (urlCandidate || asset.name || asset.title || '').toLowerCase();
  if (/\.svg$/i.test(candidate)) return 'image/svg+xml';
  if (/\.(jpe?g)$/i.test(candidate)) return 'image/jpeg';
  if (/\.png$/i.test(candidate)) return 'image/png';
  if (/\.webp$/i.test(candidate)) return 'image/webp';
  if (/\.gif$/i.test(candidate)) return 'image/gif';
  if (/\.bmp$/i.test(candidate)) return 'image/bmp';
  if (/\.mp4$/i.test(candidate)) return 'video/mp4';
  if (/\.webm$/i.test(candidate)) return 'video/webm';
  if (/\.mov$/i.test(candidate)) return 'video/quicktime';
  if (/\.mp3$/i.test(candidate)) return 'audio/mpeg';
  if (/\.wav$/i.test(candidate)) return 'audio/wav';
  if (/\.ogg$/i.test(candidate)) return 'audio/ogg';
  if (/\.m4a$/i.test(candidate)) return 'audio/mp4';

  return '';
}

/** 这个文件能不能进这个槽。时长只在读得到时判断。 */
export function rejectionOf(file, slot, durationSec) {
  if (!file || !slot) return '请选择文件';
  let fileType = file.type || '';
  if (!fileType || fileType.endsWith('/')) {
    fileType = inferMimeType(file) || fileType;
  }
  const kind = fileType.startsWith('image/')
    ? 'image'
    : fileType.startsWith('video/')
      ? 'video'
      : fileType.startsWith('audio/')
        ? 'audio'
        : 'other';
  if (kind !== slot.type) {
    const name = { image: '图片', video: '视频', audio: '音频' }[slot.type];
    return `请上传${name}，当前文件格式不符合要求`;
  }
  if (Array.isArray(slot.allowedMimes) && slot.allowedMimes.length > 0) {
    const effectiveType = (!fileType || fileType.endsWith('/')) ? (inferMimeType(file) || fileType) : fileType;
    // 消除伪 MIME (如 image/) 宽泛放行，若声明了严格 allowedMimes 白名单则做严格子类型比对
    if (!effectiveType || effectiveType.endsWith('/') || !slot.allowedMimes.includes(effectiveType)) {
      return '当前文件格式不符合要求';
    }
  }
  if (slot.durationMax != null && Number.isFinite(durationSec) && durationSec > slot.durationMax) {
    return `${slot.type === 'audio' ? '音频' : '视频'}时长不能超过 ${formatSeconds(slot.durationMax)} 秒`;
  }
  return '';
}

function formatSeconds(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/**
 * 权威单一真源 URL 白名单判定函数：
 * 可提交地址只含同源相对路径 /（排除 //）、公网 https://、不超过 5MB 的光栅图 data URL。
 * blob: 只用于本地预览，不能当作可提交参考地址。
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedReferenceUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host.endsWith('.local') ||
        host.startsWith('[') ||
        host.includes(':') ||
        /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
      ) {
        return false;
      }
      return true;
    } catch {}
    return false;
  }
  if (trimmed.startsWith('blob:')) return false;
  if (/^data:image\/(?:png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    const base64 = trimmed.slice(trimmed.indexOf(',') + 1);
    const estimatedBytes = Math.floor((base64.length * 3) / 4);
    return estimatedBytes <= (5 * 1024 * 1024);
  }
  return false;
}

/** 删掉下标处的一项后，新的顺序：被删项的右侧依次左移，左侧不动。 */
export function orderAfterRemoval(items, index) {
  if (!Array.isArray(items) || index < 0 || index >= items.length) return Array.isArray(items) ? [...items] : [];
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

/**
 * 优化本地上传资产的序列化与透传协议：
 * 接收当前 activeOperation 契约上下文，自动根据 operation.inputs 校验并自愈绑定真实 slot，
 * 彻底消除单复数不匹配（如 reference_image vs reference_images）或硬编码假设导致的后端 500。
 * @param {Array<object>} assets
 * @param {object} [activeOperation]
 * @returns {Array<{ slot?: string, type: string, role: string, name?: string, url?: string, assetId?: string }>}
 */
export function serializeReferenceAssets(assets, activeOperation) {
  if (!Array.isArray(assets)) return [];
  const targetInputs = (activeOperation?.inputs || []).filter(
    (input) => input && input.type !== 'text' && input.role !== 'prompt'
  );

  return assets
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const normalizeReferenceUrl = (value) => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        if (isAllowedReferenceUrl(trimmed) && !trimmed.startsWith('blob:')) return trimmed;
        return undefined;
      };
      const rawUrl = normalizeReferenceUrl(item.url) || normalizeReferenceUrl(item.path);
      // 站内相对路径（以 / 开头且非 //）自动补全当前 window.location.origin，确保后端与外部探针可正确通过 HTTP 读取
      const validUrl = (rawUrl && rawUrl.startsWith('/') && !rawUrl.startsWith('//') && typeof window !== 'undefined' && window.location?.origin)
        ? `${window.location.origin}${rawUrl}`
        : rawUrl;
      const validAssetId = item.assetId != null && String(item.assetId).trim() !== ''
        ? String(item.assetId)
        : undefined;

      // 动态自愈推导当前 asset 在目标 activeOperation 中的真实合规 slot
      let resolvedSlot = item.slot != null ? String(item.slot) : undefined;
      if (targetInputs.length > 0) {
        const exactMatch = targetInputs.some((inp) => inp.slot === resolvedSlot);
        if (!exactMatch) {
          // 查找别名或基于 role/type 匹配
          const roleMatched = targetInputs.find(
            (inp) => (item.role && inp.role === item.role) || (item.type && inp.type === item.type)
          );
          if (roleMatched && roleMatched.slot) {
            resolvedSlot = roleMatched.slot;
          } else {
            resolvedSlot = targetInputs[0]?.slot || resolvedSlot;
          }
        }
      }

      const normalized = {
        slot: resolvedSlot,
        type: item.type || 'image',
        role: item.role || 'reference',
        name: item.name || item.title || undefined,
        url: validUrl,
        pathOrUrl: validUrl,
        assetId: validAssetId,
      };
      const cleaned = {};
      for (const [key, value] of Object.entries(normalized)) {
        if (value !== undefined) {
          cleaned[key] = value;
        }
      }
      return cleaned;
    })
    .filter((item) => Boolean(item.url || item.assetId));
}

/**
 * 模式/模型切换平滑裁剪与自愈纯函数：
 * 根据目标操作中各输入槽位的真实 max 和允许类型，对当前素材进行 FIFO 截断与类型校验。
 * 超出容量的素材自动丢弃，保留前 max 项，杜绝脏数据滞留或超额提交导致的后端校验报错。
 * @param {Record<string, Array<object>>} currentBuckets
 * @param {object} targetOperation
 * @param {'image' | 'video'} [targetKind]
 * @returns {{
 *   cleanBuckets: Record<string, Array<object>>,
 *   didPrune: boolean,
 *   prunedCount: number,
 *   keptCount: number
 * }}
 */
export function pruneAssetsOnModeSwitch(currentBuckets = {}, targetOperation, targetKind = 'image') {
  if (!currentBuckets || typeof currentBuckets !== 'object') {
    return { cleanBuckets: {}, didPrune: false, prunedCount: 0, keptCount: 0 };
  }
  const cleanBuckets = {};
  let prunedCount = 0;
  let keptCount = 0;

  // 获取目标操作定义的所有媒体输入槽位
  const targetInputs = (targetOperation?.inputs || []).filter(
    (input) => input && input.type !== 'text' && input.role !== 'prompt'
  );

  for (const [bKey, rawItems] of Object.entries(currentBuckets)) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      cleanBuckets[bKey] = [];
      continue;
    }

    const slotKey = extractSlotKeyFromBucketKey(bKey).toLowerCase();
    // 寻找匹配的目标 input 槽位
    let matchedInput = targetInputs.find((inp) => {
      const inpSlot = (inp.slot || '').toLowerCase();
      const inpRole = (inp.role || '').toLowerCase();
      return (
        slotKey === inpSlot ||
        slotKey.includes(inpRole) ||
        (inpRole === 'reference' && (slotKey.includes('reference') || slotKey.includes('image'))) ||
        (inpRole === 'first_frame' && slotKey.includes('first')) ||
        (inpRole === 'last_frame' && slotKey.includes('last'))
      );
    });

    // 容量上限：若命中目标 input 则取 input.max，未命中或无输入槽则默认 1
    const allowedMax = (matchedInput && Number.isFinite(matchedInput.max))
      ? Math.max(0, matchedInput.max)
      : (targetInputs.length === 0 ? 1 : 1);

    // 过滤不合规模态类型并截断
    const validItems = rawItems.filter((item) => {
      if (!item) return false;
      const itemType = item.type || (targetKind === 'video' ? 'video' : 'image');
      if (targetKind === 'image' && itemType === 'video') return false;
      return true;
    });

    const keptItems = validItems.slice(0, allowedMax);
    const prunedFromThisBucket = rawItems.length - keptItems.length;
    if (prunedFromThisBucket > 0) {
      prunedCount += prunedFromThisBucket;
    }
    keptCount += keptItems.length;
    cleanBuckets[bKey] = keptItems;
  }

  return {
    cleanBuckets,
    didPrune: prunedCount > 0,
    prunedCount,
    keptCount,
  };
}
