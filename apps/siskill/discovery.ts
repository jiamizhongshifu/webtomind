import catalogData from './catalog.json';
import sharedShowcases from '../../src/shared/skill-showcases.json';
import localShowcases from './showcases.json';
import freeReleases from './free-releases.json';
import type { SkillShowcase } from '../../src/web/pages/skill-catalog/skillShowcases';
import type { SkillCatalogItem } from '../../src/services/skill-catalog-api';
export const catalog = catalogData as (SkillCatalogItem & {
  availability: string;
  formats: string[];
})[];
export const showcases: Record<string, SkillShowcase> = {
  ...sharedShowcases,
  ...localShowcases
};
export const origin = 'https://siskill.dev';
export const locales = ['en-US', 'zh-CN'];
export const guidePath = '/learn/install-skills';
export const publicPaths = [
  '/overview',
  '/skills',
  '/skills/free',
  '/skills/pricing',
  guidePath,
  ...catalog.map((s) => `/skills/${s.slug}`)
];
export const text = (value: Record<string, string>, locale: string) =>
  value[locale] || value['en-US'];
export const available = (s: { availability: string }) =>
  s.availability === 'available';
export function relatedSkills(slug: string) {
  const current = catalog.find((s) => s.slug === slug);
  return catalog
    .filter((s) => s.slug !== slug)
    .sort(
      (a, b) =>
        Number(available(b)) - Number(available(a)) ||
        Number(b.outputTypes[0] === current?.outputTypes[0]) -
          Number(a.outputTypes[0] === current?.outputTypes[0])
    )
    .slice(0, 4);
}
export function discover(params: URLSearchParams, free = false) {
  const state = params.get('availability') || 'available';
  const tier = free ? 'free' : params.get('tier');
  const q = (params.get('q') || '').trim().toLowerCase();
  return catalog.filter(
    (s) =>
      (!tier || s.tier === tier) &&
      (!params.get('type') || s.outputTypes.includes(params.get('type')!)) &&
      (state === 'all' ||
        (state === 'preview' ? !available(s) : available(s))) &&
      (!q ||
        JSON.stringify([s.name, s.summary, s.sceneTags, s.compatibleAgents])
          .toLowerCase()
          .includes(q))
  );
}
export function starterPrompt(slug: string, locale: string) {
  const zh = locale === 'zh-CN';
  const prompts: Record<string, [string, string]> = {
    'og-image': [
      'Use the og-image Skill to create a 1200 × 630 share image for my project. Ask for the title and URL if missing. Deliver editable HTML and PNG; use only assets I can share.',
      '使用 og-image Skill，为我的项目制作 1200 × 630 分享图；缺少标题和链接时先补齐。仅使用有权分享的素材，交付可编辑 HTML 和 PNG。'
    ],
    'case-study-deck': [
      'Use the case-study-deck Skill to turn my supplied customer notes into a case study deck. Keep unsupported metrics out, label missing evidence, and deliver editable source, PNG and PDF.',
      '使用 case-study-deck Skill，把我提供的客户笔记整理成案例 Deck。不编造指标，标明缺失依据，交付可编辑源文件、PNG 和 PDF。'
    ],
    'notebooklm-video': [
      'Use the notebooklm-video Skill to prepare an evidence-linked explainer from my sources. Review the brief before generation in my own Google notebook. Check my available quota and keep the downloaded video for review.',
      '使用 notebooklm-video Skill，从我提供的资料准备有来源的视频说明。审阅后在我自己的 Google 笔记本中生成，先检查可用额度，并保留下载视频供核对。'
    ],
    'creator-content-workflow': [
      'Use the creator-content-workflow Skill to turn my source notes into a practical article and one social draft. Keep claims traceable, review each version, and create a local handoff. Do not publish.',
      '使用 creator-content-workflow Skill，把我的资料笔记整理成一篇实用文章和一个平台版本。保留来源，逐版审阅，导出本地交接包，暂不发布。'
    ]
  };
  return prompts[slug]?.[zh ? 1 : 0] || '';
}
export function installGuide(locale: string) {
  const zh = locale === 'zh-CN';
  const t = (en: string, cn: string) => (zh ? cn : en);
  return {
    title: t(
      'Install your first Skill in Codex or Claude Code',
      '在 Codex 或 Claude Code 中安装第一个 Skill'
    ),
    intro: t(
      'Start with one task. Choose a reviewed package, install it in your project, then use your own materials to check the result.',
      '从一个具体任务开始：选择已发布的安装包，放进自己的项目，再用自己的资料验证结果。'
    ),
    sections: [
      [
        t('1. Choose by the output and requirements', '1. 按产出和依赖选择'),
        t(
          'Watch the demonstration and read inputs, outputs, dependencies and limits. Available now means a package has been released; Preview means you can inspect the demo but cannot buy or download it. Start with Open Graph Image if you want a free trial of the workflow.',
          '先看演示，再读输入、输出、依赖与限制。「现已开放」表示安装包已发布；「预览」可观看演示，但暂不能购买或下载。首次体验可以选择免费的 Open Graph Image。'
        )
      ],
      [
        t('2. Sign in and choose your access', '2. 登录并选择获取方式'),
        t(
          'All downloads require sign-in. Use your existing WebToMind account or register through SiSkill. Account identity is shared; SiSkill orders, membership and download rights are separate. Free Skills need no paid subscription. For paid Skills choose a single purchase or Pro; model usage is not included.',
          '所有下载都需登录，可使用现有 WebToMind 账号或通过 SiSkill 注册。身份共用，SiSkill 订单、会员和下载权益独立。免费 Skill 不需要付费订阅；付费 Skill 可单独购买或通过 Pro 获取，不含模型用量。'
        )
      ],
      [
        t('3. Download the verified archive', '3. 下载经过校验的安装包'),
        t(
          'Free packages are on their detail page; purchased and member packages appear in My Skills. Payment is confirmed by the order status, not merely by returning from Stripe. Wait for confirmation or refresh your library. Download saves a .tar.gz archive only after its size and SHA-256 match the release. If verification fails, retry instead of running a partial file.',
          '免费包在详情页下载，已购和会员包在「我的 Skill」中领取。以订单状态确认支付，不能仅凭 Stripe 跳转成功判断。等待确认或刷新下载库。下载会核对文件大小和 SHA-256，通过后保存 .tar.gz；校验失败时重新下载，不运行不完整文件。'
        )
      ],
      [
        t('4. Install in the project you will use', '4. 安装到实际使用的项目'),
        t(
          'Extract the archive and inspect SKILL.md, LICENSE.md, DEPENDENCIES.md and any included scripts. For Codex copy the Skill folder to .agents/skills/<skill-slug>/; for Claude Code use .claude/skills/<skill-slug>/. SKILL.md must sit directly inside that folder, not inside another duplicate folder. Back up an existing installation before replacing it.',
          '解压后检查 SKILL.md、LICENSE.md、DEPENDENCIES.md 和附带脚本。Codex 放在 .agents/skills/<skill-slug>/，Claude Code 放在 .claude/skills/<skill-slug>/。SKILL.md 应直接位于该目录，不要再嵌套一层同名文件夹。替换已有安装前先备份。'
        )
      ],
      [
        t(
          '5. Run one brief and inspect the result',
          '5. 执行一次需求并检查成品'
        ),
        t(
          'Open your Agent in that project. Name the Skill explicitly and supply the requested materials. If it is not discovered, start a fresh session or point the Agent to its SKILL.md. Follow the package dependency instructions, then compare actual outputs with the example. Local folder execution has been checked; discovery behavior and other operating systems depend on your Agent setup.',
          '在该项目中打开 Agent，明确指定 Skill 并提供所需资料。未识别时开启新会话，或直接指向 SKILL.md。按包内说明准备依赖，再把实际输出与示例对照。已验证项目目录中的执行；自动发现行为及其他操作系统取决于你的 Agent 环境。'
        )
      ],
      [
        t('6. Keep versions and access clear', '6. 管理版本和后续权益'),
        t(
          'Keep your archive and edited project files. A single purchase covers that Skill and its updates while the service operates. Pro covers published eligible studio Skills and updates during the paid period. You may keep using lawfully acquired local versions after expiry; new paid downloads need active access. A refund ends the entitlement granted by that order. Finished commercial outputs are allowed; redistributing the generic paid Skill is not.',
          '保留安装包与修改后的项目。单品购买包含该 Skill 在服务运营期间的更新；Pro 有效期内覆盖已发布且纳入会员的自营 Skill 和更新。到期后可继续本地使用合法取得的版本，新付费下载需要有效权益。退款结束对应订单权益。允许制作商业成品，不允许再分发通用付费 Skill。'
        )
      ]
    ],
    troubleshooting: t(
      'If you cannot download, confirm the account, order or Pro status first, then refresh My Skills. If the Agent cannot run the Skill, check its folder, Node.js version and listed dependencies. Send support the Skill name, version and error message; never send passwords, API keys or customer files.',
      '无法下载时，先确认账号、订单或 Pro 状态，再刷新「我的 Skill」。无法运行时，检查安装目录、Node.js 版本和依赖。联系客服时提供 Skill 名称、版本和错误信息，不发送密码、API Key 或客户文件。'
    )
  };
}
export type PublicPage = {
  locale: string;
  path: string;
  status: number;
  skill?: (typeof catalog)[number];
  search?: string;
};
export type PublicOffer = {
  sku: string;
  usd_cents: number;
  siskill_releases: { slug: string; version: string; status: string };
};
export function pageMetadata(page: PublicPage) {
  const zh = page.locale === 'zh-CN',
    t = (en: string, cn: string) => (zh ? cn : en);
  const title =
    page.status === 404
      ? t('Page not found | SiSkill', '页面不存在 | SiSkill')
      : page.path === '/account'
        ? t('Your library | SiSkill', '我的 Skill | SiSkill')
        : page.skill
          ? `${text(page.skill.name, page.locale)} — ${t('Agent Skill', 'Agent 技能')} | SiSkill`
          : page.path === guidePath
            ? `${installGuide(page.locale).title} | SiSkill`
            : page.path === '/skills/free'
              ? t(
                  'Free Agent Skills for Codex & Claude Code | SiSkill',
                  '免费 Agent Skill：Codex 与 Claude Code | SiSkill'
                )
              : page.path === '/skills/pricing'
                ? t(
                    'Skill pricing & Pro membership | SiSkill',
                    'Skill 单品价格与 Pro 会员 | SiSkill'
                  )
                : page.path === '/skills'
                  ? t(
                      'Explore Agent Skills for Writing, Video & Design | SiSkill',
                      '发现写作、视频与设计 Agent Skill | SiSkill'
                    )
                  : t(
                      'Agent Skills for Codex & Claude Code | SiSkill',
                      'Codex 与 Claude Code 创作技能商店 | SiSkill'
                    );
  const description = page.skill
    ? text(page.skill.summary, page.locale)
    : page.path === guidePath
      ? installGuide(page.locale).intro
      : page.path === '/skills/free'
        ? t(
            'Download Open Graph Image free after sign-in. Check its example, requirements and installation guide before creating your first share image.',
            '登录后免费下载 Open Graph Image。先查看真实示例、运行依赖和安装指引，再制作第一张网站分享图。'
          )
        : page.path === '/skills/pricing'
          ? t(
              'Choose a single Skill purchase or SiSkill Pro. Compare access, updates, download rights and separate model costs.',
              '比较单品购买与 SiSkill Pro 的访问范围、更新和下载权益，了解另计的模型费用。'
            )
          : t(
              'Discover reusable Agent Skills for writing, images, slides and video. Watch examples, check dependencies and install reviewed workflows in your own agent.',
              '发现写作、图片、幻灯片与视频 Agent Skill，观看示例、检查依赖，把已审核工作流安装到自己的 Agent。'
            );
  const params = new URLSearchParams(page.search || '');
  const filtered = ['q', 'type', 'tier', 'availability'].some((k) =>
    params.has(k)
  );
  const noindex =
    page.status !== 200 ||
    page.path === '/account' ||
    filtered ||
    Boolean(page.skill && !available(page.skill));
  return {
    title,
    description,
    canonical: `${origin}/${page.locale}${page.path}`,
    image: `${origin}${page.skill?.coverUrl || '/skill-previews/og-image.png'}`,
    robots: noindex ? 'noindex,follow' : 'index,follow',
    alternates: !noindex
      ? [
          ...locales.map((l) => ({
            hreflang: l,
            href: `${origin}/${l}${page.path}`
          })),
          { hreflang: 'x-default', href: `${origin}/en-US${page.path}` }
        ]
      : []
  };
}
export function structuredData(
  page: PublicPage,
  offers: PublicOffer[] = []
): Record<string, unknown>[] {
  if (page.status !== 200 || page.path === '/account') return [];
  const meta = pageMetadata(page),
    zh = page.locale === 'zh-CN';
  const graph: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': origin + '/#website',
      name: 'SiSkill',
      url: origin + '/en-US/overview'
    }
  ];
  const crumbs = [
    { name: 'SiSkill', item: `${origin}/${page.locale}/overview` }
  ];
  if (page.path !== '/overview') {
    crumbs.push({
      name: zh ? 'Skill 目录' : 'Skills',
      item: `${origin}/${page.locale}/skills`
    });
    if (page.path !== '/skills')
      crumbs.push({
        name: page.skill
          ? text(page.skill.name, page.locale)
          : meta.title.replace(' | SiSkill', ''),
        item: meta.canonical
      });
  }
  graph.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      ...c
    }))
  });
  if (page.skill && available(page.skill)) {
    const s = page.skill;
    const free = freeReleases.some((r) => r.slug === s.slug);
    const offer = offers.find(
      (o) =>
        o.siskill_releases.slug === s.slug &&
        o.siskill_releases.version === s.latestVersion &&
        o.siskill_releases.status === 'published' &&
        Number.isSafeInteger(o.usd_cents) &&
        o.usd_cents > 0
    );
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': meta.canonical + '#product',
      name: text(s.name, page.locale),
      description: text(s.summary, page.locale),
      image: [meta.image],
      url: meta.canonical,
      brand: { '@type': 'Brand', name: 'SiSkill' },
      ...(free || offer
        ? {
            offers: {
              '@type': 'Offer',
              price: free ? '0.00' : (offer!.usd_cents / 100).toFixed(2),
              priceCurrency: 'USD',
              availability: 'https://schema.org/InStock',
              url: meta.canonical,
              seller: { '@type': 'Organization', name: 'SiSkill' }
            }
          }
        : {})
    });
  } else if (['/overview', '/skills', '/skills/free'].includes(page.path)) {
    const items = discover(
      new URLSearchParams(page.search || ''),
      page.path === '/skills/free'
    );
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: items.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: text(s.name, page.locale),
        url: `${origin}/${page.locale}/skills/${s.slug}`
      }))
    });
  }
  return graph;
}

export function dependenciesFor(slug: string) {
  return slug === 'og-image'
    ? [
        {
          'en-US': 'Node.js 18+; verified here with Node 24 on macOS.',
          'zh-CN': 'Node.js 18+，本次使用 macOS 与 Node 24 验证。'
        },
        {
          'en-US':
            'Playwright and Chromium / Chrome, installed separately. Dependency setup requires internet; rendering then runs offline.',
          'zh-CN':
            '需单独安装 Playwright 与 Chromium / Chrome；依赖安装需要联网，渲染可离线运行。'
        }
      ]
    : showcases[slug].dependencies;
}
