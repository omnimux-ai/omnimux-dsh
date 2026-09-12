/**
 * Register attachment entry commands in the optional official Host catalog.
 * @param {{ inject?: (deps: string[], callback: (ctx: { commands: { register: Function } }) => void) => unknown }} ctx
 */
export function mountComposerCommands(ctx) {
  ctx.inject?.(['commands'], (commandCtx) => {
    // The official composer 📎 owns 添加文件 on dsh 0.1.5-rc.1, so this catalog
    // keeps only the asset-library entry.
    // commands.register owns its disposer in this injected Cordis scope.
    commandCtx.commands.register({
      name: 'add-from-library',
      description: '从资产库添加 / Add from library',
      handler: () => ({ kind: 'success' }),
    })
  })
}
