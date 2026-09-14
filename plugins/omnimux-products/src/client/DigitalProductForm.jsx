import { InputField } from 'dsh-ui-kit'
import { CategoriesEditor } from './ProductMediaSection.jsx'
import { FormSection } from './ProductFormSections.jsx'
import {
  DigitalStrategyPanel,
  MediaSection,
  ProductCoreFields,
  ProductNameRow,
  ShotsSection,
  UrlImportBar,
  assembleFormHandlers,
} from './ProductFormFields.jsx'

/**
 * 数字产品专属表单体。
 *
 * 左栏：链接提取 → 基础信息（含官网链接）→ 六维品牌战略。
 * 右栏：首屏截图（电脑端 1440×900 / 手机端 390×844，点一下换封面）→ 分类标签 → 素材列表。
 *
 * 这里没有形态切换，也没有价格 / SKU / 促销三个输入项：这三个键对数字产品在库层
 * 就不写，渲染它们只会制造「填了却不生效」的错觉。
 *
 * @param {{
 *   t: (key: string) => string,
 *   state: Record<string, any>,
 *   setters: Record<string, Function>,
 *   actions: Record<string, Function>,
 *   busy?: boolean,
 *   error?: string,
 *   onPick: (kind: 'file' | 'directory') => Promise<string[]>,
 *   previewOf?: (file: object) => string,
 *   nameRef?: any,
 * }} props
 */
export function DigitalProductForm(props) {
  const { t, state, setters, actions, busy = false, error = '', onPick, previewOf, nameRef } = props
  const { strategyHandlers, mediaActions, categoryActions } = assembleFormHandlers(setters, actions)

  const handleLinkChange = (event) => { setters.setLink(event.target.value) }

  return (
    <div className="omnimux-products-form">
      {error ? (
        <p className="omnimux-products-error">{error}</p>
      ) : null}

      <div className="omnimux-products-form-columns">
        <div className="omnimux-products-form-col-left">
          <FormSection
            title={t('section.import')}
            description={t('section.importDigitalHint')}
          >
            <UrlImportBar
              t={t}
              kind="digital"
              onImported={actions.applyImportedData}
            />
          </FormSection>

          <FormSection title={t('section.basic')}>
            <ProductNameRow
              t={t}
              state={state}
              setters={setters}
              busy={busy}
              nameRef={nameRef}
            />
            <ProductCoreFields
              t={t}
              kind="digital"
              values={state}
              onChange={setters}
              busy={busy}
            />
            <InputField
              label={t('detail.link')}
              value={state.link}
              placeholder={t('add.digitalLinkPlaceholder')}
              disabled={busy}
              onChange={handleLinkChange}
            />
          </FormSection>

          <DigitalStrategyPanel
            t={t}
            strategyOpen={state.strategyOpen}
            strategy={state.strategy}
            handlers={strategyHandlers}
          />
        </div>

        <div className="omnimux-products-form-col-right">
          <FormSection
            title={t('section.shots')}
            description={t('section.shotsHint')}
          >
            <ShotsSection
              t={t}
              state={state}
              actions={actions}
              previewOf={previewOf}
              busy={busy}
            />
          </FormSection>

          <FormSection title={t('section.classification')}>
            <CategoriesEditor
              t={t}
              categories={state.categories}
              tagDraft={state.tagDraft}
              disabled={busy}
              actions={categoryActions}
            />
          </FormSection>

          <FormSection title={t('section.media')}>
            <MediaSection
              t={t}
              state={state}
              actions={actions}
              mediaActions={mediaActions}
              onPick={onPick}
              previewOf={previewOf}
            />
          </FormSection>
        </div>
      </div>
    </div>
  )
}
