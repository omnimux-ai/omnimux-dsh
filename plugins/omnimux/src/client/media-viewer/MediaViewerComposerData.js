/**
 * 级联模型目录（品牌 ➔ 型号 ➔ 渠道与版本），完全对齐画布节点规范
 */
export const DEFAULT_CASCADE_MODELS = [
  {
    brandId: 'seedance',
    brandName: 'Seedance',
    models: [
      {
        id: 'seedance-2.0',
        name: 'Seedance 2.0',
        desc: '480p/720p/1080p/4k · 4-15s · 有声',
        channels: [
          { id: 'flagship', name: '旗舰版', price: '≈9.8 积分', tag: '满血出片 · 按次专线', billing: '按条计费', ratio: '×3.33', checked: true },
          { id: 'official', name: '官方版', price: '≈4.9 积分', tag: '官方原厂直签 · 极稳高画质', billing: '按秒计费' },
          { id: 'pro', name: '优选版', price: '≈5.7 积分', tag: '精品专线 · 极稳高画质', billing: '按秒计费', ratio: '×1.18' },
          { id: 'standard', name: '标准版', price: '≈4.9 积分', tag: '主流专线 · 官方原生', billing: '按秒计费' },
          { id: 'eco', name: '经济版', price: '≈1.5 积分', tag: '经济走量 · 按条计费', billing: '按条计费', discount: '5 折' },
        ],
      },
      {
        id: 'seedance-2.5',
        name: 'Seedance 2.5',
        desc: '480p-1080p · 4-30s/自动 · 有声',
        channels: [
          { id: 'flagship', name: '旗舰版', price: '≈12 积分', tag: '满血出片 · 超高清', billing: '按条计费' },
          { id: 'official', name: '官方版', price: '≈6.5 积分', tag: '官方直签', billing: '按秒计费' },
        ],
      },
    ],
  },
  {
    brandId: 'minimax',
    brandName: 'MiniMax',
    models: [
      {
        id: 'minimax-video-01',
        name: 'Video-01 Director',
        desc: '大动作高动态运镜 · 平滑无瑕',
        channels: [
          { id: 'official', name: '原生高清集群', price: '≈8 积分', tag: '低延迟专线', billing: '按次计费' },
        ],
      },
    ],
  },
  {
    brandId: 'openai',
    brandName: 'OpenAI',
    models: [
      {
        id: 'gpt-image-2.5',
        name: 'GPT Image 2',
        desc: '4K 照片级超强质感 · 语义完全对齐',
        channels: [
          { id: 'flare', name: '极速直连专线', price: '≈6 积分', tag: '速度优先', billing: '按张计费' },
          { id: 'official', name: '官方稳定通道', price: '≈8 积分', tag: '高可用', billing: '按张计费' },
        ],
      },
    ],
  },
];
