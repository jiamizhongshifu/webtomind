import { BeforeAfterComparison } from '../components/image-tools/BeforeAfterComparison';
import '../styles/image-tools.css';

function comparisonFixture(showNoise: boolean) {
  const noise = showNoise
    ? `<g fill="#f8d17a" opacity=".72">
        <circle cx="118" cy="92" r="3"/><circle cx="176" cy="146" r="2"/>
        <circle cx="246" cy="86" r="2.5"/><circle cx="312" cy="166" r="3"/>
        <circle cx="382" cy="116" r="2"/><circle cx="454" cy="182" r="3"/>
        <circle cx="526" cy="102" r="2.5"/><circle cx="602" cy="154" r="2"/>
        <circle cx="684" cy="88" r="3"/><circle cx="756" cy="172" r="2.5"/>
        <circle cx="830" cy="112" r="2"/><circle cx="892" cy="194" r="3"/>
        <circle cx="142" cy="292" r="2.5"/><circle cx="226" cy="344" r="3"/>
        <circle cx="338" cy="286" r="2"/><circle cx="438" cy="358" r="2.5"/>
        <circle cx="552" cy="304" r="3"/><circle cx="668" cy="362" r="2"/>
        <circle cx="776" cy="282" r="2.5"/><circle cx="872" cy="348" r="3"/>
      </g>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
    <defs>
      <linearGradient id="sky" x2="1" y2="1"><stop stop-color="#101722"/><stop offset="1" stop-color="#4b2d22"/></linearGradient>
      <radialGradient id="light"><stop stop-color="#f7d78a" stop-opacity=".9"/><stop offset="1" stop-color="#f7d78a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="960" height="640" fill="url(#sky)"/>
    <circle cx="650" cy="240" r="220" fill="url(#light)" opacity=".5"/>
    <path d="M0 520L190 330l105 98 150-212 156 174 122-104 237 234v120H0z" fill="#171b1f"/>
    <path d="M0 555c180-38 340-28 480 2 160 34 312 18 480-18v101H0z" fill="#6f4a2d" opacity=".58"/>
    ${noise}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const beforeFixture = comparisonFixture(true);
const afterFixture = comparisonFixture(false);

export function ImageComparisonHarnessPage() {
  return (
    <main
      data-harness="image-comparison"
      style={{
        minHeight: '100dvh',
        padding: 'clamp(16px, 4vw, 48px)',
        background: '#f3eee9',
        color: '#231f1d'
      }}
    >
      <div style={{ width: 'min(100%, 960px)', margin: '0 auto' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 6px', fontSize: 24 }}>
          GPT Image 2 清理前后对比
        </h1>
        <p style={{ margin: '0 0 24px', lineHeight: 1.6 }}>
          验证桌面与移动端的缩放、滚轮、分隔线拖动和键盘控制。
        </p>
        <div className="image-tool-preview-stage" style={{ minHeight: 0 }}>
          <BeforeAfterComparison
            beforeSrc={beforeFixture}
            afterSrc={afterFixture}
            beforeAlt="带颗粒的原图测试图"
            afterAlt="清理颗粒后的测试图"
            beforeLabel="原图"
            afterLabel="清理后"
            aspectRatio={1.5}
            instruction="放大查看颗粒；左右拖动分隔线比较清理前后"
          />
        </div>
      </div>
    </main>
  );
}
