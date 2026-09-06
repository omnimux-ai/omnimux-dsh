import { failedPathSelection } from '../components/local-path-picker/path-selection.js'

/**
 * Keep copied results owned by one open action until the attachment store accepts them.
 * @param {{
 *   materialize: (paths: string[]) => Promise<Array<{ sourcePath: string, ok: boolean, message?: string, error?: string }>>,
 *   adopt: (rows: object[]) => Array<{ sourcePath: string, ok: boolean, message?: string, error?: string }>,
 *   isCurrent: () => boolean,
 * }} deps
 */
export function createPathImporter({ materialize, adopt, isCurrent }) {
  const copied = new Map()
  return async (paths) => {
    if (!isCurrent()) return null
    const missing = paths.filter((path) => !copied.has(path))
    const results = missing.length ? await materialize(missing) : []
    if (!isCurrent()) return null
    const received = new Map(results.map((item) => [item.sourcePath, item]))
    for (const item of results) {
      if (item.ok) copied.set(item.sourcePath, item)
    }
    const rows = paths.map((path) => copied.get(path) || received.get(path) || {
      ok: false, sourcePath: path, error: 'missing-import-result',
    })
    return failedPathSelection(adopt(rows))
  }
}
