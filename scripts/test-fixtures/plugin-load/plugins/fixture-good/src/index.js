export const name = 'fixture-good'
export const inject = ['tools']
export function apply(ctx) {
  ctx.tools.register({ name: 'ok' })
}
