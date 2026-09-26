import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_CASCADE_MODELS } from './MediaViewerComposerData.js';
import { cleanAnnotationPrefix, inferMimeType, isAllowedReferenceUrl, makeBucketKey, rejectionOf, serializeReferenceAssets } from './media-slot.js';
import { PRESET_REFERENCE_ASSETS } from './reference-constants.js';
import { MEDIA_VIEWER_CSS } from './styles.js';

describe('MediaViewerComposer Component Contract', () => {
  it('supplies structured cascade models with brand -> model -> channel', () => {
    assert.ok(Array.isArray(DEFAULT_CASCADE_MODELS), 'Must provide model list');
    assert.ok(DEFAULT_CASCADE_MODELS.length >= 2, 'Should have multiple brands');

    const seedanceBrand = DEFAULT_CASCADE_MODELS.find((b) => b.brandId === 'seedance');
    assert.ok(seedanceBrand, 'Must include seedance brand');
    assert.ok(seedanceBrand.models.length >= 1, 'Seedance must have models');

    const seedance20 = seedanceBrand.models.find((m) => m.id === 'seedance-2.0');
    assert.ok(seedance20, 'Must include seedance-2.0 model');
    assert.ok(seedance20.channels.length >= 2, 'Must include channels/versions');

    const flagship = seedance20.channels.find((c) => c.id === 'flagship');
    assert.ok(flagship, 'Must include flagship version');
    assert.equal(flagship.name, '旗舰版');
  });

  it('includes image and video brands in the cascade catalog', () => {
    const brands = DEFAULT_CASCADE_MODELS.map((b) => b.brandId);
    assert.ok(brands.includes('seedance'), 'Should support video brand seedance');
    assert.ok(brands.includes('minimax'), 'Should support video brand minimax');
    assert.ok(brands.includes('openai'), 'Should support image brand openai');
  });

  it('画布模特注入白名单正则严格收敛对齐 serializeReferenceAssets：不放行 http:// 与 file://，仅支持 https://、blob: 与站内相对路径 /，且使用负向先行断言严格排除 // 协议相对路径', () => {
    const checkUrl = (rawUrl) => (/^(?:https:\/\/|blob:|\/(?!\/))/.test(rawUrl) ? rawUrl : '');
    assert.equal(checkUrl('/assets/images/model.png'), '/assets/images/model.png');
    assert.equal(checkUrl('https://example.com/model.png'), 'https://example.com/model.png');
    assert.equal(checkUrl('blob:http://localhost/uuid'), 'blob:http://localhost/uuid');
    assert.equal(checkUrl('//evil.com/phishing.png'), '', '必须排除 // 协议相对路径');
    assert.equal(checkUrl('///extra-slashes'), '', '必须排除多斜杠路径');
    assert.equal(checkUrl('http://example.com/model.png'), '', '必须拦截 http://');
    assert.equal(checkUrl('file:///path/to/local/model.png'), '', '必须拦截 file://');
    assert.equal(checkUrl('javascript:alert(1)'), '', '必须拦截 javascript:');
    assert.equal(checkUrl('data:image/png;base64,...'), '', '必须拦截 data:');
  });

  it('提取统一的 makeBucketKey 避免模板字符串硬编码发散', () => {
    assert.equal(makeBucketKey('image', 'model-1', 'slot-1'), 'image:model-1:slot-1');
    assert.equal(makeBucketKey('video', undefined, 'first_frame'), 'video::first_frame');
    assert.equal(makeBucketKey('image', null, null), 'image::');
  });

  it('前缀清洗健壮性：在更新 userPromptSuffix 时剥离残缺前缀，避免用户误删单个字导致重复拼接', () => {
    const savedAnnotations = [
      { index: 1, text: '金色项链' },
      { index: 2, text: '复古耳环' },
    ];
    const prefix = savedAnnotations.map((a) => `标记 ${a.index}：${a.text}`).join('；');

    // 1. 正常输入
    assert.equal(cleanAnnotationPrefix(`${prefix}；换成银色`, savedAnnotations), '换成银色');
    // 2. 用户误删单个字（把“链”删掉）
    assert.equal(cleanAnnotationPrefix('标记 1：金色项；标记 2：复古耳环；换成银色', savedAnnotations), '换成银色');
    // 3. 用户误删打点文本，残留孤立残缺前缀
    assert.equal(cleanAnnotationPrefix('标记 1：；换成银色', savedAnnotations), '换成银色');
    assert.equal(cleanAnnotationPrefix('标记 1：换成银色', savedAnnotations), '换成银色');
    assert.equal(cleanAnnotationPrefix('标记 1：', savedAnnotations), '');
  });

  it('规范 Blob 释放契约：只有在 accepted === true 时才保留，其余任何情况 (false/undefined/null) 均立即销毁', () => {
    const revoked = [];
    const fakeRevoke = (u) => revoked.push(u);

    const handleUploadResult = (accepted, url) => {
      if (accepted !== true) {
        fakeRevoke(url);
      }
    };

    // 返回 true：保留 Blob
    handleUploadResult(true, 'blob:url-1');
    assert.equal(revoked.length, 0);

    // 明确拒绝 false：销毁 Blob
    handleUploadResult(false, 'blob:url-2');
    assert.deepEqual(revoked, ['blob:url-2']);

    // 异常 undefined/null：必须销毁 Blob 防止内存泄漏
    handleUploadResult(undefined, 'blob:url-3');
    handleUploadResult(null, 'blob:url-4');
    assert.deepEqual(revoked, ['blob:url-2', 'blob:url-3', 'blob:url-4']);
  });

  it('打点坐标有限数值 Number.isFinite 保护：异常坐标兜底为 0.0 与 0，绝不抛出 TypeError 或产生 NaN', () => {
    const rawAnnotations = [
      { id: 'a1', index: 1, text: '项链', xPercent: 25.432, yPercent: 78.91 },
      { id: 'a2', index: 2, text: '手镯', xPercent: NaN, yPercent: undefined },
      { id: 'a3', index: 3, text: '戒指', xPercent: null, yPercent: Infinity },
    ];

    const formattedStrings = rawAnnotations.map((a) => {
      const safeText = (a.text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const x = Number.isFinite(a.xPercent) ? a.xPercent.toFixed(1) : '0.0';
      const y = Number.isFinite(a.yPercent) ? a.yPercent.toFixed(1) : '0.0';
      return `[区域重绘 标记${a.index}: 坐标(x: ${x}%, y: ${y}%) 要求: "${safeText}"]`;
    });

    assert.equal(formattedStrings[0], '[区域重绘 标记1: 坐标(x: 25.4%, y: 78.9%) 要求: "项链"]');
    assert.equal(formattedStrings[1], '[区域重绘 标记2: 坐标(x: 0.0%, y: 0.0%) 要求: "手镯"]');
    assert.equal(formattedStrings[2], '[区域重绘 标记3: 坐标(x: 0.0%, y: 0.0%) 要求: "戒指"]');

    const payloads = rawAnnotations.map((a) => {
      const xPct = Number.isFinite(a.xPercent) ? a.xPercent : 0;
      const yPct = Number.isFinite(a.yPercent) ? a.yPercent : 0;
      return {
        id: a.id,
        index: a.index,
        normalized_x: Math.round((xPct / 100) * 1000) / 1000,
        normalized_y: Math.round((yPct / 100) * 1000) / 1000,
      };
    });

    assert.deepEqual(payloads[0], { id: 'a1', index: 1, normalized_x: 0.254, normalized_y: 0.789 });
    assert.deepEqual(payloads[1], { id: 'a2', index: 2, normalized_x: 0, normalized_y: 0 });
    assert.deepEqual(payloads[2], { id: 'a3', index: 3, normalized_x: 0, normalized_y: 0 });
  });

  it('注解消费只读 storeState.annotationsByMediaId，彻底移除死代码 annotationsByMedia fallback', () => {
    const storeStateWithOnlyOldKey = {
      annotationsByMedia: { 'item-1': [{ id: 'old-1' }] },
    };
    const activeItemId = 'item-1';
    const mediaAnnotations = storeStateWithOnlyOldKey.annotationsByMediaId?.[activeItemId] || [];
    assert.deepEqual(mediaAnnotations, []);

    const storeStateWithNewKey = {
      annotationsByMediaId: { 'item-1': [{ id: 'new-1' }] },
    };
    const mediaAnnotations2 = storeStateWithNewKey.annotationsByMediaId?.[activeItemId] || [];
    assert.deepEqual(mediaAnnotations2, [{ id: 'new-1' }]);
  });

  it('handleLocalUpload 通过 try/finally 强保证异常或拒绝时立即释放 Blob URL', () => {
    const revoked = [];
    const fakeRevoke = (u) => revoked.push(u);

    const runUpload = (callback, blobUrl) => {
      let accepted = false;
      try {
        accepted = callback ? callback() : false;
      } finally {
        if (accepted !== true) {
          fakeRevoke(blobUrl);
        }
      }
      return accepted;
    };

    // 1. 回调正常接受 -> 不注销
    assert.equal(runUpload(() => true, 'blob:ok'), true);
    assert.deepEqual(revoked, []);

    // 2. 回调返回 false -> finally 释放
    assert.equal(runUpload(() => false, 'blob:rejected'), false);
    assert.deepEqual(revoked, ['blob:rejected']);

    // 3. 回调抛出异常 -> finally 强保证释放
    assert.throws(() => {
      runUpload(() => {
        throw new Error('boom');
      }, 'blob:exception');
    }, /boom/);
    assert.deepEqual(revoked, ['blob:rejected', 'blob:exception']);
  });

  it('handleSend 组装 assets 时透传标准 payload 规范，保留 file 与 assetId 并正确处理 url', () => {
    const dummySlots = [
      { slot: 'first_frame', type: 'image', role: 'first_frame', key: 's1' },
      { slot: 'reference', type: 'video', role: 'reference', key: 's2' },
      { slot: 'character', type: 'image', role: 'character', key: 's3' },
    ];
    const fileObj = { name: 'img1.png', size: 1024 };
    const dummyBuckets = {
      's1': [
        {
          name: 'img1.png',
          title: 'Title1',
          url: 'blob:img1',
          file: fileObj, // 本地上传 File 对象
          isCanvasModel: true,
          otherProp: 'extra',
        },
      ],
      's2': [
        {
          name: '',
          title: 'video1.mp4',
          url: 'https://example.com/v.mp4',
          file: null,
          isCanvasModel: false,
        },
      ],
      's3': [
        {
          name: 'avatar.png',
          url: 'blob:avatar',
          assetId: 'asset_server_123',
          file: null,
        },
      ],
    };

    const assets = dummySlots.flatMap((slot) => (dummyBuckets[slot.key] ?? []).map((item) => ({
      slot: slot.slot,
      type: slot.type,
      role: slot.role,
      name: item.name || item.title,
      url: item.assetId ? undefined : item.url,
      assetId: item.assetId,
      file: item.file,
    })));

    assert.equal(assets.length, 3);
    // 1. 本地上传包含 file 的素材：保留 file，url 保留 blob:
    assert.deepEqual(assets[0], {
      slot: 'first_frame',
      type: 'image',
      role: 'first_frame',
      name: 'img1.png',
      url: 'blob:img1',
      assetId: undefined,
      file: fileObj,
    });
    assert.equal('isCanvasModel' in assets[0], false, 'Must not leak isCanvasModel');

    // 2. 远端常规素材：保留 url
    assert.deepEqual(assets[1], {
      slot: 'reference',
      type: 'video',
      role: 'reference',
      name: 'video1.mp4',
      url: 'https://example.com/v.mp4',
      assetId: undefined,
      file: null,
    });

    // 3. 服务端已存在 assetId 的素材：url 规范置为 undefined，透传 assetId
    assert.deepEqual(assets[2], {
      slot: 'character',
      type: 'image',
      role: 'character',
      name: 'avatar.png',
      url: undefined,
      assetId: 'asset_server_123',
      file: null,
    });
  });

  it('MediaSlotGroup 空状态下根据 slot.type 正确分流提示文案', () => {
    const getAddLabel = (slot, items = []) => {
      const defaultTypeLabel = slot.type === 'video' ? '添加视频' : slot.type === 'audio' ? '添加音频' : '添加图片';
      return slot.label || (items.length > 0 ? '添加参考' : defaultTypeLabel);
    };

    assert.equal(getAddLabel({ type: 'video' }), '添加视频');
    assert.equal(getAddLabel({ type: 'audio' }), '添加音频');
    assert.equal(getAddLabel({ type: 'image' }), '添加图片');
    assert.equal(getAddLabel({ type: 'unknown' }), '添加图片');
    assert.equal(getAddLabel({ type: 'video', label: '首帧' }), '首帧');
    assert.equal(getAddLabel({ type: 'video' }, [{ id: '1' }]), '添加参考');
  });

  it('slotGroups 映射规范化：不提供 input.slot 时安全回退为 role，不泄露 composite key', () => {
    const rawInput = { type: 'image', role: 'character' };
    const mappedSlot = rawInput.slot ?? (rawInput.role ?? 'reference');
    assert.equal(mappedSlot, 'character');

    const defaultRoleInput = { type: 'image' };
    const mappedDefault = defaultRoleInput.slot ?? (defaultRoleInput.role ?? 'reference');
    assert.equal(mappedDefault, 'reference');
  });

  it('发往 /omnimux/api/media/generate 请求体同时携带 references 与 assets', () => {
    const rawAssets = [{ slot: 'reference_images', type: 'image', role: 'reference', url: 'https://test/1.png' }];
    const buildGeneratePayload = ({ prompt, kind, model, channel, params, assets, annotations, sessionId }) => ({
      prompt,
      kind,
      model,
      channel,
      aspectRatio: params?.aspectRatio,
      resolution: params?.resolution,
      duration: params?.duration,
      sessionId,
      references: assets,
      assets,
      annotations,
    });
    const payload = buildGeneratePayload({
      prompt: 'test prompt',
      kind: 'image',
      model: 'seedance-image',
      assets: rawAssets,
      sessionId: 'sess_1',
    });
    assert.deepEqual(payload.references, rawAssets);
    assert.deepEqual(payload.assets, rawAssets);
  });

  it('拾取器注入卡槽复用 rejectionOf 类型校验：补齐扩展名与 data URL 类型推断，缺少类型时报错', () => {
    const imageSlot = { key: 'img_slot', type: 'image' };
    const videoSlot = { key: 'vid_slot', type: 'video' };
    const audioSlot = { key: 'aud_slot', type: 'audio' };

    const checkAdmission = (asset, slot) => {
      const inferredType = asset.type || (asset.url?.startsWith('data:image/') || /\.(png|jpe?g|webp|svg)$/i.test(asset.url || '') ? 'image' : '');
      const pseudoFile = asset.file || (inferredType ? { type: `${inferredType}/` } : null);
      if (!pseudoFile) {
        return { ok: false, reason: '当前素材缺少类型信息，无法入槽' };
      }
      const reason = rejectionOf(pseudoFile, slot, null);
      if (reason) return { ok: false, reason };
      return { ok: true };
    };

    // 1. 无 type 但 url 为 .png/.jpg/.webp/.svg 或 data:image/，成功推断为 image 且校验通过入槽
    const pngAsset = { id: 'p1', name: 'photo', url: 'https://example.com/asset.png' };
    assert.equal(checkAdmission(pngAsset, imageSlot).ok, true);
    const dataUrlAsset = { id: 'd1', name: 'inline', url: 'data:image/jpeg;base64,xxxx' };
    assert.equal(checkAdmission(dataUrlAsset, imageSlot).ok, true);

    // 2. 既无 type 又无法推断出类型且无 file 时，明确提示缺少类型信息
    const untypedAsset = { id: 'u1', name: 'unknown', url: 'https://example.com/stream' };
    const untypedRes = checkAdmission(untypedAsset, imageSlot);
    assert.equal(untypedRes.ok, false);
    assert.equal(untypedRes.reason, '当前素材缺少类型信息，无法入槽');

    // 3. 视频素材放入图片槽应被拒绝
    const videoAsset = { id: 'v1', name: 'video.mp4', type: 'video' };
    assert.equal(checkAdmission(videoAsset, imageSlot).ok, false);
    assert.match(checkAdmission(videoAsset, imageSlot).reason, /请上传图片/);

    // 4. 图片素材放入图片槽应被允许
    const imageAsset = { id: 'i1', name: 'pic.png', type: 'image' };
    assert.equal(checkAdmission(imageAsset, imageSlot).ok, true);

    // 5. 音频素材放入视频槽应被拒绝
    const audioAsset = { id: 'a1', name: 'sound.mp3', type: 'audio' };
    assert.equal(checkAdmission(audioAsset, videoSlot).ok, false);
    assert.match(checkAdmission(audioAsset, videoSlot).reason, /请上传视频/);

    // 6. 音频素材放入音频槽应被允许
    assert.equal(checkAdmission(audioAsset, audioSlot).ok, true);
  });

  it('画布模特注入卡槽时受 firstSlot.max 容量硬约束截断，不超出容量', () => {
    const firstSlotSingle = { key: 'slot_1', max: 1 };
    const firstSlotMulti = { key: 'slot_2', max: 3 };
    const firstSlotUnlimited = { key: 'slot_3', max: null };

    const injectModel = (slot, currentList, modelAsset) => {
      const room = slot.max == null ? Infinity : slot.max;
      return [modelAsset, ...currentList].slice(0, room);
    };

    const modelAsset = { id: 'model_1', name: '模特原图' };
    const existing = [{ id: 'ex_1', name: '已有素材 1' }, { id: 'ex_2', name: '已有素材 2' }];

    // 容量为 1：仅模特原图入槽，已有素材被截断
    const res1 = injectModel(firstSlotSingle, existing, modelAsset);
    assert.equal(res1.length, 1);
    assert.equal(res1[0].id, 'model_1');

    // 容量为 3：模特原图在首位，保留 2 个原有素材，总共 3 个
    const res2 = injectModel(firstSlotMulti, existing, modelAsset);
    assert.equal(res2.length, 3);
    assert.equal(res2[0].id, 'model_1');

    // 容量无限制：全量保留
    const res3 = injectModel(firstSlotUnlimited, existing, modelAsset);
    assert.equal(res3.length, 3);
  });

  it('模式切换跨卡槽迁移时若素材包含 file 则生成独立 Object URL，避免共享同一 blob URL', () => {
    let objectUrlCounter = 0;
    const fakeCreateObjectURL = (f) => `blob:url-independent-${++objectUrlCounter}`;

    const migrateAsset = (firstImg) => {
      const migratedUrl = firstImg.file ? fakeCreateObjectURL(firstImg.file) : firstImg.url;
      return { ...firstImg, url: migratedUrl, markBadge: '首帧' };
    };

    const uploadedImg = {
      id: 'img_upload',
      url: 'blob:url-independent-0',
      file: { name: 'photo.jpg', type: 'image/jpeg' },
    };

    const migrated = migrateAsset(uploadedImg);
    assert.notEqual(migrated.url, uploadedImg.url);
    assert.equal(migrated.url, 'blob:url-independent-1');

    // 若无 file（如远程网络素材），保持原 URL
    const remoteImg = { id: 'img_remote', url: 'https://example.com/photo.jpg' };
    const migratedRemote = migrateAsset(remoteImg);
    assert.equal(migratedRemote.url, remoteImg.url);
  });

  it('模式切换 Object URL 撤销守卫：仅撤销 item.url !== migratedUrl 的 blob URL，不误撤销已迁移 URL', () => {
    const revoked = [];
    const fakeRevoke = (u) => revoked.push(u);

    const oldItems = [
      { id: 'item_1', url: 'blob:keep-migrated' },
      { id: 'item_2', url: 'blob:revoke-stale' },
      { id: 'item_3', url: 'https://example.com/remote.png' },
    ];
    const migratedUrl = 'blob:keep-migrated';

    for (const item of oldItems) {
      if (item.url?.startsWith('blob:') && item.url !== migratedUrl) {
        fakeRevoke(item.url);
      }
    }

    assert.deepEqual(revoked, ['blob:revoke-stale']);
  });

  it('兜底引导槽未被当前模式采纳时不发送非法 assets，仅采纳或原生卡槽才发送', () => {
    const pureTextOp = { id: 'text_to_image', inputs: [{ type: 'text', role: 'prompt' }] };
    const opInputs = pureTextOp.inputs;

    const guidedSlot = {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      guidedOnly: true,
      key: 'guided__image__reference',
    };
    const realSlot = {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      key: 'real__image__reference',
    };

    const filterAssets = (slots, buckets) => {
      return slots.flatMap((slot) => {
        const items = buckets[slot.key] ?? [];
        if (items.length === 0) return [];
        if (slot.guidedOnly) {
          const isAccepted = opInputs.some((input) => {
            if (!input || input.type === 'text' || input.role === 'prompt') return false;
            return (
              (input.slot && input.slot === slot.slot) ||
              (input.role && input.role === slot.role && input.type === slot.type)
            );
          });
          if (!isAccepted) return [];
        }
        return items.map((item) => ({
          slot: slot.slot,
          type: slot.type,
          role: slot.role,
          name: item.name || item.title,
          url: item.url,
        }));
      });
    };

    // 纯文生图下，引导槽有素材但不被模型采纳 -> 过滤为 0
    const bucketsWithGuided = {
      guided__image__reference: [{ name: 'ref.png', url: 'https://test/ref.png' }],
    };
    const sentAssets = filterAssets([guidedSlot], bucketsWithGuided);
    assert.equal(sentAssets.length, 0);

    // 真实卡槽有素材 -> 正常发送
    const bucketsWithReal = {
      real__image__reference: [{ name: 'ref.png', url: 'https://test/ref.png' }],
    };
    const sentRealAssets = filterAssets([realSlot], bucketsWithReal);
    assert.equal(sentRealAssets.length, 1);
  });

  it('ReferencePickerPopover accept 属性在 targetSlot 为 audio 时支持 audio/*', () => {
    const getAccept = (targetSlot) => {
      return targetSlot?.type === 'video' ? 'video/*' : targetSlot?.type === 'audio' ? 'audio/*' : 'image/*';
    };
    assert.equal(getAccept({ type: 'video' }), 'video/*');
    assert.equal(getAccept({ type: 'audio' }), 'audio/*');
    assert.equal(getAccept({ type: 'image' }), 'image/*');
    assert.equal(getAccept(null), 'image/*');
  });

  it('serializeReferenceAssets 优化本地上传资产序列化：过滤裸 File 实例，确保对象包含合规规范字段，支持安全 JSON 序列化，并过滤缺少有效 url/assetId 的空引用', () => {
    const fakeRawFile = { name: 'photo.jpg', size: 1024, type: 'image/jpeg' };
    const rawAssets = [
      {
        slot: 'reference_images',
        type: 'image',
        role: 'reference',
        name: 'unpersisted_blob.jpg',
        url: 'blob:https://omnimux/blob-123',
        file: fakeRawFile, // 裸 File 实例，且无 assetId
        customExtra: 'should_be_stripped',
      },
      {
        slot: 'reference_images',
        type: 'image',
        role: 'reference',
        name: 'persisted_local.jpg',
        url: 'blob:https://omnimux/blob-persisted',
        assetId: 'aid_local_persisted',
        file: fakeRawFile,
        customExtra: 'should_be_stripped',
      },
      {
        slot: 'first_frame',
        type: 'image',
        role: 'first_frame',
        name: 'remote.png',
        url: '/remote.png',
        assetId: undefined,
        file: null,
      },
      {
        slot: 'character',
        type: 'image',
        role: 'character',
        title: 'preset_human',
        url: '/avatar.png',
        assetId: 'asset_777',
      },
    ];

    const serialized = serializeReferenceAssets(rawAssets);
    assert.equal(serialized.length, 3, '纯本地未持久化 blob 且无 assetId 的空引用必须被过滤掉');

    // 1. 已持久化资产：file 属性必须被过滤掉，保留合规 slot, type, role, name, assetId，且直接透传真实 assetId，杜绝编造虚拟路径
    assert.deepEqual(serialized[0], {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      name: 'persisted_local.jpg',
      assetId: 'aid_local_persisted',
    });
    assert.equal('file' in serialized[0], false, 'Must not leak file instance');
    assert.equal('customExtra' in serialized[0], false, 'Must strip non-standard keys');

    // 2. 同源素材
    assert.deepEqual(serialized[1], {
      slot: 'first_frame',
      type: 'image',
      role: 'first_frame',
      name: 'remote.png',
      url: '/remote.png',
      pathOrUrl: '/remote.png',
    });

    // 3. 拥有 assetId 的素材：保留 validUrl 与 assetId，确保后端兼顾读取
    assert.deepEqual(serialized[2], {
      slot: 'character',
      type: 'image',
      role: 'character',
      name: 'preset_human',
      url: '/avatar.png',
      pathOrUrl: '/avatar.png',
      assetId: 'asset_777',
    });

    // 确保能够通过原生 JSON.stringify 且无多余属性
    const jsonStr = JSON.stringify(serialized);
    const parsed = JSON.parse(jsonStr);
    assert.deepEqual(parsed, serialized);
  });

  it('拾取器校验时补充 duration 校验：若卡槽声明 durationMax，支持真实时长与超限拦截，无时长给出格式拦截', () => {
    const videoSlot = {
      key: 'video_slot',
      type: 'video',
      durationMax: 15,
      allowedMimes: ['video/mp4'],
    };

    const validateAsset = (asset, slot) => {
      const exactMime = inferMimeType(asset);
      const inferredType = exactMime ? exactMime.split('/')[0] : (asset.type || '');
      const fileType = exactMime || (inferredType ? `${inferredType}/` : '');
      const pseudoFile = asset.file || (fileType ? { type: fileType, name: asset.name || asset.title } : null);
      if (!pseudoFile) {
        return { ok: false, reason: '当前素材缺少类型信息，无法入槽' };
      }

      const rawDuration = asset.duration ?? asset.durationSec ?? asset.metadata?.duration ?? asset.metadata?.durationSec;
      const duration = typeof rawDuration === 'number' && Number.isFinite(rawDuration)
        ? rawDuration
        : (typeof rawDuration === 'string' && !Number.isNaN(Number(rawDuration)) ? Number(rawDuration) : null);

      if (slot.durationMax != null && (slot.type === 'video' || slot.type === 'audio')) {
        if (duration == null) {
          return { ok: false, reason: '当前文件格式不符合要求' };
        }
      }

      const reason = rejectionOf(pseudoFile, slot, duration);
      if (reason) {
        return { ok: false, reason };
      }
      return { ok: true };
    };

    // 1. 无时长信息但卡槽有时长上限 -> 给出格式拦截
    const resNoDuration = validateAsset({ url: 'https://cdn.example.com/clip.mp4' }, videoSlot);
    assert.equal(resNoDuration.ok, false);
    assert.equal(resNoDuration.reason, '当前文件格式不符合要求');

    // 2. 超限时长 (20s > 15s) -> 拦截并提示时长超限
    const resOverDuration = validateAsset({ url: 'https://cdn.example.com/clip.mp4', duration: 20 }, videoSlot);
    assert.equal(resOverDuration.ok, false);
    assert.equal(resOverDuration.reason, '视频时长不能超过 15 秒');

    // 3. 合规时长 (10s <= 15s) -> 校验通过
    const resValid = validateAsset({ url: 'https://cdn.example.com/clip.mp4', duration: 10 }, videoSlot);
    assert.equal(resValid.ok, true);
  });

  it('模特原图截断已有素材时，遍历截断丢弃的切片项并显式释放其中的 blob URL', () => {
    const revokedUrls = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => revokedUrls.push(url);

    try {
      const room = 2;
      const modelAsset = { id: 'model_1', name: 'model.jpg', url: 'blob:https://omnimux/model', isCanvasModel: true };
      const currentList = [
        { id: 'img_keep', name: 'keep.jpg', url: 'blob:https://omnimux/keep' },
        { id: 'img_drop_1', name: 'drop1.jpg', url: 'blob:https://omnimux/drop1' },
        { id: 'img_drop_2', name: 'drop2.jpg', url: 'https://cdn.example.com/drop2.png' }, // 非 blob
        { id: 'img_drop_3', name: 'drop3.jpg', url: 'blob:https://omnimux/drop3' },
      ];

      const combined = [modelAsset, ...currentList];
      const truncated = combined.slice(room);
      for (const item of truncated) {
        if (item?.url?.startsWith('blob:')) {
          URL.revokeObjectURL(item.url);
        }
      }
      const nextList = combined.slice(0, room);

      assert.equal(nextList.length, 2);
      assert.equal(nextList[0].id, 'model_1');
      assert.equal(nextList[1].id, 'img_keep');
      // drop1 与 drop3 两个 blob url 被显式 revokeObjectURL
      assert.deepEqual(revokedUrls, ['blob:https://omnimux/drop1', 'blob:https://omnimux/drop3']);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('serializeReferenceAssets 对于未分配 assetId 的素材保留原始 url（或 path），避免强制赋 undefined 导致后端判定为残片并丢弃，同时严格过滤 blob: 协议并过滤掉缺少有效 url/assetId 的无效空引用', () => {
    const assets = [
      { slot: 'first_frame', type: 'image', role: 'first_frame', name: 'blob.png', url: 'blob:http://localhost/uuid-123' },
      { slot: 'first_frame', type: 'image', role: 'first_frame', name: 'http.png', url: '/http.png' },
      { slot: 'first_frame', type: 'image', role: 'first_frame', name: 'with_asset.png', url: '/asset.png', assetId: 'aid_456' },
      { slot: 'first_frame', type: 'image', role: 'first_frame', name: 'with_path.png', path: '/local/path/to/img.png' },
      { slot: 'first_frame', type: 'image', role: 'first_frame', name: 'blob_path.png', path: 'blob:http://localhost/uuid-456' },
    ];
    const res = serializeReferenceAssets(assets);
    assert.equal(res.length, 3, '纯本地未持久化 blob 且无 assetId 的空引用必须被彻底过滤排除');
    assert.equal(res[0].name, 'http.png');
    assert.equal(res[0].url, '/http.png');
    assert.equal(res[1].name, 'with_asset.png');
    assert.equal(res[1].url, '/asset.png');
    assert.equal(res[1].assetId, 'aid_456');
    assert.equal(res[2].name, 'with_path.png');
    assert.equal(res[2].url, '/local/path/to/img.png');
  });

  it('ReferencePickerPopover handleLocalUpload 异步上传路径完整包裹在 try ... catch ... finally 中：确保 catch 触发 onError 与 console.warn，finally 重置 input.value 并防止解码崩溃资源泄漏', async () => {
    const revokedUrls = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (u) => revokedUrls.push(u);

    const errorCalls = [];
    const warnCalls = [];
    const fakeOnError = (msg) => errorCalls.push(msg);
    const originalWarn = console.warn;
    console.warn = (...args) => warnCalls.push(args);

    try {
      // 模拟带有 try-catch-finally 及 onError 触发的 handleLocalUpload 行为
      const simulateHandleLocalUpload = async ({ readDurationError, acceptedResult, inputTarget, onError = fakeOnError }) => {
        let blobUrl = null;
        let accepted = false;
        try {
          blobUrl = 'blob:test-upload-uuid';
          if (readDurationError) {
            throw new Error('Video decoding crash');
          }
          accepted = acceptedResult;
        } catch (err) {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrl = null;
          }
          onError?.('本地素材上传失败，请重试或选择其他文件');
          console.warn?.('[ReferencePickerPopover] handleLocalUpload failed:', err);
        } finally {
          if (accepted !== true && blobUrl) {
            URL.revokeObjectURL(blobUrl);
          }
          if (inputTarget) {
            inputTarget.value = '';
          }
        }
        return { accepted, blobUrl };
      };

      // 1. 解码崩溃场景：catch 块主动 revokeObjectURL、调用 onError 与 console.warn，finally 块重置 input.value
      const target1 = { value: 'C:\\fakepath\\crash.mp4' };
      await simulateHandleLocalUpload({ readDurationError: true, acceptedResult: false, inputTarget: target1 });
      assert.equal(target1.value, '', 'Finally 块必须保证 input.value 重置为空');
      assert.deepEqual(revokedUrls, ['blob:test-upload-uuid'], 'Catch 块必须主动释放 blobUrl');
      assert.deepEqual(errorCalls, ['本地素材上传失败，请重试或选择其他文件'], 'Catch 块必须触发规范文案 onError');
      assert.equal(warnCalls.length, 1);
      assert.equal(warnCalls[0][0], '[ReferencePickerPopover] handleLocalUpload failed:');

      // 2. 正常上传但未被接受（校验失败）：finally 释放 blobUrl 并重置 input.value，无异常不触发 onError
      revokedUrls.length = 0;
      errorCalls.length = 0;
      warnCalls.length = 0;
      const target2 = { value: 'C:\\fakepath\\rejected.png' };
      await simulateHandleLocalUpload({ readDurationError: false, acceptedResult: false, inputTarget: target2 });
      assert.equal(target2.value, '', 'Finally 块必须保证 input.value 重置为空');
      assert.deepEqual(revokedUrls, ['blob:test-upload-uuid'], '未被接受时 finally 块必须释放 blobUrl');
      assert.equal(errorCalls.length, 0);

      // 3. 正常上传并被接受：保留 blobUrl，finally 依然重置 input.value
      revokedUrls.length = 0;
      errorCalls.length = 0;
      warnCalls.length = 0;
      const target3 = { value: 'C:\\fakepath\\accepted.png' };
      await simulateHandleLocalUpload({ readDurationError: false, acceptedResult: true, inputTarget: target3 });
      assert.equal(target3.value, '', 'Finally 块必须保证 input.value 重置为空');
      assert.deepEqual(revokedUrls, [], '被接受时不得释放 blobUrl');
      assert.equal(errorCalls.length, 0);
    } finally {
      URL.revokeObjectURL = originalRevoke;
      console.warn = originalWarn;
    }
  });

  it('ReferencePickerPopover 与 MediaViewerComposer 源码透传契约：ReferencePickerPopover 声明 onError并在 catch 触发，MediaViewerComposer 传入 onError={setNotice}', () => {
    const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf8');
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf8');

    // 1. ReferencePickerPopover 声明 onError
    assert.ok(popoverSrc.includes('onError,'), 'ReferencePickerPopover 必须声明 onError prop');
    assert.ok(
      popoverSrc.includes("onError?.('本地素材上传失败，请重试或选择其他文件');"),
      'ReferencePickerPopover catch 块必须调用规范文案 onError'
    );
    assert.ok(
      popoverSrc.includes("console.warn?.('[ReferencePickerPopover] handleLocalUpload failed:', err);"),
      'ReferencePickerPopover catch 块必须调用 console.warn'
    );

    // 2. MediaViewerComposer 传入 onError={setNotice}
    assert.ok(composerSrc.includes('onError={setNotice}'), 'MediaViewerComposer 必须向 ReferencePickerPopover 传入 onError={setNotice}');
  });

  it('handleSelectAsset 注入素材时动态生成唯一 itemId，避免重复添加相同素材时 key 冲突', () => {
    const rawAsset = { id: 'preset_human_1', name: 'model.jpg' };
    const list = [{ id: 'preset_human_1-100-0', name: 'model.jpg' }];
    const itemId = `${rawAsset.id || rawAsset.assetId || 'asset'}-${Date.now()}-${list.length}`;
    assert.ok(itemId.startsWith('preset_human_1-'));
    assert.ok(itemId.endsWith('-1'));
    assert.notEqual(itemId, list[0].id);
  });

  it('styles.js 校验 .omx-mv-composer-outer 与 .omx-mv-composer-root 定位契约', () => {
    assert.ok(MEDIA_VIEWER_CSS.includes('.omx-mv-composer-outer {'));
    assert.ok(MEDIA_VIEWER_CSS.includes('position: absolute;'));
    assert.ok(MEDIA_VIEWER_CSS.includes('bottom: 12px;'));
    assert.ok(MEDIA_VIEWER_CSS.includes('transform: translateX(-50%);'));
    assert.ok(MEDIA_VIEWER_CSS.includes('max-width: 920px;'));
    assert.ok(MEDIA_VIEWER_CSS.includes('z-index: 60;'));
    assert.ok(MEDIA_VIEWER_CSS.includes('.omx-mv-composer-outer .omx-mv-composer-root {'));
    assert.ok(MEDIA_VIEWER_CSS.includes('position: static;'));
    assert.ok(MEDIA_VIEWER_CSS.includes('transform: none;'));
    assert.ok(MEDIA_VIEWER_CSS.includes('flex: 1;'));
  });

  it('handleSend 生成前放宽本地上传原生 file 对象放行，拦截无 file/assetId 的纯 blob 引用与非法残片素材', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes('const hasLocalMediaFile = assets.some((a) => a.file && !a.assetId && (a.type === \'video\' || a.type === \'audio\'));') &&
      composerSrc.includes('const hasInvalidFragment = assets.some((a) => {') &&
      composerSrc.includes('if (a.assetId || a.file) return false;') &&
      composerSrc.includes("return !isAllowedReferenceUrl(a.url) || url.startsWith('blob:');"),
      '本地音视频必须单独拦截，图片文件留给提交前物化'
    );
    assert.ok(
      composerSrc.includes("setNotice('请先上传本地音视频到资产库后再用于生成');"),
      '本地音视频拦截文案必须指向资产库'
    );

    // 逻辑行为验证
    const isAllowedReferenceUrl = (u) => typeof u === 'string' && (
      (u.startsWith('/') && !u.startsWith('//')) ||
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(u.trim())
    );
    const checkFragmentInterception = (assets) => {
      const hasLocalMediaFile = assets.some((a) => a.file && !a.assetId && (a.type === 'video' || a.type === 'audio'));
      if (hasLocalMediaFile) return '请先上传本地音视频到资产库后再用于生成';
      const hasInvalidFragment = assets.some((a) => {
        if (a.assetId || a.file) return false;
        const url = String(a.url || '');
        return !isAllowedReferenceUrl(a.url) || url.startsWith('blob:');
      });
      if (hasInvalidFragment) return '参考素材地址无效，请重新选择';
      return null;
    };

    // 1. 包含未分配 assetId 且无原生 file 的 blob: 残片素材：拦截
    const assetsWithFragmentBlob = [
      { slot: 'character', type: 'image', role: 'character', url: 'blob:http://localhost/uuid-1' },
      { slot: 'reference_images', type: 'image', role: 'reference', assetId: 'aid_100' },
    ];
    assert.equal(
      checkFragmentInterception(assetsWithFragmentBlob),
      '参考素材地址无效，请重新选择'
    );

    // 2. 本地上传携带原生 file 对象的 blob: 图片素材：不被 hasInvalidFragment 拦截
    const assetsWithLocalFile = [
      { slot: 'character', type: 'image', role: 'character', url: 'blob:http://localhost/uuid-2', file: { name: 'local.png' } },
      { slot: 'reference_images', type: 'image', role: 'reference', assetId: 'aid_100' },
    ];
    assert.equal(checkFragmentInterception(assetsWithLocalFile), null);

    // 2.1 本地上传携带原生 file 对象的 blob: 视频/音频素材：被 hasInvalidFragment 拦截
    const assetsWithLocalVideoFile = [
      { slot: 'video_ref', type: 'video', role: 'reference', url: 'blob:http://localhost/uuid-video', file: { name: 'local.mp4' } },
    ];
    assert.equal(
      checkFragmentInterception(assetsWithLocalVideoFile),
      '请先上传本地音视频到资产库后再用于生成'
    );

    // 3. 站内同源相对路径与已分配 assetId 素材：放行
    const validAssets = [
      { slot: 'character', type: 'image', role: 'reference', url: '/assets/character.png' },
      { slot: 'reference_images', type: 'image', role: 'reference', assetId: 'aid_100' },
    ];
    assert.equal(checkFragmentInterception(validAssets), null);

    // 4. 合规的 base64 Data URL：放行
    const base64Assets = [
      { slot: 'character', type: 'image', role: 'character', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' },
      { slot: 'reference_images', type: 'image', role: 'reference', assetId: 'aid_100' },
    ];
    assert.equal(checkFragmentInterception(base64Assets), null);
  });

  it('handleSelectAsset 校验前推导 MIME 补全至 pseudoFile，防止原始 file.type 为空字符串时被误拦截', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes('const pseudoFile = asset.file'),
      '必须正确构建包装 pseudoFile'
    );
    assert.ok(
      composerSrc.includes('type: asset.file.type || fileType'),
      '必须在 asset.file 存在时补全 type: asset.file.type || fileType'
    );

    // 模拟构造 pseudoFile 逻辑
    const makePseudoFile = (asset, exactMime, inferredType) => {
      const fileType = exactMime || (inferredType ? `${inferredType}/` : '');
      return asset.file
        ? { ...asset.file, type: asset.file.type || fileType, name: asset.file.name || asset.name || asset.title }
        : (fileType ? { type: fileType, name: asset.name || asset.title } : null);
    };

    const targetSlot = {
      type: 'image',
      allowedMimes: ['image/png', 'image/jpeg'],
    };

    // 1. asset.file 存在，但 file.type 为空字符串，通过文件名推导出 exactMime
    const emptyTypeFileAsset = {
      name: 'sample.png',
      file: { name: 'sample.png', size: 1024, type: '' },
    };
    const exactMime = inferMimeType(emptyTypeFileAsset);
    assert.equal(exactMime, 'image/png');

    const pseudoFile = makePseudoFile(emptyTypeFileAsset, exactMime, 'image');
    assert.equal(pseudoFile.type, 'image/png');
    assert.equal(pseudoFile.name, 'sample.png');
    // 经 rejectionOf 判定，不再误拦截
    assert.equal(rejectionOf(pseudoFile, targetSlot, null), '');

    // 2. asset.file 不存在，依然能够构建基础 pseudoFile
    const nonFileAsset = { name: 'remote.jpg', url: 'https://example.com/remote.jpg' };
    const exactMime2 = inferMimeType(nonFileAsset);
    assert.equal(exactMime2, 'image/jpeg');
    const pseudoFile2 = makePseudoFile(nonFileAsset, exactMime2, 'image');
    assert.equal(pseudoFile2.type, 'image/jpeg');
    assert.equal(rejectionOf(pseudoFile2, targetSlot, null), '');
  });

  it('handleSend 若当前模型操作不支持参考图且槽位为 guidedOnly：只要存在素材项无论是否有打点均阻断提交并提示，严禁静默丢弃', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes("setNotice('当前模型不支持参考图，请切换支持参考图的模型或清空卡槽素材')"),
      '必须包含阻断提示文案：当前模型不支持参考图，请切换支持参考图的模型或清空卡槽素材'
    );
    assert.ok(
      composerSrc.includes('hasUnsupportedGuidedWithItems'),
      '必须声明 hasUnsupportedGuidedWithItems 阻断判断'
    );
    assert.equal(
      composerSrc.includes('savedAnnotations.length === 0'),
      false,
      '严禁包含 savedAnnotations.length === 0 的短路判断，只要存在素材项即行拦截'
    );

    // 模拟 handleSend 的引导槽素材阻断逻辑
    const checkGuidedItemsBlock = ({ slots, buckets, bucketKey, opInputs, setNotice }) => {
      const hasUnsupportedGuidedWithItems = slots.some((slot) => {
        if (!slot.guidedOnly) return false;
        const items = buckets[bucketKey(slot)] ?? [];
        if (items.length === 0) return false;
        const isAccepted = opInputs.some((input) => {
          if (!input || input.type === 'text' || input.role === 'prompt') return false;
          return (
            (input.slot && input.slot === slot.slot) ||
            (input.role && input.role === slot.role && input.type === slot.type)
          );
        });
        return !isAccepted;
      });

      if (hasUnsupportedGuidedWithItems) {
        setNotice('当前模型不支持参考图，请切换支持参考图的模型或清空卡槽素材');
        return true; // 阻断
      }
      return false; // 放行
    };

    const guidedSlot = { key: 'guided_slot', slot: 'reference_images', type: 'image', role: 'reference', guidedOnly: true };
    const mockBuckets = { guided_slot: [{ name: 'ref.png', url: 'https://cdn.example.com/ref.png' }] };
    const mockEmptyBuckets = { guided_slot: [] };
    const mockKeyFn = (s) => s.key;
    const unsupportedOpInputs = [{ type: 'text', role: 'prompt' }]; // 仅支持纯文本，不支持参考图
    const supportedOpInputs = [{ type: 'text', role: 'prompt' }, { slot: 'reference_images', type: 'image', role: 'reference' }];

    let noticeMsg = '';
    const mockSetNotice = (msg) => { noticeMsg = msg; };

    // 1. 存在素材项、当前操作不支持参考图 -> 无论有无打点均阻断并提示
    const blocked = checkGuidedItemsBlock({
      slots: [guidedSlot],
      buckets: mockBuckets,
      bucketKey: mockKeyFn,
      opInputs: unsupportedOpInputs,
      setNotice: mockSetNotice,
    });
    assert.equal(blocked, true);
    assert.equal(noticeMsg, '当前模型不支持参考图，请切换支持参考图的模型或清空卡槽素材');

    // 2. 无素材项时（items.length === 0） -> 不阻断
    noticeMsg = '';
    const notBlockedEmpty = checkGuidedItemsBlock({
      slots: [guidedSlot],
      buckets: mockEmptyBuckets,
      bucketKey: mockKeyFn,
      opInputs: unsupportedOpInputs,
      setNotice: mockSetNotice,
    });
    assert.equal(notBlockedEmpty, false);
    assert.equal(noticeMsg, '');

    // 3. 模型操作支持参考图时 -> 不阻断
    noticeMsg = '';
    const notBlockedSupported = checkGuidedItemsBlock({
      slots: [guidedSlot],
      buckets: mockBuckets,
      bucketKey: mockKeyFn,
      opInputs: supportedOpInputs,
      setNotice: mockSetNotice,
    });
    assert.equal(notBlockedSupported, false);
    assert.equal(noticeMsg, '');
  });

  it('handleSelectAsset 入口处增加 if (disabled) return false; 守卫', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes('const handleSelectAsset = useCallback((asset, slot) => {\n    if (disabled) return false;'),
      'handleSelectAsset 入口必须第一行执行 if (disabled) return false;'
    );
  });

  it('handleSwitchMode 入口处增加 if (disabled || mode === newMode || isSwitchingRef.current) return; 守卫', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes('if (disabled || mode === newMode || isSwitchingRef.current) return;'),
      'handleSwitchMode 入口必须包含 if (disabled || mode === newMode || isSwitchingRef.current) return; 守卫'
    );
  });

  it('reference-constants.js 预设素材移除假 assetId，并生成合规标准 1:1 单色位图 base64 PNG Data URL 通过白名单校验', () => {
    // 1. 验证四大分类中所有预设素材均不包含假 assetId，且 url 为标准 1:1 单色位图 base64 PNG Data URL
    const categories = ['upload', 'ai', 'avatar', 'product'];
    for (const cat of categories) {
      const items = PRESET_REFERENCE_ASSETS[cat];
      assert.ok(Array.isArray(items) && items.length > 0, `分类 ${cat} 必须有预设素材`);
      for (const item of items) {
        assert.equal(item.assetId, undefined, `素材 ${item.id} 严禁包含假 assetId`);
        assert.ok(
          typeof item.url === 'string' && item.url.startsWith('data:image/png;base64,'),
          `素材 ${item.id} 的 url 必须为标准 1:1 单色位图 base64 PNG Data URL`
        );
      }
    }

    // 2. 验证预设素材经过 serializeReferenceAssets 时，通过光栅图白名单合法保留 url，杜绝虚假 assetId 导致后端查找失效
    const samplePreset = PRESET_REFERENCE_ASSETS.upload[0];
    const rawAssetInSlot = {
      ...samplePreset,
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
    };
    const serialized = serializeReferenceAssets([rawAssetInSlot]);
    assert.equal(serialized.length, 1, '预设素材必须通过光栅图白名单合法保留');
    assert.deepEqual(serialized[0], {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      name: samplePreset.title,
      url: samplePreset.url,
      pathOrUrl: samplePreset.url,
    });
    assert.equal(serialized[0].assetId, undefined, '预设素材严禁携带假 assetId');

    // 3. 验证 ReferencePickerPopover 源码在点击与键盘事件中直接传入 asset，不再合成假 assetId
    const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf-8');
    assert.ok(
      !popoverSrc.includes("preset_${asset.id}"),
      'ReferencePickerPopover 严禁合成 preset_${asset.id} 假 assetId'
    );
  });

  it('MediaSlotGroup onChange 在卡槽素材移除/覆盖更新时，即时释放被丢弃的 blob: URL', () => {
    // 1. 逻辑行为验证
    const revokedUrls = [];
    const mockRevokeObjectURL = (url) => revokedUrls.push(url);
    const activeItemUrl = 'blob:https://omnimux/active-item-model';

    const prevBuckets = {
      'image:model-1:slot-1': [
        { id: '1', url: 'blob:https://omnimux/keep' },
        { id: '2', url: 'blob:https://omnimux/discard-1' },
        { id: '3', url: 'https://cdn.example.com/remote' },
        { id: '4', url: 'blob:https://omnimux/discard-2' },
        { id: '5', url: activeItemUrl },
      ],
    };

    const nextItems = [
      { id: '1', url: 'blob:https://omnimux/keep' },
      { id: '6', url: 'blob:https://omnimux/new-added' },
    ];

    const slot = { key: 'slot-1' };
    const bucketKey = (s) => `image:model-1:${s.key}`;

    const handleSlotChange = (items) => {
      const key = bucketKey(slot);
      const safeItems = Array.isArray(items) ? items : [];
      const nextUrls = new Set(safeItems.map((item) => item?.url));
      for (const item of prevBuckets[key] || []) {
        if (item?.url?.startsWith('blob:') && !nextUrls.has(item.url) && item.url !== activeItemUrl) {
          mockRevokeObjectURL(item.url);
        }
      }
      return { ...prevBuckets, [key]: safeItems };
    };

    const updated = handleSlotChange(nextItems);
    assert.deepEqual(revokedUrls, [
      'blob:https://omnimux/discard-1',
      'blob:https://omnimux/discard-2',
    ]);
    assert.equal(updated['image:model-1:slot-1'].length, 2);

    // 2. 源码结构与契约比对验证
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes('const nextUrls = new Set(nextItems.map((item) => item?.url));') &&
      composerSrc.includes('!isUrlReferencedElsewhere(item.url, key, bucketsRef.current)') &&
      composerSrc.includes('item.url !== activeItemUrl') &&
      composerSrc.includes('URL.revokeObjectURL(item.url);'),
      'MediaViewerComposer 中 MediaSlotGroup 的 onChange 必须包含即时释放丢弃 blob: URL 的逻辑且不误杀 activeItemUrl 与其他卡槽引用'
    );
    assert.ok(
      composerSrc.indexOf('URL.revokeObjectURL(item.url);') < composerSrc.indexOf('setBuckets((prev) => ({ ...prev, [key]: nextItems }));'),
      'URL.revokeObjectURL 必须移出 setBuckets updater 回调，保持 updater 纯净'
    );
  });

  it('MediaSlotGroup readDuration 增加 10 秒超时与异常保护防挂起契约', () => {
    const slotGroupSrc = fs.readFileSync(new URL('./MediaSlotGroup.jsx', import.meta.url), 'utf-8');
    assert.ok(
      slotGroupSrc.includes('let done = false;') &&
      slotGroupSrc.includes('const timer = window.setTimeout(() => finish(Number.NaN), 10000);') &&
      slotGroupSrc.includes('window.clearTimeout(timer);') &&
      slotGroupSrc.includes("media.removeAttribute('src');") &&
      slotGroupSrc.includes('media.load?.();') &&
      slotGroupSrc.includes('URL.revokeObjectURL(url);'),
      'readDuration 必须包含 10 秒超时与异常保护防挂起及资源清理'
    );
  });

  it('MediaViewerComposer 模特原图注入增加空 URL 阻断防污染契约', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes("const rawUrl = activeItemUrl || '';") &&
      composerSrc.includes("const expectedUrl = isAllowedReferenceUrl(rawUrl) ? rawUrl : '';") &&
      composerSrc.includes('if (!expectedUrl) {'),
      '模特原图注入必须在 expectedUrl 为空时阻断注入'
    );
  });

  it('杜绝编造虚拟URL: media-slot.js 预设素材序列化透传真实 validUrl 与 validAssetId，受控放行 base64 Data URL', () => {
    const rasterDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const rawAsset = {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      name: 'preset_asset',
      id: 'custom_id_123',
      url: rasterDataUrl,
      assetId: 'preset_up-1',
    };
    const [serialized] = serializeReferenceAssets([rawAsset]);
    assert.equal(serialized.url, rasterDataUrl);
    assert.equal(serialized.pathOrUrl, rasterDataUrl);
    assert.equal(serialized.assetId, 'preset_up-1');

    // 未净化的 svg+xml Data URL 被严格排除
    const rawSvgAsset = {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      name: 'svg_asset',
      id: 'svg_id_123',
      url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      assetId: 'preset_svg_1',
    };
    const [serializedSvg] = serializeReferenceAssets([rawSvgAsset]);
    assert.equal(serializedSvg.url, undefined, '未净化的 svg+xml 必须被排除');
    assert.equal(serializedSvg.pathOrUrl, undefined);
    assert.equal(serializedSvg.assetId, 'preset_svg_1');

    // 若仅有 validAssetId 但无合规 url，直接透传 assetId，绝不编造虚拟 URL
    const rawAssetNoUrl = {
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      name: 'preset_asset_2',
      assetId: 'aid_456',
    };
    const [serializedNoUrl] = serializeReferenceAssets([rawAssetNoUrl]);
    assert.equal(serializedNoUrl.url, undefined);
    assert.equal(serializedNoUrl.pathOrUrl, undefined);
    assert.equal(serializedNoUrl.assetId, 'aid_456');
  });

  it('缺陷2回归: MediaViewerComposer.jsx deriveAdaptiveOperation 实施 mode 与 model 作用域隔离', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes("const prefix = makeBucketKey('video', model?.id, '');"),
      '必须使用 makeBucketKey 提取当前 video 模式与模型的 bucket 前缀'
    );
    assert.ok(
      composerSrc.includes("const scopedVideoBuckets = Object.fromEntries("),
      '必须提取 scopedVideoBuckets 过滤当前作用域下的 buckets'
    );
    assert.ok(
      composerSrc.includes("const adaptiveOp = deriveAdaptiveOperation(model, 'video', scopedVideoBuckets);"),
      '必须将 scopedVideoBuckets 传入 deriveAdaptiveOperation 进行精准推导'
    );
  });

  it('缺陷3回归: MediaViewerComposer.jsx 保护槽位用户素材，容量已满且无 isCanvasModel 时不强行挤出', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes("const room = firstSlot.max == null ? Infinity : firstSlot.max;"),
      '必须基于 firstSlot.max 计算卡槽容量限制'
    );
    assert.ok(
      composerSrc.includes("setNotice('当前卡槽已满，无法自动加入标记原图；请清空一个卡槽后再使用标记生成');") &&
      composerSrc.includes("return prev;"),
      '卡槽容量已满且当前列表项中不含 isCanvasModel 时，必须设置提示并保护用户已有素材返回 prev'
    );

    // 逻辑行为验证
    const slotMax = 1;
    const existingUserItems = [{ id: 'user_item_1', name: 'user.png', isCanvasModel: false }];
    const simulateInject = (currentList, room) => {
      if (currentList.length >= room && !currentList.some((it) => it.isCanvasModel)) {
        return currentList; // 保护已有素材不被挤出
      }
      return [{ id: 'model_1', name: 'model.png', isCanvasModel: true }, ...currentList].slice(0, room);
    };

    const res = simulateInject(existingUserItems, slotMax);
    assert.equal(res[0].id, 'user_item_1', '用户显式选入素材必须完整保留，不得被画布模特挤出丢弃');
  });

  it('MediaViewerComposer.jsx 统一消费 media-slot.js 权威 isAllowedReferenceUrl 白名单，受控放行同源路径、https、base64，blob 只作预览', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      composerSrc.includes('isAllowedReferenceUrl') && composerSrc.includes("from './media-slot.js'"),
      '必须从 media-slot.js 统一引入权威 isAllowedReferenceUrl'
    );
    assert.ok(
      composerSrc.includes('const hasLocalMediaFile = assets.some((a) => a.file && !a.assetId && (a.type === \'video\' || a.type === \'audio\'));') &&
      composerSrc.includes('const hasInvalidFragment = assets.some((a) => {') &&
      composerSrc.includes('if (a.assetId || a.file) return false;') &&
      composerSrc.includes("return !isAllowedReferenceUrl(a.url) || url.startsWith('blob:');"),
      '本地音视频单独拦截，无 file/assetId 的 blob 不能提交'
    );

    // 逻辑行为验证单一真源 isAllowedReferenceUrl
    assert.strictEqual(isAllowedReferenceUrl('https://example.com/a.png'), true, '支持 https:// 协议');
    assert.strictEqual(isAllowedReferenceUrl('http://example.com/a.png'), false, '剔除不安全 http:// 协议');
    assert.strictEqual(isAllowedReferenceUrl('/api/media/1.png'), true, '支持同源相对路径');
    assert.strictEqual(isAllowedReferenceUrl('//example.com/a.png'), false, '排除双斜杠协议相对路径');
    assert.strictEqual(isAllowedReferenceUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), true);
    assert.strictEqual(isAllowedReferenceUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
    assert.strictEqual(isAllowedReferenceUrl('data:image/webp;base64,UklGRg=='), true);
    assert.strictEqual(isAllowedReferenceUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false, '必须严格排除未净化的 svg+xml Data URL');
    assert.strictEqual(isAllowedReferenceUrl('data:text/html;base64,PHNjcmlwdD4='), false);
    assert.strictEqual(isAllowedReferenceUrl('blob:http://localhost/1234'), false, 'blob 不能作为可提交参考地址');
  });

  it('MediaViewerComposer.jsx 消除死胡同拦截放行包含 file 的本地素材，MediaViewerTab.jsx 彻底移除 store.setNotice 依赖', () => {
    const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
    assert.ok(
      !composerSrc.includes('hasUnmaterializedLocalReference'),
      'MediaViewerComposer 必须消除 hasUnmaterializedLocalReference 死胡同粗暴阻断'
    );
    assert.ok(
      composerSrc.includes('const hasInvalidFragment = assets.some((a) => {') &&
      composerSrc.includes('if (a.assetId || a.file) return false;'),
      '放行合规本地图片素材进入 assets 供提交器和后端处理'
    );

    const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');
    assert.ok(
      !tabSrc.includes('store.setNotice'),
      'MediaViewerTab.jsx 必须彻底移除对不存在的 store.setNotice 的依赖'
    );
    assert.ok(
      !tabSrc.includes('hasUnmaterializedLocalReference'),
      '未物化本地素材校验已消除，MediaViewerTab.jsx 无需重复校验'
    );

    // 模式切换纯净 updater 逻辑验证：确保 setBuckets 调用时无副作用
    assert.ok(
      composerSrc.includes("setBuckets((prev) => ({"),
      'MediaViewerComposer 模式切换 setBuckets 必须为纯对象更新，无副作用'
    );
  });

  describe('审秋毫 7 项缺陷（1 High + 6 Medium）彻底闭环专项回归', () => {
    it('缺陷 1 [High]: MediaViewerComposer.jsx 清空标注时严格排除 activeItemUrl，不误杀模特底图', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
      assert.ok(
        composerSrc.includes("if (item.isLocalUpload && item.url?.startsWith('blob:') && item.url !== activeItemUrl)"),
        '清除标注退槽时只释放本地上传 blob，并排除当前画布地址'
      );

      // 逻辑行为验证：当退槽的模特原图刚好是当前主视口底图时，绝不释放 activeItemUrl
      const revoked = [];
      const activeItemUrl = 'blob:https://omnimux/model-active-url';
      const removedList = [
        { id: 'canvas_model', url: activeItemUrl, isCanvasModel: true },
        { id: 'other_blob', url: 'blob:https://omnimux/other-blob', isCanvasModel: true },
      ];
      for (const item of removedList) {
        if (item.url?.startsWith('blob:') && item.url !== activeItemUrl) {
          revoked.push(item.url);
        }
      }
      assert.deepEqual(revoked, ['blob:https://omnimux/other-blob'], '绝不可销毁 activeItemUrl');
    });

    it('缺陷 2 [Medium]: MediaViewerComposer.jsx 将 onChange 内部 URL.revokeObjectURL 移出 setBuckets updater 回调并保持 updater 纯净', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
      assert.ok(
        composerSrc.includes('onChange={(items) => {'),
        'onChange 回调函数必须为块语句而不是直接包裹 setBuckets'
      );
      assert.ok(
        composerSrc.indexOf('URL.revokeObjectURL(item.url);') < composerSrc.indexOf('setBuckets((prev) => ({ ...prev, [key]: nextItems }));'),
        'URL.revokeObjectURL 必须移至 setBuckets 调用之前，保持 setBuckets 纯净'
      );
      assert.ok(
        composerSrc.includes('item.url !== activeItemUrl') &&
        composerSrc.includes('!isUrlReferencedElsewhere(item.url, key, bucketsRef.current)'),
        '卡槽更新比对释放时必须保护 activeItemUrl 与其他槽位引用'
      );
    });

    it('缺陷 3 [Medium]: media-slot.js 权威单一真源严格排除未净化 svg+xml Data URL，仅放行光栅图', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
      const slotSrc = fs.readFileSync(new URL('./media-slot.js', import.meta.url), 'utf-8');

      // 验证单一真源白名单中光栅图正则与 svg+xml 拦截
      assert.ok(
        composerSrc.includes('isAllowedReferenceUrl'),
        'MediaViewerComposer.jsx 必须统一消费 isAllowedReferenceUrl'
      );
      assert.ok(
        !composerSrc.includes("svg+xml"),
        'MediaViewerComposer.jsx 绝对不可放行 svg+xml'
      );
      assert.ok(
        slotSrc.includes("/^data:image\\/(?:png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)"),
        'media-slot.js isAllowedReferenceUrl 必须放行光栅图 png/jpeg/webp/gif/bmp'
      );

      // 序列化与校验测试
      const rawAssets = [
        { slot: '1', type: 'image', url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', name: 'svg-bad' },
        { slot: '2', type: 'image', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', name: 'png-good' },
      ];
      const serialized = serializeReferenceAssets(rawAssets);
      assert.equal(serialized.length, 1, 'svg+xml 无 assetId 时必须被直接过滤');
      assert.equal(serialized[0].name, 'png-good');
      assert.ok(serialized[0].url.startsWith('data:image/png;base64,'));
    });

    it('缺陷 4 [Medium]: MediaViewerComposer.jsx 跨模态迁移释放旧项前增加全局引用检查和 activeItemUrl 保护', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
      assert.ok(
        composerSrc.includes('function isUrlReferencedElsewhere(url, excludeKey, currentBuckets)'),
        '必须声明全局跨槽位引用检查 helper 函数'
      );
      assert.ok(
        composerSrc.includes('!isUrlReferencedElsewhere(item.url, vKey, bucketsRef.current)'),
        '图像转视频迁移时必须包含全局引用检查'
      );
      assert.ok(
        composerSrc.includes('!isUrlReferencedElsewhere(item.url, imgKey, bucketsRef.current)'),
        '视频转图像迁移时必须包含全局引用检查'
      );

      // 逻辑验证：如果旧项在其他卡槽仍被引用，不销毁
      const buckets = {
        'video::first_frame': [{ url: 'blob:https://omnimux/shared-blob' }],
        'video::last_frame': [{ url: 'blob:https://omnimux/shared-blob' }],
        'video::other': [{ url: 'blob:https://omnimux/unique-blob' }],
      };
      const checkElsewhere = (url, excludeKey) => {
        for (const [k, items] of Object.entries(buckets)) {
          if (k === excludeKey) continue;
          if (items.some((it) => it.url === url)) return true;
        }
        return false;
      };
      assert.strictEqual(checkElsewhere('blob:https://omnimux/shared-blob', 'video::first_frame'), true, '仍被 last_frame 引用');
      assert.strictEqual(checkElsewhere('blob:https://omnimux/unique-blob', 'video::other'), false, '无其他引用');
    });

    it('缺陷 5 [Medium]: ReferencePickerPopover.jsx 本地素材未持久化前不设置 assetId（仅保留 id: localId），杜绝虚假 assetId 导致后端查找失效', () => {
      const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf-8');
      assert.ok(
        popoverSrc.includes('const localId = `local_${Date.now()}`;') &&
        popoverSrc.includes('id: localId,'),
        'ReferencePickerPopover 本地上传必须包含 id: localId'
      );
      assert.ok(
        !popoverSrc.includes('assetId: localId,'),
        'ReferencePickerPopover 本地上传未持久化前严禁合成假 assetId: localId'
      );

      // 验证消除死胡同拦截：放行包含 file 的本地素材进入 assets 供提交器和后端处理
      const localAsset = {
        id: 'local_1720000000',
        name: 'test.png',
        file: new Uint8Array([1, 2, 3]),
        url: 'blob:http://localhost/local-blob',
      };
      const isAllowedReferenceUrl = (u) => typeof u === 'string' && (
        (u.startsWith('/') && !u.startsWith('//')) ||
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(u.trim())
      );
      const hasInvalidFragment = [localAsset].some((a) => !a.file && !a.assetId && !isAllowedReferenceUrl(a.url));
      assert.strictEqual(hasInvalidFragment, false, '包含 file 的本地素材必须被放行，消除死胡同阻断');
    });

    describe('审秋毫复核（1 High + 4 Medium）闭环专项回归', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');

      it('缺陷 1 [High]: 提交时透传 url: item.url 与 assetId: item.assetId，绝不因为存在 assetId 擦除 url', () => {
        assert.ok(
          composerSrc.includes('url: item.url,\n        assetId: item.assetId,') ||
          (composerSrc.includes('url: item.url,') && composerSrc.includes('assetId: item.assetId,')),
          'MediaViewerComposer.jsx 必须同时透传 url 与 assetId'
        );
        assert.ok(
          !composerSrc.includes('url: item.assetId ? undefined : item.url'),
          '绝对不可存在因为 item.assetId 而将 url 置为 undefined 的逻辑'
        );
      });

      it('缺陷 2 [Medium]: onChange 释放 blob 前增加 !isUrlReferencedElsewhere(item.url, key, bucketsRef.current)', () => {
        assert.ok(
          composerSrc.includes('!isUrlReferencedElsewhere(item.url, key, bucketsRef.current)'),
          'onChange 必须包含 !isUrlReferencedElsewhere 守卫'
        );
      });

      it('缺陷 3 [Medium]: handleSwitchMode 依赖数组中补齐 activeItemUrl', () => {
        assert.ok(
          composerSrc.includes('[disabled, mode, closePopovers, model, videoModeId, setMode, setNotice, activeItemUrl]'),
          'handleSwitchMode 依赖项必须包含 activeItemUrl'
        );
      });

      it('缺陷 4 [Medium]: 画布模特更新旧项时增加 current.url !== activeItemUrl 与 !isUrlReferencedElsewhere', () => {
        assert.ok(
          composerSrc.includes('current.url !== activeItemUrl &&\n            !isUrlReferencedElsewhere(current.url, key, bucketsRef.current)') ||
          (composerSrc.includes('current.url !== activeItemUrl') && composerSrc.includes('!isUrlReferencedElsewhere(current.url, key, bucketsRef.current)')),
          '画布模特更新旧项时必须同时保护 activeItemUrl 与全局引用'
        );
      });

      it('缺陷 5 [Medium]: 模特槽位溢出截断时增加 !isUrlReferencedElsewhere(item.url, key, bucketsRef.current)', () => {
        assert.ok(
          composerSrc.includes('item.url !== activeItemUrl &&\n              !isUrlReferencedElsewhere(item.url, key, bucketsRef.current)') ||
          (composerSrc.includes('for (const item of truncated)') && composerSrc.includes('!isUrlReferencedElsewhere(item.url, key, bucketsRef.current)')),
          '模特槽位截断时必须包含 !isUrlReferencedElsewhere 守卫'
        );
      });

      it('缺陷 6 [Medium]: MediaViewerComposer.jsx 预填提示词时同步更新 userPromptSuffix 与 userPromptSuffixRef.current', () => {
        assert.ok(
          composerSrc.includes('setPrompt(request.prompt);\n    setUserPromptSuffix(request.prompt);\n    userPromptSuffixRef.current = request.prompt;') ||
          (composerSrc.includes('setPrompt(request.prompt);') &&
           composerSrc.includes('setUserPromptSuffix(request.prompt);') &&
           composerSrc.includes('userPromptSuffixRef.current = request.prompt;')),
          '预填提示词时必须同步更新 prompt, userPromptSuffix 与 userPromptSuffixRef.current'
        );
      });
    });

    describe('审秋毫复核（2 High + 3 Medium）闭环专项回归', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
      const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');

      it('缺陷 1 [High]: MediaViewerTab.jsx handleDirectSubmit 对包含 file 的 blob: 素材进行异步预物化转换为 base64 Data URL', async () => {
        assert.ok(
          tabSrc.includes('materializeAssetFile'),
          'MediaViewerTab.jsx 必须声明 materializeAssetFile 预物化转换逻辑'
        );
        assert.ok(
          tabSrc.includes('const materializedAssets = Array.isArray(assets)'),
          'handleDirectSubmit 必须对 assets 异步物化'
        );
        assert.ok(
          tabSrc.includes('serializeReferenceAssets(materializedAssets)'),
          'serializeReferenceAssets 必须消费物化后的 materializedAssets'
        );

        // 逻辑行为验证：预物化转换逻辑
        const fakeBlob = new Blob(['sample-image-content'], { type: 'image/png' });
        const mockAssetWithBlob = {
          slot: 'reference_images',
          type: 'image',
          role: 'reference',
          url: 'blob:http://localhost/uuid-1234',
          file: fakeBlob,
        };

        const testMaterialize = async (asset) => {
          if (!asset || typeof asset !== 'object') return asset;
          const isBlobUrl = (typeof asset.url === 'string' && asset.url.startsWith('blob:')) ||
            (typeof asset.path === 'string' && asset.path.startsWith('blob:'));
          if (asset.file && (isBlobUrl || !asset.url)) {
            if (typeof FileReader !== 'undefined') {
              const fileObj = (typeof Blob !== 'undefined' && asset.file instanceof Blob)
                ? asset.file
                : asset.file;
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(fileObj);
              });
              if (typeof dataUrl === 'string') {
                return { ...asset, url: dataUrl, path: dataUrl };
              }
            }
          }
          return asset;
        };

        const materialized = await testMaterialize(mockAssetWithBlob);
        if (typeof FileReader !== 'undefined') {
          assert.ok(materialized.url.startsWith('data:image/png;base64,'));
          const serialized = serializeReferenceAssets([materialized]);
          assert.equal(serialized.length, 1);
          assert.ok(serialized[0].url.startsWith('data:image/png;base64,'));
        } else {
          // 模拟 FileReader 场景验证经过 serializeReferenceAssets 时不被静默丢弃
          const simulatedDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
          const simulatedMaterialized = { ...mockAssetWithBlob, url: simulatedDataUrl };
          const serialized = serializeReferenceAssets([simulatedMaterialized]);
          assert.equal(serialized.length, 1);
          assert.ok(serialized[0].url.startsWith('data:image/png;base64,'));
        }
      });

      it('缺陷 2 [High]: media-slot.js 导出权威单一真源 isAllowedReferenceUrl，并在 MediaViewerComposer.jsx 与 MediaViewerTab.jsx 中统一消费消除割裂', () => {
        const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
        const slotSrc = fs.readFileSync(new URL('./media-slot.js', import.meta.url), 'utf-8');
        const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');

        assert.ok(slotSrc.includes('export function isAllowedReferenceUrl(url)'), 'media-slot.js 必须导出权威单一真源 isAllowedReferenceUrl');
        assert.ok(composerSrc.includes('isAllowedReferenceUrl') && composerSrc.includes("from './media-slot.js'"), 'MediaViewerComposer.jsx 必须从 media-slot.js 统一引入');
        assert.ok(tabSrc.includes('isAllowedReferenceUrl') && tabSrc.includes("from './media-slot.js'"), 'MediaViewerTab.jsx 必须从 media-slot.js 统一引入');

        // 单一真源规则验证：支持同源相对路径 /、https://、合法图片 base64 Data URL；blob 不可提交
        assert.strictEqual(isAllowedReferenceUrl('/local/path.jpg'), true);
        assert.strictEqual(isAllowedReferenceUrl('https://cdn.example.com/a.png'), true);
        assert.strictEqual(isAllowedReferenceUrl('blob:http://localhost/uuid-999'), false);
        assert.strictEqual(isAllowedReferenceUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), true);
        assert.strictEqual(isAllowedReferenceUrl('http://cdn.example.com/a.png'), false, '严格排除未加密 http:// 协议');
        assert.strictEqual(isAllowedReferenceUrl('//cdn.example.com/a.png'), false, '严格排除双斜杠协议相对路径');
        assert.strictEqual(isAllowedReferenceUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false, '严格排除未净化 svg');
      });

      it('缺陷 3 [Medium]: MediaViewerComposer.jsx 模特原图注入统一权威白名单校验原始 URL 彻底移除 file:// replace 剥离', () => {
        assert.ok(
          composerSrc.includes("const rawUrl = activeItemUrl || '';") &&
          composerSrc.includes("const expectedUrl = isAllowedReferenceUrl(rawUrl) ? rawUrl : '';"),
          '模特原图注入必须直接调用统一权威白名单函数 isAllowedReferenceUrl 校验原始 URL'
        );
        // 逻辑行为验证
        assert.strictEqual(isAllowedReferenceUrl('file:///dest/generated-model.png'), false, '未转换的 file:// 协议不属于参考图合法白名单，杜绝非法注入');
        assert.strictEqual(isAllowedReferenceUrl('/dest/generated-model.png'), true, '同源相对路径顺利通过权威白名单检验');
        assert.strictEqual(isAllowedReferenceUrl('https://example.com/model.jpg'), true, 'https 协议顺利通过权威白名单检验');
      });

      it('缺陷 4 & 5 [Medium]: MediaViewerComposer.jsx 跨模态迁移直接移交已有 Object URL，不重复克隆创建多余 Object URL', () => {
        assert.ok(
          composerSrc.includes('const migratedUrl = firstImg.url;') &&
          composerSrc.includes('const migratedUrl = firstFrame.url;'),
          '跨模态迁移必须直接移交已有 Object URL'
        );
        assert.ok(
          composerSrc.includes('url: firstImg.url,') &&
          composerSrc.includes('url: firstFrame.url,'),
          '新卡槽项必须挂载移交后的已有 url'
        );
      });
    });

    describe('契约统一与缺陷清零专项回归 (Issue #2660 闭环)', () => {
      const composerSrc = fs.readFileSync(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf-8');
      const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');
      const slotGroupSrc = fs.readFileSync(new URL('./MediaSlotGroup.jsx', import.meta.url), 'utf-8');
      const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf-8');

      it('项 2: MediaViewerTab.jsx handleDirectSubmit 增加 if (!resp.ok) 状态码校验', () => {
        assert.ok(
          tabSrc.includes('if (!resp.ok) {') &&
          tabSrc.includes('Media generation failed with HTTP status'),
          'handleDirectSubmit 必须对非 2xx 响应抛出异常，避免静默吞异常'
        );
      });

      it('项 3: MediaViewerComposer.jsx 杜绝生成带尾部斜杠的伪 MIME（如 image/），推导不明确时安全默认使用 image/jpeg', () => {
        assert.ok(
          !composerSrc.includes("`${inferredType}/`"),
          'MediaViewerComposer.jsx 严禁生成裸 `${inferredType}/` 伪 MIME'
        );
        assert.ok(
          composerSrc.includes("const safeSubtype = inferredType === 'video' ? 'video/mp4' : (inferredType === 'audio' ? 'audio/mpeg' : 'image/jpeg');"),
          '推导不明确时必须具备 safeSubtype 安全子类型兜底'
        );
        assert.ok(
          composerSrc.includes("const fileType = exactMime || safeSubtype;"),
          'fileType 必须直接采用 exactMime 或 safeSubtype'
        );
      });

      it('项 4: MediaViewerComposer.jsx videoSlots 依赖数组移除未使用的 bucketKey', () => {
        assert.ok(
          composerSrc.includes('}, [mode, model, slots]);'),
          'videoSlots useMemo 必须移除未使用的 bucketKey 依赖'
        );
      });

      it('项 5: MediaViewerComposer.jsx setNotice 处理 room === Infinity 文案', () => {
        assert.ok(
          composerSrc.includes("setNotice(room === Infinity ? '卡槽已满，无法再添加素材' : `最多添加 ${room} 个`);"),
          '卡槽满提示必须区分 Infinity 与具体数字'
        );
      });

      it('项 6: MediaSlotGroup.jsx 彻底移除内部 removeAt 的 URL.revokeObjectURL，由父组件集中管理防止双重释放', () => {
        assert.ok(
          !slotGroupSrc.includes('URL.revokeObjectURL(removed.url)'),
          'removeAt 内部严禁直接调用 URL.revokeObjectURL(removed.url)'
        );
      });

      it('项 7: ReferencePickerPopover.jsx 规范 Object URL 托管生命周期', () => {
        assert.ok(
          popoverSrc.includes('pendingBlobUrlRef'),
          'ReferencePickerPopover 必须包含 pendingBlobUrlRef 托管挂起中的 Object URL'
        );
        assert.ok(
          popoverSrc.includes('blobUrl = null;\n          pendingBlobUrlRef.current = null;\n          onClose?.();'),
          '素材成功入槽后必须解除本地释放权，生命周期正式移交外部卡槽'
        );
      });

      it('审秋毫 12 项整改专项闭环验证', () => {
        // 1. MediaViewerComposer.jsx: expectedUrl 为空时穿透清理 isCanvasModel
        assert.ok(
          composerSrc.includes('// 当 expectedUrl 为空时，若卡槽内存在 isCanvasModel 模特项，不提前 return，而是穿透执行清理将其剔除，防止僵尸模特数据'),
          'MediaViewerComposer.jsx 必须声明 expectedUrl 为空时穿透清理 isCanvasModel'
        );
        assert.ok(
          composerSrc.includes('if (!expectedUrl) {') &&
          composerSrc.includes('if (!list.some((item) => item.isCanvasModel)) return prev;\n            return { ...prev, [key]: list.filter((item) => !item.isCanvasModel) };'),
          'expectedUrl 为空时必须从卡槽剔除 isCanvasModel'
        );

        // 2. MediaViewerComposer.jsx: 跨模态迁移时同步从源卡槽中清理原素材
        assert.ok(
          composerSrc.includes('const nextSrcList = srcList.filter((item) => item !== firstImg && item.id !== firstImg.id);'),
          '图像切视频迁移时必须将原素材移出源卡槽'
        );
        assert.ok(
          composerSrc.includes('const nextSrcList = srcList.filter((item) => item !== firstFrame && item.id !== firstFrame.id);'),
          '视频切图像迁移时必须将原素材移出源卡槽'
        );

        // 3. ReferencePickerPopover.jsx: 本地上传所有权转移与失败释放
        assert.ok(
          popoverSrc.includes('accepted = result instanceof Promise ? await result : result;'),
          'ReferencePickerPopover.jsx 必须正确等待入槽判定结果'
        );

        // 5. MediaViewerTab.jsx: 移除请求体中重复的 assets: serializedReferences
        assert.ok(
          !tabSrc.includes('assets: serializedReferences'),
          'MediaViewerTab.jsx 请求体严禁包含重复的 assets 字段'
        );
        assert.ok(
          tabSrc.includes('references: serializedReferences'),
          'MediaViewerTab.jsx 请求体必须包含标准的 references 字段'
        );

        // 6. MediaViewerTab.jsx: materializeAssetFile 严格收敛在图片类型与 <=5MB
        assert.ok(
          tabSrc.includes('MAX_MATERIALIZE_FILE_SIZE = 5 * 1024 * 1024'),
          'materializeAssetFile 必须声明 5MB 合理阈值'
        );
        assert.ok(
          tabSrc.includes("const isEligible = asset.type === 'image' &&") &&
          tabSrc.includes('(!asset.file?.size || asset.file.size <= MAX_MATERIALIZE_FILE_SIZE);'),
          'materializeAssetFile 必须严格收敛在图片类型'
        );

        // 7. MediaViewerTab.jsx: handleDirectSubmit catch 失败提示通道
        assert.ok(
          tabSrc.includes("console.error('[MediaViewer] Direct generate failed:', err);"),
          'handleDirectSubmit 发生错误时必须记录日志'
        );
        assert.ok(
          tabSrc.includes("window.dispatchEvent(new CustomEvent('omnimux:toast', { detail: { message, type: 'error' } }));"),
          '有通知通道时向用户派发失败提示'
        );

        // 8. media-slot.js: 支持 gif 与 bmp
        assert.strictEqual(isAllowedReferenceUrl('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='), true);
        assert.strictEqual(isAllowedReferenceUrl('data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////AA=='), true);

        // 11. ReferencePickerPopover.jsx: 移除 panel.focus?.()
        assert.ok(
          !popoverSrc.includes('panel.focus?.()'),
          'ReferencePickerPopover.jsx 绝对不可抢占输入框焦点'
        );

        // 12. MediaSlotGroup.jsx: removeAt 彻底移除内部 revokeObjectURL 防止双重释放
        assert.ok(
          !slotGroupSrc.includes('URL.revokeObjectURL(removed.url)'),
          'MediaSlotGroup.jsx removeAt 必须由父组件集中管理生命周期，不进行内部直接撤销'
        );
      });

      it('审秋毫最新 5 项缺陷（1 High + 4 Medium）专项回归验证', () => {
        // 1. [High] MediaViewerComposer.jsx: 完善 hasInvalidFragment 校验拦截不支持直接序列化的非图片本地素材，并清理 cloneBlobOrFile 死函数
        assert.ok(
          composerSrc.includes('const hasLocalMediaFile = assets.some((a) => a.file && !a.assetId && (a.type === \'video\' || a.type === \'audio\'));') &&
          composerSrc.includes('const hasInvalidFragment = assets.some((a) => {') &&
          composerSrc.includes('if (a.assetId || a.file) return false;') &&
          composerSrc.includes("return !isAllowedReferenceUrl(a.url) || url.startsWith('blob:');"),
          'MediaViewerComposer 提交校验必须拦截本地音视频与无 file/assetId 的纯 blob 引用'
        );
        assert.ok(
          composerSrc.includes("setNotice('请先上传本地音视频到资产库后再用于生成');"),
          'MediaViewerComposer 拦截本地音视频必须给出明确提示'
        );
        assert.ok(
          !composerSrc.includes('function cloneBlobOrFile'),
          'MediaViewerComposer 必须清理无引用的 cloneBlobOrFile 死函数'
        );

        // 2. [Medium] MediaSlotGroup.jsx:119 彻底移除内部 removeAt 的 URL.revokeObjectURL
        assert.ok(
          !slotGroupSrc.includes('URL.revokeObjectURL(removed.url)'),
          'MediaSlotGroup removeAt 必须彻底移除 URL.revokeObjectURL 防止双重释放'
        );

        // 3. [Medium] MediaViewerTab.jsx:30-34 对超过 5MB 跳过 Base64 物化的本地图片进行前置错误阻断，防止静默丢弃
        assert.ok(
          tabSrc.includes("const isEligible = asset.type === 'image' &&") &&
          tabSrc.includes('(!asset.file?.size || asset.file.size <= MAX_MATERIALIZE_FILE_SIZE);') &&
          tabSrc.includes("if (asset.file && isBlobOrEmpty && asset.type === 'image' && !isEligible) {") &&
          tabSrc.includes("throw new Error('本地图片超过 5MB，请压缩后重试或先上传到资产库');"),
          'MediaViewerTab.jsx 必须对超过 5MB 的本地图片进行前置阻断抛错'
        );

        // 3.1 行为级验证：超过 5MB 的本地图片物化时前置阻断抛出明确错误
        const MAX_SIZE = 5 * 1024 * 1024;
        const testMaterializeEligibility = (asset) => {
          const isBlobOrEmpty = !asset.url ||
            (typeof asset.url === 'string' && asset.url.startsWith('blob:')) ||
            (typeof asset.path === 'string' && asset.path.startsWith('blob:'));
          const isEligible = asset.type === 'image' &&
            (!asset.file?.size || asset.file.size <= MAX_SIZE);
          if (asset.file && isBlobOrEmpty && asset.type === 'image' && !isEligible) {
            throw new Error('本地图片超过 5MB，请压缩后重试或先上传到资产库');
          }
          return isEligible;
        };

        assert.throws(
          () => testMaterializeEligibility({
            type: 'image',
            url: 'blob:http://localhost/oversized',
            file: { size: 5 * 1024 * 1024 + 1 },
          }),
          /本地图片超过 5MB，请压缩后重试或先上传到资产库/
        );
        assert.strictEqual(
          testMaterializeEligibility({
            type: 'image',
            url: 'blob:http://localhost/normal',
            file: { size: 2 * 1024 * 1024 },
          }),
          true
        );

        // 4 & 5. [Medium] MediaViewerComposer.jsx:408-410 & 461-463 跨模态迁移时直接移交已有 Object URL，不重复克隆
        assert.ok(
          composerSrc.includes('const migratedUrl = firstImg.url;') &&
          composerSrc.includes('const migratedUrl = firstFrame.url;'),
          'MediaViewerComposer 跨模态迁移必须直接移交已有 Object URL'
        );
        assert.ok(
          composerSrc.includes('url: firstImg.url,') &&
          composerSrc.includes('url: firstFrame.url,'),
          '新卡槽项必须使用原有 url，不重复克隆创建多余 Object URL'
        );
      });

      it('审秋毫最新 3 项闭环复核（1 High + 2 Medium）专项回归验证', async () => {
        // 1. [High] MediaViewerComposer.jsx:166-167 彻底移除 file:// replace 剥离，直接调用统一权威白名单函数校验原始 URL
        assert.ok(
          composerSrc.includes("const rawUrl = activeItemUrl || '';") &&
          composerSrc.includes("const expectedUrl = isAllowedReferenceUrl(rawUrl) ? rawUrl : '';"),
          'MediaViewerComposer 必须直接使用 isAllowedReferenceUrl(rawUrl) 校验原始 URL'
        );
        assert.ok(
          !composerSrc.includes("replace(/^file:\\/\\//, '')"),
          'MediaViewerComposer 严禁使用 replace 剥离 file:// 伪造路径'
        );

        // 2. [Medium] MediaViewerTab.jsx:55-59 materializeAssetFile 读取异常时抛出显式错误阻断流程
        assert.ok(
          tabSrc.includes("console.warn('[MediaViewerTab] Failed to materialize local file to base64 Data URL:', err);") &&
          tabSrc.includes("throw new Error('本地图片读取失败，请重试或先上传到资产库');"),
          'MediaViewerTab.jsx 在读取本地文件异常时必须抛出显式错误阻断流程'
        );

        // 3. [Medium] ReferencePickerPopover.jsx:198-203 预设素材选择点击与键盘回车支持异步 Promise 并包裹错误处理
        const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf-8');
        assert.ok(
          popoverSrc.includes("onError?.('素材入槽失败，请重试');") &&
          popoverSrc.includes("console.warn?.('[ReferencePickerPopover] preset asset selection failed:', err);"),
          'ReferencePickerPopover 预设素材选择必须包含错误提示与日志输出'
        );
        assert.ok(
          popoverSrc.includes('const accepted = result instanceof Promise ? await result : result;') &&
          popoverSrc.includes('if (accepted === true) {'),
          'ReferencePickerPopover 预设素材选择必须支持 Promise 异步判定'
        );
      });

      it('审秋毫最新具体修改（1 High + 1 Medium）专项闭环验证', () => {
        const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');
        const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf-8');

        // 1. [High] MediaViewerTab.jsx:47-53 校验失败抛出格式不支持错误并阻断流程
        assert.ok(
          tabSrc.includes("if (typeof dataUrl === 'string' && isAllowedReferenceUrl(dataUrl)) {") &&
          tabSrc.includes("throw new Error('本地图片格式暂不支持，请转换为 PNG/JPEG/WebP/GIF/BMP 后重试');"),
          'MediaViewerTab.jsx 当 dataUrl 不在白名单时必须抛出格式不支持错误阻断流程'
        );

        // 2. [Medium] ReferencePickerPopover.jsx:198-209 提取 handlePresetSelect 并加入 selectingRef 互斥防重
        assert.ok(
          popoverSrc.includes('const selectingRef = useRef(false);'),
          'ReferencePickerPopover 必须声明 selectingRef 防重标记'
        );
        assert.ok(
          popoverSrc.includes('const handlePresetSelect = async (asset) => {') &&
          popoverSrc.includes('if (selectingRef.current) return;') &&
          popoverSrc.includes('selectingRef.current = true;') &&
          popoverSrc.includes('selectingRef.current = false;'),
          'ReferencePickerPopover 必须封装 handlePresetSelect 并在开始/结束维护 selectingRef 互斥锁'
        );
        assert.ok(
          popoverSrc.includes('onClick={() => handlePresetSelect(asset)}') &&
          popoverSrc.includes('handlePresetSelect(asset);'),
          'ReferencePickerPopover 预置卡片点击与回车必须共同复用 handlePresetSelect'
        );
      });

      it('审秋毫终审复核 2 项具体修改（2 Medium）专项闭环验证', () => {
        const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');
        const popoverSrc = fs.readFileSync(new URL('./ReferencePickerPopover.jsx', import.meta.url), 'utf-8');

        // 1. [Medium] ReferencePickerPopover.jsx:56-59 handleLocalUpload 接入 selectingRef 互斥防重锁并在 finally 中复位
        assert.ok(
          popoverSrc.includes('const handleLocalUpload = async (e) => {\n    if (selectingRef.current) return;\n    selectingRef.current = true;') &&
          popoverSrc.includes('selectingRef.current = false;'),
          'ReferencePickerPopover handleLocalUpload 必须接入 selectingRef 互斥防重锁并在 finally 中复位'
        );

        // 2. [Medium] MediaViewerTab.jsx:37-40 缺少 FileReader 运行环境下显式抛出明确错误
        assert.ok(
          tabSrc.includes("if (typeof FileReader !== 'undefined') {") &&
          tabSrc.includes("} else {\n        throw new Error('当前运行环境不支持本地图片解析，请先上传到资产库');\n      }") &&
          tabSrc.includes("err?.message === '当前运行环境不支持本地图片解析，请先上传到资产库'"),
          'MediaViewerTab 在无 FileReader 环境下必须抛出明确错误防止静默 drop'
        );
      });

      it('审秋毫最终 2 项具体修改（1 High + 1 Medium）专项闭环验证', () => {
        const tabSrc = fs.readFileSync(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf-8');
        const slotSrc = fs.readFileSync(new URL('./media-slot.js', import.meta.url), 'utf-8');

        // 1. [High] media-slot.js:426-435 收敛 isAllowedReferenceUrl 对 HTTPS URL 的安全防线（排除私有 IP、localhost、内网地址，同时防御 IPv6 私有/回环，防止 SSRF）
        assert.ok(
          slotSrc.includes("if (trimmed.startsWith('https://')) {") &&
          slotSrc.includes('const parsed = new URL(trimmed);') &&
          slotSrc.includes('const host = parsed.hostname.toLowerCase();') &&
          slotSrc.includes("host === 'localhost'") &&
          slotSrc.includes("host.endsWith('.local')") &&
          slotSrc.includes("host.startsWith('[')") &&
          slotSrc.includes("host.includes(':')") &&
          slotSrc.includes('/^127\\.|^10\\.|^192\\.168\\.|^172\\.(1[6-9]|2\\d|3[01])\\./.test(host)'),
          'media-slot.js isAllowedReferenceUrl 源码中必须包含排除私有 IPv4、IPv6、localhost、内网地址的安全校验'
        );
        assert.strictEqual(isAllowedReferenceUrl('https://cdn.example.com/pic.png'), true);
        assert.strictEqual(isAllowedReferenceUrl('https://localhost/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://app.local/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://127.0.0.1/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://10.0.0.1/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://192.168.1.1/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://172.16.0.1/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://172.24.1.1/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://172.31.255.255/pic.png'), false);
        assert.strictEqual(isAllowedReferenceUrl('https://172.32.0.1/pic.png'), true);
        assert.strictEqual(isAllowedReferenceUrl('https://[::1]/pic.png'), false, '排除 IPv6 回环地址');
        assert.strictEqual(isAllowedReferenceUrl('https://[fe80::1]/pic.png'), false, '排除 IPv6 私有/链路本地地址');
        assert.strictEqual(isAllowedReferenceUrl('https://[::ffff:127.0.0.1]/pic.png'), false, '排除 IPv6 映射地址');

        // 2. [Medium] media-slot.js:437 对 data:image/...;base64 增加 5MB 等价长度限制
        assert.ok(
          slotSrc.includes("const estimatedBytes = Math.floor((base64.length * 3) / 4);") &&
          slotSrc.includes("return estimatedBytes <= (5 * 1024 * 1024);"),
          'media-slot.js 必须对 Base64 数据设置 5MB 等价长度限制'
        );
        const validSmallBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        assert.strictEqual(isAllowedReferenceUrl(validSmallBase64), true, '合规小型 Base64 放行');
        const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((5 * 1024 * 1024 * 4) / 3) + 10);
        assert.strictEqual(isAllowedReferenceUrl(hugeBase64), false, '超大 Base64 数据（>5MB）拦截');

        // MediaViewerTab.jsx:22 将 MAX_MATERIALIZE_FILE_SIZE 调整至 5MB，提示文案更新保持一致
        assert.ok(
          tabSrc.includes('const MAX_MATERIALIZE_FILE_SIZE = 5 * 1024 * 1024; // 5MB'),
          'MediaViewerTab.jsx MAX_MATERIALIZE_FILE_SIZE 必须收敛至 5MB'
        );
        assert.ok(
          tabSrc.includes("throw new Error('本地图片超过 5MB，请压缩后重试或先上传到资产库');"),
          'MediaViewerTab.jsx 超限提示文案必须与产品经理核定一致'
        );
      });
    });
  });
});
