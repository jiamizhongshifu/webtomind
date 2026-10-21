import {
  available,
  dependenciesFor,
  catalog,
  discover,
  guidePath,
  installGuide,
  pageMetadata,
  showcases,
  starterPrompt,
  text,
  type PublicPage,
  type PublicOffer
} from './discovery';
export const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );
export const serializeJsonLd = (data: unknown) =>
  JSON.stringify(data).replace(/</g, '\\u003c');
// Public, visible initial content for everyone, replaced by the interactive app.
export function publicContent(page: PublicPage, offers: PublicOffer[] = []) {
  const e = escapeHtml,
    l = page.locale,
    zh = l === 'zh-CN',
    t = (en: string, cn: string) => (zh ? cn : en);
  const link = (path: string, label: string) =>
    `<a href="/${l}${e(path)}">${e(label)}</a>`;
  const meta = pageMetadata(page);
  const nav = `<header class="siskill-initial-nav">${link('/overview', 'SiSkill')} ${link('/skills', t('Explore Skills', '发现 Skill'))} ${link('/skills/free', t('Free Skills', '免费 Skill'))} ${link('/skills/pricing', t('Pricing', '会员与价格'))} ${link(guidePath, t('Installation guide', '安装指引'))}</header>`;
  let body = '';
  if (page.path === '/account')
    body = `<h1>${e(meta.title)}</h1><p>${t('Enable JavaScript to sign in and view your private library.', '请启用 JavaScript，登录后查看个人下载库。')}</p>`;
  else if (page.status !== 200)
    body = `<h1>${e(meta.title)}</h1>${link('/skills', t('Explore Skills', '发现 Skill'))}`;
  else if (page.skill) {
    const s = page.skill,
      show = showcases[s.slug],
      offer = offers.find(
        (o) =>
          o.siskill_releases.slug === s.slug &&
          o.siskill_releases.version === s.latestVersion
      );
    body = `<nav>${link('/skills', t('Skills', 'Skill 目录'))} / ${e(text(s.name, l))}</nav><h1>${e(text(s.name, l))}</h1><p>${e(text(s.summary, l))}</p><img class="siskill-initial-cover" src="${e(s.coverUrl)}" alt="${e(text(s.name, l))}"><p>${available(s) ? `${t('Available now', '现已开放')} · v${e(s.latestVersion)}` : t('Preview — package not released', '演示预览：安装包尚未发布')}</p><p>${s.tier === 'free' && available(s) ? t('Free after sign-in.', '登录后免费。') : offer ? `USD ${(offer.usd_cents / 100).toFixed(2)} · ${t('Single purchase, or get access through Pro.', '单次购买，或通过 Pro 获取。')}` : t('Enable JavaScript to check current purchase availability.', '启用 JavaScript 查看当前购买状态。')}</p>`;
    for (const key of ['outputs', 'inputs', 'dependencies'] as const)
      body += `<section><h2>${{ outputs: t('What you get', '交付内容'), inputs: t('What you provide', '需要的输入'), dependencies: t('What you need', '运行依赖') }[key]}</h2><ul>${(key === 'dependencies' ? dependenciesFor(s.slug) : show[key]).map((v) => `<li>${e(text(v, l))}</li>`).join('')}</ul></section>`;
    body += `<section><h2>${t('Usage notes', '使用说明')}</h2><p>${e(text(show.limits, l))}</p></section>`;
    if (available(s))
      body += `<section><h2>${t('Get started', '开始使用')}</h2><p>${e(starterPrompt(s.slug, l))}</p>${link(guidePath, t('Installation & troubleshooting guide', '安装与排错指引'))}<p>${link('/account', t('Sign in to access your Skills', '登录以获取 Skill'))}</p></section>`;
  } else if (page.path === guidePath) {
    const g = installGuide(l);
    body = `<h1>${e(g.title)}</h1><p>${e(g.intro)}</p>${g.sections.map(([title, desc], i) => `<section id="step-${i + 1}"><h2>${e(title)}</h2><p>${e(desc)}</p></section>`).join('')}<h2>${t('Troubleshooting', '遇到问题')}</h2><p>${e(g.troubleshooting)}</p>`;
  } else if (page.path === '/skills/pricing')
    body = `<h1>${t('SiSkill pricing', 'SiSkill 会员与价格')}</h1><p>${e(meta.description)}</p><h2>${t('Free', '免费')}</h2><p>${t('Open Graph Image is free after sign-in.', 'Open Graph Image 登录后免费。')}</p><h2>SiSkill Pro</h2><p>${t('Includes published eligible studio Skills during your paid period. Cancel renewal in your account. Model usage and third-party services are separate. Enable JavaScript to check current plans and checkout.', '有效期内包含已发布且纳入会员的自营 Skill，可在账户内取消续费。模型和第三方服务费用另计。启用 JavaScript 查看当前方案与结账。')}</p><h2>${t('Individual Skills', '单独购买')}</h2><p>${t('One payment for one Skill and updates while the service operates. Keep acquired versions locally. No package resale.', '一次购买获得单个 Skill 及服务运营期间的更新，可持续本地使用已获得版本，禁止转售原包。')}</p>${link('/skills', t('Explore available Skills', '查看已开放 Skill'))}`;
  else {
    const items = discover(
      new URLSearchParams(page.search || ''),
      page.path === '/skills/free'
    );
    body = `<h1>${e(page.path === '/overview' ? t('Your agent. A creative studio.', '你的 Agent，一间创作工作室。') : page.path === '/skills/free' ? t('Free Agent Skills', '免费 Agent Skill') : t('Find your next Skill', '找到你的下一个 Skill'))}</h1><p>${e(meta.description)}</p>${items.map((s) => `<article><h2>${link('/skills/' + s.slug, text(s.name, l))}</h2><p>${e(text(s.summary, l))}</p><p>${e(s.formats.join(' · '))} · ${available(s) ? t('Available now', '现已开放') : t('Preview', '预览')}</p></article>`).join('')}`;
  }
  return `${nav}<main class="siskill-initial">${body}</main><footer class="siskill-initial-nav">${link(guidePath, t('Install your first Skill', '安装第一个 Skill'))} ${catalog
    .filter(available)
    .map((s) => link('/skills/' + s.slug, text(s.name, l)))
    .join(' ')}</footer>`;
}
