const qa = (window.__qa = window.__qa || { uploads: [], accounts: [], drafts: [] })

export function errorText(body, status) {
  return (body && typeof body.error === 'string' ? body.error : '') || `HTTP ${status}`
}
export function getCapabilities() {
  return Promise.resolve({ ok: true, status: 200, body: { platforms: {} } })
}
export function mediaContentUrl(id) {
  return `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==#${id}`
}
export async function uploadMedia(file) {
  qa.uploads.push({ name: file.name, type: file.type })
  return { ok: true, status: 200, body: { media: { id: `media-${qa.uploads.length}`, kind: 'image', filename: file.name, content_type: file.type } } }
}
export function createDraft(_type, payload) {
  qa.drafts.push(payload)
  return Promise.resolve({ ok: true, status: 200, body: { record: { id: 'draft-created' } } })
}
export function updateDraft(_id, payload) {
  qa.drafts.push(payload)
  return Promise.resolve({ ok: true, status: 200, body: { record: { id: 'draft-created' } } })
}
export function submitRecord() {
  qa.submitted = true
  return Promise.resolve({ ok: true, status: 200, body: { record: { id: 'draft-created' } } })
}
export function recordDetail() {
  if (!qa.draft) return Promise.resolve({ ok: false, status: 404, body: { error: 'draft not found' } })
  return Promise.resolve({ ok: true, status: 200, body: qa.draft })
}
export function creatorInfo() {
  return Promise.resolve({ ok: true, status: 200, body: { success: true, data: qa.creatorInfo || { privacy_level_options: ['SELF_ONLY'] } } })
}
export function listHubAccounts() {
  return Promise.resolve({ ok: true, status: 200, body: { accounts: qa.accounts } })
}
