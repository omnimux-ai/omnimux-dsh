import { assertSocialSuccess, requireSocialProvider } from './provider.js'
/**
 * @param {{ withPat: Function }} client
 * @param {{ filename?: string, content_type?: string }} args
 */
export function presignMedia(client, args) {
  return client.withPat('/api/social/v1/media/presign', {
    method: 'POST',
    body: {
      filename: args.filename,
      content_type: args.content_type,
    },
  })
}

/**
 * @param {{ withPat: Function }} client
 * @param {Record<string, unknown>} args
 */
export async function createPost(client, args) {
  const provider = requireSocialProvider(args.provider)
  return assertSocialSuccess(await client.withPat('/api/social/v1/posts', {
    method: 'POST',
    body: { ...args, provider },
  }))
}

/**
 * @param {{ withPat: Function }} client
 * @param {{ id?: string, provider?: unknown }} args
 */
export async function getPost(client, args) {
  const provider = requireSocialProvider(args.provider)
  const id = encodeURIComponent(String(args.id || ''))
  return assertSocialSuccess(await client.withPat(`/api/social/v1/posts/${id}?provider=${provider}`))
}
