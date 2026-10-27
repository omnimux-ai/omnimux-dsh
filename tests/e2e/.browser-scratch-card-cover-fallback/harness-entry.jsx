
import React from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'
import { injectInspirationStyles } from './styles.js'
import { zh } from './locales.js'

// The card's reveal opacity and pointer-events live in the plugin stylesheet, so
// a harness that skips it measures a card no user ever sees.
injectInspirationStyles()

const t = (key) => zh[key] || key
const root = createRoot(document.getElementById('host'))
window.__mount = (row) => {
  root.render(React.createElement(InspirationCoverCard, {
    card: { row, t, selected: false, selecting: false, replicateBusy: null, onSelect() {}, onReplicate() {}, revealed: true },
  }))
}
window.__ready = true
