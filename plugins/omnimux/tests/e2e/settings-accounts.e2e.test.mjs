import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

// Requires an already prepared task-private application and its owned Ego space.
// The fixture must use synthetic credentials and include only DeepSeek + OmniMux.
// This journey closes that space after success. It never creates another browser
// space, reads shared profiles, submits credentials, or sends a model request.
test('settings: official API editors and OmniMux profile remain reachable without the removed configuration', { timeout: 90000 }, async () => {
  const spaceId = Number(process.env.OMNIMUX_SETTINGS_QA_SPACE_ID)
  assert.equal(Number.isSafeInteger(spaceId) && spaceId > 0, true, 'prepare an owned Ego task space and provide OMNIMUX_SETTINGS_QA_SPACE_ID')
  const origin = new URL(process.env.OMNIMUX_SETTINGS_QA_ORIGIN || 'about:blank')
  assert.equal(origin.protocol, 'http:')
  assert.equal(origin.hostname, '127.0.0.1')
  assert.equal(Boolean(origin.port) && origin.port !== '45120', true, 'use a dynamic task-private application, never the shared Dev app')
  assert.equal(origin.href, origin.origin + '/')
  const evidence = resolve(root, '.workbuddy/settings-browser/regression')
  await mkdir(evidence, { recursive: true })

  const script = `
const fs = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const crypto = await import('node:crypto');
const root = ${JSON.stringify(root)};
const out = ${JSON.stringify(evidence)};
const origin = ${JSON.stringify(origin.origin)};
const task = await taskSpace(${spaceId});
const page = task.page('p1');
const report = { scope:'task-private-settings-browser', spaceId:task.spaceId, origin, checks:[], closed:false, startedAt:new Date().toISOString() };
const record = (name, actual, expected) => { assert.deepEqual(actual, expected, name); report.checks.push({name, actual, expected, pass:true}); };
try {
  record('prepared-page-origin', new URL(await page.url()).origin, origin);
  const resource = await page.evaluate(() => performance.getEntriesByType('resource').find(entry => entry.name.includes('/plugins/??') && entry.name.includes('omnimux/client.js') && entry.name.includes('dsh-client-ui-settings-models'))?.name);
  assert.equal(typeof resource, 'string', 'the application must have loaded both the task client and official settings modules');
  const response = await page.fetch(resource, {timeout:15000});
  record('loaded-client-response', response.status, 200);
  const source = await fs.readFile(root + '/plugins/omnimux/lib/client.js', 'utf8');
  record('current-task-client-exact-bytes', response.body.includes(source), true);
  record('one-official-models-module', response.body.split('id: "@deepseek-ai/dsh-client-ui-settings-models"').length - 1, 1);
  report.clientHash = crypto.createHash('sha256').update(source).digest('hex');

  await page.click('xpath=//*[@role="dialog"]//button[normalize-space(.)="模型"]', {label:'打开官方模型配置'});
  await page.waitForSelector('loc=css:button[aria-label="编辑 DeepSeek (deepseek-official)"]', {state:'visible'});
  const providers = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button[aria-label^="编辑 "]')].map(button => button.getAttribute('aria-label')));
  record('retained-providers', providers, ['编辑 DeepSeek (deepseek-official)', '编辑 OmniMux (omnimux)']);
  for (const label of providers) {
    await page.click('loc=css:button[aria-label="' + label + '"]', {label:'查看保留密钥入口'});
    await page.waitForSelector('loc=css:[role="dialog"] input[placeholder="由启动环境提供（只读）"]', {state:'visible'});
    const field = await page.evaluate(() => {
      const input = document.querySelector('[role="dialog"] input[placeholder="由启动环境提供（只读）"]');
      const rect = input?.getBoundingClientRect();
      return { visible:!!rect && rect.width > 0 && rect.height > 0, disabled:input?.disabled === true };
    });
    record(label + ':synthetic-credential-editor', field, {visible:true, disabled:true});
    await page.click('text="取消"', {label:'关闭只读配置查看'});
  }
  await page.screenshot({path:out + '/retained-providers.png'});
  await page.click('xpath=//*[@role="dialog"]//button[normalize-space(.)="个人资料"]', {label:'查看个人账号入口'});
  await page.waitForSelector('loc=css:.omnimux-profile', {state:'visible'});
  const profile = await page.evaluate(() => {
    const container = document.querySelector('.omnimux-profile');
    const rect = container?.getBoundingClientRect();
    return {visible:!!rect && rect.width>0 && rect.height>0, signedOut:container?.textContent.includes('未登录') === true, loginAvailable:[...(container?.querySelectorAll('button') || [])].some(button => button.textContent.trim()==='登录')};
  });
  record('omnimux-profile-and-login-entry', profile, {visible:true,signedOut:true,loginAvailable:true});
  await page.screenshot({path:out + '/profile.png'});
  await page.click('xpath=//*[@role="dialog"]//button[normalize-space(.)="插件"]', {label:'查看插件配置结果'});
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.innerText.includes('插件配置'), undefined, {timeout:10000});
  const plugins = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const text = dialog?.innerText || '';
    return {pluginConfiguration:text.includes('插件配置') && text.includes('终端'), removedTitles:['运行方式','创作画布模型','模型服务','自带密钥','本地代理'].filter(label => text.includes(label)), oldCards:dialog?.querySelectorAll('.omnimux-models-card,[data-testid="omnimux-model-settings"],.omnimux-runtime-section').length};
  });
  record('removed-configuration-has-no-registration-output', plugins, {pluginConfiguration:true,removedTitles:[],oldCards:0});
  await page.screenshot({path:out + '/plugin-configuration.png'});
  report.snapshot = await page.snapshot();
  report.status = 'PASS';
  report.completedAt = new Date().toISOString();
  await task.finish({keep:[]});
  report.closed = true;
  report.spaceAbsent = !(await listTaskSpaces()).some(space => space.id === task.spaceId);
  assert.equal(report.spaceAbsent, true, 'the completed task space must be absent');
  await fs.writeFile(out + '/browser.json', JSON.stringify(report,null,2));
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error?.message || error);
  await fs.writeFile(out + '/browser.json', JSON.stringify(report,null,2));
  throw error;
}
`
  const browserEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
  const output = await new Promise((accept, reject) => {
    const child = spawn('ego-browser', ['nodejs'], { cwd: root, env: browserEnv, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('settings browser journey timed out')) }, 75000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', (code, signal) => { clearTimeout(timer); accept({ code, signal, stdout, stderr }) })
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error) })
    child.stdin.end(script)
  })
  await writeFile(resolve(evidence, 'ego-output.json'), JSON.stringify(output, null, 2))
  assert.equal(output.code, 0, `real settings journey failed; inspect ${evidence}/ego-output.json`)
  const report = JSON.parse(await readFile(resolve(evidence, 'browser.json'), 'utf8'))
  assert.equal(report.status, 'PASS')
  assert.equal(report.closed, true)
  assert.equal(report.spaceAbsent, true)
  assert.equal(report.checks.length, 9)
})
