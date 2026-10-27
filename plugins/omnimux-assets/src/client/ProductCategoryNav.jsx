import { Button } from 'dsh-ui-kit'

/**
 * 产品二级分类胶囊导航。
 * 挂载在第一层 FilterBar 正下方，与本地分类导航共享 24px 左对齐基准线与黄金垂直净空。
 *
 * @param {{
 *   t: (key: string) => string,
 *   kindTab: string,
 *   onKindTabChange: (kind: string) => void,
 * }} props
 */
export function ProductCategoryNav(props) {
  const { t, kindTab = 'all', onKindTabChange } = props
  const chips = [
    { id: 'all', label: t('product.all') || '全部' },
    { id: 'physical', label: t('product.physical') || '实物产品' },
    { id: 'digital', label: t('product.digital') || '数字产品' },
  ]

  return (
    <div className="omnimux-assets-local-nav" role="group" aria-label="产品二级分类">
      <div className="omnimux-assets-local-nav-row">
        {chips.map((chip) => (
          <Button
            key={chip.id}
            variant="ghost"
            size="sm"
            className="omnimux-assets-cloud-chip"
            aria-pressed={kindTab === chip.id ? 'true' : 'false'}
            onClick={() => onKindTabChange?.(chip.id)}
          >
            {chip.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
