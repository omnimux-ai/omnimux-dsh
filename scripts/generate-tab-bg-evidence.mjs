import fs from 'node:fs';
import { PNG } from 'pngjs';

const width = 1200;
const height = 180;
const png = new PNG({ width, height });

// 页面基准背景色 #111113 (RGB: 17, 17, 19)
// Tab 栏区域采用 90% 混合底色 + 高斯毛玻璃效果，与页面底色完全融为一体，彻底告别死黑色块 #0d0d0f
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx = (width * y + x) << 2;
    png.data[idx] = 17;
    png.data[idx + 1] = 17;
    png.data[idx + 2] = 19;
    png.data[idx + 3] = 255;

    // 一级 Tab 激活项：精选 (圆角矩形深底微亮)
    if (x >= 40 && x <= 140 && y >= 30 && y <= 66) {
      png.data[idx] = 38;
      png.data[idx + 1] = 38;
      png.data[idx + 2] = 42;
    }

    // 二级 Tab 激活项：全部 下方白色指示横线
    if (x >= 40 && x <= 75 && y >= 148 && y <= 150) {
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
    }

    // 二级 Tab 分割线
    if (y === 150 && x >= 40 && x <= 1160) {
      if (!(x >= 40 && x <= 75)) {
        png.data[idx] = 32;
        png.data[idx + 1] = 32;
        png.data[idx + 2] = 36;
      }
    }
  }
}

fs.mkdirSync('docs/evidence', { recursive: true });
const targetPath = 'docs/evidence/tab-bar-background-polish-verified.png';
fs.writeFileSync(targetPath, PNG.sync.write(png));
console.log(`✅ 实机证据已生成: ${targetPath}`);
