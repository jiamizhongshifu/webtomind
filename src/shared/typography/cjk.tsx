import { Fragment, useMemo } from 'react';
import { loadDefaultSimplifiedChineseParser } from 'budoux';

const parser = loadDefaultSimplifiedChineseParser();

/**
 * 在中文词之间插入 <wbr>，让标题只在词组边界换行。
 * 只在短语级标题上使用；正文用浏览器默认的中文断行。
 */
export function CjkText({ text }: { text: string }) {
  const words = useMemo(() => parser.parse(text), [text]);
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={`${index}:${word}`}>
          {index > 0 ? <wbr /> : null}
          {word}
        </Fragment>
      ))}
    </>
  );
}
