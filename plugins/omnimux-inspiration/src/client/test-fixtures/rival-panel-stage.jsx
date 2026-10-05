/**
 * Render-test mount point for RivalAccountsPanel (R5-⑨ re-entry guard).
 * The panel is mounted directly with a canned feed; `rival-add-to-chat.js` is
 * stubbed by the bundler alias in the test, so the guard is judged by how
 * many times the orchestrator actually runs.
 */

import { RivalAccountsPanel } from '../RivalAccountsPanel.jsx'

export function RivalPanelStage(props) {
  return <RivalAccountsPanel {...props} />
}
