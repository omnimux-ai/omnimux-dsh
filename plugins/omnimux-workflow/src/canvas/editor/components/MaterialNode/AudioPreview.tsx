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

  return (
    <div className="wf-audio nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <audio ref={audio} src={source} preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setError('audio.loadFailed'); }} />
      <div className="wf-audio__transport">
        <button type="button" className="wf-audio__button wf-audio__play" aria-label={t(playing ? 'audio.pause' : 'audio.play')} onClick={() => void toggle()}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
        <div className="wf-audio__timeline">
          <div className="wf-audio__wave">
            {peaks ? <svg viewBox="0 0 288 40" preserveAspectRatio="none" aria-hidden="true">
              <defs><clipPath id={clipId}><rect width={288 * progress} height="40" /></clipPath></defs>
              {[false, true].map((played) => <g key={String(played)} className={played ? 'wf-audio__played' : 'wf-audio__unplayed'} clipPath={played ? `url(#${clipId})` : undefined}>
                {peaks.map((peak, index) => <rect key={index} x={index * 288 / peaks.length} y={20 - peak * 19} width={Math.max(1, 288 / peaks.length - 1)} height={Math.max(0.5, peak * 38)} rx="0.5" />)}
              </g>)}
            </svg> : <div className="wf-audio__fallback" style={{ '--audio-progress': `${progress * 100}%` } as React.CSSProperties} />}
            <input className="wf-audio__seek" type="range" min="0" max={playableDuration || 1} step="0.1" value={Math.min(time, playableDuration)} disabled={!playableDuration}
              aria-label={`${t('audio.position')}${label ? `: ${label}` : ''}`} aria-valuetext={`${audioTime(time)} / ${audioTime(duration)}`}
              onChange={(event) => seek(Number(event.target.value))} />
          </div>
          <div className="wf-audio__time"><span>{audioTime(time)}</span><span>{duration ? audioTime(duration) : '--:--'}</span></div>
        </div>
      </div>
      <div className="wf-audio__status" role="status">
        <span>{t(fileMessage || error || waveStatus || (target ? 'audio.projectCopy' : 'audio.remote'))}</span>
        {waveFailed && !error && <button type="button" className="wf-audio__button" aria-label={t('audio.retry')} onClick={() => setRetry((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" /></button>}
      </div>
      <div className="wf-audio__files">
        {!target && onSave ? <button type="button" className="wf-audio__button wf-audio__save" disabled={busy} title={t('audio.remote')} onClick={() => void save()}><Download size={14} aria-hidden="true" />{t('audio.save')}</button> : <>
          <button type="button" className="wf-audio__button" disabled={!target || busy} title={t(target ? 'audio.openHint' : 'audio.remote')} aria-label={t('audio.open')} onClick={() => void fileAction('open')}><ExternalLink size={14} aria-hidden="true" /></button>
          <button type="button" className="wf-audio__button" disabled={!target || busy} title={t(target ? 'audio.revealHint' : 'audio.remote')} aria-label={t('audio.reveal')} onClick={() => void fileAction('reveal')}><FolderOpen size={14} aria-hidden="true" /></button>
        </>}
        {onReplace && <button type="button" className="wf-audio__button wf-audio__replace" aria-label={t('node.replace')} title={t('node.replace')} onClick={onReplace}><RefreshCw size={14} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}
