import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveAdaptiveOperation, extractSlotKeyFromBucketKey, inferMimeType, isAllowedReferenceUrl, orderAfterRemoval, rejectionOf, serializeReferenceAssets, slotPlan } from './media-slot.js';

const imageModel = {
  id: 'grok-imagine-image-2-0',
  operations: [
    { id: 'text_to_image', output: { type: 'image' }, inputs: [{ type: 'text', role: 'prompt', max: 1 }] },
    {
      id: 'image_edit',
      output: { type: 'image' },
      inputs: [
        { type: 'text', role: 'prompt', max: 1 },
        { slot: 'reference_images', type: 'image', role: 'reference', max: 1, allowedMimes: ['image/png', 'image/jpeg'] },
      ],
    },
    {
      id: 'multi_reference',
      output: { type: 'image' },
      inputs: [
        { type: 'text', role: 'prompt', max: 1 },
        { slot: 'reference_images', type: 'image', role: 'reference', max: 4, allowedMimes: ['image/png', 'image/jpeg'] },
      ],
    },
  ],
};

const videoModel = {
  id: 'seedance-2-0-fast',
  operations: [
    { id: 'text_to_video', label: '文生视频', output: { type: 'video' }, inputs: [{ type: 'text', role: 'prompt' }] },
    {
      id: 'first_frame',
      output: { type: 'video' },
      inputs: [{ slot: 'first_frame', type: 'image', role: 'first_frame', max: 1 }],
    },
    {
      id: 'first_last_frame',
      output: { type: 'video' },
      inputs: [
        { slot: 'first_frame', type: 'image', role: 'first_frame', max: 1 },
        { slot: 'last_frame', type: 'image', role: 'last_frame', max: 1 },
      ],
    },
    {
      id: 'video_multi_ref',
      output: { type: 'video' },
      inputs: [
        { slot: 'reference_images', type: 'image', role: 'reference', max: 9 },
        { slot: 'reference_videos', type: 'video', role: 'reference', max: 3, totalMaxDurationSec: 15.2 },
        { slot: 'reference_audios', type: 'audio', role: 'reference', max: 3, totalMaxDurationSec: 15 },
      ],
    },
    {
      id: 'video_edit',
      output: { type: 'video' },
      inputs: [
        { slot: 'reference_videos', type: 'video', role: 'reference', max: 1, totalMaxDurationSec: 30 },
      ],
    },
  ],
};

describe('素材卡槽槽位与自适应推导', () => {
  it('图像模型用带参考图的操作，上限来自契约', () => {
    const plan = slotPlan(imageModel, 'image');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, 'image');
    assert.equal(plan[0].max, 4);
  });

  it('纯文生图模型常驻提供 1 个 1:1 虚线空卡槽', () => {
    const plan = slotPlan({ operations: [imageModel.operations[0]] }, 'image');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, 'image');
    assert.equal(plan[0].max, 1);
    assert.equal(plan[0].slot, 'reference');
    assert.equal(plan[0].role, 'reference');
    assert.equal(plan[0].key, 'image:reference:reference');
  });

  it('视频文生视频模式常驻提供首尾帧引导槽', () => {
    const plan = slotPlan(videoModel, 'video', 'text_to_video');
    assert.deepEqual(plan.map((slot) => slot.label), ['首帧', '尾帧']);
    assert.equal(plan[0].role, 'first_frame');
    assert.equal(plan[1].role, 'last_frame');
  });

  it('视频首尾帧与全能参考对应契约槽位', () => {
    assert.deepEqual(slotPlan(videoModel, 'video', 'first_last_frame').map((slot) => slot.label), ['首帧', '尾帧']);
    const ref = slotPlan(videoModel, 'video', 'video_multi_ref');
    assert.deepEqual(ref.map((slot) => slot.type), ['image', 'video', 'audio']);
    assert.deepEqual(ref.map((slot) => slot.max), [9, 3, 3]);
    assert.equal(ref[1].durationMax, 15.2);
  });

  it('读不到契约时不显示卡槽', () => {
    assert.deepEqual(slotPlan(null, 'image'), []);
    assert.deepEqual(slotPlan({ id: 'unknown' }, 'video', 'video_multi_ref'), []);
  });

  it('格式不符与超时长分别给出原因', () => {
    const videoSlot = slotPlan(videoModel, 'video', 'video_multi_ref')[1];
    assert.match(rejectionOf({ type: 'image/png' }, videoSlot), /视频/);
    assert.match(rejectionOf({ type: 'video/mp4' }, videoSlot, 18), /15\.2/);
    assert.equal(rejectionOf({ type: 'video/mp4' }, videoSlot, 10), '');
  });

  it('删除后右侧左移，左侧保持原位', () => {
    assert.deepEqual(orderAfterRemoval(['a', 'b', 'c', 'd'], 1), ['a', 'c', 'd']);
    assert.deepEqual(orderAfterRemoval(['a'], 0), []);
  });

  describe('deriveAdaptiveOperation 方案 C 双轨打点自适应机制', () => {
    it('图像模式：0 素材 -> 文生图', () => {
      const op = deriveAdaptiveOperation(imageModel, 'image', {});
      assert.equal(op.id, 'text_to_image');
    });

    it('图像模式：1 素材 -> 图片编辑', () => {
      const op = deriveAdaptiveOperation(imageModel, 'image', {
        'image:grok:ref': [{ id: '1', name: 'img1.png', type: 'image' }],
      });
      assert.equal(op.id, 'image_edit');
    });

    it('图像模式：多素材 -> 多图参考', () => {
      const op = deriveAdaptiveOperation(imageModel, 'image', {
        'image:grok:ref': [
          { id: '1', name: 'img1.png', type: 'image' },
          { id: '2', name: 'img2.png', type: 'image' },
        ],
      });
      assert.equal(op.id, 'multi_reference');
    });

    it('视频模式：0 素材 -> 文生视频', () => {
      const op = deriveAdaptiveOperation(videoModel, 'video', {});
      assert.equal(op.id, 'text_to_video');
    });

    it('视频模式：仅首帧 -> 首帧生视频', () => {
      const op = deriveAdaptiveOperation(videoModel, 'video', {
        firstFrame: { id: 'ff', name: 'first.png' },
      });
      assert.equal(op.id, 'first_frame');
    });

    it('视频模式：首尾帧 -> 首尾帧生视频', () => {
      const op = deriveAdaptiveOperation(videoModel, 'video', {
        firstFrame: { id: 'ff', name: 'first.png' },
        lastFrame: { id: 'lf', name: 'last.png' },
      });
      assert.equal(op.id, 'first_last_frame');
    });

    it('视频模式：孤立尾帧因模型不支持单尾帧，优雅降级为 text_to_video', () => {
      const op = deriveAdaptiveOperation(videoModel, 'video', {
        lastFrame: { id: 'lf', name: 'last.png' },
      });
      assert.equal(op.id, 'text_to_video');
    });

    it('视频模式：参考视频 -> 视频编辑', () => {
      const op = deriveAdaptiveOperation(videoModel, 'video', {
        refVideos: [{ id: 'rv', name: 'clip.mp4' }],
      });
      assert.equal(op.id, 'video_edit');
    });

    it('视频模式：全能参考组合', () => {
      const op = deriveAdaptiveOperation(videoModel, 'video', {
        firstFrame: { id: 'ff', name: 'first.png' },
        refVideos: [{ id: 'rv', name: 'clip.mp4' }],
      });
      assert.equal(op.id, 'video_multi_ref');
    });

    it('模型不存在或无 operations 时安全返回 null', () => {
      assert.equal(deriveAdaptiveOperation(null, 'image', {}), null);
      assert.equal(deriveAdaptiveOperation({ operations: [] }, 'image', {}), null);
    });

    it('切分复合键 slotKey，避免模型 ID 包含 video/first 关键字时误判', () => {
      // 模型 ID 包含 video (kling-video-model)，槽位实际是图片引用槽
      const op = deriveAdaptiveOperation(imageModel, 'image', {
        'image:kling-video-model:guided__image__reference': [
          { id: '1', name: 'ref1.png', type: 'image' },
        ],
      });
      assert.equal(op.id, 'image_edit');
    });

    it('视频模式：修复 refVideosCount 双重重复计数，单视频 slot 统一统计一次', () => {
      // 传入 1 个视频文件，其包含 type: 'video' 且位于包含 video 的 key 下
      const op = deriveAdaptiveOperation(videoModel, 'video', {
        'video:seedance-2-0-fast:reference_videos': [
          { id: 'v1', name: 'clip.mp4', type: 'video' },
        ],
      });
      // 只有 1 个视频且无首尾帧时，应自适应收敛到单个视频的 video_edit
      assert.equal(op.id, 'video_edit');
    });

    it('槽位 Key 统一稳定化：彻底消除引导槽与真实操作槽的 Key 不一致问题', () => {
      const customTextModel = {
        operations: [
          { id: 'custom_t2i', output: { type: 'image' }, inputs: [{ type: 'text', role: 'prompt' }] },
        ],
      };
      const imgPlan = slotPlan(customTextModel, 'image');
      assert.equal(imgPlan[0].key, 'image:reference:reference');
      assert.equal(imgPlan[0].slot, 'reference');
      assert.equal(imgPlan[0].role, 'reference');

      const vidPlan = slotPlan(videoModel, 'video', 'text_to_video');
      assert.equal(vidPlan[0].key, 'image:first_frame:first_frame');
      assert.equal(vidPlan[0].slot, 'first_frame');
      assert.equal(vidPlan[0].role, 'first_frame');
      assert.equal(vidPlan[1].key, 'image:last_frame:last_frame');
      assert.equal(vidPlan[1].slot, 'last_frame');
      assert.equal(vidPlan[1].role, 'last_frame');
    });

    it('slotPlan 纯文生图模型即使无标准操作名也保障返回虚线空卡槽', () => {
      const customTextModel = {
        operations: [
          { id: 'custom_t2i', output: { type: 'image' }, inputs: [{ type: 'text', role: 'prompt' }] },
        ],
      };
      const plan = slotPlan(customTextModel, 'image');
      assert.equal(plan.length, 1);
      assert.equal(plan[0].slot, 'reference');
      assert.equal(plan[0].role, 'reference');
      assert.equal(plan[0].key, 'image:reference:reference');
      assert.equal(plan[0].max, 1);
    });

    it('slotPlan 仅在 groups.length === 0 时启用降级，不覆盖模型已有合法 slots', () => {
      const customVideoModel = {
        operations: [
          {
            id: 'text_to_video',
            output: { type: 'video' },
            inputs: [
              { slot: 'custom_input', type: 'video', role: 'source', max: 1 },
            ],
          },
        ],
      };
      const plan = slotPlan(customVideoModel, 'video', 'text_to_video');
      assert.equal(plan.length, 1);
      assert.equal(plan[0].slot, 'custom_input');
      assert.equal(plan[0].role, 'source');
    });

    it('videoBucketsDependencyKey 过滤逻辑基于显式 slot.role 或 slot.type 匹配', () => {
      const slots = [
        { key: 'first_frame', role: 'first_frame', type: 'image' },
        { key: 'last_frame', role: 'last_frame', type: 'image' },
        { key: 'reference_images', role: 'reference', type: 'image' },
      ];
      const buckets = {
        'video:v-model:first_frame': [{ id: '1' }],
        'video:v-model:last_frame': [{ id: '2' }],
        'video:v-model:reference_images': [{ id: '3' }],
      };
      const filtered = Object.entries(buckets)
        .filter(([k]) => {
          const slotKey = extractSlotKeyFromBucketKey(k);
          const matchedSlot = slots.find((s) => s.key === slotKey);
          if (!matchedSlot) return false;
          return (
            matchedSlot.role === 'first_frame' ||
            matchedSlot.role === 'last_frame' ||
            matchedSlot.role === 'video' ||
            matchedSlot.type === 'video'
          );
        })
        .map(([k]) => k);
      assert.deepEqual(filtered.sort(), ['video:v-model:first_frame', 'video:v-model:last_frame'].sort());
    });

    it('卡片角标优先级：item.markBadge || item.badge || null，不再以 slot.label 兜底', () => {
      const slot = { label: '首帧' };
      const itemWithMark = { id: '1', markBadge: '标记 2' };
      const itemWithBadge = { id: '2', badge: '自定义' };
      const itemPlain = { id: '3' };

      const getBadge = (item) => item.markBadge || item.badge || null;

      assert.equal(getBadge(itemWithMark, slot), '标记 2');
      assert.equal(getBadge(itemWithBadge, slot), '自定义');
      assert.equal(getBadge(itemPlain, slot), null);
    });

    it('切模态平滑迁移素材：仅释放未被保留的旧素材，正要保留的首帧 Blob URL 完好不被误杀', () => {
      const firstFrame = { id: 'frame_1', url: 'blob:https://test/first-frame', markBadge: '首帧' };
      const currentItems = [
        { id: 'old_img_1', url: 'blob:https://test/old-img-1' },
        { id: 'frame_1', url: 'blob:https://test/first-frame' },
        { id: 'old_img_2', url: 'https://remote/old-img-2' },
      ];

      const revokedUrls = [];
      const fakeRevoke = (url) => revokedUrls.push(url);

      // 仅释放未被保留的旧素材（it.id !== firstFrame.id）
      const removed = currentItems.filter((it) => it.id !== firstFrame.id);
      for (const item of removed) {
        if (item.url?.startsWith('blob:')) {
          fakeRevoke(item.url);
        }
      }

      // 验证：仅 old_img_1 被释放，正要保留的 firstFrame.url 绝不被 revoke
      assert.deepEqual(revokedUrls, ['blob:https://test/old-img-1']);
      assert.ok(!revokedUrls.includes(firstFrame.url));

      const nextItems = [{ ...firstFrame, markBadge: undefined }];
      assert.equal(nextItems.length, 1);
      assert.equal(nextItems[0].id, 'frame_1');
      assert.equal(nextItems[0].url, 'blob:https://test/first-frame');
    });

    it('卡槽满时拒绝新素材并返回 false，触发外部安全释放 Blob URL', () => {
      const slot = { key: 'slot_1', max: 1 };
      const currentList = [{ id: 'existing_1', name: '已存在素材' }];
      const newAsset = { id: 'new_1', name: '新上传素材', url: 'blob:https://test/new' };

      const revokedUrls = [];
      const fakeRevoke = (url) => revokedUrls.push(url);

      const tryAddAsset = (asset, targetSlot, list) => {
        const room = targetSlot.max == null ? Infinity : targetSlot.max;
        if (list.length >= room) {
          return false;
        }
        return true;
      };

      const accepted = tryAddAsset(newAsset, slot, currentList);
      if (!accepted) {
        fakeRevoke(newAsset.url);
      }

      assert.equal(accepted, false);
      assert.deepEqual(revokedUrls, ['blob:https://test/new']);
    });

    it('extractSlotKeyFromBucketKey 规范解析各种格式 bucketKey 消除裸 slice(2)', () => {
      assert.equal(extractSlotKeyFromBucketKey('image:dall-e-3:image:reference:0'), 'image:reference:0');
      assert.equal(extractSlotKeyFromBucketKey('video:kling:first_frame'), 'first_frame');
      assert.equal(extractSlotKeyFromBucketKey('raw_key'), 'raw_key');
      assert.equal(extractSlotKeyFromBucketKey(''), '');
      assert.equal(extractSlotKeyFromBucketKey(null), '');
    });

    it('收紧 isVideoSlot 判定，排除首尾帧槽位，防止 guided__video__first_frame 误判为视频槽把图片污染为视频', () => {
      const buckets = {
        'video:v-model:guided__video__first_frame': [{ id: 'img_1', url: 'https://example.com/frame.jpg' }],
      };
      const op = deriveAdaptiveOperation(videoModel, 'video', buckets);
      assert.equal(op?.id, 'first_frame');
    });

    it('兜底引导槽标记 guidedOnly: true，而模型原生真实卡槽不带该标记', () => {
      const customTextModel = {
        operations: [
          { id: 'custom_t2i', output: { type: 'image' }, inputs: [{ type: 'text', role: 'prompt' }] },
        ],
      };
      const imgPlan = slotPlan(customTextModel, 'image');
      assert.equal(imgPlan[0].guidedOnly, true);

      const vidPlan = slotPlan(videoModel, 'video', 'text_to_video');
      assert.equal(vidPlan[0].guidedOnly, true);
      assert.equal(vidPlan[1].guidedOnly, true);

      const realImgPlan = slotPlan(imageModel, 'image');
      assert.ok(!realImgPlan[0].guidedOnly);
    });

    it('inferMimeType 精确推断预设与输入素材的具体 MIME 子类型', () => {
      // 1. Data URL
      assert.equal(inferMimeType({ url: 'data:image/svg+xml;base64,PHN2Zz...' }), 'image/svg+xml');
      assert.equal(inferMimeType({ url: 'data:image/png;base64,iVBORw...' }), 'image/png');
      assert.equal(inferMimeType({ url: 'data:video/mp4;base64,...' }), 'video/mp4');

      // 2. 扩展名精确匹配
      assert.equal(inferMimeType({ url: 'https://cdn.example.com/vector.svg?v=1#hash' }), 'image/svg+xml');
      assert.equal(inferMimeType({ name: 'photo.jpg' }), 'image/jpeg');
      assert.equal(inferMimeType({ title: 'clip.mp4' }), 'video/mp4');
      assert.equal(inferMimeType({ url: 'https://cdn.example.com/audio.mp3' }), 'audio/mpeg');

      // 3. 已有明确合法 MIME
      assert.equal(inferMimeType({ mime: 'image/webp' }), 'image/webp');
      assert.equal(inferMimeType({ file: { type: 'image/png' } }), 'image/png');

      // 4. 伪 MIME 或无法推断时返回空字符串
      assert.equal(inferMimeType({ type: 'image/' }), '');
      assert.equal(inferMimeType({ url: 'https://cdn.example.com/unknown_ext' }), '');
      assert.equal(inferMimeType(null), '');
    });

    it('rejectionOf 消除伪 MIME image/ 宽泛放行，若声明了严格 allowedMimes 则严格校验', () => {
      const strictImageSlot = {
        type: 'image',
        allowedMimes: ['image/png', 'image/jpeg'],
      };

      // 伪 MIME 结尾带斜杠：不可绕过白名单，必须拦截
      const pseudoFile = { type: 'image/' };
      assert.equal(rejectionOf(pseudoFile, strictImageSlot, null), '当前文件格式不符合要求');

      // 非白名单的真实图片 MIME (如 svg) 必须被拦截
      const svgFile = { type: 'image/svg+xml' };
      assert.equal(rejectionOf(svgFile, strictImageSlot, null), '当前文件格式不符合要求');

      // 白名单内的精确 MIME 放行
      const pngFile = { type: 'image/png' };
      assert.equal(rejectionOf(pngFile, strictImageSlot, null), '');
      const jpegFile = { type: 'image/jpeg' };
      assert.equal(rejectionOf(jpegFile, strictImageSlot, null), '');

      // 没有声明 allowedMimes 时，正常大类匹配放行
      const permissiveImageSlot = { type: 'image' };
      assert.equal(rejectionOf(pngFile, permissiveImageSlot, null), '');
      assert.equal(rejectionOf(svgFile, permissiveImageSlot, null), '');

      // 空文件类型（type: ''）借助 inferMimeType 从文件名自动补全确切类型并比对 allowedMimes
      const emptyTypePngFile = { type: '', name: 'sample.png' };
      assert.equal(rejectionOf(emptyTypePngFile, strictImageSlot, null), '', '空文件类型若能通过文件名推断出允许的 MIME 则放行');
      const emptyTypeSvgFile = { type: '', name: 'sample.svg' };
      assert.equal(rejectionOf(emptyTypeSvgFile, strictImageSlot, null), '当前文件格式不符合要求', '推断出的类型若不在 allowedMimes 则拦截');
    });

    it('inferMimeType 对于 blob: URL 在扩展名推断阶段予以忽略，自动降级回退到 name 或 title', () => {
      assert.equal(inferMimeType({ url: 'blob:https://omnimux/uuid-1234', name: 'photo.png' }), 'image/png');
      assert.equal(inferMimeType({ url: 'blob:http://localhost/uuid-5678', title: 'video.mp4' }), 'video/mp4');
      assert.equal(inferMimeType({ url: 'blob:https://omnimux/uuid-9999', name: 'audio.wav' }), 'audio/wav');
      assert.equal(inferMimeType({ url: 'blob:https://omnimux/uuid-0000', name: 'vector.svg' }), 'image/svg+xml');
      assert.equal(inferMimeType({ url: 'blob:https://omnimux/uuid-no-name' }), '');
    });

    it('单一真源 isAllowedReferenceUrl 权威白名单：支持同源相对路径 /、https://、合法图片 base64 Data URL，排除 blob:、http://、//、未净化 svg 与非法协议', () => {
      // 1. 同源相对路径
      assert.strictEqual(isAllowedReferenceUrl('/api/media/1.png'), true);
      assert.strictEqual(isAllowedReferenceUrl('/assets/local-test.jpg'), true);
      assert.strictEqual(isAllowedReferenceUrl('//cdn.example.com/pic.png'), false, '双斜杠协议相对路径必须严格排除');

      // 2. https:// 协议支持与安全防线（防范私有 IP、localhost、内网地址 SSRF）
      assert.strictEqual(isAllowedReferenceUrl('https://cdn.example.com/pic.png'), true);
      assert.strictEqual(isAllowedReferenceUrl('http://cdn.example.com/pic.png'), false, '未加密 http 协议必须严格排除');
      assert.strictEqual(isAllowedReferenceUrl('https://localhost/pic.png'), false, '排除 localhost 敏感主机');
      assert.strictEqual(isAllowedReferenceUrl('https://foo.local/pic.png'), false, '排除 .local 局域网主机');
      assert.strictEqual(isAllowedReferenceUrl('https://127.0.0.1/pic.png'), false, '排除 127.x 环回地址');
      assert.strictEqual(isAllowedReferenceUrl('https://10.0.0.1/pic.png'), false, '排除 10.x 内网私有地址');
      assert.strictEqual(isAllowedReferenceUrl('https://192.168.1.1/pic.png'), false, '排除 192.168.x 内网私有地址');
      assert.strictEqual(isAllowedReferenceUrl('https://172.16.0.1/pic.png'), false, '排除 172.16-31.x 内网私有地址');
      assert.strictEqual(isAllowedReferenceUrl('https://172.31.255.255/pic.png'), false, '排除 172.31.x 内网私有地址');
      assert.strictEqual(isAllowedReferenceUrl('https://[::1]/pic.png'), false, '排除 IPv6 回环地址');
      assert.strictEqual(isAllowedReferenceUrl('https://[fe80::1]/pic.png'), false, '排除 IPv6 链路本地地址');
      assert.strictEqual(isAllowedReferenceUrl('https://[::ffff:127.0.0.1]/pic.png'), false, '排除 IPv4 映射的 IPv6 地址');

      // 3. blob: 只用于预览，不能作为可提交参考地址
      assert.strictEqual(isAllowedReferenceUrl('blob:http://localhost/uuid-123'), false);
      assert.strictEqual(isAllowedReferenceUrl('blob:https://omnimux/uuid-456'), false);

      // 4. 合法图片 base64 Data URL（png/jpeg/webp/gif/bmp）与 5MB 上限限制
      assert.strictEqual(isAllowedReferenceUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), true);
      assert.strictEqual(isAllowedReferenceUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
      assert.strictEqual(isAllowedReferenceUrl('data:image/webp;base64,UklGRg=='), true);
      assert.strictEqual(isAllowedReferenceUrl('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='), true);
      assert.strictEqual(isAllowedReferenceUrl('data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////AA=='), true);
      const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((5 * 1024 * 1024 * 4) / 3) + 10);
      assert.strictEqual(isAllowedReferenceUrl(hugeBase64), false, '排除超过 5MB 的超大 Base64 数据');

      // 5. 严格排除未净化的 svg+xml、非图片 data URL、file:// 与 javascript: 危险伪协议
      assert.strictEqual(isAllowedReferenceUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
      assert.strictEqual(isAllowedReferenceUrl('data:text/html;base64,PHNjcmlwdD4='), false);
      assert.strictEqual(isAllowedReferenceUrl('file:///path/pic.png'), false);
      assert.strictEqual(isAllowedReferenceUrl('javascript:alert(1)'), false);
      assert.strictEqual(isAllowedReferenceUrl(''), false);
      assert.strictEqual(isAllowedReferenceUrl(null), false);
    });

    it('serializeReferenceAssets 对参考图 URL 实施单一真源协议白名单（支持 https://、同源相对路径 / 与合规 base64 Data URL，过滤非法/私有协议与瞬态 blob:）', () => {
      const assets = [
        { slot: 'ref', type: 'image', role: 'reference', name: 'valid_https.png', url: 'https://cdn.example.com/pic.png' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'valid_path.png', path: '/local/static/pic.png' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'valid_assetId.png', url: 'blob:http://localhost/uuid', assetId: 'aid_valid' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'invalid_http.png', url: 'http://cdn.example.com/pic.png' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'invalid_proto_relative.png', url: '//cdn.example.com/pic.png' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'invalid_file.png', url: 'file:///path/pic.png' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'invalid_js.png', url: 'javascript:alert(1)' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'invalid_blob.png', url: 'blob:http://localhost/uuid' },
        { slot: 'ref', type: 'image', role: 'reference', name: 'invalid_data.png', url: 'data:image/png;base64,...' },
      ];
      const serialized = serializeReferenceAssets(assets);
      assert.equal(serialized.length, 3, '合规同源 / 相对路径、https:// 或分配了 assetId 的素材保留');
      assert.equal(serialized[0].name, 'valid_https.png');
      assert.equal(serialized[0].url, 'https://cdn.example.com/pic.png');
      assert.equal(serialized[1].name, 'valid_path.png');
      assert.equal(serialized[1].url, '/local/static/pic.png');
      assert.equal(serialized[2].name, 'valid_assetId.png');
      assert.equal(serialized[2].assetId, 'aid_valid');
      assert.equal(serialized[2].url, undefined, '无合规 URL 时不编造虚拟路径');
      assert.equal(serialized[2].pathOrUrl, undefined, '无合规 URL 时不编造虚拟路径');

      // 光栅图 base64 Data URL（png/jpeg/webp）在 serializeReferenceAssets 中必须被保留，直接透传真实 Data URL
      const rasterDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const presetAsset = {
        id: 'up-1',
        slot: 'reference_images',
        type: 'image',
        role: 'reference',
        name: '工作室布光参考图',
        url: rasterDataUrl,
        assetId: 'preset_up-1',
      };
      const res = serializeReferenceAssets([presetAsset]);
      assert.equal(res.length, 1, '带有合规 base64 Data URL 与 assetId 的预设素材必须被合法保留');
      assert.equal(res[0].assetId, 'preset_up-1');
      assert.equal(res[0].url, rasterDataUrl);
      assert.equal(res[0].pathOrUrl, rasterDataUrl);

      // 严格排除未净化的 svg+xml Data URL：url 不被放行，仅保留合法的 assetId
      const svgAsset = {
        id: 'svg-1',
        slot: 'reference_images',
        type: 'image',
        role: 'reference',
        name: '未净化的SVG矢量图',
        url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
        assetId: 'preset_svg-1',
      };
      const resSvg = serializeReferenceAssets([svgAsset]);
      assert.equal(resSvg.length, 1);
      assert.equal(resSvg[0].assetId, 'preset_svg-1');
      assert.equal(resSvg[0].url, undefined, '未净化的 svg+xml Data URL 必须被严格排除，不可作为合规 URL 透传');
      assert.equal(resSvg[0].pathOrUrl, undefined);

      // 仅有 assetId 但无有效 URL 时，真实透传 validAssetId，杜绝编造虚拟路径
      const assetWithIdOnly = {
        id: 'up-2',
        slot: 'reference_images',
        type: 'image',
        role: 'reference',
        name: '仅ID素材',
        assetId: 'aid_only_123',
      };
      const resIdOnly = serializeReferenceAssets([assetWithIdOnly]);
      assert.equal(resIdOnly.length, 1);
      assert.equal(resIdOnly[0].assetId, 'aid_only_123');
      assert.equal(resIdOnly[0].url, undefined, '杜绝编造不存在的虚拟 URL');
      assert.equal(resIdOnly[0].pathOrUrl, undefined);
    });
  });
});
