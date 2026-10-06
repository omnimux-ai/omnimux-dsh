/**
 * 素材卡槽的槽位计算。
 *
 * 只读当前模型在执行中枢登记的 operations[].inputs，
 * 不在界面里另写张数、格式或时长。读不到契约时返回空，调用方不显示卡槽。
 */

/** 图像参考类契约操作 id：页签、推导、激活三处必须同一集合，不得分裂。 */
export const IMAGE_REFERENCE_OP_IDS = Object.freeze(['multi_reference', 'image_to_image', 'inpaint_outpaint']);
/** 图像编辑类契约操作 id。 */
export const IMAGE_EDIT_OP_IDS = Object.freeze(['image_edit']);

/** 参考类操作判定（页签/推导/激活共用，禁止各写一份）。 */
export function isImageReferenceOpId(id) {
  return IMAGE_REFERENCE_OP_IDS.includes(id);
}

/** 编辑类操作判定。 */
export function isImageEditOpId(id) {
  return IMAGE_EDIT_OP_IDS.includes(id);
}

/**
 * 图像操作的展示层标签（只用于回显，不决定提交行为；提交一律用操作 id）。
 * 参考类三 id（multi_reference / image_to_image / inpaint_outpaint）统一回显为「参考」，编辑类为「编辑」，其余为「文生图」。
 * @param {object|null} op
 * @returns {'文生图' | '参考' | '编辑'}
 */
export function imageOpDisplayLabel(op) {
  if (isImageEditOpId(op?.id)) return '编辑';
  if (isImageReferenceOpId(op?.id)) return '参考';
  return '文生图';
}

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

const IMAGE_MODE_ORDER = [...IMAGE_REFERENCE_OP_IDS, ...IMAGE_EDIT_OP_IDS, 'text_to_image'];

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
      found.minDurationSec = firstNumber(found.minDurationSec, input.minDurationSec);
      found.totalDurationMax = firstNumber(found.totalDurationMax, input.totalMaxDurationSec);
      found.maxSizeMb = firstNumber(found.maxSizeMb, input.maxSizeMb);
      continue;
    }
    groups.push({
      key,
      slot: rawSlot,
      type: input.type,
      role,
      max: finiteMax(input.max),
      durationMax: firstNumber(input.maxDurationSec, input.totalMaxDurationSec),
      minDurationSec: firstNumber(input.minDurationSec),
      totalDurationMax: firstNumber(input.totalMaxDurationSec),
      maxSizeMb: firstNumber(input.maxSizeMb),
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
 * 方案 C 双轨打点自适应机制：根据当前模型与已入槽素材自适应推导最佳契约操作。
 * @param {object} model
 * @param {'image' | 'video'} kind
 * @param {object | Array} [buckets]
 * @returns {object | null}
 */
export function deriveAdaptiveOperation(model, kind, buckets = {}, hintOpId = '') {
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
    // 操作 id 词汇统一：参考类含 image_to_image / inpaint_outpaint，不得出现「页签认识、推导不认识」的分裂。
    const refOp = operations.find((op) => isImageReferenceOpId(op.id));
    const editOp = operations.find((op) => isImageEditOpId(op.id));
    const textOp = operations.find((op) => op.id === 'text_to_image');
    if (imageCount === 0) {
      targetId = (textOp ?? refOp ?? editOp)?.id ?? null;
    } else if (imageCount === 1) {
      targetId = (editOp ?? refOp ?? textOp)?.id ?? null;
    } else {
      targetId = (refOp ?? editOp ?? textOp)?.id ?? null;
    }
  } else {
    // kind === 'video'
    if (!hasFirstFrame && !hasLastFrame && refVideosCount === 0) {
      targetId = 'text_to_video';
    } else if (hasFirstFrame && !hasLastFrame && refVideosCount === 0) {
      // 页签明确指向首尾帧时保持双帧操作：尾帧槽继续显示供补齐，不把双槽降成单槽（Issue #3045；提交时由调用方按实际素材再降级）
      targetId = hintOpId === 'first_last_frame' ? 'first_last_frame' : 'first_frame';
    } else if (hasFirstFrame && hasLastFrame && refVideosCount === 0) {
      targetId = 'first_last_frame';
    } else if (!hasFirstFrame && hasLastFrame && refVideosCount === 0) {
      // 孤立尾帧因模型不支持单尾帧，优雅降级为 text_to_video 或合适操作，不映射到强制双帧的 first_last_frame
      targetId = operations.some((op) => op.id === 'text_to_video') ? 'text_to_video' : (operations[0]?.id ?? null);
    } else if (refVideosCount > 0 && !hasFirstFrame && !hasLastFrame) {
      // 视频素材按页签分流：编辑页签归 video_edit，参考页签归 video_multi_ref。
      // 无页签提示（hintOpId 未给/非编辑）默认收敛 video_multi_ref——同接口全能入口。
      if (hintOpId === 'video_edit' && operations.some((op) => op.id === 'video_edit')) {
        targetId = 'video_edit';
      } else if (operations.some((op) => op.id === 'video_multi_ref')) {
        targetId = 'video_multi_ref';
      } else if (operations.some((op) => op.id === 'video_edit')) {
        targetId = 'video_edit';
      } else {
        targetId = operations[0]?.id ?? null;
      }
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
    // 纯文生图常驻提供 1 个 1:1 虚线空卡槽；
    // 上限与参考契约对齐（multi_reference 兜底 max:4），
    // 允许连续粘贴多图后自适应推导进入参考模式，不能 1 张就锁死。
    if (groups.length === 0) {
      return [{
        key: 'image:reference:reference',
        slot: 'reference',
        type: 'image',
        role: 'reference',
        max: 4,
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

/** 契约大小口径与提交校验一致：MiB。 */
const BYTES_PER_MB = 1024 * 1024;

/**
 * 这个文件能不能进这个槽。大小、时长只在读得到时判断，读不到交给提交校验。
 * @param {object} file
 * @param {object} slot
 * @param {number|null} [durationSec]
 * @param {{ existing?: Array<object> }} [context] 同卡槽已入槽素材，用于累计总时长
 */
export function rejectionOf(file, slot, durationSec, context = {}) {
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
  const mediaName = slot.type === 'audio' ? '音频' : '视频';
  const sizeBytes = sizeOf(file);
  if (Number.isFinite(slot.maxSizeMb) && Number.isFinite(sizeBytes) && sizeBytes > slot.maxSizeMb * BYTES_PER_MB) {
    return `文件不能超过 ${formatSeconds(slot.maxSizeMb)}MB`;
  }
  if (slot.durationMax != null && Number.isFinite(durationSec) && durationSec > slot.durationMax) {
    return `${mediaName}时长不能超过 ${formatSeconds(slot.durationMax)} 秒`;
  }
  if (Number.isFinite(slot.minDurationSec) && Number.isFinite(durationSec) && durationSec < slot.minDurationSec) {
    return `${mediaName}时长不能少于 ${formatSeconds(slot.minDurationSec)} 秒`;
  }
  if (Number.isFinite(slot.totalDurationMax) && Number.isFinite(durationSec)) {
    const used = (context.existing ?? []).reduce((sum, item) => {
      const value = durationOf(item);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    if (used + durationSec > slot.totalDurationMax) {
      return `${mediaName}总时长不能超过 ${formatSeconds(slot.totalDurationMax)} 秒`;
    }
  }
  return '';
}

/** 素材的字节数：本地文件取 File.size，资产库素材取元数据。读不到返回 NaN。 */
export function sizeOf(item) {
  const raw = item?.size ?? item?.sizeBytes ?? item?.file?.size ?? item?.raw?.size ?? item?.raw?.sizeBytes;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

/** 已入槽素材的时长（秒）。读不到返回 NaN。 */
export function durationOf(item) {
  const raw = item?.durationSec ?? item?.duration ?? item?.metadata?.durationSec ?? item?.metadata?.duration;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

/**
 * 组合规则锁：契约 inputGroups 中 min≥1 的组还没有任何素材时，组外卡槽不可单独添加。
 * 例：MiniMax H3 参考模式「音频不能单独输入」——无图/视频时锁音频卡槽。
 * @param {object|null} operation 当前生效的契约操作
 * @param {object} slot 待判断卡槽（slotPlan 产物）
 * @param {Array<object>} slots 当前全部卡槽
 * @param {(slot: object) => Array<object>} itemsOf 读取某卡槽已入槽素材
 * @returns {string} 锁定时返回契约提示，否则空串
 */
export function groupLockOf(operation, slot, slots, itemsOf) {
  const groups = Array.isArray(operation?.inputGroups) ? operation.inputGroups : [];
  if (!slot || groups.length === 0) return '';
  if (groups.some((group) => (group.slots ?? []).includes(slot.slot))) return '';
  for (const group of groups) {
    const min = Number.isFinite(group.min) ? group.min : 0;
    if (min < 1) continue;
    const members = (slots ?? []).filter((candidate) => (group.slots ?? []).includes(candidate.slot));
    const count = members.reduce((sum, member) => sum + (itemsOf(member)?.length ?? 0), 0);
    if (count < min) return group.hint || '请先添加必需的素材';
  }
  return '';
}

/**
 * 实际渲染的卡槽：被组合规则锁定且自身为空的卡槽不显示（不支持的直接不出现）。
 * 锁中但已有素材的卡槽保留显示，避免丢素材。
 * @param {Array<object>} slots
 * @param {object|null} operation
 * @param {(slot: object) => Array<object>} itemsOf
 */
export function visibleSlots(slots, operation, itemsOf) {
  return (slots ?? []).filter((slot) => {
    if (!groupLockOf(operation, slot, slots, itemsOf)) return true;
    return (itemsOf(slot)?.length ?? 0) > 0;
  });
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
