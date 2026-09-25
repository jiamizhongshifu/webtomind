/**
 * Hero 几何视觉 — 等距（isometric）模块化方块拼装结构。
 *
 * 依据 design.md：block-like / modular / construction 的概念图，
 * 无色基调（黑白灰，多面用「平涂色块」区分而非渐变），点缀 Action Green / Alert Yellow，
 * 全部黑色描边（强边框）。概念：散落的素材方块（卫星）沿虚线「组合」进中心主结构，
 * 中点的 + 标记表「拼装」，呼应 WebToMind「按 slot 组合素材一键生成」。
 *
 * 富化层（v2）：中心金字塔 + 四枚漂浮卫星方块 + 组合虚线/＋ 标记
 *   + 技术感装饰（背景虚线环、角点定位标记、边缘刻度、绿/黄强调点）。
 *
 * 纯 SVG + 平涂，无渐变 / 无阴影，符合 design.md 扁平高对比要求。
 */

const HX = 40; // 顶面菱形水平半宽
const HY = 20; // 顶面菱形垂直半高（2:1 等距）
const H = 46; // 立方体侧面高度

interface Tones {
  top: string;
  left: string;
  right: string;
}

// 平涂三面（顶最亮 / 左中 / 右最暗），靠「stark color shift」表达体积
const GRAY: Tones = { top: '#ffffff', left: '#c8cdd3', right: '#9aa0a6' };
const GREEN: Tones = { top: '#d1ffca', left: '#a7e89e', right: '#82c577' };
const YELLOW: Tones = { top: '#fff100', left: '#d8ce00', right: '#b0a700' };
const DARK: Tones = { top: '#3a3a3a', left: '#222222', right: '#0c0c0c' };

function cube(x: number, y: number, t: Tones, key: string, s = 1, sw = 2) {
  const hx = HX * s;
  const hy = HY * s;
  const h = H * s;
  const top = `${x},${y} ${x + hx},${y + hy} ${x},${y + 2 * hy} ${x - hx},${y + hy}`;
  const left = `${x - hx},${y + hy} ${x},${y + 2 * hy} ${x},${y + 2 * hy + h} ${x - hx},${y + hy + h}`;
  const right = `${x},${y + 2 * hy} ${x + hx},${y + hy} ${x + hx},${y + hy + h} ${x},${y + 2 * hy + h}`;
  return (
    <g key={key} stroke="#000" strokeWidth={sw} strokeLinejoin="round">
      <polygon points={left} fill={t.left} />
      <polygon points={right} fill={t.right} />
      <polygon points={top} fill={t.top} />
    </g>
  );
}

// 每个堆叠：[col, row, 层数, 顶层强调色?]
// 居中阶梯金字塔：四角 1 层 / 四边 2 层 / 中心 3 层，绿色立方在塔尖做焦点，
// 黄色在前边缘做次强调，一枚深色立方在前角做"接地"对比，其余无色。
const STACKS: Array<[number, number, number, Tones?]> = [
  [0, 0, 1],
  [1, 0, 2],
  [2, 0, 1],
  [0, 1, 2],
  [1, 1, 3, GREEN],
  [2, 1, 2],
  [0, 2, 1, DARK],
  [1, 2, 2, YELLOW],
  [2, 2, 1]
];

// 漂浮卫星方块：散落在主结构周围，沿虚线「组合」进主体。
// [x, y, scale, tone, 连接目标 tx, ty]
const SATELLITES: Array<[number, number, number, Tones, number, number]> = [
  [392, 78, 0.52, GREEN, 300, 128],
  [414, 236, 0.58, YELLOW, 298, 170],
  [62, 300, 0.5, GRAY, 152, 206],
  [78, 74, 0.42, DARK, 172, 116]
];

// 沿连线 62% 处取「组合」＋标记的位置
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function HeroGeometric() {
  const originX = 230;
  const originY = 86;

  // 画家算法：先画远处（col+row 小）的堆叠，每个堆叠自下而上
  const cubes = STACKS.slice()
    .sort((a, b) => a[0] + a[1] - (b[0] + b[1]))
    .flatMap(([col, row, levels, accent]) => {
      const apexX = originX + (col - row) * HX;
      const apexY = originY + (col + row) * HY;
      return Array.from({ length: levels }, (_, l) => {
        const tone = l === levels - 1 && accent ? accent : GRAY;
        return cube(apexX, apexY - l * H, tone, `${col}-${row}-${l}`);
      });
    });

  return (
    <svg
      viewBox="0 0 460 440"
      className="hero-geometric"
      role="img"
      aria-label="模块化方块拼装结构"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* 技术感点阵背景 */}
        <pattern id="hg-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="#000" opacity="0.08" />
        </pattern>
      </defs>

      {/* —— 背景层 —— */}
      <rect x="0" y="0" width="460" height="440" fill="url(#hg-dots)" />
      {/* 背景虚线轨道环，给结构一个"系统"语境 */}
      <circle
        cx="224"
        cy="150"
        r="160"
        fill="none"
        stroke="#000"
        strokeOpacity="0.1"
        strokeWidth="1.5"
        strokeDasharray="2 9"
      />

      {/* —— 组合连线（在方块之下）—— */}
      {SATELLITES.map(([sx, sy, , , tx, ty], i) => (
        <line
          key={`conn-${i}`}
          x1={sx}
          y1={sy + 12}
          x2={tx}
          y2={ty}
          stroke="#000"
          strokeOpacity="0.32"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
      ))}

      {/* —— 卫星方块 —— */}
      {SATELLITES.map(([sx, sy, s, tone], i) =>
        cube(sx, sy, tone, `sat-${i}`, s, 1.6)
      )}

      {/* —— 中心主结构 —— */}
      {cubes}

      {/* —— 前景：组合 ＋ 标记（连线 62% 处）—— */}
      {SATELLITES.map(([sx, sy, , , tx, ty], i) => {
        const px = lerp(sx, tx, 0.62);
        const py = lerp(sy + 12, ty, 0.62);
        return (
          <g key={`plus-${i}`} stroke="#000" strokeWidth="2.4" strokeLinecap="round">
            <line x1={px - 5} y1={py} x2={px + 5} y2={py} />
            <line x1={px} y1={py - 5} x2={px} y2={py + 5} />
          </g>
        );
      })}

      {/* —— 强调点 —— */}
      <circle cx="436" cy="150" r="5" fill="#d1ffca" stroke="#000" strokeWidth="1.5" />
      <circle cx="46" cy="170" r="5" fill="#fff100" stroke="#000" strokeWidth="1.5" />
      <rect x="350" y="324" width="9" height="9" fill="#000" />
      <rect x="120" y="356" width="8" height="8" fill="#d1ffca" stroke="#000" strokeWidth="1.5" />

      {/* —— 角点定位标记（技术框）—— */}
      <g stroke="#000" strokeOpacity="0.45" strokeWidth="2" fill="none">
        <path d="M16,30 V16 H30" />
        <path d="M444,30 V16 H430" />
        <path d="M16,410 V424 H30" />
        <path d="M444,410 V424 H430" />
      </g>

      {/* —— 左缘刻度（精密感）—— */}
      <g stroke="#000" strokeOpacity="0.3" strokeWidth="1.5">
        <line x1="8" y1="120" x2="19" y2="120" />
        <line x1="8" y1="180" x2="19" y2="180" />
        <line x1="8" y1="240" x2="19" y2="240" />
      </g>
    </svg>
  );
}
