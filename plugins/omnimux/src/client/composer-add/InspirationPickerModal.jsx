import { InspirationPicker } from '../components/inspiration-picker/index.js'
import { MAX_ATTACHMENTS } from './kind.js'

/**
 * composer 域薄适配层：共享 InspirationPicker + composer 专属配额与空态引导。
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t: (key: string, vars?: object) => string,
 *   occupied: number,
 *   alreadyIds: Set<string> | string[],
 *   onConfirm: (items: object[]) => void | Promise<void>,
 * }} props
 */
export function InspirationPickerModal({ open, onClose, t, occupied, alreadyIds, onConfirm }) {
  return (
    <InspirationPicker
      open={open}
      onClose={onClose}
      t={t}
      maxSelect={MAX_ATTACHMENTS}
      occupied={occupied}
      alreadyIds={alreadyIds}
      onConfirm={onConfirm}
      closeOnConfirm={false}
      emptyAction={{
        label: t('inspirationPicker.goLibrary'),
        onClick: () => {
          try {
            window.__omnimuxWorkbench?.open?.({
              tabId: 'omnimux-inspiration:library',
              title: t('inspirationPicker.libraryTitle'),
            })
          } catch {
            // workbench 不可用时静默
          }
        },
      }}
    />
  )
}
