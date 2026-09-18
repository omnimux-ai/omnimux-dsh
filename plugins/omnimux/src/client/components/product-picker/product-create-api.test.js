import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCreatePayloadFromDraft,
  createProductFromLink,
  isHttpUrl,
  messageFromProductsResult,
  normalizeHttpUrl,
} from './product-create-api.js';

test('isHttpUrl / normalizeHttpUrl: 接受粘贴主机名，拒绝危险协议', () => {
  assert.equal(isHttpUrl('https://shop.example.com/p/1'), true);
  assert.equal(isHttpUrl('shop.example.com/p/1'), true);
  assert.equal(isHttpUrl(''), false);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(normalizeHttpUrl('shop.example.com/p/1'), 'https://shop.example.com/p/1');
  assert.equal(normalizeHttpUrl('https://a.com'), 'https://a.com');
});

test('buildCreatePayloadFromDraft: 实体与数字草稿映射，缺名拒绝', () => {
  const physical = buildCreatePayloadFromDraft({
    name: '  便携风扇  ',
    kind: 'physical',
    selling_points: '静音',
    price: '99',
    sku: 'F-1',
    promotion: '包邮',
    categories: ['家居', '', 7],
    media: [{ id: 'med_1', real_path: '/tmp/a.png', original_name: 'a.png' }],
    cover_media_id: 'med_1',
  });
  assert.equal(physical.ok, true);
  assert.equal(physical.body.name, '便携风扇');
  assert.equal(physical.body.kind, 'physical');
  assert.equal(physical.body.price, '99');
  assert.deepEqual(physical.body.categories, ['家居']);
  assert.equal(physical.body.media[0].id, 'med_1');

  const digital = buildCreatePayloadFromDraft(
    {
      name: '数字课',
      kind: 'digital',
      link: '',
      brand_strategy: { brand_basic_info: { company: { name: 'A' } } },
    },
    { fallbackUrl: 'https://course.example.com' },
  );
  assert.equal(digital.ok, true);
  assert.equal(digital.body.kind, 'digital');
  assert.equal(digital.body.link, 'https://course.example.com');
  assert.ok(digital.body.brand_strategy);

  assert.equal(buildCreatePayloadFromDraft({ selling_points: 'x' }).ok, false);
  assert.equal(buildCreatePayloadFromDraft(null).reason, 'empty-draft');
});

test('createProductFromLink: 校验 → 解析 → 保存成功路径', async () => {
  const calls = [];
  const result = await createProductFromLink({
    url: 'shop.example.com/p/aurora',
    preferredKind: 'physical',
    importFromLink: async (url, kind) => {
      calls.push(['import', url, kind]);
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          data: {
            name: 'Aurora Mug',
            selling_points: '保温',
            price: '24.9',
            link: 'https://shop.example.com/p/aurora',
          },
        },
      };
    },
    createProduct: async (body) => {
      calls.push(['create', body]);
      return {
        ok: true,
        status: 200,
        body: { product: { id: 'prod_1', ...body }, revision: 1 },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.product.id, 'prod_1');
  assert.equal(result.product.name, 'Aurora Mug');
  assert.equal(calls[0][0], 'import');
  assert.equal(calls[0][1], 'https://shop.example.com/p/aurora');
  assert.equal(calls[0][2], 'physical');
  assert.equal(calls[1][0], 'create');
  assert.equal(calls[1][1].name, 'Aurora Mug');
});

test('createProductFromLink: 非法链接 / 解析失败 / 空结果 / 保存失败 / 过期请求', async () => {
  const invalid = await createProductFromLink({ url: 'not a url' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.stage, 'validate');
  const invalidJs = await createProductFromLink({ url: 'javascript:alert(1)' });
  assert.equal(invalidJs.ok, false);
  assert.equal(invalidJs.stage, 'validate');

  const empty = await createProductFromLink({
    url: 'https://shop.example.com/p/1',
    importFromLink: async () => ({
      ok: false,
      status: 422,
      body: { error: 'link-import-empty', message: 'empty' },
    }),
    createProduct: async () => {
      throw new Error('should not save');
    },
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.stage, 'empty');

  const importFail = await createProductFromLink({
    url: 'https://shop.example.com/p/1',
    importFromLink: async () => ({
      ok: false,
      status: 400,
      body: { error: 'link-import-failed', message: '站点不可达' },
    }),
  });
  assert.equal(importFail.ok, false);
  assert.equal(importFail.stage, 'import');
  assert.match(importFail.message, /站点不可达/);

  const saveFail = await createProductFromLink({
    url: 'https://shop.example.com/p/1',
    importFromLink: async () => ({
      ok: true,
      status: 200,
      body: { data: { name: '货' } },
    }),
    createProduct: async () => ({
      ok: false,
      status: 400,
      body: { error: 'name-invalid', message: '名称过长' },
    }),
  });
  assert.equal(saveFail.ok, false);
  assert.equal(saveFail.stage, 'save');
  assert.match(saveFail.message, /名称过长/);

  const token = { current: 1 };
  const stale = await createProductFromLink({
    url: 'https://shop.example.com/p/1',
    signalToken: token,
    requestId: 1,
    importFromLink: async () => {
      token.current = 9; // 关闭弹窗后 token 前进
      return { ok: true, status: 200, body: { data: { name: '货' } } };
    },
    createProduct: async () => ({ ok: true, status: 200, body: { product: { id: 'x' } } }),
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.stage, 'stale');
});

test('messageFromProductsResult: 优先 message，其次 error', () => {
  assert.equal(
    messageFromProductsResult({ body: { message: '保存失败' } }),
    '保存失败',
  );
  assert.equal(
    messageFromProductsResult({ body: { error: 'boom' } }),
    'boom',
  );
  assert.equal(messageFromProductsResult({ status: 500 }), 'HTTP 500');
});
