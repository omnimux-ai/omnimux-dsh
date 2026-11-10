/**
 * `plugins.detail.section` is the "below the page's own content" extension
 * point. The hub `omnimux` bundle already renders the full model settings card
 * through `plugins.bundle.config`; matching it here would mount the same card
 * twice on one PackageDetail page. Only sibling `omnimux-*` bundles need the
 * shared section.
 *
 * @param {{kind?: string, pkg?: {name?: string}} | null | undefined} subject
 * @returns {boolean}
 */
export function isSharedModelSettingsDetailSubject(subject) {
  return subject?.kind === 'bundle'
    && typeof subject.pkg?.name === 'string'
    && subject.pkg.name !== 'omnimux'
    && subject.pkg.name.startsWith('omnimux-')
}
