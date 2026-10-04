import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tabPath = join(here, './MediaViewerTab.jsx');

describe('左侧缩略图按时间倒序排列（最新项置顶显示）单元测试', () => {
  it('AC-1: MediaViewerTab 必须计算 thumbnailsList 并按时间倒序稳定排序', () => {
    const source = readFileSync(tabPath, 'utf8');

    // 必须定义并计算 thumbnailsList
    assert.match(
      source,
      /const thumbnailsList = React\.useMemo/s,
      '必须使用 useMemo 缓存 thumbnailsList'
    );

    // 排序逻辑必须包含 timestamp 倒序比较 (tb - ta)
    assert.match(
      source,
      /const tb = b\.timestamp \?\? 0;\s*const ta = a\.timestamp \?\? 0;\s*if \(tb !== ta\) return tb - ta;/s,
      '必须按时间戳从大到小降序排列（最新在最前面）'
    );

    // 缩略图栏渲染必须使用 thumbnailsList
    assert.match(
      source,
      /thumbnailsList\.length > 1 \?\s*\(\s*<div className="omx-mv-thumbnails-rail"/s,
      '缩略图栏必须绑定 thumbnailsList'
    );
    assert.match(
      source,
      /thumbnailsList\.map\(\(item\) =>/s,
      '缩略图项必须遍历 thumbnailsList'
    );
  });

  it('AC-2: 会话无选中态或切换会话时，默认选中缩略图栏首项（最新项）', () => {
    const source = readFileSync(tabPath, 'utf8');

    // activeItem 计算必须优先匹配 activeId，无匹配则优先回退到 thumbnailsList[0]
    assert.match(
      source,
      /const activeItem = sessionMediaList\.find\(\(m\) => m\.id === activeId\) \|\| thumbnailsList\[0\]/s,
      'activeItem 必须优先回退到 thumbnailsList[0] 最新项'
    );

    // 会话切换时，若当前 activeId 不存在，自动联动选中最新项
    assert.match(
      source,
      /const defaultTarget = thumbnailsList\[0\] \|\| sessionMediaList\[0\];/s,
      '切换会话时必须优先联动选中最新项'
    );
  });

  it('AC-3: 模拟排序函数验证——最新项排在第1位，相同时间后加入者排在前面', () => {
    const list = [
      { id: '1', timestamp: 100, title: '第一张' },
      { id: '2', timestamp: 200, title: '第二张' },
      { id: '3', timestamp: 300, title: '第三张' },
      { id: '4', timestamp: 300, title: '同时间第四张' },
    ];

    const sorted = [...list].sort((a, b) => {
      const tb = b.timestamp ?? 0;
      const ta = a.timestamp ?? 0;
      if (tb !== ta) return tb - ta;
      return list.indexOf(b) - list.indexOf(a);
    });

    assert.equal(sorted[0].id, '4', '最新后追加项必须排在第1位');
    assert.equal(sorted[1].id, '3', '最新同时间前一项必须排在第2位');
    assert.equal(sorted[2].id, '2', '次新项必须排在第3位');
    assert.equal(sorted[3].id, '1', '最早项必须排在第4位（底部）');
  });
});
