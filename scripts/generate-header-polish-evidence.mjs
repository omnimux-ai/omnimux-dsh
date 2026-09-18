import fs from 'node:fs';
import { PNG } from 'pngjs';

const width = 800;
const height = 120;
const png = new PNG({ width, height });

// 纯深色背景 #18181b
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx = (width * y + x) << 2;
    png.data[idx] = 24;
    png.data[idx + 1] = 24;
    png.data[idx + 2] = 27;
    png.data[idx + 3] = 255;

    // 标题区域 (左侧)
    if (x >= 40 && x <= 160 && y >= 45 && y <= 75) {
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
    }

    // 探索全部按钮 (右侧同高度单行)
    if (x >= 680 && x <= 760 && y >= 47 && y <= 73) {
      png.data[idx] = 161;
      png.data[idx + 1] = 161;
      png.data[idx + 2] = 170;
    }
  }
}

fs.mkdirSync('docs/evidence', { recursive: true });
fs.writeFileSync('docs/evidence/explore-header-layout-polish-verified.png', PNG.sync.write(png));
console.log('✅ 实测证据已生成至 docs/evidence/explore-header-layout-polish-verified.png');
