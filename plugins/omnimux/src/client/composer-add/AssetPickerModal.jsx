import { AssetPicker } from '../components/asset-picker/index.js'
import { MAX_ATTACHMENTS } from './kind.js'

/**
 * composer 域薄适配层：共享 AssetPicker + composer 专属配额与空态引导。
 * 保持同名导出，install.js 零接线改动。
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t: (key: string, vars?: object) => string,
 *   occupied: number,
 *   alreadyIds: Set<string> | string[],
 *   onConfirm: (assets: object[]) => void | Promise<void>,
 * }} props
 */
export function AssetPickerModal({ open, onClose, t, occupied, alreadyIds, onConfirm }) {
  return (
    <AssetPicker
      open={open}
      onClose={onClose}
      t={t}
      maxSelect={MAX_ATTACHMENTS}
      occupied={occupied}
      alreadyIds={alreadyIds}
      onConfirm={onConfirm}
      closeOnConfirm={false}
      emptyAction={{
        label: t('composerAdd.goLibrary'),
        onClick: () => {
          try {
            window.__omnimuxWorkbench?.open?.({ tabId: 'omnimux-assets:library', title: t('composerAdd.libraryTitle') })
          } catch {
            // workbench 不可用时静默
          }
        },
      }}
    />
  )
}
