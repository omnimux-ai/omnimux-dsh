export const commands = {
  init: { usage: 'init --template <id> --id <new-id> --out <new-directory>', description: '从官方样例创建配置、填写样例及预期草稿；目标目录必须不存在' },
  check: { usage: 'check <definition.json> [values.json]', description: '只读检查配置，提供 values 时同时检查填写数据' },
  preview: { usage: 'preview <definition.json> <values.json>', description: '只读生成草稿 JSON，不上传文件、不发送消息' },
  docs: { usage: 'docs [--check]', description: '更新生成参考；--check 只读检查漂移并在不一致时失败' },
};
export function usage() {
  return Object.values(commands).map(command => `pnpm --config.verify-deps-before-run=false form: ${command.usage}\n  ${command.description}`).join('\n');
}
