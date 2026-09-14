/**
 * Harness entry: renders the REAL panel gallery component against fixed
 * fixtures, inside a container of a chosen width and theme.
 *
 * The frame is what `index.html` embeds; it is also usable on its own:
 *   frame.html?theme=dark&width=440&delay=350
 */

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MessageImages } from '../../src/panel/MessageImages.tsx'
import { PANEL_COPY } from '../../src/panel/strings.ts'
import '../../src/panel/styles.css'
import { createHarnessApi } from './fakeApi.ts'
import { ATTACHMENTS, CASES } from './fixtures.ts'

const params = new URLSearchParams(window.location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const width = Number.parseInt(params.get('width') ?? '440', 10)
const delay = Number.parseInt(params.get('delay') ?? '350', 10)
const locale = params.get('locale') === 'en' ? 'en' : 'zh'

document.documentElement.dataset.theme = theme
document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'

const host = document.getElementById('root')
if (host === null) throw new Error('harness: #root is missing')

const api = createHarnessApi(ATTACHMENTS, { delayMs: delay })
const copy = PANEL_COPY[locale]

const style = document.createElement('style')
style.textContent = `
  /* Harness chrome only — the gallery itself is styled by styles.css. */
  html, body { margin: 0; padding: 0; }
  body { width: ${width}px; background: var(--canvas); color: var(--ink); font-size: 13.5px; }
  .harness { display: flex; flex-direction: column; gap: 18px; padding: 14px 12px 40px; }
  .harness-case > h2 {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .harness-row { display: flex; width: 100%; min-width: 0; }
  .harness-row.user { justify-content: flex-end; }
  .harness-row + .harness-row { margin-top: 6px; }
  .harness-row .body {
    min-width: 0;
    max-width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 18px 18px 18px 4px;
    background: var(--surface);
  }
  .harness-row.user .body {
    border-radius: 18px 18px 4px 18px;
    background: var(--canvas-deep);
  }
`
document.head.append(style)

function Transcript(): React.JSX.Element {
  return (
    <div className="harness">
      {CASES.map((testCase) => (
        <section className="harness-case" key={testCase.id} data-case={testCase.id}>
          <h2>{testCase.title}</h2>
          <div className={`harness-row ${testCase.align === 'end' ? 'user' : 'assistant'}`}>
            <div className="body message-body md">
              <MessageImages
                images={testCase.images}
                sessionId="harness"
                api={api}
                align={testCase.align}
                copy={copy}
              />
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

createRoot(host).render(createElement(Transcript))
