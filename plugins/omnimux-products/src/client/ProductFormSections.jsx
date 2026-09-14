/**
 * 表单分区与多行文本域。
 *
 * 这两个形态在任何一次改造前都不存在于共享套件里，而本任务的作用域限定在
 * 产品库客户端（工作树内），因此先落在插件内、命名与共享套件保持一致
 * （`FormSection` / `TextareaField`），待套件补齐后只需替换 import 来源。
 * 样式全部走 `--dsw-*` 令牌，与套件同源。
 */

/**
 * 表单分区：标题 + 说明 + 可选操作区 + 内容体。
 * @param {{
 *   title?: import('react').ReactNode,
 *   description?: import('react').ReactNode,
 *   actions?: import('react').ReactNode,
 *   children?: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export function FormSection(props) {
  const { title, description, actions, children, className } = props
  const sectionClass = className
    ? `omnimux-products-form-section ${className}`
    : 'omnimux-products-form-section'

  if (!title && !actions) {
    return <section className={sectionClass}>{children}</section>
  }

  return (
    <section className={sectionClass}>
      <div className="omnimux-products-form-section-head">
        <div className="omnimux-products-form-section-heading">
          {title ? <h2 className="omnimux-products-form-section-title">{title}</h2> : null}
          {description ? <p className="omnimux-products-form-section-desc">{description}</p> : null}
        </div>
        {actions ? <div className="omnimux-products-form-section-actions">{actions}</div> : null}
      </div>
      <div className="omnimux-products-form-section-body">{children}</div>
    </section>
  )
}

/**
 * 多行文本域：与套件 InputField 共用同一份 label / 边框 / 令牌规格。
 * @param {{
 *   value?: string,
 *   placeholder?: string,
 *   label?: string,
 *   disabled?: boolean,
 *   rows?: number,
 *   className?: string,
 *   onChange?: (event: any) => void,
 * }} props
 */
export function TextareaField(props) {
  const { value, placeholder, label, disabled = false, rows = 2, className, onChange } = props
  const controlClass = className
    ? `omnimux-products-textarea ${className}`
    : 'omnimux-products-textarea'

  const control = (
    <textarea
      className={controlClass}
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      disabled={disabled}
      onChange={onChange}
    />
  )

  if (!label) return control

  return (
    <div className="omnimux-products-field-control">
      <span className="omnimux-products-field-label">
        <span className="omnimux-products-field-label-text">{label}</span>
      </span>
      {control}
    </div>
  )
}
