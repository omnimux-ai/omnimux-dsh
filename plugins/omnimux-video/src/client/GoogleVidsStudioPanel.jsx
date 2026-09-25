import React, { useState, useEffect } from 'react';

/**
 * Google Vids (Veo) 视频生成工作台中枢主组件 (中间页形态)
 * 实现：
 * 1. 首次进入环境开箱就绪向导 (Onboarding Wizard)
 * 2. 剪辑项目准入状态硬门禁自愈条 (GateBanner)
 * 3. 任务时间线生成记录流 (TimelineFeed)
 * 4. 底部四大模式收纳型创作抽屉 (PromptDrawer)
 * 5. 跨组件状态联动 (插入轨道/延续扩展/编辑修改/画质升频/重新创建/移除)
 */
export function GoogleVidsStudioPanel({ onInsertToTimeline, isEditorReady = false, onOpenProject }) {
  // 向导就绪状态
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [wizardSteps, setWizardSteps] = useState({
    1: true,  // 驱动引擎
    2: true,  // 浏览器安全桥接
    3: true,  // Google 账号登录态
    4: isEditorReady // 剪辑工程
  });

  // 四大模式：'create' | 'modify' | 'animate' | 'extend'
  const [currentMode, setCurrentMode] = useState('create');
  const [promptText, setPromptText] = useState('');
  const [attachedAsset, setAttachedAsset] = useState(null);

  // 任务时间线列表
  const [tasks, setTasks] = useState([
    {
      id: 'task_demo_skincare',
      title: '韩国极简防晒美学成片',
      videoUrl: './media/google_vids_korean_skincare.mp4',
      status: 'completed',
      durationSec: 10,
      resolution: '720p',
      isUpscaled: false
    }
  ]);

  // 监听剪辑工程就绪态同步更新向导第4步
  useEffect(() => {
    setWizardSteps((prev) => ({ ...prev, 4: isEditorReady }));
  }, [isEditorReady]);

  // 模式切换
  const handleSwitchMode = (mode, asset = null) => {
    setCurrentMode(mode);
    setAttachedAsset(asset);
    if (mode === 'extend') {
      setPromptText('添加您的视频，然后描述接下来会发生什么。');
    } else if (mode === 'modify') {
      setPromptText('请描述您想进行的更改（例如调整背景光影或服装风格）。');
    } else if (mode === 'animate') {
      setPromptText('添加您的图片，然后描述视频中应展现的情节与运动细节。');
    } else {
      setPromptText('');
    }
  };

  // 触发生成任务
  const handleSubmitTask = () => {
    if (!isEditorReady || !promptText.trim()) return;

    const newTaskId = `task_${Date.now()}`;
    const newTask = {
      id: newTaskId,
      title: promptText.slice(0, 16),
      status: 'generating',
      progress: 3,
      durationSec: 10,
      resolution: '720p'
    };

    setTasks([newTask, ...tasks]);

    // 模拟后台静默生成进度流动
    let p = 3;
    const timer = setInterval(() => {
      p += 20;
      if (p >= 100) {
        clearInterval(timer);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === newTaskId
              ? {
                  ...t,
                  status: 'completed',
                  videoUrl: './media/google_vids_puppy.mp4',
                  title: '金毛幼犬草地奔跑成片'
                }
              : t
          )
        );
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === newTaskId ? { ...t, progress: p } : t))
        );
      }
    }, 400);
  };

  // 触发升频
  const handleUpscale = (taskId) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'generating', progress: 12, isUpscaling: true } : t
      )
    );
    let p = 12;
    const timer = setInterval(() => {
      p += 25;
      if (p >= 100) {
        clearInterval(timer);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: 'completed', isUpscaled: true, resolution: '1080p' }
              : t
          )
        );
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, progress: p } : t))
        );
      }
    }, 350);
  };

  // 移除任务卡片
  const handleRemoveTask = (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <div className="gvids-studio-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--dsw-alias-bg-base)' }}>
      {/* 顶部硬门禁提示条 */}
      {!isEditorReady && (
        <div style={{ background: 'var(--dsw-alias-bg-layer-2)', borderBottom: '1px solid var(--dsw-alias-state-warning-primary)', padding: '10px 16px', fontSize: '12.5px', color: 'var(--dsw-alias-state-warning-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ <strong>请新建或打开项目，进入编辑器页面后方可提交生成</strong></span>
          {onOpenProject && (
            <button onClick={onOpenProject} style={{ padding: '3px 8px', fontSize: '11px', background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-base)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              右侧进入项目
            </button>
          )}
        </div>
      )}

      {/* 时间线生成流 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' }}>生成记录时间线 ({tasks.length})</span>
          <button onClick={() => setOnboardingOpen(true)} style={{ background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-brand-primary)', padding: '3px 8px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer' }}>
            ⚙️ 开箱向导
          </button>
        </div>

        {tasks.map((task) => (
          <div key={task.id} style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dsw-alias-bg-base)' }}>
            {task.status === 'generating' ? (
              <div style={{ padding: '16px', background: 'var(--dsw-alias-bg-layer-2)' }}>
                <div style={{ fontSize: '24px', fontWeight: 600 }}>{task.progress}%</div>
                <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginTop: '4px' }}>
                  {task.isUpscaling ? '正在执行 4K 超分辨率与帧率升频...' : '正在通过 ego 独立沙箱调用 Veo 大模型渲染...'}
                </div>
                <div style={{ height: '4px', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: '2px', overflow: 'hidden', marginTop: '10px' }}>
                  <div style={{ height: '100%', width: `${task.progress}%`, background: task.isUpscaling ? 'var(--dsw-alias-success)' : 'var(--dsw-alias-brand-primary)', transition: 'width 0.3s' }} />
                </div>
              </div>
            ) : (
              <div>
                <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--dsw-alias-bg-base)' }}>
                  <video src={task.videoUrl} loop muted autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', right: '10px', bottom: '10px', background: 'var(--dsw-alias-bg-mask-1)', color: 'var(--dsw-alias-label-primary-inverted)', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                    {task.resolution} • 0:10 {task.isUpscaled ? '(已升频)' : ''}
                  </div>
                </div>
                {/* 动作栏 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--dsw-alias-bg-layer-1)', borderTop: '1px solid var(--dsw-alias-border-l1)' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => onInsertToTimeline && onInsertToTimeline(task)}
                      style={{ background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-brand-primary)', border: 'none', padding: '5px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ← 插入
                    </button>
                    <button onClick={() => handleSwitchMode('extend', task.videoUrl)} style={{ background: 'transparent', border: 'none', padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}>
                      ⧉ 延续
                    </button>
                    <button onClick={() => handleSwitchMode('modify', task.videoUrl)} style={{ background: 'transparent', border: 'none', padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}>
                      ✎ 编辑
                    </button>
                    <button onClick={() => handleUpscale(task.id)} style={{ background: 'transparent', border: 'none', padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}>
                      ⛶ 升频
                    </button>
                  </div>
                  <button onClick={() => handleRemoveTask(task.id)} style={{ background: 'transparent', border: 'none', color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', cursor: 'pointer' }}>
                    🗑 移除
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部收纳型创作抽屉 */}
      <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', padding: '14px', background: 'var(--dsw-alias-bg-base)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Tab 导航 */}
        <div style={{ display: 'flex', background: 'var(--dsw-alias-bg-layer-2)', padding: '3px', borderRadius: '20px', width: 'fit-content', gap: '2px' }}>
          {['create', 'modify', 'animate', 'extend'].map((m) => (
            <button
              key={m}
              onClick={() => handleSwitchMode(m)}
              style={{
                border: 'none',
                background: currentMode === m ? 'var(--dsw-alias-bg-base)' : 'transparent',
                color: currentMode === m ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: currentMode === m ? 600 : 500
              }}
            >
              {m === 'create' ? '创建' : m === 'modify' ? '修改' : m === 'animate' ? '添加动画' : '扩展'}
            </button>
          ))}
        </div>

        {/* 提示词输入 */}
        <textarea
          disabled={!isEditorReady}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={
            !isEditorReady
              ? '请先在右侧打开或新建剪辑工程...'
              : currentMode === 'create'
              ? '描述您的视频。您可以添加品牌图片、角色等素材。'
              : promptText
          }
          style={{ width: '100%', minHeight: '60px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l1)', padding: '8px 10px', fontSize: '12.5px', resize: 'none', outline: 'none' }}
        />

        {/* 底部参数与生成按钮 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '16px', padding: '4px 10px', fontSize: '11.5px', color: 'var(--dsw-alias-label-primary)' }}>
            Omni • 720p • 横屏 16:9 • 10s
          </div>
          <button
            disabled={!isEditorReady || !promptText.trim()}
            onClick={handleSubmitTask}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: !isEditorReady || !promptText.trim() ? 'var(--dsw-alias-bg-layer-3)' : 'var(--dsw-alias-brand-primary)',
              color: 'var(--dsw-alias-label-primary-inverted)',
              border: 'none',
              cursor: !isEditorReady || !promptText.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
