import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gridSource = readFileSync(new URL('./UnifiedLibraryGrid.jsx', import.meta.url), 'utf8');
const exploreSectionSource = readFileSync(new URL('../../../../../omnimux-inspiration/src/explore/templates/ExploreTemplatesSection.jsx', import.meta.url), 'utf8');

test('UnifiedLibraryGrid 无限滚动与状态分流契约', () => {
  // 1. Props 必须声明无限滚动与状态解耦字段
  assert.match(gridSource, /loadingMore\s*=\s*false/, '必须支持 loadingMore 状态');
  assert.match(gridSource, /hasMore\s*=\s*false/, '必须支持 hasMore 状态');
  assert.match(gridSource, /onLoadMore/, '必须支持 onLoadMore 触底回调');
  assert.match(gridSource, /emptyText\s*=\s*'暂无素材'/, '空态默认文案必须为 PM 锁定的「暂无素材」');

  // 2. 必须挂载 IntersectionObserver 监听底部哨兵节点
  assert.match(gridSource, /sentinelRef\s*=\s*useRef/, '必须使用 sentinelRef 捕获哨兵节点');
  assert.match(gridSource, /IntersectionObserver/, '必须使用标准 IntersectionObserver 机制');
  assert.match(gridSource, /rootMargin:\s*'200px 0px'/, '必须配置 200px 视口提前量保证丝滑触底预加载');
  assert.match(gridSource, /data-sentinel=""/, 'DOM 树中必须渲染 data-sentinel 哨兵节点');

  // 3. 状态分流与逐字文案严格锁定（对齐产品经理许清楚 Spec）
  assert.match(gridSource, /加载中…/, '加载中文案必须锁定为「加载中…」');
  assert.match(gridSource, /已无更多/, '触底结束文案必须锁定为「已无更多」');
  assert.match(gridSource, /重试/, '错误重试按钮文案必须锁定为「重试」');
  assert.match(gridSource, /data-flow-loading-more=""/, '必须渲染底部加载中容器');
  assert.match(gridSource, /data-flow-no-more=""/, '必须渲染底部已无更多容器');
});

test('ExploreTemplatesSection 分类下推与无限滚动联动契约', () => {
  // 1. 分类切换必须中止在途请求并重置状态
  assert.match(exploreSectionSource, /controller\s*=\s*new AbortController\(\)/, '必须使用 AbortController 消除快速切分类的竞态');
  assert.match(exploreSectionSource, /controller\.abort\(\)/, '切分类或卸载时必须 abort 在途请求');

  // 2. 必须下推 category 至 loadLibraryCards 走服务端精确过滤
  assert.match(exploreSectionSource, /category:\s*selectedSubCategory/, '必须将 selectedSubCategory 下推至数据加载器');
  assert.match(exploreSectionSource, /page:\s*1/, '切分类时必须从第 1 页开始请求');

  // 3. 必须支持 handleLoadMore 追加下一页并去重合并
  assert.match(exploreSectionSource, /const handleLoadMore\s*=\s*useCallback/, '必须定义 handleLoadMore 触底追加方法');
  assert.match(exploreSectionSource, /nextPage\s*=\s*\((?:current|libraryData)\.page\s*\|\|\s*1\)\s*\+\s*1/, '触底必须正确计算下一页页码');
  assert.match(exploreSectionSource, /newCards\.length\s*>\s*0/, '追加时必须执行去重与 hasMore 动态计算');

  // 4. 外部库必须直接使用服务端下发结果，不再对第 1 页做粗暴的本地内存 filter
  assert.match(exploreSectionSource, /activePrimaryTab\s*===\s*'trending'/, '爆款趋势必须直接使用服务端分类结果');

  // 5. UnifiedLibraryGrid 必须接收全套无限滚动 Props
  assert.match(exploreSectionSource, /loadingMore=\{libraryData\.loadingMore\}/, '必须透传 loadingMore');
  assert.match(exploreSectionSource, /hasMore=\{libraryData\.hasMore\}/, '必须透传 hasMore');
  assert.match(exploreSectionSource, /onLoadMore=\{handleLoadMore\}/, '必须透传 onLoadMore 回调');
  assert.match(exploreSectionSource, /emptyText="暂无素材"/, '空态文案必须为 PM 锁定的「暂无素材」');
});
