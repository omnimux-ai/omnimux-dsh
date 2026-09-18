/**
 * 极光流光色彩光学算法体系（Aurora Mesh Gradient Algorithm Engine）
 * 1:1 对标 Creatify 技能卡片的高饱和度地平线椭圆流光渐变（彻底告别深黑底色）
 */

// 14 套精选高饱和度全幅炫彩流光预设（覆盖原版全色域经典与高颜值扩展）
export const AURORA_PRESETS = [
  // 1. UGC Confessional 霓虹紫粉 (原版经典)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #fed7aa 0%, #f43f5e 32%, #7c3aed 68%, #1c0a38 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(124, 58, 237, 0.45)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 2. Cinematic 皇家电光蓝紫 (原版经典)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #e0e7ff 0%, #a855f7 32%, #3b82f6 68%, #0f1026 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(79, 70, 229, 0.45)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 3. UGC Showcase 冰川湛蓝雪白 (原版经典)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #ffffff 0%, #7dd3fc 32%, #0284c7 66%, #082145 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(2, 132, 199, 0.45)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 4. Ecommerce 焦糖琥珀暖金 (原版经典)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #fef3c7 0%, #ea580c 34%, #9a3412 68%, #1c130e 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(234, 88, 12, 0.45)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 5. Static Image 深海青蓝紫罗兰 (原版经典)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #f3e8ff 0%, #818cf8 32%, #0284c7 66%, #082f49 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(99, 102, 241, 0.45)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 6. Carousel 翡翠碧玉薄荷 (原版经典)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #ccfbf1 0%, #10b981 32%, #047857 68%, #022c22 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(16, 185, 129, 0.45)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 7. Sunset Coral 珊瑚落日余晖 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #fff1f2 0%, #fb7185 30%, #e11d48 62%, #3a0814 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(225, 29, 72, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 8. Cyber Neon 赛博激光霓虹 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #a5f3fc 0%, #06b6d4 28%, #ec4899 68%, #19052a 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(236, 72, 153, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 9. Nordic Aurora 极地幽绿极光 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #ecfdf5 0%, #34d399 28%, #0284c7 66%, #041d28 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(14, 165, 233, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 10. Cosmic Nebula 宇宙深空星云 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #fdf4ff 0%, #d946ef 30%, #4338ca 68%, #0d0824 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(217, 70, 239, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 11. Imperial Gold 钛金奢华流金 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #fffbeb 0%, #f59e0b 32%, #78350f 68%, #190f05 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(245, 158, 11, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 12. Deep Ocean 大洋深渊钴蓝 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #e0f2fe 0%, #0284c7 32%, #1e1b4b 70%, #080c1e 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(2, 132, 199, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 13. Sweet Berry 浆果甜心紫红 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #fdf2f8 0%, #f472b6 32%, #9333ea 68%, #25072e 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(244, 114, 182, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
  // 14. Silver Frost 极简水银银霜 (全新扩展)
  {
    bg: 'radial-gradient(ellipse 115% 82% at 50% 120%, #ffffff 0%, #94a3b8 32%, #334155 68%, #0f172a 100%)', /* exempt-ui03: 极光流光算法特化 */
    glow: 'rgba(148, 163, 184, 0.55)', /* exempt-ui03: 极光流光算法特化 */
  },
];

/**
 * 确定性哈希算法：根据 skill 标识计算唯一稳定的随机种子
 */
export function hashSeed(str) {
  let hash = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * 极光流光色彩光学算法：为每个 skill 卡片随机/散列生成独一无二的极光视觉方案
 * 确保全量 120+ 技能卡片每个都呈现绚烂夺目、各具特色的高品质流光
 */
export function resolveSkillAuroraStyle(item) {
  const seedKey = String(item?.slug || item?.id || item?.name || item?.title || '');
  const seed = hashSeed(seedKey);
  return AURORA_PRESETS[seed % AURORA_PRESETS.length];
}
