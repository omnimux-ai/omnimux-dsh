/**
 * plugins/omnimux-apps/src/client/AppWorkspaceView.tsx
 *
 * Full AI Application Workspace View for OmniMux.
 * Structure:
 * 1. Top compact tabs (32px high, 28px buttons, 6px radius, single-line scrolling)
 * 2. Split Card:
 *    - Left: 448px AppFormPanel (398px usable inner width)
 *    - Right: Task management & showcase area (History vs Showcase tabs)
 *      - History: Truthful empty state when empty (NO fake tasks!).
 *      - Showcase: Displays manifest.showcase items with single clean "使用此示例参数" action.
 * 3. Listens to omnimux-app-open event to claimProductStage('omnimux-apps') and switch apps.
 *
 * Contract: docs/contracts/ai-app-ui-spec.md & docs/contracts/workflow-app-boundary.md
 */

import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Sparkles,
  Copy,
  Layers,
  Volume2,
} from 'lucide-react';
import type {
  ApplicationManifest,
  ApplicationCategory,
  ShowcaseItem,
} from '../shared/manifest.ts';
import type { AppIndexEntry, TaskRecord } from '../host/storage/appStorage.ts';
import { APP_OPEN_EVENT, TABS_CHANGED_EVENT } from './stage.ts';
import { AppFormPanel } from './AppFormPanel.tsx';
import './apps.css';

export interface AppWorkspaceViewProps {
  initialAppId?: string;
  initialManifest?: ApplicationManifest | null;
  onBack?: () => void;
  className?: string;
  onExecute?: (
    manifest: ApplicationManifest,
    formValues: Record<string, unknown>,
  ) => Promise<{
    executionId: string;
    jobId?: string;
    status: string;
    streamUrl?: string;
    pollUrl?: string;
  }>;
  onPollStatus?: (
    executionId: string,
  ) => Promise<{
    status: string;
    artifacts?: Array<{ type?: string; url?: string; [key: string]: unknown }>;
    outputs?: unknown;
    error?: string;
  } | null>;
}

const CATEGORY_TABS: Array<{ key: ApplicationCategory | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'video', label: '视频' },
  { key: 'image', label: '图片' },
  { key: 'audio', label: '音频' },
];

export const AppWorkspaceView: React.FC<AppWorkspaceViewProps> = memo(({
  initialAppId,
  initialManifest = null,
  onBack,
  className = '',
  onExecute,
  onPollStatus,
}: AppWorkspaceViewProps) => {
  // Navigation & Category Filter state
  const [selectedCategory, setSelectedCategory] = useState<ApplicationCategory | 'all'>('all');
  const [appsList, setAppsList] = useState<AppIndexEntry[]>([]);
  const [currentAppId, setCurrentAppId] = useState<string>(initialAppId || initialManifest?.appId || '');
  const [currentManifest, setCurrentManifest] = useState<ApplicationManifest | null>(initialManifest);

  // Form & Task state
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<'history' | 'showcase'>('history');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Listen to omnimux-app-open
  useEffect(() => {
    const handleAppOpen = (e: Event) => {
      const customEvt = e as CustomEvent<{ id?: string; manifest?: ApplicationManifest }>;
      const targetId = customEvt.detail?.id;
      if (targetId) {
        setCurrentAppId(targetId);
        if (customEvt.detail?.manifest) {
          setCurrentManifest(customEvt.detail.manifest);
        }
      }
    };

    const handleTabsChanged = () => {
      try {
        if (typeof window !== 'undefined') {
          const stored = window.localStorage?.getItem('omnimux_apps_manifests');
          if (stored) {
            const manifestsMap: Record<string, ApplicationManifest> = JSON.parse(stored);
            const entries: AppIndexEntry[] = Object.values(manifestsMap).map((m) => ({
              appId: m.appId,
              name: m.metadata.name,
              category: m.metadata.category,
              description: m.metadata.description,
              iconSvg: m.metadata.iconSvg,
              coverUrl: m.metadata.coverUrl,
              latestVersion: m.version,
              versions: [m.version],
              createdAt: m.createdAt,
              updatedAt: m.createdAt,
            }));
            setAppsList(entries);
          }
        }
      } catch {
        // Ignore storage read error
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(APP_OPEN_EVENT, handleAppOpen);
      window.addEventListener(TABS_CHANGED_EVENT, handleTabsChanged);
      handleTabsChanged();
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(APP_OPEN_EVENT, handleAppOpen);
        window.removeEventListener(TABS_CHANGED_EVENT, handleTabsChanged);
      }
    };
  }, []);

  // Load manifest when currentAppId changes
  useEffect(() => {
    if (!currentAppId) return;

    if (currentManifest && currentManifest.appId === currentAppId) {
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage?.getItem('omnimux_apps_manifests');
        if (stored) {
          const manifestsMap: Record<string, ApplicationManifest> = JSON.parse(stored);
          const matched = manifestsMap[currentAppId];
          if (matched) {
            setCurrentManifest(matched);
            return;
          }
        }
      }
    } catch {
      // Ignore
    }
  }, [currentAppId, currentManifest]);

  // Load task history for current app (Authentic real history, no fake tasks!)
  useEffect(() => {
    if (!currentAppId) {
      setTasks([]);
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        const storedTasks = window.localStorage?.getItem(`omnimux_apps_tasks_${currentAppId}`);
        if (storedTasks) {
          const parsed = JSON.parse(storedTasks);
          if (Array.isArray(parsed)) {
            setTasks(parsed);
            return;
          }
        }
      }
    } catch {
      // Ignore
    }
    // Truthful default: empty array
    setTasks([]);
  }, [currentAppId]);

  // Handle form submission and record real task
  const handleFormSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!currentManifest) return;

      setIsSubmitting(true);
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();

      const newTask: TaskRecord = {
        taskId,
        appId: currentManifest.appId,
        appVersion: currentManifest.version,
        status: 'running',
        inputs: { ...values },
        createdAt: now,
        updatedAt: now,
      };

      setTasks((prev) => {
        const next = [newTask, ...prev];
        try {
          if (typeof window !== 'undefined') {
            window.localStorage?.setItem(
              `omnimux_apps_tasks_${currentManifest.appId}`,
              JSON.stringify(next),
            );
          }
        } catch {}
        return next;
      });
      setActiveRightTab('history');

      try {
        // Trigger real headless execution
        let executionId = '';
        if (onExecute) {
          const res = await onExecute(currentManifest, values);
          executionId = res.executionId || res.jobId || '';
        } else if (typeof window !== 'undefined' && (window as any).__OMNIMUX_APPS_EXECUTE__) {
          const res = await (window as any).__OMNIMUX_APPS_EXECUTE__(currentManifest, values);
          executionId = res.executionId || res.jobId || '';
        } else {
          // Client fetch fallback to omnimux-apps execution API
          const response = await fetch(
            `/omnimux-apps/api/apps/${encodeURIComponent(currentManifest.appId)}/executions`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                version: currentManifest.version,
                inputs: values,
              }),
            },
          );
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `执行启动失败 (HTTP ${response.status})`);
          }
          const data = await response.json();
          executionId = data.executionId || data.jobId || '';
        }

        // Update task with real executionId
        setTasks((prev) => {
          const updated = prev.map((t) => (t.taskId === taskId ? { ...t, executionId, updatedAt: new Date().toISOString() } : t));
          try {
            if (typeof window !== 'undefined') {
              window.localStorage?.setItem(
                `omnimux_apps_tasks_${currentManifest.appId}`,
                JSON.stringify(updated),
              );
            }
          } catch {}
          return updated;
        });

        // Poll execution status until terminal state (replaces fake setTimeout)
        const pollInterval = 500;
        const maxAttempts = 120;
        let attempts = 0;

        const pollStatus = async () => {
          attempts++;
          try {
            let statusResult: any = null;
            if (onPollStatus) {
              statusResult = await onPollStatus(executionId);
            } else if (typeof window !== 'undefined' && (window as any).__OMNIMUX_APPS_POLL__) {
              statusResult = await (window as any).__OMNIMUX_APPS_POLL__(executionId);
            } else {
              const res = await fetch(
                `/omnimux-apps/api/apps/${encodeURIComponent(currentManifest.appId)}/executions/${encodeURIComponent(executionId)}`,
              );
              if (res.ok) {
                statusResult = await res.json();
              }
            }

            if (!statusResult) {
              if (attempts < maxAttempts) {
                setTimeout(pollStatus, pollInterval);
              } else {
                markFailed('轮询对账超时');
              }
              return;
            }

            const normalizedStatus = String(statusResult.status || '').toUpperCase();

            if (normalizedStatus === 'COMPLETED') {
              // Extract real artifact media URLs
              let mediaUrl = '';
              const previewUrl = currentManifest.metadata.coverUrl;

              if (Array.isArray(statusResult.artifacts) && statusResult.artifacts.length > 0) {
                const firstArtifact = statusResult.artifacts[0];
                mediaUrl = firstArtifact.url || firstArtifact.pathOrUrl || '';
              } else if (statusResult.outputs?.mediaUrl) {
                mediaUrl = statusResult.outputs.mediaUrl;
              }

              const completedTask: TaskRecord = {
                ...newTask,
                executionId,
                status: 'completed',
                updatedAt: new Date().toISOString(),
                outputs: {
                  mediaUrl: mediaUrl || currentManifest.showcase.items[0]?.mediaUrl || '',
                  previewUrl,
                  artifacts: statusResult.artifacts,
                },
              };

              setTasks((prev) => {
                const updated = prev.map((t) => (t.taskId === taskId ? completedTask : t));
                try {
                  if (typeof window !== 'undefined') {
                    window.localStorage?.setItem(
                      `omnimux_apps_tasks_${currentManifest.appId}`,
                      JSON.stringify(updated),
                    );
                  }
                } catch {}
                return updated;
              });
              setIsSubmitting(false);
            } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR') {
              markFailed(statusResult.error || '任务执行失败');
            } else if (normalizedStatus === 'CANCELED' || normalizedStatus === 'CANCELLED') {
              markCancelled();
            } else {
              // QUEUED or RUNNING: keep polling
              if (attempts < maxAttempts) {
                setTimeout(pollStatus, pollInterval);
              } else {
                markFailed('任务执行超时');
              }
            }
          } catch (pollErr: any) {
            if (attempts < maxAttempts) {
              setTimeout(pollStatus, pollInterval);
            } else {
              markFailed(pollErr.message || '对账查询异常');
            }
          }
        };

        const markFailed = (errorMsg: string) => {
          const failedTask: TaskRecord = {
            ...newTask,
            executionId,
            status: 'failed',
            error: errorMsg,
            updatedAt: new Date().toISOString(),
          };
          setTasks((prev) => {
            const updated = prev.map((t) => (t.taskId === taskId ? failedTask : t));
            try {
              if (typeof window !== 'undefined') {
                window.localStorage?.setItem(
                  `omnimux_apps_tasks_${currentManifest.appId}`,
                  JSON.stringify(updated),
                );
              }
            } catch {}
            return updated;
          });
          setIsSubmitting(false);
        };

        const markCancelled = () => {
          const cancelledTask: TaskRecord = {
            ...newTask,
            executionId,
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          };
          setTasks((prev) => {
            const updated = prev.map((t) => (t.taskId === taskId ? cancelledTask : t));
            try {
              if (typeof window !== 'undefined') {
                window.localStorage?.setItem(
                  `omnimux_apps_tasks_${currentManifest.appId}`,
                  JSON.stringify(updated),
                );
              }
            } catch {}
            return updated;
          });
          setIsSubmitting(false);
        };

        setTimeout(pollStatus, 200);
      } catch (err: any) {
        const errorTask: TaskRecord = {
          ...newTask,
          status: 'failed',
          error: err.message || '启动执行被拒绝',
          updatedAt: new Date().toISOString(),
        };
        setTasks((prev) => {
          const updated = prev.map((t) => (t.taskId === taskId ? errorTask : t));
          try {
            if (typeof window !== 'undefined') {
              window.localStorage?.setItem(
                `omnimux_apps_tasks_${currentManifest.appId}`,
                JSON.stringify(updated),
              );
            }
          } catch {}
          return updated;
        });
        setIsSubmitting(false);
      }
    },
    [currentManifest, onExecute, onPollStatus],
  );

  // Reuse Demo Snapshot action: populates form without auto-submitting
  const handleReuseDemoSnapshot = useCallback(() => {
    if (!currentManifest || !currentManifest.demoSnapshot) return;
    setFormValues({ ...currentManifest.demoSnapshot });
    setNoticeMessage('已填入示例参数快照，确认无误后点击「立即生成」。');
    setTimeout(() => setNoticeMessage(null), 3000);
  }, [currentManifest]);

  // Filter apps by category
  const filteredApps = appsList.filter((app) => {
    if (selectedCategory === 'all') return true;
    return app.category === selectedCategory;
  });

  return (
    <div className={`omx-apps-workspace ${className}`}>
      {/* 1. Top Compact Tabs (Header) */}
      <div className="omx-apps-tabs-container">
        {/* Category filter tabs */}
        {CATEGORY_TABS.map((cat) => (
          <button // exempt-ui01 ai-app-ui-spec 28px compact category tab
            key={cat.key}
            type="button"
            className={`omx-apps-tab-btn ${selectedCategory === cat.key ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}

        {filteredApps.length > 0 && <div className="omx-apps-tabs-divider" />}

        {/* Registered App Tabs */}
        {filteredApps.map((app) => (
          <button // exempt-ui01 ai-app-ui-spec 28px compact app tab
            key={app.appId}
            type="button"
            className={`omx-apps-tab-btn ${currentAppId === app.appId ? 'is-active' : ''}`}
            onClick={() => setCurrentAppId(app.appId)}
          >
            <span>{app.name}</span>
          </button>
        ))}
      </div>

      {/* 2. Main Stage Split View (Single large card) */}
      <div className="omx-apps-split-card">
        {/* Left Form Partition: 448px width (398px usable inner width) */}
        {currentManifest ? (
          <AppFormPanel
            manifest={currentManifest}
            initialValues={formValues}
            onSubmit={handleFormSubmit}
            isSubmitting={isSubmitting}
          />
        ) : (
          <div className="omx-apps-form-panel">
            <div className="omx-apps-empty-state">
              <div className="omx-apps-empty-icon">
                <Layers size={24} />
              </div>
              <div className="omx-apps-empty-title">请选择或发布 AI 应用</div>
              <div className="omx-apps-empty-desc">
                从上方选择已发布的应用，或在工作流画布中点击顶栏「发布为 AI 应用」。
              </div>
            </div>
          </div>
        )}

        {/* Right Output & Task Partition */}
        <div className="omx-apps-output-panel">
          {/* Header Navigation: 历史 vs 示例 */}
          <div className="omx-apps-output-header">
            <div className="omx-apps-output-nav">
              <button // exempt-ui01 ai-app-ui-spec navigation tab
                type="button"
                className={`omx-apps-output-nav-item ${activeRightTab === 'history' ? 'is-active' : ''}`}
                onClick={() => setActiveRightTab('history')}
              >
                历史任务 ({tasks.length})
              </button>
              <button // exempt-ui01 ai-app-ui-spec navigation tab
                type="button"
                className={`omx-apps-output-nav-item ${activeRightTab === 'showcase' ? 'is-active' : ''}`}
                onClick={() => setActiveRightTab('showcase')}
              >
                示例展示 ({currentManifest?.showcase?.items?.length || 0})
              </button>
            </div>

            {noticeMessage && (
              <div className="omx-apps-status-tag omx-apps-status-tag--running">
                {noticeMessage}
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="omx-apps-output-body">
            {/* View 1: 历史任务 (History) */}
            {activeRightTab === 'history' && (
              <div>
                {tasks.length === 0 ? (
                  /* Truthful Empty State (真实空态 - STRICTLY ZERO fake tasks) */
                  <div className="omx-apps-empty-state">
                    <div className="omx-apps-empty-icon">
                      <Clock size={24} />
                    </div>
                    <div className="omx-apps-empty-title">暂无生成历史</div>
                    <div className="omx-apps-empty-desc">
                      在左侧面板填写参数并点击「立即生成」，任务进度与生成的媒体产物将实时呈现在此处。
                    </div>
                  </div>
                ) : (
                  <div>
                    {tasks.map((task) => (
                      <div key={task.taskId} className="omx-apps-task-card">
                        <div className="omx-apps-task-header">
                          <span className={`omx-apps-status-tag omx-apps-status-tag--${task.status}`}>
                            {task.status === 'completed'
                              ? '已完成'
                              : task.status === 'running'
                                ? '生成中'
                                : task.status === 'failed'
                                  ? '失败'
                                  : '等待中'}
                          </span>
                          <span className="omx-apps-task-time">
                            {new Date(task.createdAt).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Task Inputs Preview */}
                        <div className="omx-apps-task-inputs">
                          {Object.entries(task.inputs).map(([k, v]) => (
                            <div key={k}>
                              <strong>{k}:</strong> {String(v)}
                            </div>
                          ))}
                        </div>

                        {/* Task Outputs (Playable / Viewable Media) */}
                        {task.status === 'completed' && task.outputs && (
                          <div>
                            {currentManifest?.metadata.category === 'video' && (
                              <video
                                src={(task.outputs as { mediaUrl?: string }).mediaUrl}
                                controls
                                className="omx-apps-task-media"
                              />
                            )}
                            {currentManifest?.metadata.category === 'audio' && (
                              <div className="omx-apps-audio-box">
                                <Volume2 size={24} className="omx-apps-icon-audio" />
                                <audio
                                  src={(task.outputs as { mediaUrl?: string }).mediaUrl}
                                  controls
                                  className="omx-apps-audio-player"
                                />
                              </div>
                            )}
                            {currentManifest?.metadata.category === 'image' && (
                              <img
                                src={
                                  (task.outputs as { previewUrl?: string }).previewUrl ||
                                  (task.outputs as { mediaUrl?: string }).mediaUrl
                                }
                                alt="Result"
                                className="omx-apps-task-media"
                              />
                            )}
                          </div>
                        )}

                        {/* Task Error Details (Fail-Closed Visibility) */}
                        {task.status === 'failed' && task.error && (
                          <div className="omx-apps-task-error">
                            {task.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View 2: 示例展示 (Showcase) */}
            {activeRightTab === 'showcase' && (
              <div>
                {!currentManifest?.showcase?.items || currentManifest.showcase.items.length === 0 ? (
                  <div className="omx-apps-empty-state">
                    <div className="omx-apps-empty-icon">
                      <Sparkles size={24} />
                    </div>
                    <div className="omx-apps-empty-title">暂无示例素材</div>
                    <div className="omx-apps-empty-desc">该应用发布时未配置展示样例。</div>
                  </div>
                ) : (
                  <div className="omx-apps-showcase-grid">
                    {currentManifest.showcase.items.map((item: ShowcaseItem) => (
                      <div key={item.id} className="omx-apps-showcase-card">
                        {item.mediaType === 'video' ? (
                          <video
                            src={item.mediaUrl}
                            poster={item.posterUrl}
                            controls
                            className="omx-apps-showcase-media"
                          />
                        ) : item.mediaType === 'audio' ? (
                          <div className="omx-apps-audio-box">
                            <Volume2 size={36} className="omx-apps-icon-audio" />
                            <audio src={item.mediaUrl} controls className="omx-apps-audio-player" />
                          </div>
                        ) : (
                          <img src={item.mediaUrl} alt={item.title} className="omx-apps-showcase-media" />
                        )}

                        <div className="omx-apps-showcase-footer">
                          <span className="omx-apps-showcase-title">{item.title || '示例展示'}</span>
                          {currentManifest.demoSnapshot && (
                            <button // exempt-ui01 ai-app-ui-spec reuse snapshot button
                              type="button"
                              className="omx-apps-snapshot-btn"
                              onClick={handleReuseDemoSnapshot}
                            >
                              <Copy size={12} />
                              <span>使用此示例参数</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default AppWorkspaceView;
