import { Button, DropdownSelect } from '../kit.js'
import { MAX_IMAGES } from '../lib/mode-assets.js'
import { RecoverableMedia } from './RecoverableMedia.jsx'

/**
 * 爆款复刻表单：一张素材卡 + 一个提示词开关 + 参数卡只留清晰度。
 *
 * 为什么没有画幅选择与参考时长：复刻的输出时长与画幅跟随参考片，
 * 由拆解结果决定（见 lib/recreate.js 的 recreateBody），不是用户手填项。
 *
 * 表单本身不发请求、不做进度；拆解与提交由 MotionPanel 编排，
 * 因此这里所有回调都只是把用户动作交回去。
 *
 * @param {{
 *   assets: { video: any, images: any[], prompt: string, promptOn: boolean },
 *   resolution: string,
 *   resolutions: string[],
 *   onResolution: (value: string) => void,
 *   options: any,
 *   checking: boolean,
 *   disabled: boolean,
 *   uploading: boolean,
 *   onVideoSlot: () => void,
 *   onImageSlot: () => void,
 *   onRemoveVideo: () => void,
 *   onRemoveImage: (index: number) => void,
 *   onUploadVideo: (file: File) => void,
 *   onUploadImage: (files: File[]) => void,
 *   onPromptOn: (value: boolean) => void,
 *   onPrompt: (value: string) => void,
 * }} props
 */
export function RecreateForm(props) {
  const { assets, resolution, resolutions, onResolution, options, checking, disabled, uploading } = props
  const { video, images, prompt, promptOn } = assets
  const full = images.length >= MAX_IMAGES
  const locked = disabled || uploading

  const dropVideo = (event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file?.type?.startsWith('video/')) props.onUploadVideo(file)
  }
  const dropImage = (event) => {
    event.preventDefault()
    const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type?.startsWith('image/'))
    if (files.length) props.onUploadImage(files)
  }

  return <>
    <section className="omx-avatar-block">
      <div className="omx-avatar-block-head">
        <span className="omx-avatar-block-title">素材</span>
        <span className="omx-avatar-block-meta">{`图片 ${images.length} / ${MAX_IMAGES}`}</span>
      </div>
      <div className="omx-avatar-block-body omx-avatar-material-slots">
        <div className="omx-avatar-material-slot">
          {video
            ? <>
              <RecoverableMedia video src={video.url} controls muted preload="metadata" />
              <div className="omx-avatar-pane-tools">
                <span>参考视频</span>
                <Button disabled={locked} onClick={props.onRemoveVideo}>移除视频</Button>
              </div>
            </>
            : null}
          <button type="button" /* exempt-ui01: 参考素材槽为多行复合入口 */ className="omx-avatar-material-trigger" aria-label="添加参考视频" disabled={locked} onClick={props.onVideoSlot} onDragOver={(event) => event.preventDefault()} onDrop={dropVideo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/></svg>
            <span>{video ? '更换参考视频' : '添加参考视频，拆解爆款结构'}</span>
            <small>视频时长：4 至 30 秒</small>
          </button>
        </div>
        <div className="omx-avatar-material-slot">
          {images.length
            ? <div className="omx-avatar-selected-images">
              {images.map((item, index) => (
                <div key={item.id} className="omx-avatar-selected-image">
                  <RecoverableMedia compact className="omx-avatar-material-thumb" src={item.url} alt={item.name} />
                  <span>{`图片 ${index + 1}`}</span>
                  <Button aria-label={`移除图片 ${index + 1}`} disabled={locked} onClick={() => props.onRemoveImage(index)}>移除</Button>
                </div>
              ))}
            </div>
            : null}
          <button type="button" /* exempt-ui01: 参考素材槽为多行复合入口 */ className="omx-avatar-material-trigger" aria-label="添加参考图片" disabled={locked || full} onClick={props.onImageSlot} onDragOver={(event) => event.preventDefault()} onDrop={dropImage}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>
            <span>{images.length ? '添加更多参考图片' : '添加角色、产品或服饰图片'}</span>
            <small>{`最多 ${MAX_IMAGES} 张参考图片`}</small>
          </button>
        </div>
        <p className="omx-avatar-recreate-note">参考视频仅用于拆解，不会提交给视频模型</p>
      </div>
    </section>

    <section className="omx-avatar-block">
      <div className="omx-avatar-block-head">
        <span className="omx-avatar-block-title">提示词</span>
        <Button aria-pressed={promptOn} disabled={locked} onClick={() => props.onPromptOn(!promptOn)}>{promptOn ? '补充说明：已开启' : '补充说明：关闭'}</Button>
      </div>
      {promptOn
        ? <div className="omx-avatar-block-body">
          <textarea className="omx-avatar-recreate-prompt" aria-label="补充说明" rows={4} value={prompt} disabled={locked} placeholder="说明这次复刻要保留什么、换成什么" onChange={(event) => props.onPrompt(event.target.value)} />
        </div>
        : null}
    </section>

    <div className="omx-avatar-recreate-params">
      <div className="omx-avatar-field">
        <DropdownSelect
          aria-label="清晰度"
          placeholder="清晰度"
          value={resolution}
          disabled={locked || !options || checking}
          options={resolutions.map((value) => ({ value, label: value }))}
          onChange={onResolution}
        />
      </div>
    </div>
  </>
}
