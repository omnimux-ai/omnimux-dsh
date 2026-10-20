import { Button } from 'dsh-ui-kit'
import { ArrowLeft, MessageSquarePlus } from 'lucide-react'

/**
 * 合集详情页头（Issue 3459）。
 *
 * 合集详情不再是「一根返回条」：名称、加入会话与重命名都要在滚动时一直可用，
 * 所以页头吸附在一级工具栏下方（`.omx-stage-sticky` 的 44px 偏移）。按合集规格
 * 约定，标题只显示名称、不显示成员数。
 *
 * 组件只负责呈现，导航与写入仍在 `useInspirationCollections` 里：
 * 传入的回调是唯一入口，避免第二个写入口。
 *
 * @param {{
 *   t: (key: string) => string,
 *   title: string,
 *   busy?: boolean,
 *   addToSessionBusy?: boolean,
 *   onBack?: () => void,
 *   onRename?: () => void,
 *   onAddToSession?: () => void,
 * }} props
 */
export function CollectionHeader({ t, title, busy = false, addToSessionBusy = false, onBack, onRename, onAddToSession }) {
  const named = Boolean(title)
  return (
    <div className="omnimux-inspiration-collection-navigation">
      <Button
        variant="ghost"
        leadingIcon={<ArrowLeft size={16} aria-hidden="true" />}
        onClick={onBack}
      >
        {t('collection.back')}
      </Button>
      <span
        className="omnimux-inspiration-collection-heading"
        role="heading"
        aria-level={2}
        title={title || undefined}
      >
        {title}
      </span>
      <div className="omnimux-inspiration-collection-header-actions">
        <Button
          variant="primary"
          leadingIcon={<MessageSquarePlus size={16} aria-hidden="true" />}
          loading={addToSessionBusy}
          disabled={!named || busy || typeof onAddToSession !== 'function'}
          onClick={onAddToSession}
        >
          {t('collection.addToSession')}
        </Button>
        <Button
          variant="outline"
          disabled={!named || busy || typeof onRename !== 'function'}
          onClick={onRename}
        >
          {t('collection.rename')}
        </Button>
      </div>
    </div>
  )
}
