const qa = (window.__qa = window.__qa || { uploads: [], drafts: [] })
export function errorText(body, status) { return (body && typeof body.error === 'string' ? body.error : '') || `HTTP ${status}` }
export function getCapabilities() { return Promise.resolve({ ok: true, status: 200, body: { platforms: {} } }) }
export function mediaContentUrl(id) { return `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==#${id}` }
export async function uploadMedia(file) { qa.uploads.push({ name: file.name, type: file.type }); return { ok: true, status: 200, body: { media: { id: `m-${qa.uploads.length}`, kind: 'image', filename: file.name, content_type: file.type } } } }
export function createDraft(_t, payload) { qa.drafts.push(payload); return Promise.resolve({ ok: true, status: 200, body: { record: { id: 'draft-1' } } }) }
export function updateDraft(_id, payload) { qa.drafts.push(payload); return Promise.resolve({ ok: true, status: 200, body: { record: { id: 'draft-1' } } }) }
export function submitRecord() { qa.submitted = true; return Promise.resolve({ ok: true, status: 200, body: { record: { id: 'draft-1' } } }) }
export function recordDetail() { return Promise.resolve({ ok: false, status: 404, body: { error: 'draft not found' } }) }
export function creatorInfo() { return Promise.resolve({ ok: true, status: 200, body: { success: true, data: { privacy_level_options: ['SELF_ONLY'] } } }) }
export function listHubAccounts() { return Promise.resolve({ ok: true, status: 200, body: { accounts: [{ id: 'acc-1', platform: 'tiktok', username: 'omnimux_creator', display_name: 'OmniMux Creator', status: 'active', provider: 'tiktok_direct', agent_usable: true }] } }) }
