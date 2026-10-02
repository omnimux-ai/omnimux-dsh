export const name = 'fixture-missing-inject'
export const inject = []
export function apply(ctx) {
  // Crash class from #2788/#2791/#2773: read a host service without declaring it.
  ctx.tools.register({ name: 'should-fail' })
}
