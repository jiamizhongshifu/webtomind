import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform
} from 'motion/react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/shared/ui';

const projects = [
  {
    type: 'slides',
    label: ['Decks', '演示文稿'],
    slug: 'case-study-deck',
    title: ['Customer Case Study Deck', '客户案例 Deck'],
    input: [
      'Turn our project notes into a story a client can follow.',
      '把项目记录整理成一份让客户看得懂的案例。'
    ],
    result: ['A story, ready to share.', '让好项目，有好表达。'],
    format: 'Editable source · PNG · PDF',
    image: 'case-study.png'
  },
  {
    type: 'image',
    label: ['Social', '社交图文'],
    slug: 'og-image',
    title: ['Product Share Image', '产品分享图'],
    input: [
      'Give our next product update a share image of its own.',
      '为下一次产品更新，做一张清晰的分享图。'
    ],
    result: ['Make the first impression count.', '让第一眼，就有吸引力。'],
    format: 'Editable source · PNG',
    image: 'og-image.png'
  },
  {
    type: 'web',
    label: ['Websites', '网页'],
    slug: 'saas-landing-page',
    title: ['SaaS Landing Page', 'SaaS 落地页'],
    input: [
      'Explain what our product does, and who it helps.',
      '讲清楚产品能做什么，以及它能帮助谁。'
    ],
    result: ['A home for your next idea.', '让下一个想法，有处落地。'],
    format: 'Editable HTML · Responsive layout',
    image: 'saas-page.png'
  },
  {
    type: 'video',
    label: ['Video', '视频'],
    slug: 'app-feature-demo-video',
    title: ['App Feature Demo', 'App 功能演示'],
    input: [
      'Show the new review flow, from first click to finished work.',
      '从第一次点击到完成交付，演示新的审阅流程。'
    ],
    result: ['Let the product do the talking.', '让产品自己说话。'],
    format: 'Editable scenes · MP4',
    image: 'app-demo.jpg'
  }
];

export function SkillBrandHero({
  locale,
  isZh,
  brandName = 'WebToMind',
  freeSkillsComingSoon = false
}: {
  locale: string;
  isZh: boolean;
  brandName?: string;
  freeSkillsComingSoon?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: stage,
    offset: ['start 95%', 'center 45%']
  });
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1]);
  const project = projects[selected];
  const lang = isZh ? 1 : 0;
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) media.pause();
    });
    observer.observe(media);
    const hide = () => {
      if (document.hidden) media.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      media.pause();
      observer.disconnect();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [showVideo, selected]);
  return (
    <section className="skill-brand-hero" aria-labelledby="skill-brand-title">
      <motion.div
        className="skill-brand-message"
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <h1 id="skill-brand-title">
          {isZh ? '给你的 Agent，' : 'Your agent.'}
          <br />
          <em>{isZh ? '一间创作工作室。' : 'A creative studio.'}</em>
        </h1>
        <p className="skill-brand-lead">
          {isZh
            ? '用可复用的 Skill，把想法做成图文、演示、网页和视频。在你的 Agent 中运行，交付可编辑的作品。'
            : 'Turn a brief into visuals, decks, websites and video. Reusable Skills for your agent. Editable work you can make your own.'}
        </p>
        <div className="skill-brand-actions">
          <ButtonLink to={`/${locale}/skills`} variant="primary" size="lg">
            {isZh ? '找到你的 Skill' : 'Find your next Skill'}{' '}
            <span aria-hidden="true">→</span>
          </ButtonLink>
          <Link to={`/${locale}/skills?tier=free`}>
            {freeSkillsComingSoon
              ? isZh
                ? '探索免费 Skill'
                : 'Explore free Skills'
              : isZh
                ? '从免费 Skill 开始'
                : 'Start with a free Skill'}{' '}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <p className="skill-brand-agents">
          <span>
            {isZh ? '为你熟悉的 Agent 而做' : 'Made for the agents you use'}
          </span>
          <strong>Claude Code</strong>
          <strong>Codex</strong>
          <strong>Cursor</strong>
          <span>{isZh ? '及更多' : '+ more'}</span>
        </p>
      </motion.div>
      <div className="skill-proof-stage skill-output-stage" ref={stage}>
        <div className="skill-proof-toolbar">
          <span className="skill-proof-wordmark">
            {brandName} <span>/</span> {isZh ? '作品展台' : 'In the making'}
          </span>
          <div
            className="skill-proof-tabs"
            role="group"
            aria-label={isZh ? '选择作品类型' : 'Choose an output'}
          >
            {projects.map((item, index) => (
              <button
                key={item.type}
                type="button"
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index);
                  setShowVideo(false);
                }}
              >
                {item.label[lang]}
              </button>
            ))}
          </div>
        </div>
        <div className="skill-proof-body">
          <div className="skill-proof-brief">
            <span className="skill-proof-label">
              {isZh ? '从你的想法开始' : 'START WITH YOUR IDEA'}
            </span>
            <p key={`brief-${selected}`} className="skill-proof-input">
              “{project.input[lang]}”
            </p>
            <div className="skill-proof-connector" aria-hidden="true">
              <span />→
            </div>
            <h2>{project.result[lang]}</h2>
            <p className="skill-proof-delivery">
              {isZh
                ? '源文件归你，内容随你修改。'
                : 'Your source files. Your finishing touch.'}
            </p>
            <Link
              className="skill-proof-link"
              to={`/${locale}/skills/${project.slug}`}
            >
              {isZh ? '探索这个 Skill' : 'Explore this Skill'}{' '}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <motion.div
            className="skill-proof-output"
            style={{ scale: reduced ? 1 : scale }}
          >
            {showVideo ? (
              <video
                ref={video}
                key={project.slug}
                controls
                autoPlay
                muted
                playsInline
                poster={`/skill-previews/${project.image}`}
                src={`/skill-previews/videos/${project.slug}.mp4`}
                aria-label={isZh ? 'Skill 功能演示' : 'Skill demonstration'}
              />
            ) : (
              <motion.img
                key={project.image}
                initial={reduced ? false : { opacity: 0.5, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                src={`/skill-previews/${project.image}`}
                alt={project.title[lang]}
                width={1280}
                height={720}
                fetchPriority="high"
              />
            )}
          </motion.div>
        </div>
        <div className="skill-proof-caption">
          <div>
            <Link to={`/${locale}/skills/${project.slug}`}>
              {project.title[lang]} ↗
            </Link>
            <span>
              {isZh
                ? project.format
                    .replace('Editable source', '可编辑源文件')
                    .replace('Editable HTML', '可编辑 HTML')
                    .replace('Responsive layout', '自适应布局')
                    .replace('Editable scenes', '可编辑场景')
                : project.format}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowVideo(!showVideo)}
            aria-pressed={showVideo}
          >
            {showVideo
              ? isZh
                ? '查看成品'
                : 'View output'
              : isZh
                ? '播放功能演示'
                : 'Watch the workflow'}{' '}
            <span aria-hidden="true">{showVideo ? '↩' : '▷'}</span>
          </button>
        </div>
      </div>
      <div className="skill-brand-benefits">
        <p>
          <strong>{isZh ? '先看效果' : 'See it before you get it.'}</strong>
          <span>
            {isZh
              ? '真实演示，清楚知道会得到什么。'
              : 'Actual demonstrations, clear deliverables.'}
          </span>
        </p>
        <p>
          <strong>{isZh ? '把流程留下' : 'Keep the workflow.'}</strong>
          <span>
            {isZh
              ? '模板和脚本，可编辑、可重复使用。'
              : 'Editable templates and reusable scripts.'}
          </span>
        </p>
        <p>
          <strong>{isZh ? '用你熟悉的工具' : 'Stay with your agent.'}</strong>
          <span>
            {isZh
              ? '安装到本地，在自己的项目中使用。'
              : 'Install locally. Work in your own projects.'}
          </span>
        </p>
      </div>
    </section>
  );
}
