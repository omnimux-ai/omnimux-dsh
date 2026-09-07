/**
 * MiniMax 进阶版 8 段非线性长拖尾彗星流光图层 (AnimatedBeam)
 *
 * 核心升级参数：
 * - EDGE_FLOW_PULSE_LENGTH_PX = 64 (加长能量彗星拖尾总长，由 36px 扩展至 64px)
 * - EDGE_FLOW_GAP_LENGTH_PX = 186 (拉宽脉冲间隙，由 120px 扩展至 186px，单周期 250px)
 * - EDGE_FLOW_SEGMENT_COUNT = 8 (8 段微元渐变，拖尾过渡极致丝滑)
 * - EDGE_FLOW_SPEED_PX_PER_SECOND = 108 (108px/s 恒定物理流速)
 * - EDGE_FLOW_TAIL_WIDTH = 0.9 (尾尖 0.9px 渐细)
 * - EDGE_FLOW_HEAD_WIDTH = 3.0 (头部 3.0px 高亮核)
 * - EDGE_FLOW_TAIL_OPACITY = 0.16 (尾部极致渐隐)
 * - EDGE_FLOW_HEAD_OPACITY = 0.98 (头部高能量)
 * - taperedProgress = progress ** 1.4 (非线性长拖尾指数曲线)
 * - 纯流光叠加层：不侵入底层静态连线颜色，100% 保持深浅色底轨。
 */

import { useId, useRef, useState, useEffect, useMemo, memo } from 'react';

export interface AnimatedBeamProps {
  /** SVG path d 值 */
  pathD: string;
  /** 路径起点坐标 */
  startPoint?: { x: number; y: number };
  /** 路径终点坐标 */
  endPoint?: { x: number; y: number };
  /** 自定义动画时长（秒） */
  duration?: number;
  /** 动画延迟（秒） */
  delay?: number;
  /** 是否反向流动 */
  reverse?: boolean;
  /** 附加 className */
  className?: string;
}

// 进阶物理常量：加长拖尾 (64px) + 拉宽间隙 (186px) + 8 段微元平滑过渡
const EDGE_FLOW_SPEED_PX_PER_SECOND = 108; // 108px/s 恒定物理流速
const EDGE_FLOW_PULSE_LENGTH_PX = 64;       // 64px 加长能量微元总长
const EDGE_FLOW_GAP_LENGTH_PX = 186;        // 186px 脉冲间隔
const EDGE_FLOW_PERIOD_PX = EDGE_FLOW_PULSE_LENGTH_PX + EDGE_FLOW_GAP_LENGTH_PX; // 250px 周期
const EDGE_FLOW_SEGMENT_COUNT = 8;          // 8 段微元无缝拼接
const EDGE_FLOW_TAIL_WIDTH = 0.9;
const EDGE_FLOW_HEAD_WIDTH = 3.0;
const EDGE_FLOW_TAIL_OPACITY = 0.16;
const EDGE_FLOW_HEAD_OPACITY = 0.98;

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  pathD,
  startPoint,
  endPoint,
  duration,
  delay = 0,
  reverse = false,
  className,
}) => {
  const id = useId();
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const filterId = `beam-comet-glow-${safeId}`;
  const flowAnimationName = `beam-flow-${safeId}`;
  const breatheAnimationName = `beam-breathe-${safeId}`;

  // 第 0 帧默认估算弧长
  const initialEstimate = useMemo(() => {
    if (startPoint && endPoint) {
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      return Math.max(250, Math.hypot(dx, dy) * 1.15);
    }
    return 250;
  }, [startPoint, endPoint]);

  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState<number>(initialEstimate);

  useEffect(() => {
    if (pathRef.current) {
      try {
        const len = pathRef.current.getTotalLength();
        if (Number.isFinite(len) && len > 0) {
          setPathLength(len);
        }
      } catch {
        // SVG detached fallback
      }
    }
  }, [pathD]);

  // 8 段彗星微元几何与动画计算
  const { segments, calculatedDuration, periodPx } = useMemo(() => {
    const effectiveLength = pathLength > 0 ? pathLength : initialEstimate;
    const cycles = Math.max(1, Math.round(effectiveLength / EDGE_FLOW_PERIOD_PX));
    const actualPeriod = effectiveLength / cycles;
    
    // 脉冲与间隙等比放缩至当前周期网格
    const pulseLength = actualPeriod * (EDGE_FLOW_PULSE_LENGTH_PX / EDGE_FLOW_PERIOD_PX);
    const segLength = pulseLength / EDGE_FLOW_SEGMENT_COUNT;
    const computedSec = duration ?? Math.max(0.5, actualPeriod / EDGE_FLOW_SPEED_PX_PER_SECOND);

    const segs = Array.from({ length: EDGE_FLOW_SEGMENT_COUNT }, (_, index) => {
      const progress = index / (EDGE_FLOW_SEGMENT_COUNT - 1); // 0 (tail tip) -> 1 (head spark)
      const taperedProgress = progress ** 1.4; // 彗星长拖尾非线性指数
      const coreWidth = EDGE_FLOW_TAIL_WIDTH + (EDGE_FLOW_HEAD_WIDTH - EDGE_FLOW_TAIL_WIDTH) * taperedProgress;
      const haloWidth = coreWidth + 1.4;
      const opacity = EDGE_FLOW_TAIL_OPACITY + (EDGE_FLOW_HEAD_OPACITY - EDGE_FLOW_TAIL_OPACITY) * taperedProgress;

      // 负向延迟对齐，8 段严密拼接成 64px 长拖尾彗星
      const segmentTimeOffsetSec = -(index * (computedSec / actualPeriod) * segLength);

      return {
        index,
        progress,
        taperedProgress,
        coreWidth,
        haloWidth,
        opacity,
        dashArray: `${segLength} ${actualPeriod - segLength}`,
        timeDelay: delay + segmentTimeOffsetSec,
      };
    });

    return {
      segments: segs,
      calculatedDuration: computedSec,
      periodPx: actualPeriod,
    };
  }, [pathLength, initialEstimate, duration, delay]);

  // CSS 关键帧：流光位移 + 1600ms 正弦呼吸
  const styleContent = `
    @keyframes ${flowAnimationName} {
      from { stroke-dashoffset: ${reverse ? -periodPx : 0}px; }
      to { stroke-dashoffset: ${reverse ? 0 : -periodPx}px; }
    }
    @keyframes ${breatheAnimationName} {
      0%, 100% { opacity: 0.88; }
      50% { opacity: 1.0; }
    }
  `;

  return (
    <g className={className} pointerEvents="none">
      <defs>
        {/* CSS GPU 加速关键帧 */}
        <style>{styleContent}</style>

        {/* 彗星头部高能量电晕发光滤镜 */}
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 隐藏测量辅助路径 */}
      <path
        ref={pathRef}
        d={pathD}
        fill="none"
        stroke="none"
      />

      {/* 8 段长拖尾彗星流光图层 */}
      <g
        style={{
          animation: `${breatheAnimationName} 1.6s ease-in-out infinite`,
        }}
      >
        {segments.map((seg) => {
          const isHead = seg.index >= 5;
          return (
            <g key={seg.index}>
              {/* 外层 Halo 辉光（头部高能微元） */}
              {isHead && (
                <path
                  d={pathD}
                  stroke="var(--wb-beam-glow, #7961f2)"
                  strokeWidth={seg.haloWidth}
                  strokeLinecap="round"
                  strokeDasharray={seg.dashArray}
                  fill="none"
                  filter={`url(#${filterId})`}
                  opacity={seg.opacity * 0.75}
                  style={{
                    animation: `${flowAnimationName} ${calculatedDuration}s linear ${seg.timeDelay}s infinite`,
                    willChange: 'stroke-dashoffset',
                  }}
                />
              )}

              {/* 核心彗星能量微元（尾部渐细电紫，头部高亮香芋紫） */}
              <path
                d={pathD}
                stroke={seg.index === 7 ? 'var(--wb-beam-start, #b8b7ff)' : 'var(--wb-beam-end, #7961f2)'}
                strokeWidth={seg.coreWidth}
                strokeLinecap="round"
                strokeDasharray={seg.dashArray}
                fill="none"
                opacity={seg.opacity}
                filter={seg.index === 7 ? `url(#${filterId})` : undefined}
                style={{
                  animation: `${flowAnimationName} ${calculatedDuration}s linear ${seg.timeDelay}s infinite`,
                  willChange: 'stroke-dashoffset',
                }}
              />
            </g>
          );
        })}
      </g>
    </g>
  );
};

export default memo(AnimatedBeam);
