const ENDPOINT = '/omnimux/reference-storage/config'
async function responseValue(response) {
  let value
  try { value = await response.json() } catch { throw new Error('存储设置响应无效，请重试') }
  if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : '存储设置未能保存，请重试')
  return value
}
export async function readStorageSettings(fetcher = fetch) {
  return responseValue(await fetcher(ENDPOINT, { cache: 'no-store' }))
}
export async function saveStorageSettings(value, fetcher = fetch) {
  return responseValue(await fetcher(ENDPOINT, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value), cache: 'no-store' }))
}
