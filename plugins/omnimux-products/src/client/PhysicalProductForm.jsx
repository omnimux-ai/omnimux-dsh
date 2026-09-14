import { CategoriesEditor } from './ProductMediaSection.jsx'
import { FormSection } from './ProductFormSections.jsx'
import {
  MediaSection,
  ProductCommerceFields,
  ProductCoreFields,
  ProductNameRow,
  UrlImportBar,
  assembleFormHandlers,
} from './ProductFormFields.jsx'

/**
 * 实物产品专属表单体。
 *
 * 左栏：链接提取 → 基础信息 → 商业化设置。右栏：分类标签 → 商品主图与素材。
 * 这里没有形态切换（形态由二级页固定），没有品牌战略面板，也没有首屏截图容器 ——
 * 实物商品既不需要六维战略，也不该被塞进两张整屏快照。
 *
 * 字段域与数字表单完全同构（state/setters/actions 由同一个 hook 提供），差别只在
 * 渲染哪些控件；因此两个表单可以共用 `useProductFormState`，不重复造第二套状态。
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
export function PhysicalProductForm(props) {
  const { t, state, setters, actions, busy = false, error = '', onPick, previewOf, nameRef } = props
  const { mediaActions, categoryActions } = assembleFormHandlers(setters, actions)

  return (
    <div className="omnimux-products-form">
      {error ? (
        <p className="omnimux-products-error">{error}</p>
      ) : null}

      <div className="omnimux-products-form-columns">
        <div className="omnimux-products-form-col-left">
          <FormSection
            title={t('section.import')}
            description={t('section.importPhysicalHint')}
          >
            <UrlImportBar
              t={t}
              kind="physical"
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
              kind="physical"
              values={state}
              onChange={setters}
              busy={busy}
            />
          </FormSection>

          <FormSection title={t('section.trade')}>
            <div className="omnimux-products-grid-fields">
              <ProductCommerceFields
                t={t}
                values={state}
                onChange={setters}
                busy={busy}
              />
            </div>
          </FormSection>
        </div>

        <div className="omnimux-products-form-col-right">
          <FormSection title={t('section.classification')}>
            <CategoriesEditor
              t={t}
              categories={state.categories}
              tagDraft={state.tagDraft}
              disabled={busy}
              actions={categoryActions}
            />
          </FormSection>

          <FormSection
            title={t('section.mediaPhysical')}
            description={t('section.mediaPhysicalHint')}
          >
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
