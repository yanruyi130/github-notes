# github-notes
我的github的液态玻璃方案

## 天气玻璃 · Weather Glass

一个用 React、TypeScript 和 Vite 构建的天气与音乐工作台。手动切换晴、阴、雨、雪，拖动玻璃查看不同区域的折射，用材质面板逐层检查光学效果。应用无需位置权限、天气 API 或服务器。

### 运行

需要 Node.js 20.19+ 或 22.12+（20.x 或 22.x 及以上）。在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开终端中显示的本地地址。`pnpm build` 会先检查 TypeScript，再构建到 `dist/`。`pnpm preview` 用于检查构建产物。用 HTTP(S) 服务器打开应用，便于浏览器按来源保存曲库。

### 操作与存储

- 天气和形状各有独立选择器。拖动玻璃或在聚焦后用方向键移动，双击（触屏可双击轻点）或按 `Home` 复位。
- 点击右上角的材质图标，单独查看投影、模糊与色调、折射、环境着色、边缘高光和文字适配。滑动时即时更新画面。
- 可一次选择多个音频文件。新曲目会分配给当前天气，可在播放列表重新分配、选择或移除。本地分配优先于内置曲目。音乐经用户点击播放后开始。
- 音频文件和天气分配存储在 IndexedDB。天气、形状、音量、当前天气对应的选曲及氛围音开关存储在 localStorage。清除此站点的数据会移除本地曲库和偏好。
- 氛围声默认关闭，开启后可以独立调音。音乐分析与氛围音分开，不使用麦克风。系统开启减少动态效果时，天气与玻璃显示静态版本。

### 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx`、`src/style.css` | 响应式舞台、形状选择器、播放器及设置面板 |
| `src/config.ts` | 天气和内置曲目、SVG 轮廓、材质默认值 |
| `src/weather.ts` | Canvas 天气背景、场景调色和粒子 |
| `src/GlassStage.tsx`、`src/glassRenderer.ts` | 场景过渡、拖动、轮廓距离场、背景采样、折射和表面效果 |
| `src/audio.ts`、`src/audioEngine.ts` | 选曲逻辑、播放切换、音量和 Web Audio 分析 |
| `src/ambience.ts`、`src/musicDB.ts` | 原创程序化氛围音与浏览器本地曲库 |

### 新增主题、形状与曲目

- **天气**：在 `WEATHER_IDS` 和 `WEATHER` 添加 ID、名称、色彩、曲风及内置槽，在 `src/weather.ts` 设置调色、远景、天气粒子，并在 `src/ambience.ts` 添加声音参数。需要新图标时更新 `src/Icon.tsx`。
- **形状**：在 `src/config.ts` 扩展 `ShapeId` 和 `SHAPES`，给出名称及 `0 0 400 340` 坐标系内的闭合 SVG path。留一定边距，避免过细的轮廓。形状按钮、玻璃遮罩、计算折射用的距离场和高光共用该路径。
- **内置曲目**：将有权公开分发的音频放在 `public/music/`，为 `WEATHER[天气 ID].builtin` 填写 `title` 和 `src`。例如把 `src` 设为 `` `${import.meta.env.BASE_URL}music/track.mp3` ``。在素材许可说明中记录作者、来源、许可和署名。如果没有素材，保留 `builtin: null`。

| 天气 | 内置曲风方向 | 速度 |
| --- | --- | --- |
| 晴天 | 明亮轻钢琴、木吉他 | 90–105 BPM |
| 阴天 | 柔和钢琴、轻氛围铺底 | 65–80 BPM |
| 雨天 | Lo-fi 钢琴或轻柔节拍，避开明显雨声 | 70–85 BPM |
| 下雪 | 音乐盒、钟琴或轻弦乐 | 60–75 BPM |

四个内置槽暂为空。应用使用 Web Audio 节点与程序噪声实时合成风声、细雨声等环境音，没有随应用分发录音文件。用户上传的音乐仅保存在该用户的浏览器中。

### 参考与兼容性

液态玻璃的分层、边缘折射和适应背景的文字思路参考 [Glasswork](https://github.com/kubai087/glasswork)，Copyright (c) 2026 Kubai087，[MIT 许可证](https://github.com/kubai087/glasswork/blob/main/LICENSE)。本项目的天气图形、轮廓和渲染代码为独立实现，未包含 Glasswork 的素材。

场景背景和折射使用 Canvas 2D，无需 WebGL 或 SVG 背景滤镜。没有 Canvas `filter` 的浏览器使用邻域采样模糊。浏览器不支持 Web Audio 时，音乐仍可通过原生音频元素播放，频谱律动与氛围音需要 Web Audio。可播放的音频格式由浏览器决定。
