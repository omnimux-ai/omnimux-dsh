import React from 'react';
import { resolveItemDesc, resolveItemTitle, resolveSuiteCounts } from './plazaUtils.js';

function getH(opts) {
  if (opts && typeof opts.h === 'function') return opts.h;
  if (typeof h === 'function') return h;
  return React.createElement;
}

function resolveTr(opts) {
  if (opts && typeof opts.tr === 'function') return opts.tr;
  if (typeof useTr === 'function') return useTr();
  if (typeof lookup === 'function') return lookup;
  return (k) => k;
}

function resolveOverlay(opts) {
  if (opts && opts.Overlay) return opts.Overlay;
  if (typeof Overlay !== 'undefined') return Overlay;
  return 'div';
}

function resolveButton(opts) {
  if (opts && opts.Button) return opts.Button;
  if (typeof Button !== 'undefined') return Button;
  return 'button';
}

function resolveStateHook(opts) {
  if (opts && opts.hooks && typeof opts.hooks.useState === 'function') return opts.hooks.useState;
  if (typeof useState === 'function') return useState;
  return React.useState;
}

function resolveApi(opts) {
  if (opts && typeof opts.api === 'function') return opts.api;
  if (typeof api === 'function') return api;
  return null;
}

/** `{name}` 占位替换；真源 lookup 已带 interpolation，此处只服务回落文案。 */
function fillParams(text, params) {
  let out = String(text || '');
  for (const key of Object.keys(params || {})) {
    out = out.split('{' + key + '}').join(String(params[key]));
  }
  return out;
}

function t(tr, key, fallback, params) {
  let raw = '';
  try {
    const res = typeof tr === 'function' ? tr(key, params) : '';
    if (typeof res === 'string') raw = res;
  } catch {}
  if (raw && raw !== key) return raw;
  return params ? fillParams(fallback, params) : fallback;
}

/** 来源行：bundled / git 两种 source 都只取可读路径，缺省回落渠道名。 */
export function resolveSuiteSourceLabel(item) {
  const src = item && item.source;
  if (typeof src === 'string' && src) return src;
  if (src && typeof src === 'object') {
    const path = String(src.path || '');
    // 平铺仓库（技能直接躺在仓库根）用 `.` 表示包根，对用户没有信息量，回落显示仓库名。
    if (path && path !== '.') return path;
    return String(src.repo || src.type || '');
  }
  return String((item && item.channel) || 'OmniMux');
}

export const SUITE_BLOCKS = Object.freeze([
  { key: 'skills', list: 'skills', titleKey: 'suite.section.skills', hintKey: 'suite.section.skillsHint', fallbackTitle: '技能', fallbackHint: '技能会与对话相关时由智能体自动调用。' },
  { key: 'rules', list: 'rules', variant: 'source', titleKey: 'suite.section.rules', hintKey: 'suite.section.rulesHint', fallbackTitle: '规则', fallbackHint: '规则定义了智能体的行为约束，安装后写入 AGENTS.md。以下为规则原文。' },
  { key: 'agents', list: 'agents', titleKey: 'suite.section.agents', hintKey: 'suite.section.agentsHint', fallbackTitle: 'Agent', fallbackHint: 'Agent 是预设的专业角色，安装后可在专家馆召唤。' },
]);

function blockShell(h, tr, block, body) {
  return h('section', { key: block.key, className: 'ws-suite-block' },
    h('h4', { className: 'ws-suite-block-title' }, t(tr, block.titleKey, block.fallbackTitle)),
    h('p', { className: 'ws-suite-block-hint' }, t(tr, block.hintKey, block.fallbackHint)),
    body,
  );
}

/**
 * 规则直接展示源文本：规则的价值就是它写入 AGENTS.md 的原文，
 * 压成「标题 + 一句摘要」的卡片会让用户看不出实际约束。
 */
function renderSourceBlock(h, tr, block, rows) {
  return blockShell(h, tr, block,
    h('div', { className: 'ws-suite-rules' },
      rows.map((row, idx) => h('article', { key: block.key + '-' + idx, className: 'ws-suite-rule' },
        h('div', { className: 'ws-suite-rule-title' }, String((row && (row.title || row.name)) || '')),
        h('pre', { className: 'ws-suite-rule-body' }, String((row && (row.content || row.desc)) || '')),
      )),
    ),
  );
}

function renderGridBlock(h, tr, block, rows) {
  return blockShell(h, tr, block,
    h('div', { className: 'ws-suite-grid' },
      rows.map((row, idx) => h('div', { key: block.key + '-' + idx, className: 'ws-suite-item' },
        h('div', { className: 'ws-suite-item-title' }, String((row && (row.title || row.name)) || '')),
        row && row.desc ? h('div', { className: 'ws-suite-item-desc' }, String(row.desc)) : null,
      )),
    ),
  );
}

function renderBlock(h, tr, block, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return block.variant === 'source'
    ? renderSourceBlock(h, tr, block, rows)
    : renderGridBlock(h, tr, block, rows);
}

function renderCloseButton(h, tr, onClose) {
  // exempt-ui01 modal close icon button
  return h('button', {
    type: 'button',
    className: 'modal-close-btn',
    'aria-label': t(tr, 'action.close', '关闭'),
    onClick: onClose,
  },
    h('svg', { width: '18', height: '18', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      h('line', { x1: '18', y1: '6', x2: '6', y2: '18', stroke: 'currentColor', strokeWidth: '2' }),
      h('line', { x1: '6', y1: '6', x2: '18', y2: '18', stroke: 'currentColor', strokeWidth: '2' }),
    ),
  );
}

function renderTargetOption(h, value, label, current, onPick) {
  const selected = current === value;
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(value);
    }
  };
  return h('div', {
    key: value,
    role: 'radio',
    'aria-checked': selected,
    'aria-label': label,
    tabIndex: 0,
    className: 'ws-suite-target-option' + (selected ? ' on' : ''),
    onClick: () => onPick(value),
    onKeyDown,
  }, label);
}

function partLine(h, tr, key, fallback, part, primaryKey) {
  const data = part || {};
  return h('li', { key, className: 'ws-suite-receipt-item' }, t(tr, key, fallback, {
    installed: data[primaryKey] || 0,
    written: data[primaryKey] || 0,
    already: data.already || 0,
    failed: data.failed || 0,
    total: data.total || 0,
  }));
}

/** 回执：按服务端 suiteInstall / suiteUninstall 响应列出结果。 */
function renderReceipt(h, tr, receipt) {
  if (!receipt) return null;
  if (receipt.uninstalled === true) {
    return h('div', { className: 'ws-suite-receipt', role: 'status' },
      h('p', { className: 'ws-suite-receipt-title' }, t(tr, 'suite.receipt.uninstalledTitle', '卸载完成')),
      h('p', { className: 'ws-suite-receipt-item' }, t(tr, 'suite.receipt.uninstalled', '已完成卸载，相关配置与预设已清理。')),
    );
  }
  const failed = Array.isArray(receipt.failed) ? receipt.failed : [];
  const partial = receipt.partial === true || failed.length > 0;
  const lines = [];
  if (receipt.skills) lines.push(partLine(h, tr, 'suite.receipt.skills', '技能：新增 {installed}、已完成 {already}、失败 {failed}（共 {total}）', receipt.skills, 'installed'));
  if (receipt.rules) lines.push(partLine(h, tr, 'suite.receipt.rules', '规则：写入 {written}、已存在 {already}、失败 {failed}（共 {total}）', receipt.rules, 'written'));
  if (receipt.agents) lines.push(partLine(h, tr, 'suite.receipt.agents', 'Agent：新增 {installed}、已完成 {already}、失败 {failed}（共 {total}）', receipt.agents, 'installed'));
  if (receipt.rules && receipt.rules.file) {
    lines.push(h('li', { key: 'rules-file', className: 'ws-suite-receipt-item' }, t(tr, 'suite.receipt.ruleFile', '规则落点：{file}', { file: String(receipt.rules.file) })));
  }
  return h('div', { className: 'ws-suite-receipt' + (partial ? ' partial' : ''), role: 'status' },
    h('p', { className: 'ws-suite-receipt-title' }, partial
      ? t(tr, 'suite.receipt.partial', '部分未完成')
      : t(tr, 'suite.receipt.title', '安装完成')),
    h('ul', { className: 'ws-suite-receipt-list' },
      lines,
      failed.map((row, idx) => h('li', { key: 'failed-' + idx, className: 'ws-suite-receipt-item failed' },
        t(tr, 'suite.receipt.failed', '未完成 · {name}：{error}', {
          name: String((row && (row.name || row.part)) || ''),
          error: String((row && row.error) || ''),
        }),
      )),
    ),
  );
}

/**
 * 套件详情模态：标题行（套件名 + 安装）→ 来源 → 描述 →「技能 / 规则 / Agent」三块。
 * 空块及其标题整块不渲染；安装走确认框（落点默认当前项目），确认后调 suiteInstall。
 */
export function SuiteDetailModal(opts) {
  const safe = opts || {};
  const { item, onClose, onInstalled, onUninstalled, projectDir } = safe;
  const h = getH(safe);
  const tr = resolveTr(safe);
  const buttonComp = resolveButton(safe);
  const overlayComp = resolveOverlay(safe);
  const stateFn = resolveStateHook(safe);
  const apiFn = resolveApi(safe);

  const [installedLocal, setInstalledLocal] = stateFn(Boolean(item && (item.installed === true || item.preinstalled === true)));
  const [confirmOpen, setConfirmOpen] = stateFn(false);
  const [confirmUninstallOpen, setConfirmUninstallOpen] = stateFn(false);
  const [ruleTarget, setRuleTarget] = stateFn('project');
  const [installing, setInstalling] = stateFn(false);
  const [uninstalling, setUninstalling] = stateFn(false);
  const [error, setError] = stateFn('');
  const [receipt, setReceipt] = stateFn('');

  if (!item) return null;

  const suite = item.suite || {};
  const counts = resolveSuiteCounts(item);
  const title = resolveItemTitle(item, tr);
  const desc = resolveItemDesc(item, tr);
  const sourceLabel = resolveSuiteSourceLabel(item);
  const installed = installedLocal;
  const targetLabel = (target) => (target === 'global'
    ? t(tr, 'suite.install.ruleTargetGlobal', '个人全局')
    : t(tr, 'suite.install.ruleTargetProject', '当前项目'));

  const closeConfirm = () => {
    if (installing) return;
    setConfirmOpen(false);
    setError('');
  };
  const openConfirm = () => {
    if (installed) return;
    setError('');
    setConfirmOpen(true);
  };
  const confirmInstall = () => {
    if (installing) return;
    const target = ruleTarget === 'global' ? 'global' : 'project';
    // 服务端不知道会话工作区：写当前项目时必须是客户端解析出的绝对路径。
    if (target === 'project' && !projectDir) {
      setError(t(tr, 'suite.install.noProjectDir', '无法定位当前项目目录，请改选「个人全局」后重试。'));
      return;
    }
    setInstalling(true);
    setError('');
    const payload = { id: String(item.id || ''), ruleTarget: target };
    if (target === 'project') payload.projectDir = String(projectDir);
    const pending = apiFn ? apiFn('suiteInstall', payload) : Promise.reject(new Error('suiteInstall unavailable'));
    Promise.resolve(pending).then((res) => {
      const body = res && typeof res === 'object' ? res : {};
      setInstalling(false);
      setConfirmOpen(false);
      setReceipt(body);
      // partial 表示有未完成项：只回执、不声明安装完成（按钮保持可重试，服务端幂等）。
      if (body.partial === true) return;
      setInstalledLocal(true);
      if (typeof onInstalled === 'function') onInstalled(item);
    }, (err) => {
      setInstalling(false);
      setError(t(tr, 'suite.install.failed', '安装失败：{m}', {
        m: err && err.message ? err.message : String(err || ''),
      }));
    });
  };

  const closeUninstallConfirm = () => {
    if (uninstalling) return;
    setConfirmUninstallOpen(false);
    setError('');
  };
  const openUninstallConfirm = () => {
    setError('');
    setConfirmUninstallOpen(true);
  };
  const confirmUninstallAction = () => {
    if (uninstalling) return;
    setUninstalling(true);
    setError('');
    const payload = { id: String(item.id || '') };
    const pending = apiFn ? apiFn('suiteUninstall', payload) : Promise.reject(new Error('suiteUninstall unavailable'));
    Promise.resolve(pending).then((res) => {
      setUninstalling(false);
      setConfirmUninstallOpen(false);
      setReceipt({ uninstalled: true });
      setInstalledLocal(false);
      if (typeof onUninstalled === 'function') onUninstalled(item);
    }, (err) => {
      setUninstalling(false);
      setError(t(tr, 'suite.uninstall.failed', '卸载失败：{m}', {
        m: err && err.message ? err.message : String(err || ''),
      }));
    });
  };

  const blocks = SUITE_BLOCKS
    .map((block) => renderBlock(h, tr, block, suite[block.list]))
    .filter(Boolean);

  const actionButtonText = () => {
    if (installing) return t(tr, 'suite.install.installing', '正在安装…');
    if (uninstalling) return t(tr, 'suite.uninstall.uninstalling', '正在卸载…');
    if (installed) return t(tr, 'suite.uninstall', '卸载');
    return t(tr, 'suite.install', '安装');
  };

  const detail = h('div', { className: 'modal-dialog ws-detail-dialog', role: 'dialog', 'aria-modal': 'true' },
    h('div', { className: 'ws-detail-header-row' },
      h('div', { className: 'ws-detail-header-left' },
        h('h3', { className: 'ws-detail-header-title' }, title),
      ),
      h('div', { className: 'ws-detail-header-actions' },
        h(buttonComp, {
          size: 'sm',
          variant: installed ? 'outline' : 'primary',
          disabled: installing || uninstalling,
          onClick: installed ? openUninstallConfirm : openConfirm,
        }, actionButtonText()),
        renderCloseButton(h, tr, onClose),
      ),
    ),
    h('div', { className: 'ws-detail-source' },
      h('span', { className: 'ws-detail-source-label' }, t(tr, 'suite.source', '来源')),
      h('span', { className: 'ws-detail-source-value' }, sourceLabel),
    ),
    h('p', { className: 'ws-detail-desc' }, desc),
    renderReceipt(h, tr, receipt),
    h('div', { className: 'ws-suite-body' }, blocks),
  );

  const confirm = confirmOpen ? h('div', { className: 'modal-dialog ws-suite-install-dialog', role: 'dialog', 'aria-modal': 'true' },
    h('div', { className: 'modal-header' },
      h('h3', { className: 'modal-title' }, t(tr, 'suite.install.title', '安装套件')),
    ),
    h('p', { className: 'ws-suite-install-summary' }, t(tr, 'suite.install.summary',
      '将安装 {skills} 个技能、{rules} 条规则、{agents} 个 Agent。',
      { skills: counts.skills, rules: counts.rules, agents: counts.agents })),
    counts.rules > 0 ? h('div', { className: 'ws-suite-target' },
      h('div', { className: 'ws-suite-target-label' }, t(tr, 'suite.install.ruleTarget', '规则写入位置')),
      h('div', { className: 'ws-suite-target-options' },
        renderTargetOption(h, 'project', targetLabel('project'), ruleTarget, setRuleTarget),
        renderTargetOption(h, 'global', targetLabel('global'), ruleTarget, setRuleTarget),
      ),
    ) : null,
    error ? h('p', { className: 'sh-err', role: 'alert' }, error) : null,
    h('div', { className: 'ws-detail-actions' },
      h(buttonComp, { size: 'sm', variant: 'outline', disabled: installing, onClick: closeConfirm },
        t(tr, 'suite.install.cancel', '取消')),
      h(buttonComp, { size: 'sm', variant: 'primary', disabled: installing, onClick: confirmInstall },
        installing ? t(tr, 'suite.install.installing', '正在安装…') : t(tr, 'suite.install.confirm', '确认安装')),
    ),
  ) : null;

  const confirmUninstall = confirmUninstallOpen ? h('div', { className: 'modal-dialog ws-suite-install-dialog', role: 'dialog', 'aria-modal': 'true' },
    h('div', { className: 'modal-header' },
      h('h3', { className: 'modal-title' }, t(tr, 'suite.uninstall.title', '卸载套件')),
    ),
    h('p', { className: 'ws-suite-install-summary' }, t(tr, 'suite.uninstall.summary',
      '确定卸载「{title}」吗？卸载后普通对话将无法直接调用其 {skills} 个技能。',
      { title, skills: counts.skills, rules: counts.rules, agents: counts.agents })),
    error ? h('p', { className: 'sh-err', role: 'alert' }, error) : null,
    h('div', { className: 'ws-detail-actions' },
      h(buttonComp, { size: 'sm', variant: 'outline', disabled: uninstalling, onClick: closeUninstallConfirm },
        t(tr, 'suite.install.cancel', '取消')),
      h(buttonComp, { size: 'sm', variant: 'primary', disabled: uninstalling, onClick: confirmUninstallAction },
        uninstalling ? t(tr, 'suite.uninstall.uninstalling', '正在卸载…') : t(tr, 'suite.uninstall.confirm', '确认卸载')),
    ),
  ) : null;

  return [
    h(overlayComp, { key: 'suite-detail', onClose }, detail),
    confirm ? h(overlayComp, { key: 'suite-install-confirm', onClose: closeConfirm }, confirm) : null,
    confirmUninstall ? h(overlayComp, { key: 'suite-uninstall-confirm', onClose: closeUninstallConfirm }, confirmUninstall) : null,
  ];
}
