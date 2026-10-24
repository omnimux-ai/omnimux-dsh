/**
 * ComfyUI 页面全屏层（Issue #3681 M1；托管状态机 #3701 M2c）。
 *
 * 与导演台同款约定：监听 `COMFY_PAGE_OPEN_EVENT`（detail: { nodeId }），从画布 store
 * 解析该节点的目标地址。地址决定走哪条路径：
 *
 *  - **托管后端路径**（地址 = `DEFAULT_COMFY_PAGE_URL`，新节点默认）：读宿主状态机
 *    （未安装 / 安装中 / 已装未启动 / 启动中 / 就绪 / 失败），按状态给出**唯一**主行动
 *    （安装 / 启动 / 重试），就绪时直接渲染 iframe（真编辑器）。安装中与启动中按
 *    `COMFY_BACKEND_POLL_MS` 轮询；关闭或卸载即 `clearInterval` + `abort` 在途请求。
 *  - **手动地址路径**（用户自己填了别的地址，例如自装 8188）：保持 M1 行为 —— 探测
 *    目标是否有人应答，可达渲染 iframe，不可达给引导层。托管状态不吞这条路径。
 *
 * 同一时刻最多一个全屏层：再次打开只切换 nodeId；关闭时卸载 iframe（不留后台连接）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useCanvasStore } from '../../store/canvasStore';
import { pickLocalDirectory } from '../../bridge/apiClient.ts';
import {
  COMFY_PAGE_PROBE_TIMEOUT_MS,
  DEFAULT_COMFY_PAGE_URL,
  comfyPageUrlFromData,
  normalizeComfyPageUrl,
  type ComfyPageUrlReason,
} from '../utils/comfyPageUrl';
import {
  COMFY_BACKEND_LOG_LINES,
  COMFY_BACKEND_POLL_MS,
  comfyBackendDriverDisplay,
  comfyBackendDriverRequirementKey,
  comfyBackendSettingsCodeKey,
  comfyBackendSupportKey,
  comfyBackendVariantKey,
  fetchComfyBackendLog,
  fetchComfyBackendSettings,
  fetchComfyBackendState,
  formatComfyBackendBytes,
  installComfyBackend,
  parseComfyBackendDriverVerdict,
  parseComfyBackendLog,
  parseComfyBackendSettings,
  parseComfyBackendSettingsCode,
  parseComfyBackendStatus,
  parseComfyBackendSupport,
  parseComfyBackendTargetOptions,
  parseComfyBackendTargetProblem,
  parseComfyBackendVariant,
  parseComfyBackendVariants,
  resolveComfyBackendPanel,
  shouldProbeComfyPage,
  startComfyBackend,
  updateComfyBackendSettings,
  type ComfyBackendDriverVerdict,
  type ComfyBackendEnvelopeContext,
  type ComfyBackendPrimaryAction,
  type ComfyBackendSettings,
  type ComfyBackendStatus,
  type ComfyBackendSupport,
  type ComfyBackendTargetProblem,
  type ComfyBackendVariantRow,
} from '../utils/comfyBackendClient';
import { COMFY_PAGE_OPEN_EVENT } from '../../nodes/definitions/comfyPage';

type ProbeState = 'probing' | 'connected' | 'unreachable';

const REASON_KEY: Record<ComfyPageUrlReason, string> = {
  empty: 'comfyPage.guide.reasonEmpty',
  scheme: 'comfyPage.guide.reasonScheme',
  invalid: 'comfyPage.guide.reasonInvalid',
};

/** 主行动 → 按钮文案（同一时刻只有一个）。 */
const PRIMARY_KEY: Record<Exclude<ComfyBackendPrimaryAction, 'none'>, string> = {
  install: 'comfyPage.backend.install',
  start: 'comfyPage.backend.start',
  'retry-install': 'comfyPage.backend.retryInstall',
  'retry-start': 'comfyPage.backend.retryStart',
  update: 'comfyPage.backend.update',
  'change-dir': 'comfyPage.backend.changeDir',
  'choose-variant': 'comfyPage.backend.chooseVariant',
};

const NO_VERDICT: ComfyBackendDriverVerdict = { status: 'unknown', detail: '', required: null };

export function ComfyPageOverlay() {
  const t = useT();
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [probe, setProbe] = useState<ProbeState>('probing');
  const [reason, setReason] = useState<ComfyPageUrlReason | null>(null);
  /** 每次「重试」/轮询递增，驱动重新取状态。 */
  const [attempt, setAttempt] = useState(0);

  /** 地址是否指向本插件托管后端（新节点默认地址）。 */
  const [managed, setManaged] = useState(false);
  const [backend, setBackend] = useState<ComfyBackendStatus | null>(null);
  /** 读状态失败的可读原因（传输错误或形状不认识），绝不渲染成成功态。 */
  const [backendError, setBackendError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'install' | 'start' | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logError, setLogError] = useState<string | null>(null);

  /** M3：宿主给的设置、预检体积与驱动结论。 */
  const [settings, setSettings] = useState<ComfyBackendSettings>({ installRoot: '', modelsPath: '' });
  const [requiredBytes, setRequiredBytes] = useState(0);
  /** M4：驱动判定（四态 + 人话 + 下限）。 */
  const [driver, setDriver] = useState<ComfyBackendDriverVerdict>(NO_VERDICT);
  /** M4：平台矩阵、当前方案、目标解析问题与候选列表。 */
  const [variants, setVariants] = useState<ComfyBackendVariantRow[]>([]);
  const [variant, setVariant] = useState('');
  const [support, setSupport] = useState<ComfyBackendSupport | null>(null);
  const [targetProblem, setTargetProblem] = useState<ComfyBackendTargetProblem | null>(null);
  const [targetOptions, setTargetOptions] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 输入框草稿（空串 = 用默认）。 */
  const [installRootDraft, setInstallRootDraft] = useState('');
  const [modelsPathDraft, setModelsPathDraft] = useState('');
  /** 设置保存失败的码（宿主 400 的 code）。 */
  const [settingsErrorKey, setSettingsErrorKey] = useState<string | null>(null);
  const [settingsErrorCode, setSettingsErrorCode] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  /** 动作请求的 abort 句柄：关闭全屏层时一并中止。 */
  const actionRef = useRef<AbortController | null>(null);

  const patchNodeStatus = useCallback((id: string, status: string) => {
    const store = useCanvasStore.getState();
    const node = store.nodes.find((item) => item.id === id);
    if (!node) return;
    // 只在真的变化时写，避免轮询把 store 每 1.5s 推一次。
    if ((node.data as Record<string, unknown>).status === status) return;
    store.setNodes((nodes) =>
      nodes.map((item) => (item.id === id ? { ...item, data: { ...item.data, status } } : item)),
    );
  }, []);

  /** 信封里的矩阵/驱动/目标问题：纯数据，喂给状态 → 界面映射。 */
  const context: ComfyBackendEnvelopeContext = {
    targetProblem,
    targetOptions,
    driver,
    variant,
    support,
    variants,
    requiredBytes,
  };
  const panel = managed ? resolveComfyBackendPanel(backend, context) : null;
  const view = panel && panel.kind === 'state' ? panel.view : null;
  /** 读不到托管状态时回落 M1 探测/引导，而不是给死胡同面板。 */
  const useProbe = shouldProbeComfyPage(managed, backend);

  // 打开事件：解析节点地址，重置草稿、探测态与托管状态。
  useEffect(() => {
    const listener = (event: Event) => {
      const id = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId;
      if (typeof id !== 'string') return;
      const node = useCanvasStore.getState().nodes.find((item) => item.id === id);
      if (!node || node.type !== 'comfy-page') return;
      const target = comfyPageUrlFromData(node.data as Record<string, unknown>);
      setNodeId(id);
      setUrl(target);
      setDraft(target);
      setReason(null);
      setProbe('probing');
      setManaged(target === DEFAULT_COMFY_PAGE_URL);
      setBackend(null);
      setBackendError(null);
      setLogOpen(false);
      setLogLines([]);
      setLogError(null);
      setSettingsOpen(false);
      setSettingsErrorKey(null);
      setSettingsErrorCode(null);
      setAttempt((value) => value + 1);
    };
    window.addEventListener(COMFY_PAGE_OPEN_EVENT, listener);
    return () => window.removeEventListener(COMFY_PAGE_OPEN_EVENT, listener);
  }, []);

  // M1 手动地址路径（用户手填地址，或托管状态读不到时的回落）：探测目标是否有人
  // 应答；不依赖目标站 CORS，超时按不可达处理。
  useEffect(() => {
    if (!nodeId || !useProbe) return undefined;
    let stopped = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), COMFY_PAGE_PROBE_TIMEOUT_MS);
    setProbe('probing');
    patchNodeStatus(nodeId, 'probing');
    fetch(url, { mode: 'no-cors', signal: controller.signal, cache: 'no-store' })
      .then(() => {
        if (stopped) return;
        setProbe('connected');
        patchNodeStatus(nodeId, 'connected');
      })
      .catch(() => {
        if (stopped) return;
        setProbe('unreachable');
        patchNodeStatus(nodeId, 'unreachable');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [nodeId, useProbe, url, attempt, patchNodeStatus]);

  // 托管路径：读一次宿主状态；形状不认识时给出可读错误（不猜状态）。
  useEffect(() => {
    if (!nodeId || !managed) return undefined;
    let stopped = false;
    const controller = new AbortController();
    void (async () => {
      const result = await fetchComfyBackendState(controller.signal);
      if (stopped) return;
      const parsed = result.ok ? parseComfyBackendStatus(result.body.status) : null;
      if (parsed) {
        setBackend(parsed);
        setBackendError(null);
        setSettings(parseComfyBackendSettings(result.body.settings));
        setRequiredBytes(
          typeof result.body.requiredBytes === 'number' && Number.isFinite(result.body.requiredBytes)
            ? result.body.requiredBytes
            : 0,
        );
        setDriver(parseComfyBackendDriverVerdict(result.body));
        setVariants(parseComfyBackendVariants(result.body.variants));
        setVariant(parseComfyBackendVariant(result.body));
        setSupport(parseComfyBackendSupport(result.body.support));
        setTargetProblem(parseComfyBackendTargetProblem(result.body.targetProblem));
        setTargetOptions(parseComfyBackendTargetOptions(result.body.targetOptions));
        patchNodeStatus(nodeId, parsed.state === 'ready' ? 'connected' : 'unreachable');
        return;
      }
      setBackend(null);
      setBackendError(result.body.error ?? result.body.message ?? t('comfyPage.backend.stateUnavailable'));
      patchNodeStatus(nodeId, 'unreachable');
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [nodeId, managed, attempt, patchNodeStatus, t]);

  // 只有安装中/启动中才轮询（其余状态打开时取一次）。
  const backendState = backend ? backend.state : null;
  useEffect(() => {
    if (!nodeId || !managed) return undefined;
    if (backendState !== 'installing' && backendState !== 'starting') return undefined;
    const timer = window.setInterval(() => setAttempt((value) => value + 1), COMFY_BACKEND_POLL_MS);
    return () => window.clearInterval(timer);
  }, [nodeId, managed, backendState]);

  // 日志面板：展开时取尾部日志；轮询期间跟着刷新；收起即停。
  useEffect(() => {
    if (!nodeId || !managed || !logOpen) return undefined;
    let stopped = false;
    const controller = new AbortController();
    void (async () => {
      const result = await fetchComfyBackendLog(COMFY_BACKEND_LOG_LINES, controller.signal);
      if (stopped) return;
      if (result.ok) {
        setLogLines(parseComfyBackendLog(result.body));
        setLogError(null);
        return;
      }
      setLogLines([]);
      setLogError(result.body.error ?? result.body.message ?? t('comfyPage.backend.logUnavailable'));
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [nodeId, managed, logOpen, attempt, t]);

  // 卸载：中止在途动作请求（轮询与状态/日志请求由各自 effect 的清理负责）。
  useEffect(() => () => actionRef.current?.abort(), []);

  // 打开设置区时用宿主当前值填充草稿；轮询不会覆盖用户正在输入的内容
  // （依赖的是两个字符串本身，值没变就不会重跑）。
  useEffect(() => {
    if (!settingsOpen) return;
    setInstallRootDraft(settings.installRoot);
    setModelsPathDraft(settings.modelsPath);
  }, [settingsOpen, settings.installRoot, settings.modelsPath]);

  /** 保存设置：只发用户真正改过的字段（另一项不会被顺手重置）。 */
  const saveSettings = useCallback(
    async (patch: { installRoot?: string; modelsPath?: string; variant?: string }) => {
      if (!nodeId) return;
      actionRef.current?.abort();
      const controller = new AbortController();
      actionRef.current = controller;
      setSettingsSaving(true);
      setSettingsErrorKey(null);
      setSettingsErrorCode(null);
      try {
        const result = await updateComfyBackendSettings(patch, controller.signal);
        if (controller.signal.aborted) return;
        if (result.ok) {
          setSettings(parseComfyBackendSettings(result.body.settings));
          // 选方案也会改「当前方案」：立刻用响应里的 variant 更新，不用等下一次轮询。
          if (patch.variant !== undefined) setVariant(parseComfyBackendVariant(result.body.settings));
          setAttempt((value) => value + 1);
          return;
        }
        const code = parseComfyBackendSettingsCode(result.body.code);
        const rawCode = result.body.code;
        setSettingsErrorCode(code ?? (typeof rawCode === 'string' ? rawCode : null));
        setSettingsErrorKey(
          code ? comfyBackendSettingsCodeKey(code) : 'comfyPage.backend.settingsCode.unknown',
        );
      } finally {
        if (actionRef.current === controller) actionRef.current = null;
        if (!controller.signal.aborted) setSettingsSaving(false);
      }
    },
    [nodeId],
  );

  /** 「选择目录」：复用画布既有的原生选择器（宿主 /api/pick，kind=directory）。 */
  const pickDirectory = useCallback(
    async (field: 'installRoot' | 'modelsPath') => {
      const picked = await pickLocalDirectory().catch(() => null);
      if (!picked) {
        setSettingsErrorKey('comfyPage.backend.settings.pickFailed');
        setSettingsErrorCode(null);
        return;
      }
      if (!picked.ok) {
        setSettingsErrorKey(
          picked.body.error === 'picker-unsupported'
            ? 'comfyPage.backend.settings.pickUnsupported'
            : 'comfyPage.backend.settings.pickFailed',
        );
        setSettingsErrorCode(picked.body.error ?? null);
        return;
      }
      const path = picked.body.path;
      if (!path) return;
      if (field === 'installRoot') setInstallRootDraft(path);
      else setModelsPathDraft(path);
      await saveSettings(field === 'installRoot' ? { installRoot: path } : { modelsPath: path });
    },
    [saveSettings],
  );

  const runAction = useCallback(
    async (kind: 'install' | 'start') => {
      if (!nodeId) return;
      actionRef.current?.abort();
      const controller = new AbortController();
      actionRef.current = controller;
      setBusyAction(kind);
      try {
        const result = kind === 'install'
          ? await installComfyBackend(controller.signal)
          : await startComfyBackend(controller.signal);
        if (controller.signal.aborted) return;
        const parsed = result.ok ? parseComfyBackendStatus(result.body.status) : null;
        if (parsed) {
          setBackend(parsed);
          setBackendError(null);
          patchNodeStatus(nodeId, parsed.state === 'ready' ? 'connected' : 'unreachable');
        } else {
          setBackendError(result.body.error ?? result.body.message ?? t('comfyPage.backend.stateUnavailable'));
        }
      } finally {
        if (actionRef.current === controller) actionRef.current = null;
        if (!controller.signal.aborted) setBusyAction(null);
      }
      setAttempt((value) => value + 1);
    },
    [nodeId, patchNodeStatus, t],
  );

  const close = useCallback(() => {
    actionRef.current?.abort();
    actionRef.current = null;
    if (nodeId) patchNodeStatus(nodeId, 'idle');
    setNodeId(null);
    setBackend(null);
    setBackendError(null);
    setBusyAction(null);
    setLogOpen(false);
    setLogLines([]);
    setLogError(null);
  }, [nodeId, patchNodeStatus]);

  // ESC 退出；只在打开时监听。
  useEffect(() => {
    if (!nodeId) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodeId, close]);

  if (!nodeId) return null;

  const applyAddress = () => {
    const normalized = normalizeComfyPageUrl(draft);
    if (!normalized.ok) {
      setReason(normalized.reason);
      return;
    }
    setReason(null);
    setUrl(normalized.url);
    setDraft(normalized.url);
    setManaged(normalized.url === DEFAULT_COMFY_PAGE_URL);
    setBackend(null);
    setBackendError(null);
    setLogOpen(false);
    setLogLines([]);
    setLogError(null);
    useCanvasStore.getState().setNodes((nodes) =>
      nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, url: normalized.url } } : node)),
    );
    setAttempt((value) => value + 1);
  };

  const headerStatus = panel && panel.kind === 'state'
    ? t(panel.stateKey)
    : t(`comfyPage.status.${probe}`);
  const headerState = panel && panel.kind === 'state' ? panel.state : probe;

  /** 方案名称：画布自己的 i18n 名称；未知 id 回落宿主 label（不编名称）。 */
  const variantName = (id: string, label: string): string => {
    const key = comfyBackendVariantKey(id);
    return key ? t(key) : label;
  };

  /** 驱动结论：结论 + 行内精确原因（unknown/unsatisfied 不能只藏在悬停里）。 */
  const driverLine = comfyBackendDriverDisplay(driver);

  const runPrimary = () => {
    if (!view) return;
    // 「换目录」/「更换方案」都不是后端动作：它们只是把设置区打开，让用户自己选。
    if (view.primaryAction === 'change-dir' || view.primaryAction === 'choose-variant') {
      setSettingsOpen(true);
      return;
    }
    if (view.primaryAction === 'start' || view.primaryAction === 'retry-start') void runAction('start');
    else if (view.primaryAction === 'install' || view.primaryAction === 'retry-install' || view.primaryAction === 'update') {
      void runAction('install');
    }
  };

  return (
    <div className="wf-comfy-page-overlay" role="dialog" aria-modal="true" aria-label={t('comfyPage.card.title')}>
      <header className="wf-comfy-page-overlay__bar">
        <span className="wf-comfy-page-overlay__title">{t('comfyPage.card.title')}</span>
        <code className="wf-comfy-page-overlay__url" title={url}>{url}</code>
        <span
          className="wf-comfy-page-overlay__status"
          data-status={headerState}
        >
          {headerStatus}
        </span>
        {managed && panel && panel.kind === 'state' ? (
          <button
            type="button"
            className="wf-comfy-page-overlay__settings-toggle"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            {t('comfyPage.backend.settings.open')}
          </button>
        ) : null}
        {view && view.showLog ? (
          <button
            type="button"
            className="wf-comfy-page-overlay__log-toggle"
            aria-expanded={logOpen}
            onClick={() => setLogOpen((value) => !value)}
          >
            {logOpen ? t('comfyPage.backend.hideLog') : t('comfyPage.backend.showLog')}
          </button>
        ) : null}
        <a className="wf-comfy-page-overlay__external" href={url} target="_blank" rel="noreferrer noopener">
          {t('comfyPage.overlay.openExternal')}
        </a>
        {!managed ? (
          <button type="button" className="wf-comfy-page-overlay__retry" onClick={() => setAttempt((value) => value + 1)}>
            {t('comfyPage.overlay.retry')}
          </button>
        ) : null}
        <button type="button" className="wf-comfy-page-overlay__close" onClick={close} aria-label={t('comfyPage.overlay.close')}>
          {t('comfyPage.overlay.close')}
        </button>
      </header>

      {view && view.showFrame ? (
        <iframe
          className="wf-comfy-page-overlay__frame"
          src={url}
          title={t('comfyPage.card.title')}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : null}

      {managed && view && !view.showFrame ? (
        <div className="wf-comfy-page-overlay__panel" data-state={view.state}>
          <p className="wf-comfy-page-overlay__panel-state">{t(view.stateKey)}</p>

          {view.showProgress ? (
            <div
              className="wf-comfy-page-overlay__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.percent}
            >
              <div className="wf-comfy-page-overlay__progress-track">
                <div
                  className="wf-comfy-page-overlay__progress-fill"
                  style={{ width: `${view.percent}%` }}
                />
              </div>
              <span className="wf-comfy-page-overlay__progress-value">{view.percent}%</span>
            </div>
          ) : null}

          {view.showStarting ? (
            <p className="wf-comfy-page-overlay__stage">{t('comfyPage.backend.starting')}</p>
          ) : null}

          {view.stageKey ? (
            <p className="wf-comfy-page-overlay__stage" title={backend ? backend.message : undefined}>
              {t(view.stageKey)}
            </p>
          ) : null}

          {view.errorKey ? (
            <p className="wf-comfy-page-overlay__guide-error" role="alert">
              {backend && backend.error ? `${t(view.errorKey)}（${backend.error}）` : t(view.errorKey)}
            </p>
          ) : null}

          {view.showDiskRequired && requiredBytes > 0 ? (
            <dl className="wf-comfy-page-overlay__facts">
              <div className="wf-comfy-page-overlay__fact">
                <dt>{t('comfyPage.backend.factRequired')}</dt>
                <dd className="wf-comfy-page-overlay__fact-value" data-fact="required-bytes">
                  {formatComfyBackendBytes(requiredBytes)}
                </dd>
              </div>
            </dl>
          ) : null}

          {view.problemKey ? (
            <p className="wf-comfy-page-overlay__problem" role="alert" data-problem={targetProblem}>
              {t(view.problemKey)}
            </p>
          ) : null}

          {view.showDriverNote ? (
            <p
              className="wf-comfy-page-overlay__driver"
              data-driver={driver.status}
              title={driver.detail || undefined}
            >
              {t(driverLine.key)}
              {driverLine.requirement ? (
                <span className="wf-comfy-page-overlay__driver-required">
                  {`（${t('comfyPage.backend.driver.requiredAtLeast')} ${driverLine.requirement}）`}
                </span>
              ) : null}
              {driverLine.detail ? (
                <span className="wf-comfy-page-overlay__driver-detail">{`· ${driverLine.detail}`}</span>
              ) : null}
            </p>
          ) : null}

          {view.state === 'not-installed' && backend && backend.target ? (
            <dl className="wf-comfy-page-overlay__facts">
              <div className="wf-comfy-page-overlay__fact">
                <dt>{t('comfyPage.backend.factPlatform')}</dt>
                <dd>{`${backend.target.platform}/${backend.target.arch}`}</dd>
              </div>
              <div className="wf-comfy-page-overlay__fact">
                <dt>{t('comfyPage.backend.factSize')}</dt>
                <dd>{formatComfyBackendBytes(backend.target.estimatedBytes)}</dd>
              </div>
              <div className="wf-comfy-page-overlay__fact">
                <dt>{t('comfyPage.backend.factLocation')}</dt>
                <dd className="wf-comfy-page-overlay__fact-value" data-fact="location">
                  {backend.installRoot ? backend.installRoot : `targets/${backend.target.id}`}
                </dd>
              </div>
              <div className="wf-comfy-page-overlay__fact">
                <dt>{t('comfyPage.backend.factVersions')}</dt>
                <dd>{`Python ${backend.target.pythonVersion} · PyTorch ${backend.target.torchVersion} · ComfyUI ${backend.target.comfyuiTag}`}</dd>
              </div>
            </dl>
          ) : null}

          {view.primaryAction !== 'none' ? (
            <button
              type="button"
              className="wf-comfy-page-overlay__primary"
              onClick={runPrimary}
              disabled={busyAction !== null}
            >
              {t(PRIMARY_KEY[view.primaryAction])}
            </button>
          ) : null}
        </div>
      ) : null}

      {managed && settingsOpen && panel && panel.kind === 'state' ? (
        <div className="wf-comfy-page-overlay__settings">
          {variants.length > 0 ? (
            <div className="wf-comfy-page-overlay__variants">
              <p className="wf-comfy-page-overlay__setting-label">{t('comfyPage.backend.variants')}</p>
              {variants.map((row) => (
                <button
                  type="button"
                  className="wf-comfy-page-overlay__variant"
                  key={row.id}
                  data-variant={row.variant}
                  data-support={row.support}
                  aria-pressed={row.variant === variant}
                  onClick={() => void saveSettings({ variant: row.variant })}
                >
                  <span className="wf-comfy-page-overlay__variant-head">
                    <span className="wf-comfy-page-overlay__variant-name">
                      {variantName(row.variant, row.label)}
                    </span>
                    <span className="wf-comfy-page-overlay__variant-support">
                      {t(comfyBackendSupportKey(row.support))}
                    </span>
                    {row.variant === variant ? (
                      <span className="wf-comfy-page-overlay__variant-current">
                        {t('comfyPage.backend.variant.current')}
                      </span>
                    ) : null}
                  </span>
                  <span className="wf-comfy-page-overlay__variant-meta">
                    {`${t(comfyBackendDriverRequirementKey(row.driver))}${
                      row.minDriver ? ` ≥ ${row.minDriver}` : ''
                    } · ${formatComfyBackendBytes(row.estimatedBytes)}`}
                  </span>
                  {row.notes ? (
                    <span className="wf-comfy-page-overlay__variant-notes">{row.notes}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="wf-comfy-page-overlay__setting" data-field="install-root">
            <label className="wf-comfy-page-overlay__setting-label" htmlFor="wf-comfy-install-root">
              {t('comfyPage.backend.settings.installRoot')}
            </label>
            <div className="wf-comfy-page-overlay__setting-row">
              <input
                id="wf-comfy-install-root"
                className="wf-comfy-page-overlay__setting-input"
                value={installRootDraft}
                spellCheck={false}
                placeholder={backend ? backend.installRoot : ''}
                onChange={(event) => setInstallRootDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveSettings({ installRoot: installRootDraft });
                }}
              />
              <button
                type="button"
                className="wf-comfy-page-overlay__setting-pick"
                onClick={() => void pickDirectory('installRoot')}
              >
                {t('comfyPage.backend.settings.pick')}
              </button>
            </div>
            <p className="wf-comfy-page-overlay__setting-hint">
              {settings.installRoot
                ? settings.installRoot
                : `${t('comfyPage.backend.settings.installRootDefault')}${backend && backend.installRoot ? ` · ${backend.installRoot}` : ''}`}
            </p>
          </div>

          <div className="wf-comfy-page-overlay__setting" data-field="models-path">
            <label className="wf-comfy-page-overlay__setting-label" htmlFor="wf-comfy-models-path">
              {t('comfyPage.backend.settings.modelsPath')}
            </label>
            <div className="wf-comfy-page-overlay__setting-row">
              <input
                id="wf-comfy-models-path"
                className="wf-comfy-page-overlay__setting-input"
                value={modelsPathDraft}
                spellCheck={false}
                onChange={(event) => setModelsPathDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveSettings({ modelsPath: modelsPathDraft });
                }}
              />
              <button
                type="button"
                className="wf-comfy-page-overlay__setting-pick"
                onClick={() => void pickDirectory('modelsPath')}
              >
                {t('comfyPage.backend.settings.pick')}
              </button>
            </div>
            <p className="wf-comfy-page-overlay__setting-hint">
              {settings.modelsPath
                ? settings.modelsPath
                : t('comfyPage.backend.settings.modelsPathDefault')}
            </p>
          </div>

          <div className="wf-comfy-page-overlay__setting-actions">
            <button
              type="button"
              className="wf-comfy-page-overlay__setting-save"
              disabled={settingsSaving}
              onClick={() =>
                void saveSettings({ installRoot: installRootDraft, modelsPath: modelsPathDraft })
              }
            >
              {t('comfyPage.backend.settings.save')}
            </button>
          </div>

          {settingsErrorKey ? (
            <p
              className="wf-comfy-page-overlay__setting-error"
              role="alert"
              data-code={settingsErrorCode ?? ''}
            >
              {t(settingsErrorKey)}
            </p>
          ) : null}
        </div>
      ) : null}

      {managed && logOpen && view && view.showLog ? (
        <div className="wf-comfy-page-overlay__log">
          <div className="wf-comfy-page-overlay__log-head">
            <span className="wf-comfy-page-overlay__log-title">{t('comfyPage.backend.showLog')}</span>
          </div>
          {logError ? (
            <p className="wf-comfy-page-overlay__guide-error" role="alert">{logError}</p>
          ) : null}
          {logLines.length === 0 ? (
            <p className="wf-comfy-page-overlay__log-empty">{t('comfyPage.backend.logEmpty')}</p>
          ) : (
            <div className="wf-comfy-page-overlay__log-body">
              {logLines.map((line, index) => (
                <p className="wf-comfy-page-overlay__log-line" key={`${String(index)}`}>{line}</p>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {useProbe ? (
        probe === 'connected' ? (
          <iframe
            className="wf-comfy-page-overlay__frame"
            src={url}
            title={t('comfyPage.card.title')}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <div className="wf-comfy-page-overlay__guide" role="status">
            {probe === 'probing' ? (
              <p className="wf-comfy-page-overlay__guide-title">{t('comfyPage.overlay.opening')}</p>
            ) : (
              <>
                <p className="wf-comfy-page-overlay__guide-title">{t('comfyPage.guide.title')}</p>
                <p className="wf-comfy-page-overlay__guide-body">{t('comfyPage.guide.body')}</p>
                {managed && backendError ? (
                  <p className="wf-comfy-page-overlay__guide-error" role="alert">{backendError}</p>
                ) : null}
                <div className="wf-comfy-page-overlay__address">
                  <label className="wf-comfy-page-overlay__address-label" htmlFor="wf-comfy-page-address">
                    {t('comfyPage.overlay.addressLabel')}
                  </label>
                  <input
                    id="wf-comfy-page-address"
                    className="wf-comfy-page-overlay__input"
                    value={draft}
                    spellCheck={false}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyAddress();
                    }}
                  />
                  <button type="button" className="wf-comfy-page-overlay__apply" onClick={applyAddress}>
                    {t('comfyPage.overlay.retry')}
                  </button>
                </div>
                {reason ? (
                  <p className="wf-comfy-page-overlay__guide-error" role="alert">
                    {t(REASON_KEY[reason])}
                  </p>
                ) : null}
              </>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}
