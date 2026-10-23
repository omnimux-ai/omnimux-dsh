import { Image, Button } from '../../controls';
import { useEffect, useState } from 'react';
import { resolveImageUrl, directorServices } from '../../services';
import type { DirectorScreenshot } from '../../scene-types';
export function DirectorScreenshotGallery({ screenshots, title = '相机截图', compact = false, onSelect, onDelete }: { screenshots: DirectorScreenshot[]; title?: string; compact?: boolean; onSelect?: (screenshot: DirectorScreenshot) => void | Promise<void>; onDelete?: (screenshotId: string) => void }) {
  return <section aria-label="相机截图" className={compact ? 'space-y-2' : 'space-y-2 border-t pt-3'} style={compact ? undefined : { borderColor: 'var(--director-sequencer-border)' }}>
    <h3 className="text-[13px] font-medium">{title}</h3>
    {screenshots.length ? <div className="grid grid-cols-2 gap-2">{screenshots.map(screenshot => <ScreenshotCard key={screenshot.id} screenshot={screenshot} compact={compact} onSelect={onSelect} onDelete={onDelete} />)}</div> : <p className="text-xs opacity-55">暂无截图</p>}
  </section>;
}
function ScreenshotCard({ screenshot, compact, onSelect, onDelete }: { screenshot: DirectorScreenshot; compact: boolean; onSelect?: (screenshot: DirectorScreenshot) => void | Promise<void>; onDelete?: (screenshotId: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; setFailed(false); setUrl(null);
    void resolveImageUrl(screenshot.storageKey, screenshot.url, { cacheMiss: true }).then(resolved => { if (active) setUrl(resolved); }).catch(error => { if (active) { setFailed(true); directorServices().props.adapters.notify?.('error', error instanceof Error ? error.message : '截图读取失败'); } });
    return () => { active = false; };
  }, [screenshot.storageKey, screenshot.url]);
  return <div className="min-w-0 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--director-sequencer-border)' }}>
    {url ? <Image src={url} alt={screenshot.name} width="100%" className={compact ? 'aspect-square rounded-lg object-cover' : 'aspect-video object-cover'} preview={{ mask: '查看' }} /> : <p role="status" className="p-2 text-xs">{failed ? '截图读取失败' : '正在读取截图'}</p>}
    <span className="block truncate px-2 py-1 text-xs" title={screenshot.name}>{screenshot.name}</span>
    {onSelect || onDelete ? <div className="flex gap-1 p-1">{onSelect ? <Button disabled={busy || !url} onClick={async () => { setBusy(true); try { await onSelect(screenshot); } finally { setBusy(false); } }}>用此构图</Button> : null}{onDelete ? <Button disabled={busy} danger onClick={() => onDelete(screenshot.id)}>删除</Button> : null}</div> : null}
  </div>;
}
