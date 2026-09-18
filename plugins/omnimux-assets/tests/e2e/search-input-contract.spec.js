import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const stageJsx = readFileSync(join(here, '../../src/client/AssetsStage.jsx'), 'utf8')
const cloudViewJsx = readFileSync(join(here, '../../src/client/CloudAssetsView.jsx'), 'utf8')
const cloudFeedJs = readFileSync(join(here, '../../src/client/use-cloud-assets-feed.js'), 'utf8')

test('资产中心搜索框 (SearchField) 符合受控输入契约且杜绝 onChange 误用', () => {
  // 1. 验证 SearchField 必须绑定 onValueChange 而不是未受控/覆盖的 onChange
  assert.match(
    stageJsx,
    /<SearchField\b[^>]*onValueChange=\{feed\.setQuery\}/,
    'SearchField 必须通过 onValueChange={feed.setQuery} 接收值变更回调'
  )
  assert.doesNotMatch(
    stageJsx,
    /<SearchField\b[^>]*onChange=\{feed\.setQuery\}/,
    'SearchField 严禁使用未被解构支持的 onChange'
  )
  assert.match(
    stageJsx,
    /<SearchField\b[^>]*onClear=\{\(\) => feed\.setQuery\(''\)\}/,
    'SearchField 必须提供 onClear 清除处理器'
  )
})

test('资产中心公共素材流与顶栏搜索输入实现双向贯通联动', () => {
  // 1. AssetsStage 必须向 CloudAssetsView 透传 query 属性
  assert.match(
    stageJsx,
    /<CloudAssetsView\b[^>]*query=\{feed\.query\}/,
    'AssetsStage 必须将 feed.query 传递给 CloudAssetsView'
  )

  // 2. CloudAssetsView 必须获取 query 并在调用 useCloudAssetsFeed 时传递 query
  assert.match(
    cloudViewJsx,
    /const query = props\.query \?\? ''/,
    'CloudAssetsView 必须获取 props.query 参数'
  )
  assert.match(
    cloudViewJsx,
    /useCloudAssetsFeed\(\{[\s\S]*?query[\s\S]*?\}\)/,
    'CloudAssetsView 必须将 query 传递给 useCloudAssetsFeed'
  )

  // 3. useCloudAssetsFeed 必须接收外部 query 并在变动时同步更新内部 query 状态
  assert.match(
    cloudFeedJs,
    /const externalQuery = options\?\.query/,
    'useCloudAssetsFeed 必须支持外部 query 参数传入'
  )
  assert.match(
    cloudFeedJs,
    /useEffect\(\(\) => \{[\s\S]*?if \(typeof externalQuery === 'string'\) \{[\s\S]*?setQuery\(externalQuery\)[\s\S]*?\}[\s\S]*?\}, \[externalQuery\]\)/,
    'useCloudAssetsFeed 必须在 externalQuery 发生变化时自动同步更新内部 query'
  )
})
