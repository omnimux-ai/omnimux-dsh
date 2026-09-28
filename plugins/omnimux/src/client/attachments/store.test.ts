import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttachmentStore,
  inferExtension,
  generateFingerprint,
  MAX_ATTACHMENTS_PER_SESSION,
} from './store.ts';
import type { AttachmentPayload } from './types.ts';

function makePayload(overrides: Partial<AttachmentPayload> & { entityId: string; title: string }): AttachmentPayload {
  return {
    sourcePlugin: 'omnimux-workflow',
    kind: 'document',
    relativePath: `docs/${overrides.entityId}.md`,
    ...overrides,
  };
}

test('inferExtension: 正确提取全大写格式扩展名', () => {
  assert.equal(inferExtension('未命名表格.htable', '.hilo/tables/node-01.htable'), 'HTABLE');
  assert.equal(inferExtension('请创作一个[时长]的[类.md', 'prompts/template.md'), 'MD');
  assert.equal(inferExtension('镜头_01.mp4', 'assets/videos/shot1.mp4'), 'MP4');
  assert.equal(inferExtension('无扩展名文件', 'some/path', 'custom_ext'), 'CUSTOM_EXT');
});

test('AttachmentStore: 基础增删与多会话隔离', () => {
  const store = createAttachmentStore();
  const sessionA = 'session-alpha';
  const sessionB = 'session-beta';

  let sessionANotifyCount = 0;
  let sessionBNotifyCount = 0;

  const unsubA = store.subscribe(sessionA, () => {
    sessionANotifyCount++;
  });
  const unsubB = store.subscribe(sessionB, () => {
    sessionBNotifyCount++;
  });

  // 1. Session A 添加表格
  const res1 = store.addAttachment(sessionA, {
    sourcePlugin: 'omnimux-workflow',
    kind: 'table',
    entityId: 'node-tbl-01',
    title: '未命名表格.htable',
    relativePath: '.hilo/tables/node-tbl-01.htable',
  });
  assert.equal(res1.ok, true);
  assert.equal(sessionANotifyCount, 1);
  assert.equal(sessionBNotifyCount, 0);

  // 验证 Session A 快照与 Session B 隔离
  const snapA1 = store.getSnapshot(sessionA);
  const snapB1 = store.getSnapshot(sessionB);
  assert.equal(snapA1.length, 1);
  assert.equal(snapA1[0].extension, 'HTABLE');
  assert.equal(snapB1.length, 0);

  // 2. Session B 添加视频
  const res2 = store.addAttachment(sessionB, {
    sourcePlugin: 'omnimux-workflow',
    kind: 'video',
    entityId: 'node-vid-01',
    title: '主角镜头.mp4',
    relativePath: 'assets/videos/shot1.mp4',
    duration: '0:31',
    previewUrl: 'blob:http://localhost/video-thumb.png',
  });
  assert.equal(res2.ok, true);
  assert.equal(sessionBNotifyCount, 1);

  const snapB2 = store.getSnapshot(sessionB);
  assert.equal(snapB2.length, 1);
  assert.equal(snapB2[0].duration, '0:31');
  assert.equal(snapB2[0].extension, 'MP4');

  // 3. 重复添加相同实体到 Session A (指纹去重)
  const resDuplicate = store.addAttachment(sessionA, {
    sourcePlugin: 'omnimux-workflow',
    kind: 'table',
    entityId: 'node-tbl-01',
    title: '未命名表格.htable',
    relativePath: '.hilo/tables/node-tbl-01.htable',
  });
  assert.equal(resDuplicate.ok, false);
  assert.equal(resDuplicate.reason, 'duplicate');
  assert.equal(store.getSnapshot(sessionA).length, 1);

  // 4. 移除单个附件
  store.removeAttachment(sessionA, snapA1[0].id);
  assert.equal(store.getSnapshot(sessionA).length, 0);

  // 5. 清空 Session B
  store.clear(sessionB);
  assert.equal(store.getSnapshot(sessionB).length, 0);

  unsubA();
  unsubB();
});

test('AttachmentStore: 单会话上限约束 (MAX_ATTACHMENTS_PER_SESSION = 8)', () => {
  const store = createAttachmentStore();
  const sessionId = 'session-limit-test';

  for (let i = 0; i < MAX_ATTACHMENTS_PER_SESSION; i++) {
    const res = store.addAttachment(sessionId, {
      sourcePlugin: 'omnimux-workflow',
      kind: 'document',
      entityId: `doc-${i}`,
      title: `文档_${i}.md`,
      relativePath: `docs/doc_${i}.md`,
    });
    assert.equal(res.ok, true);
  }

  assert.equal(store.getSnapshot(sessionId).length, 8);

  // 第 9 个应该被拒绝
  const resOverflow = store.addAttachment(sessionId, {
    sourcePlugin: 'omnimux-workflow',
    kind: 'document',
    entityId: 'doc-overflow',
    title: '超限文档.md',
    relativePath: 'docs/doc_overflow.md',
  });
  assert.equal(resOverflow.ok, false);
  assert.equal(resOverflow.reason, 'quota-exceeded');
  assert.equal(store.getSnapshot(sessionId).length, 8);
});

test('AttachmentStore: Stage 无 sessionId 落入 default，claimPendingAttachments 认领到目标会话并通知', () => {
  const store = createAttachmentStore();
  const targetSession = 'session-xxx';

  let defaultNotifyCount = 0;
  let targetNotifyCount = 0;
  const unsubDefault = store.subscribe('default', () => {
    defaultNotifyCount++;
  });
  const unsubTarget = store.subscribe(targetSession, () => {
    targetNotifyCount++;
  });

  // 模拟跨插件 Stage 未携带 sessionId：空字符串 → 落入 'default'
  const pendingRes = store.addAttachment('', {
    sourcePlugin: 'omnimux-inspiration',
    kind: 'inspiration',
    entityId: 'insp-01',
    title: '灵感封面.png',
    relativePath: 'inspiration/insp-01.png',
    previewUrl: 'blob:http://localhost/cover.png',
  });
  assert.equal(pendingRes.ok, true);
  assert.equal(pendingRes.attachment?.sessionId, 'default');
  assert.equal(store.getSnapshot('default').length, 1);
  assert.equal(store.getSnapshot(targetSession).length, 0);
  assert.equal(defaultNotifyCount, 1);
  assert.equal(targetNotifyCount, 0);

  const pendingId = store.getSnapshot('default')[0].id;

  // 目标会话 Tray 挂载后主动认领
  const migrated = store.claimPendingAttachments(targetSession);
  assert.equal(migrated, 1);
  assert.equal(store.getSnapshot('default').length, 0, "'default' 分组应被清空");
  const claimed = store.getSnapshot(targetSession);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, pendingId);
  assert.equal(claimed[0].sessionId, targetSession);
  assert.equal(claimed[0].title, '灵感封面.png');
  assert.equal(targetNotifyCount, 1, '目标会话应收到响应式通知');
  assert.equal(defaultNotifyCount, 2, "'default' 清空后应收到通知");

  // 空分组再次认领为 no-op
  assert.equal(store.claimPendingAttachments(targetSession), 0);
  assert.equal(store.claimPendingAttachments('default'), 0);
  assert.equal(store.claimPendingAttachments(''), 0);

  unsubDefault();
  unsubTarget();
});

test('AttachmentStore: setActiveSessionId 自动触发 claimPendingAttachments', () => {
  const store = createAttachmentStore();
  const targetSession = 'session-auto-claim';

  let targetNotifyCount = 0;
  const unsubTarget = store.subscribe(targetSession, () => {
    targetNotifyCount++;
  });

  store.addAttachment('', makePayload({
    entityId: 'auto-1',
    title: '自动认领.md',
    kind: 'document',
  }));
  store.addAttachment('', {
    sourcePlugin: 'omnimux-workflow',
    kind: 'video',
    entityId: 'auto-vid',
    title: '镜头.mp4',
    relativePath: 'assets/auto.mp4',
  });

  assert.equal(store.getActiveSessionId(), 'default');
  assert.equal(store.getSnapshot('default').length, 2);
  assert.equal(store.getSnapshot(targetSession).length, 0);
  assert.equal(targetNotifyCount, 0);

  store.setActiveSessionId(targetSession);

  assert.equal(store.getActiveSessionId(), targetSession);
  assert.equal(store.getSnapshot('default').length, 0);
  const claimed = store.getSnapshot(targetSession);
  assert.equal(claimed.length, 2);
  assert.ok(claimed.every((item) => item.sessionId === targetSession));
  assert.equal(targetNotifyCount, 1);

  // 活跃会话已是真实会话时，无 sessionId 的新增应直接落入该会话
  const directRes = store.addAttachment('', makePayload({
    entityId: 'auto-2',
    title: '直达活跃会话.md',
  }));
  assert.equal(directRes.ok, true);
  assert.equal(directRes.attachment?.sessionId, targetSession);
  assert.equal(store.getSnapshot(targetSession).length, 3);
  assert.equal(store.getSnapshot('default').length, 0);

  unsubTarget();
});

test('AttachmentStore: claimPendingAttachments 指纹去重，不重复迁入已有附件', () => {
  const store = createAttachmentStore();
  const targetSession = 'session-dedup';

  const sharedPayload: AttachmentPayload = {
    sourcePlugin: 'omnimux-workflow',
    kind: 'table',
    entityId: 'node-tbl-dup',
    title: '未命名表格.htable',
    relativePath: '.hilo/tables/node-tbl-dup.htable',
  };

  const existing = store.addAttachment(targetSession, sharedPayload);
  assert.equal(existing.ok, true);

  // default 中放入同一指纹附件 + 一份新附件
  store.addAttachment('default', sharedPayload);
  store.addAttachment('default', makePayload({
    entityId: 'fresh-doc',
    title: '新文档.md',
  }));

  assert.equal(store.getSnapshot('default').length, 2);
  assert.equal(store.getSnapshot(targetSession).length, 1);

  const fingerprint = generateFingerprint(sharedPayload);
  const migrated = store.claimPendingAttachments(targetSession);
  assert.equal(migrated, 1, '重复指纹应跳过，仅迁入新附件');
  assert.equal(store.getSnapshot('default').length, 0);

  const snap = store.getSnapshot(targetSession);
  assert.equal(snap.length, 2);
  assert.equal(snap.filter((item) => item.fingerprint === fingerprint).length, 1);
  assert.equal(snap[0].id, existing.attachment?.id);
  assert.equal(snap[1].entityId, 'fresh-doc');
  assert.equal(snap[1].sessionId, targetSession);
});

test('AttachmentStore: claimPendingAttachments 遵守单会话容量上限', () => {
  const store = createAttachmentStore();
  const targetSession = 'session-claim-cap';

  // 目标会话已有 6 项，default 待认领 4 项 → 只能再迁入 2 项
  for (let i = 0; i < 6; i++) {
    const res = store.addAttachment(targetSession, makePayload({
      entityId: `existing-${i}`,
      title: `已有_${i}.md`,
    }));
    assert.equal(res.ok, true);
  }
  for (let i = 0; i < 4; i++) {
    const res = store.addAttachment('default', makePayload({
      entityId: `pending-${i}`,
      title: `待认领_${i}.md`,
    }));
    assert.equal(res.ok, true);
  }

  const migrated = store.claimPendingAttachments(targetSession);
  assert.equal(migrated, 2);
  assert.equal(store.getSnapshot(targetSession).length, MAX_ATTACHMENTS_PER_SESSION);
  assert.equal(store.getSnapshot('default').length, 0, '即使超额未迁完，default 仍应被清空');

  const titles = store.getSnapshot(targetSession).map((item) => item.title);
  assert.ok(titles.includes('待认领_0.md'));
  assert.ok(titles.includes('待认领_1.md'));
  assert.ok(!titles.includes('待认领_2.md'));
  assert.ok(!titles.includes('待认领_3.md'));
});

test('AttachmentStore: addAttachment 空 sessionId 在无活跃会话时落入 default', () => {
  const store = createAttachmentStore();
  assert.equal(store.getActiveSessionId(), 'default');

  const res = store.addAttachment('', makePayload({
    entityId: 'parked',
    title: '暂存.md',
  }));
  assert.equal(res.ok, true);
  assert.equal(res.attachment?.sessionId, 'default');
  assert.equal(store.getSnapshot('default').length, 1);
  assert.equal(store.getSnapshot('session-nobody').length, 0);
});

test('AttachmentStore: addAttachment 运行时门禁拦截 [object Object] 与自动自愈商品对象', () => {
  const store = createAttachmentStore();

  // 1. 拦截脏字符串 [object Object]
  const dirtyRes = store.addAttachment('s1', makePayload({
    entityId: 'dirty-1',
    title: '脏预览.png',
    previewUrl: '[object Object]',
  }));
  assert.equal(dirtyRes.ok, true);
  assert.equal(dirtyRes.attachment?.previewUrl, '', '包含 [object Object] 的预览 URL 必须被清洗为空串');

  // 2. 拦截包含 [object Object] 的复合脏串
  const dirtyPrefixRes = store.addAttachment('s1', makePayload({
    entityId: 'dirty-2',
    title: '脏前缀.png',
    previewUrl: 'http://localhost:43120/[object Object]',
  }));
  assert.equal(dirtyPrefixRes.ok, true);
  assert.equal(dirtyPrefixRes.attachment?.previewUrl, '', '复合包含 [object Object] 的预览 URL 必须被清洗');

  // 3. 自愈传入的商品对象作为 previewUrl
  const objRes = store.addAttachment('s1', makePayload({
    entityId: 'prd_bra',
    title: '中老年纯棉文胸',
    previewUrl: {
      id: 'prd_bra',
      cover: { id: 'med_bra_cover' },
    } as any,
  }));
  assert.equal(objRes.ok, true);
  assert.equal(
    objRes.attachment?.previewUrl,
    '/omnimux/products/prd_bra?preview=med_bra_cover',
    '若 previewUrl 被误传为商品对象，必须自愈为合法 preview 路由'
  );
});
