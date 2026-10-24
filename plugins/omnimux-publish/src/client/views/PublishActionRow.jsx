import {
  IconPlusOutline16,
  IconDownloadOutline16,
} from 'dsh-ui-kit'
import { IconFolderOutline16 } from '../icons/stage.js'
import { Button } from 'dsh-ui-kit'

export function PublishActionRow({ t, onNew, onToggleBatch, onExport }) {
  return (
    <section className="omnimux-publish-action-row">
      <Button
        variant="primary"
        size="default"
        leadingIcon={<IconPlusOutline16 />}
        onClick={onNew}
      >
        {t('action.new')}
      </Button>
      <Button
        variant="outline"
        size="default"
        leadingIcon={<IconFolderOutline16 />}
        onClick={onToggleBatch}
      >
        {t('action.batch')}
      </Button>
      <Button
        variant="outline"
        size="default"
        leadingIcon={<IconDownloadOutline16 />}
        onClick={onExport}
      >
        {t('action.export')}
      </Button>
    </section>
  )
}
