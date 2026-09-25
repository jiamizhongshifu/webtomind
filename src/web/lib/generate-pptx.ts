const STYLE_COLORS: Record<
  string,
  { bg: string; text: string; accent: string }
> = {
  notion: { bg: 'FFFDF8', text: '241916', accent: 'B54B32' },
  minimal: { bg: 'F7F7F5', text: '171717', accent: '333333' },
  corporate: { bg: '142033', text: 'FFFFFF', accent: 'D4AF37' },
  blueprint: { bg: '17365D', text: 'FFFFFF', accent: '63B3ED' }
};

function cleanFileName(value: string): string {
  return `${value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'presentation'}.pptx`;
}

export async function generatePptxInBrowser(input: {
  content: string;
  style: string;
  slideCount: number;
}): Promise<{ slideCount: number; fileName: string }> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  const colors = STYLE_COLORS[input.style] || STYLE_COLORS.notion;
  const lines = input.content
    .split(/\n|[。！？.!?]+/)
    .map((line) => line.replace(/^[-*#\d.、\s]+/, '').trim())
    .filter(Boolean);
  const title = lines[0]?.slice(0, 80) || '演示稿';
  const bodyLines = lines.slice(1);
  const requestedPageCount = Math.min(15, Math.max(2, input.slideCount));
  const contentPageCount = Math.min(
    requestedPageCount - 1,
    Math.max(1, bodyLines.length)
  );
  const groups = Array.from({ length: contentPageCount }, (_, index) =>
    bodyLines.filter((_, lineIndex) => lineIndex % contentPageCount === index)
  );
  const pageCount = groups.length + 1;

  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'WebToMind';
  pptx.subject = title;
  pptx.title = title;

  const cover = pptx.addSlide();
  cover.background = { color: colors.bg };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.7,
    y: 1.05,
    w: 0.12,
    h: 4.8,
    fill: { color: colors.accent },
    line: { color: colors.accent }
  });
  cover.addText(title, {
    x: 1.15,
    y: 1.65,
    w: 10.8,
    h: 1.7,
    fontFace: 'Aptos Display',
    fontSize: 32,
    bold: true,
    color: colors.text,
    breakLine: false,
    margin: 0
  });
  cover.addText('Generated with WebToMind', {
    x: 1.18,
    y: 4.9,
    w: 5.5,
    h: 0.35,
    fontFace: 'Aptos',
    fontSize: 12,
    color: colors.accent,
    margin: 0
  });

  groups.forEach((bullets, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: colors.bg };
    const heading = bullets[0]?.slice(0, 54) || `核心内容 ${index + 1}`;
    slide.addText(heading, {
      x: 0.8,
      y: 0.65,
      w: 11.7,
      h: 0.7,
      fontFace: 'Aptos Display',
      fontSize: 24,
      bold: true,
      color: colors.text,
      margin: 0
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.8,
      y: 1.48,
      w: 1.2,
      h: 0,
      line: { color: colors.accent, width: 3 }
    });
    const items = (bullets.length > 1 ? bullets.slice(1) : bullets).slice(0, 6);
    slide.addText(
      items.map((text) => ({ text, options: { bullet: { indent: 18 } } })),
      {
        x: 0.95,
        y: 1.8,
        w: 11,
        h: 4.8,
        fontFace: 'Aptos',
        fontSize: 18,
        color: colors.text,
        breakLine: true,
        paraSpaceAfter: 16,
        valign: 'top',
        margin: 0.08
      }
    );
    slide.addText(String(index + 2).padStart(2, '0'), {
      x: 11.8,
      y: 6.85,
      w: 0.55,
      h: 0.25,
      fontSize: 9,
      color: colors.accent,
      align: 'right',
      margin: 0
    });
  });

  const fileName = cleanFileName(title);
  await pptx.writeFile({ fileName });
  return { slideCount: pageCount, fileName };
}
