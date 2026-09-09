import STUDIO_CSS from './studio.css'
export const STYLES_ID = 'omnimux-studio-styles'
export function injectStudioStyles(documentObject = document) {
  const style = documentObject.createElement('style')
  style.id = STYLES_ID
  style.textContent = STUDIO_CSS
  documentObject.head.appendChild(style)
  return () => style.remove()
}
