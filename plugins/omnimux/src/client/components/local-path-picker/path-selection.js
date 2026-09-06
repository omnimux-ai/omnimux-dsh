/** Parse one absolute path per line without expanding shell syntax. */
export function parseLocalPaths(text) {
  const paths = [...new Set(String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
  const invalid = paths.find((path) => (
    !(/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path))
    || path.includes('\0')
    || path.replaceAll('\\', '/').split('/').includes('..')
  ))
  return { paths, invalid: invalid ?? null }
}

/** Keep failed inputs available for correction without importing successful inputs twice. */
export function failedPathSelection(results) {
  const failed = results.filter((item) => item?.ok === false)
  return {
    remainingPaths: failed.map((item) => item.sourcePath),
    error: failed.map((item) => item.message || item.error).filter(Boolean).join('\n'),
  }
}
