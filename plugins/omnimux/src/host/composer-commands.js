/**
 * Register attachment entry commands in the optional official Host catalog.
 * @param {{ inject?: (deps: string[], callback: (ctx: { commands: { register: Function } }) => void) => unknown }} ctx
 */
export function mountComposerCommands(ctx) {
  ctx.inject?.(['commands'], (commandCtx) => {
    // Register plus-menu commands. commands.register owns its disposer in this injected Cordis scope.
    commandCtx.commands.register({
      name: 'add-file',
      description: '上传媒体或文件 / Upload media or files',
      handler: () => ({ kind: 'success' }),
    })
    commandCtx.commands.register({
      name: 'add-from-library',
      description: '从资产库选择 / Choose from asset library',
      handler: () => ({ kind: 'success' }),
    })
    commandCtx.commands.register({
      name: 'add-from-product',
      description: '从商品库选择 / Choose from product library',
      handler: () => ({ kind: 'success' }),
    })
    commandCtx.commands.register({
      name: 'add-from-inspiration',
      description: '从灵感库选择 / Choose from inspiration library',
      handler: () => ({ kind: 'success' }),
    })
  })
}
