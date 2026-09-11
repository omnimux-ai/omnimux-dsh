import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Pause, Play, RefreshCw } from 'lucide-react';
import { useT, type DictKey } from '../../../i18n';
import { audioTime, loadAudioPeaks, projectAudioTarget } from '../../utils/audioWaveform';

export interface AudioPreviewProps {
  source: string;
  workspaceId?: string;
  label?: string;
  onSave?: () => Promise<void>;
  onReplace?: () => void;
}

/** The media element owns transport state; SVG only visualizes decoded samples. */
export default function AudioPreview({ source, workspaceId, label, onSave, onReplace }: AudioPreviewProps): React.ReactElement {
  const t = useT();
  const audio = useRef<HTMLAudioElement>(null);
  const alive = useRef(true);
  const actionController = useRef<AbortController | null>(null);
  const clipId = useId().replace(/:/g, '');
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [waveStatus, setWaveStatus] = useState<DictKey | null>('audio.metadata');
  const [waveFailed, setWaveFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<DictKey | null>(null);
  const [fileMessage, setFileMessage] = useState<DictKey | null>(null);
  const [busy, setBusy] = useState(false);
  const target = useMemo(() => projectAudioTarget(source, workspaceId, window.location.origin), [source, workspaceId]);
  const playableDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = playableDuration ? Math.min(1, Math.max(0, time / playableDuration)) : 0;

  useEffect(() => {
    alive.current = true;
    const media = audio.current;
    // StrictMode replays effects after cleanup; restore the declarative source.
    if (media) media.setAttribute('src', source);
    return () => {
      alive.current = false;
      actionController.current?.abort();
      if (media) {
        media.pause();
        media.removeAttribute('src');
        media.load();
      }
    };
  }, []);

  useEffect(() => {
    if (!duration) return;
    const controller = new AbortController();
    setPeaks(null);
    setWaveFailed(false);
    setWaveStatus('audio.decoding');
    void loadAudioPeaks(source, duration, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setPeaks(data);
      setWaveStatus(null);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      const code = cause instanceof Error ? cause.message : '';
      setWaveStatus(code === 'waveform-budget' ? 'audio.budget'
        : code === 'waveform-busy' ? 'audio.waveBusy' : 'audio.waveFailed');
      setWaveFailed(true);
    });
    return () => controller.abort();
  }, [source, duration, retry]);

  const toggle = async (): Promise<void> => {
    const media = audio.current;
    if (!media) return;
    if (!media.paused) { media.pause(); return; }
    setError(null);
    try {
      await media.play();
    } catch {
      if (alive.current) setError('audio.playFailed');
    }
  };

  const seek = (value: number): void => {
    const media = audio.current;
    if (!media || !playableDuration) return;
    media.currentTime = Math.min(playableDuration, Math.max(0, value));
    setTime(media.currentTime);
  };

  const fileAction = async (action: 'open' | 'reveal'): Promise<void> => {
    if (!target || actionController.current) return;
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(true);
    setError(null);
    setFileMessage(null);
    try {
      const response = await fetch(`/omnimux-workflow/api/workspaces/${encodeURIComponent(target.workspaceId)}/audio-file-action`, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, relativePath: target.relativePath }),
      });
      const body = await response.json() as { error?: string };
      if (!alive.current || controller.signal.aborted) return;
      if (!response.ok) {
        const messages: Record<string, DictKey> = {
          'audio-action-unsupported': 'audio.unsupported',
          'unsupported-audio': 'audio.invalidFile',
          'not-found': 'audio.missing',
          'audio-action-busy': 'audio.actionBusy',
        };
        setFileMessage(messages[body.error ?? ''] ?? 'audio.actionFailed');
        return;
      }
      setFileMessage(action === 'open' ? 'audio.opened' : 'audio.revealed');
    } catch {
      if (!controller.signal.aborted && alive.current) setFileMessage('audio.actionFailed');
    } finally {
      actionController.current = null;
      if (alive.current) setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!onSave || busy) return;
    setBusy(true);
    setError(null);
    setFileMessage('audio.saving');
    try {
      await onSave();
      if (alive.current) setFileMessage('audio.saved');
    } catch (cause) {
      if (!alive.current) return;
      const messages: Record<string, DictKey> = {
        'audio-save-budget': 'audio.saveBudget', 'audio-save-timeout': 'audio.saveTimeout',
        'audio-save-network': 'audio.saveNetwork', 'audio-save-source': 'audio.saveSource',
        'audio-save-busy': 'audio.saveBusy', 'unsupported-audio': 'audio.invalidFile',
        'audio-save-apply': 'audio.saveApply',
      };
      setFileMessage(messages[cause instanceof Error ? cause.message : ''] ?? 'audio.saveFailed');
    } finally { if (alive.current) setBusy(false); }
  };

  const statusKey = fileMessage || error || (waveFailed ? waveStatus : null);
  const statusText = statusKey ? t(statusKey) : '';

  return (
    <div className="wf-audio" onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <audio ref={audio} src={source} preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setError('audio.loadFailed'); }} />

      {/* 1. 顶部：全宽专业沉浸式波形区（对标图2：铺满卡片上半部，细腻胶囊柱条） */}
      <div className="wf-audio__timeline">
        <div
          className="wf-audio__wave"
          onClick={(event) => {
            if (!playableDuration) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width > 0) {
              const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              seek(ratio * playableDuration);
            }
          }}
        >
          {peaks ? (
            <svg viewBox="0 0 320 64" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id={clipId}>
                  <rect width={320 * progress} height="64" />
                </clipPath>
              </defs>
              {[false, true].map((played) => (
                <g
                  key={String(played)}
                  className={played ? 'wf-audio__played' : 'wf-audio__unplayed'}
                  clipPath={played ? `url(#${clipId})` : undefined}
                >
                  {peaks.map((peak, index) => {
                    const barHeight = Math.max(4, peak * 56);
                    const y = 32 - barHeight / 2;
                    const barWidth = Math.max(2, 320 / peaks.length - 2);
                    const x = (index * 320) / peaks.length;
                    return (
                      <rect
                        key={index}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="1.5"
                      />
                    );
                  })}
                </g>
              ))}
            </svg>
          ) : (
            <div className="wf-audio__fallback" style={{ '--audio-progress': `${progress * 100}%` } as React.CSSProperties} />
          )}
          <input
            className="wf-audio__seek"
            type="range"
            min="0"
            max={playableDuration || 1}
            step="0.1"
            value={Math.min(time, playableDuration)}
            disabled={!playableDuration}
            aria-label={`${t('audio.position')}${label ? `: ${label}` : ''}`}
            aria-valuetext={`${audioTime(time)} / ${audioTime(duration)}`}
            onChange={(event) => seek(Number(event.target.value))}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            style={{ pointerEvents: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0 }}
          />
        </div>
      </div>

      {/* 2. 底部：三段式平衡控制栏（左时间、中纯白圆形大播放键、右极简纯图标动作区） */}
      <div className="wf-audio__transport">
        {/* 左侧：时间进度 */}
        <div className="wf-audio__time">
          <span>{audioTime(time)}</span>
          <span className="wf-audio__time-sep">/</span>
          <span>{duration ? audioTime(duration) : '--:--'}</span>
        </div>

        {/* 居中：核心白色实心圆形大播放按钮（Hero Play Button） */}
        <button
          type="button"
          className="wf-audio__button wf-audio__play nodrag"
          aria-label={t(playing ? 'audio.pause' : 'audio.play')}
          onClick={(event) => {
            event.stopPropagation();
            void toggle();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {playing ? (
            <Pause size={16} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={16} fill="currentColor" aria-hidden="true" style={{ marginLeft: 2 }} />
          )}
        </button>

        {/* 右侧：纯图标极简动作区（对标图2：无多余文本，轻量纯图标下载） */}
        <div className="wf-audio__actions wf-audio__files">
          <div className="wf-audio__actions-left">
            {!target && onSave ? (
              <button
                type="button"
                className="wf-audio__button wf-audio__save nodrag"
                disabled={busy}
                title={t('audio.save')}
                aria-label={t('audio.save')}
                onClick={(event) => {
                  event.stopPropagation();
                  void save();
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Download size={18} aria-hidden="true" />
                <span className="wf-audio__btn-text">{t('audio.save')}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="wf-audio__button wf-audio__action nodrag"
                  disabled={!target || busy}
                  title={t(target ? 'audio.openHint' : 'audio.remote')}
                  aria-label={t('audio.open')}
                  onClick={(event) => {
                    event.stopPropagation();
                    void fileAction('open');
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="wf-audio__button wf-audio__action nodrag"
                  disabled={!target || busy}
                  title={t(target ? 'audio.revealHint' : 'audio.remote')}
                  aria-label={t('audio.reveal')}
                  onClick={(event) => {
                    event.stopPropagation();
                    void fileAction('reveal');
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <FolderOpen size={16} aria-hidden="true" />
                </button>
              </>
            )}
            <div className="wf-audio__status" role="status">
              {statusText ? <span>{statusText}</span> : null}
              {waveFailed && !error && (
                <button
                  type="button"
                  className="wf-audio__button wf-audio__retry nodrag"
                  aria-label={t('audio.retry')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRetry((value) => value + 1);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          {onReplace && (
            <button
              type="button"
              className="wf-audio__button wf-audio__replace nodrag"
              aria-label={t('node.replace')}
              title={t('node.replace')}
              onClick={(event) => {
                event.stopPropagation();
                onReplace();
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
