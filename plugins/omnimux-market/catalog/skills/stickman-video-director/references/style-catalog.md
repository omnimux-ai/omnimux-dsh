# 画风目录与角色锚定

三套画风。用户在设卡阶段选定其中一套；选定后六段全部沿用同一套环境定义与角色锚定。

英文段落是**写进提示词的原文**，逐字照写，不要改写同义句——改词会让模型改画风。

---

## 风格 1 · 经典极简（Classic Minimalist）

最纯粹的高对比火柴人。无面部五官、无服饰、无填充身体，靠高反差线条与少量饱和强调色穿透认知。适合硬核知识、逻辑拆解、思维模型。

两种底色，用户选一：

**1A 白底黑线（Light）**

> flat, uniform, digitally pure-white canvas with no shading, no textures, no gradients, and no 3D depth

**1B 黑底白线（Dark）**

> flat, uniform, pitch-black canvas with pure white line art

**角色锁定**

> hollow circular head, no facial features, no hair, no clothing, no filled body, stable proportions, uniform medium line weight

**配色**：全片不超过三个饱和强调色，只用日常颜色词（鲜红、电光蓝、暖金）。白底时必须坚持纯白平面画布，不得出现纹理、渐变或三维纵深。

**专属禁令**：不得出现阴影、渐变、纹理、立体感。

---

## 风格 2 · 角色锚定（Modern Beanie Zeke）

有固定角色形象的彩色火柴人，适合故事型与情绪型内容。**跨幕一致性是这套画风的命门**，靠逐字复用的角色锚定描述维持。

**第 1 段的角色锁定（完整版，首次出现用）**

> A minimalist 2D animated stick figure wearing a bright red beanie (smooth knit, no pom-pom) and a yellow t-shirt, with simple black stick limbs and shorts. Simple black lines, vibrant colors, smooth 2D animation style.

**第 2–6 段的角色锁定（复用版）**

> The same minimalist 2D animated stick figure in a bright red beanie and yellow shirt... Simple black lines, vibrant colors, smooth 2D animation style.

**必须同时写**：不得有细致的眼睛、瞳孔或写实五官——否则会出现「凸眼」变形。

**专属禁令**：`no photorealistic human skin, no 3D humanoid CGI models, no chaotic line glitches`

---

## 风格 3 · 科技棚拍（Modern Studio Tech）

纯白摄影棚 + 浅灰透视网格 + 青色玻璃质感界面元素。适合产品、工具、方法论类内容。

**环境定义**

> in a modern bright white studio space with subtle light-gray perspective grid lines on the floor plane. High-key studio lighting, clean white negative space, sleek glowing cyan and electric blue glass holographic UI elements.

**必须同时写的负面约束**

> STRICTLY MINIMALIST, NO CIRCUIT BOARD TEXTURES, NO SCI-FI WALL PANELS, NO CRACKED CONCRETE.

角色沿用风格 2 的锚定描述。

**专属禁令**：`strictly minimalist studio aesthetic, no circuit board textures, no sci-fi wall panels, no spaceship corridors, no cracked concrete, no grunge textures`

---

## 通用写法

**要「密度」不要「换风格」**，用这句：

> rapid scene changes, kinetic motion-graphic transformations, and frequent visual events, while preserving an identical stick-figure design, constant line weight, and strict temporal consistency

**不要写** `rapid style changes`——它会诱导模型改画法、改线宽、改角色设计。

**配色表达**：只用日常颜色词。**永远不要把色号、RGB、HSL、Pantone 写进提示词**——模型会把显眼的色彩标记当成界面文字原样画出来。

**画面文字**：默认禁止任何可见文字；需要的小字标（2–5 词）另列到后期叠加清单。
