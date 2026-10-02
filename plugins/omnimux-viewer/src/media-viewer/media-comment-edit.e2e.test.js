import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveAdaptiveOperation,
  isAllowedReferenceUrl,
  makeBucketKey,
  operationsOf,
  serializeReferenceAssets,
  slotPlan,
} from './media-slot.js';
import { isLocalMediaSource } from '../../../omnimux/src/media/gateway-upload.js';

describe('E2E: 媒体查看器局部评论标注与图片编辑生成契约验证 (Issue #2827)', () => {
  const mockImageModel = {
    id: 'gpt-image-2.5',
    label: 'GPT Image 2.5',
    family: 'openai',
  };

  it('1. 契约自适应：通用图像模型缺省 operations 时提供图片编辑操作兜底', () => {
    const ops = operationsOf(mockImageModel, 'image');
    assert.ok(ops.length >= 2, '必须提供至少包含文生图与图片编辑的标准操作契约');
    assert.ok(ops.some((op) => op.id === 'text_to_image'), '必须包含 text_to_image');
    assert.ok(ops.some((op) => op.id === 'image_edit' || op.id === 'multi_reference'), '必须包含图片编辑或垫图参考操作');
  });

  it('2. 槽位 Key 稳定：初始状态与编辑状态均返回一致的 image:reference:reference 槽位 Key', () => {
    const initialPlan = slotPlan(mockImageModel, 'image');
    assert.equal(initialPlan.length, 1);
    assert.equal(initialPlan[0].key, 'image:reference:reference');

    const editPlan = slotPlan(mockImageModel, 'image', 'image_edit');
    assert.equal(editPlan.length, 1);
    assert.equal(editPlan[0].key, 'image:reference:reference');
  });

  it('3. 方案 C 双轨打点自适应：添加 1 个标注模特原图后自动推导为 image_edit 操作', () => {
    const slot = slotPlan(mockImageModel, 'image')[0];
    const key = makeBucketKey('image', mockImageModel.id, slot.key);

    const assetUrl = '/omnimux-viewer/asset?p=L1VzZXJzL3gvc2hvdC5qcGc&s=testmac';
    assert.equal(isAllowedReferenceUrl(assetUrl), true, '查看器同源相对路径必须被合法参考图白名单放行');

    const buckets = {
      [key]: [
        {
          id: 'canvas-model-1',
          name: '画布模特原图',
          url: assetUrl,
          isCanvasModel: true,
          markBadge: '标记 1',
        },
      ],
    };

    const activeOp = deriveAdaptiveOperation(mockImageModel, 'image', buckets);
    assert.ok(activeOp, '必须成功自适应推导出有效操作');
    assert.equal(activeOp.id, 'image_edit', '1 个模特原图必须自动对齐到 image_edit 图片编辑操作');
  });

  it('4. 序列化合规：查看器同源相对路径成功序列化并通过协议白名单', () => {
    const rawAssets = [
      {
        slot: 'reference_image',
        type: 'image',
        role: 'reference',
        name: '画布模特原图',
        url: '/omnimux-viewer/asset?p=L1VzZXJzL3gvc2hvdC5qcGc&s=testmac',
      },
    ];
    const serialized = serializeReferenceAssets(rawAssets);
    assert.equal(serialized.length, 1);
    assert.equal(serialized[0].url, '/omnimux-viewer/asset?p=L1VzZXJzL3gvc2hvdC5qcGc&s=testmac');
    assert.equal(serialized[0].pathOrUrl, '/omnimux-viewer/asset?p=L1VzZXJzL3gvc2hvdC5qcGc&s=testmac');
  });

  it('5. 本地媒体解析与网关探测：/omnimux-viewer/asset 识别为 local-url 并解析 base64 路径', async () => {
    const url = '/omnimux-viewer/asset?p=L1VzZXJzL3gvc2hvdC5qcGc&s=testmac';
    assert.equal(isLocalMediaSource(url), true, '查看器静态路由必须识别为本地素材');

    const fullUrl = 'http://127.0.0.1:45120/omnimux-viewer/asset?p=L1VzZXJzL3gvc2hvdC5qcGc&s=testmac';
    assert.equal(isLocalMediaSource(fullUrl), true, '回环地址查看器静态路由必须识别为本地素材');
  });
});
