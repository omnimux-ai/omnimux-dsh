/**
 * Register attachment entry commands in the optional official Host catalog.
 * @param {{ inject?: (deps: string[], callback: (ctx: { commands: { register: Function } }) => void) => unknown }} ctx
 */
export function mountComposerCommands(ctx) {
  ctx.inject?.(['commands'], (commandCtx) => {
    // commands.register owns its disposer in this injected Cordis scope.
    commandCtx.commands.register({
      name: 'add-file',
      description: '添加文件 / Add files',
      handler: () => ({ kind: 'success' }),
    })
    commandCtx.commands.register({
      name: 'add-from-library',
      description: '从资产库添加 / Add from library',
      handler: () => ({ kind: 'success' }),
    })
  })
}
