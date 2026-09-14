import { Badge, CardGrid, EmptyState, MediaCard } from 'dsh-ui-kit'

/**
 * 双视口首屏截图卡片。
 *
 * 数据源就是导入链路已经写盘的 `media[]`：桌面图在前、移动图在后，文件名形如
 * `site-<host>-<viewport>-<stamp>-<rand>.png`。因此这里只做「按视口识别 → 并排
 * 展示 → 点一下设封面」，不引入新的取数通路。
 */

/** 展示顺序与文件名里的视口标识一一对应。 */
export const SHOT_VIEWPORTS = Object.freeze([
  Object.freeze({ kind: 'desktop', labelKey: 'add.shots.desktop', sizeKey: 'add.shots.desktopSize', aspectRatio: '16:9' }),
  Object.freeze({ kind: 'mobile', labelKey: 'add.shots.mobile', sizeKey: 'add.shots.mobileSize', aspectRatio: '9:16' }),
])

/**
 * 一条媒体行属于哪个视口；认不出时回答 `null`（普通素材不会被当成截图）。
 * @param {{ original_name?: string, real_path?: string } | null | undefined} file
 * @returns {'desktop' | 'mobile' | null}
 */
export function viewportKindOf(file) {
  if (!file || typeof file !== 'object') return null
  const hay = `${String(file.original_name ?? '')} ${String(file.real_path ?? '')}`.toLowerCase()
  if (/(^|[^a-z])desktop([^a-z]|$)/.test(hay)) return 'desktop'
  if (/(^|[^a-z])mobile([^a-z]|$)/.test(hay)) return 'mobile'
  return null
}

/**
 * 在媒体列表里找到某个视口的截图行。
 * @param {Array<object> | null | undefined} media
 * @param {'desktop' | 'mobile'} kind
 * @returns {{ file: object, index: number } | null}
 */
export function shotOf(media, kind) {
  const list = Array.isArray(media) ? media : []
  const index = list.findIndex((row) => viewportKindOf(row) === kind)
  return index >= 0 ? { file: list[index], index } : null
}

/**
 * @param {{
 *   t: (key: string) => string,
 *   media: Array<object>,
 *   coverId: string | null,
 *   srcOf: (file: object) => string,
 *   disabled?: boolean,
 *   onSetCover: (file: object, index: number) => void,
 * }} props
 */
export function ScreenshotPreview(props) {
  const { t, media, coverId, srcOf, disabled = false, onSetCover } = props
  const found = SHOT_VIEWPORTS.map((viewport) => ({ viewport, hit: shotOf(media, viewport.kind) }))
  const captured = found.filter((row) => row.hit !== null)

  if (captured.length === 0) {
    return (
      <EmptyState
        compact
        className="omnimux-products-shot-empty"
        title={t('add.shots.empty')}
        description={t('add.shots.emptyHint')}
      />
    )
  }

  return (
    <CardGrid
      className="omnimux-products-shot-grid"
      maxColumns={2}
      minItemWidth="180px"
      gap={12}
    >
      {found.map((row) => {
        const { viewport, hit } = row
        if (hit === null) {
          return (
            <div className="omnimux-products-shot-cell is-missing" key={viewport.kind}>
              <EmptyState
                compact
                title={t(viewport.labelKey)}
                description={t('add.shots.missing')}
              />
            </div>
          )
        }
        const isCover = Boolean(coverId) && coverId === hit.file.id
        return (
          <div className="omnimux-products-shot-cell" key={viewport.kind}>
            <MediaCard
              className="omnimux-products-shot-card"
              aspectRatio={viewport.aspectRatio}
              coverUrl={srcOf(hit.file)}
              title={t(viewport.labelKey)}
              subtitle={t(viewport.sizeKey)}
              badge={isCover ? <Badge variant="brand" size="sm">{t('detail.coverBadge')}</Badge> : undefined}
              selected={isCover}
              disabled={disabled}
              onClick={() => { onSetCover(hit.file, hit.index) }}
            />
            <span className="omnimux-products-shot-hint">
              {isCover ? t('add.shots.isCover') : t('add.shots.setCover')}
            </span>
          </div>
        )
      })}
    </CardGrid>
  )
}
