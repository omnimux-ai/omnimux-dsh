/** Keep one pending composer picker action from settling another action's UI. */
export function createPickerActionController() {
  let current = null
  let revision = 0

  const settle = (action, restoreComposerFocus) => {
    if (!action || current !== action) return false
    current = null
    action.resolve()
    if (restoreComposerFocus && !action.signal.aborted) action.restoreComposerFocus()
    return true
  }

  return {
    start(action) {
      settle(current, false)
      current = action
      revision += 1
      return action
    },
    current() {
      return current
    },
    isCurrent(action) {
      return current === action
    },
    revision() {
      return revision
    },
    settle(action) {
      return settle(action, true)
    },
  }
}
