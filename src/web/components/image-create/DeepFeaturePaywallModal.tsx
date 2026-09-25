import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Crown, Lock, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/shared/ui';
import { motionPresets } from '@/design/motion-presets';
import { BeamCta } from '@/web/components/BeamCta';
import { useOverlayBehavior } from '@/shared/ui';
import { trackEvent } from '../../lib/analytics';
import unlockPromptCaseImage from '../../assets/create/unlock-prompt-case.webp';
import { collapsePaywallReturnTo } from '@/shared/paywall-return-to';
import { getWorkspacePricingHref } from '../../lib/pricing-route';

export type DeepFeaturePaywallKind =
  | 'gallery'
  | 'characters'
  | 'apps'
  | 'prompt_case'
  | 'workflow';

interface DeepFeaturePaywallModalProps {
  open: boolean;
  kind: DeepFeaturePaywallKind;
  localePrefix: '' | '/zh-CN' | '/en-US';
  isAuthenticated: boolean;
  onClose: () => void;
  onContinue?: () => void;
  source?: string;
}

const COPY = {
  zh: {
    close: '关闭付费引导',
    badge: '会员工作流',
    eyebrow: '解锁深度创作能力',
    cta: '查看会员套餐',
    loginCta: '登录后升级',
    later: '继续预览',
    footnote: '失败任务不扣费，生成前会显示实际积分消耗。',
    kinds: {
      gallery: {
        title: '把历史图库变成可复用的创作资产。',
        body: '图库不只是相册。会员可以更稳定地复用历史图片、Prompt、参考图和项目沉淀，适合做系列图和长期商业素材。',
        visual: 'Gallery',
        benefits: ['历史图继续编辑', '一键导入参考图', '收藏分类沉淀案例']
      },
      characters: {
        title: '角色一致性适合长期项目，建议升级后使用。',
        body: '当你需要同一角色反复出现在不同姿态、场景和画风里，会员方案会给你更多积分、私密历史和更完整的角色工作流。',
        visual: 'Characters',
        benefits: [
          '角色卡与参考图管理',
          'A/B 分组工作流',
          '一致性检查与修复提示'
        ]
      },
      apps: {
        title: '商业应用适合高频交付，会员会更划算。',
        body: '电商主图、封面、局部重绘和角色资产会消耗更多迭代次数。订阅后每月积分刷新，并解锁会员 Prompt 案例。',
        visual: 'Apps',
        benefits: ['商业模板与应用入口', '更多月度积分', '会员专属 Prompt 案例']
      },
      prompt_case: {
        title: '解锁完整 Prompt，直接复现精选案例。',
        body: '会员案例会展示完整 Prompt、模型参数和可复用结构，适合把优秀案例迁移到自己的角色、产品或账号风格。',
        visual: 'Prompt',
        benefits: [
          '完整精选案例 Prompt',
          '一键带入创作台',
          '私密生成与历史追溯'
        ]
      },
      workflow: {
        title: '这个工作流适合订阅用户持续使用。',
        body: '深度工作流通常需要参考图、历史复用和多轮迭代。会员方案能降低频繁创作时的摩擦。',
        visual: 'Workflow',
        benefits: ['更多月度积分', '参考图与历史复用', '失败退款保障']
      }
    }
  },
  en: {
    close: 'Close upgrade prompt',
    badge: 'Member workflow',
    eyebrow: 'Unlock deeper creation flows',
    cta: 'View plans',
    loginCta: 'Sign in to upgrade',
    later: 'Continue preview',
    footnote:
      'Failed system jobs refund automatically. Exact credit cost appears before generation.',
    kinds: {
      gallery: {
        title: 'Turn image history into reusable creative assets.',
        body: 'The gallery is more than an album. Members can reuse prior images, prompts, references and project context more effectively for ongoing series work.',
        visual: 'Gallery',
        benefits: [
          'Continue editing from history',
          'Import as reference images',
          'Save results into Boards'
        ]
      },
      characters: {
        title: 'Character consistency is built for long-running projects.',
        body: 'When the same character needs to appear across poses, scenes and styles, membership gives you more credits, private history and the full character workflow.',
        visual: 'Characters',
        benefits: [
          'Character cards and references',
          'A/B grouping workflow',
          'Consistency checks and repair prompts'
        ]
      },
      apps: {
        title: 'Commercial apps make more sense with a member plan.',
        body: 'Product images, covers, inpainting and character assets take more iteration. Subscriptions refresh credits monthly and unlock member prompt cases.',
        visual: 'Apps',
        benefits: [
          'Commercial app workflows',
          'More monthly credits',
          'Member-only prompt cases'
        ]
      },
      prompt_case: {
        title: 'Unlock the full prompt and reproduce curated cases.',
        body: 'Member cases reveal complete prompts, model settings and reusable structure so you can adapt strong examples to your own character, product or channel.',
        visual: 'Prompt',
        benefits: [
          'Full curated prompts',
          'Open directly in the studio',
          'Private generation and traceable history'
        ]
      },
      workflow: {
        title: 'This workflow is designed for subscribers.',
        body: 'Deep workflows usually need references, history reuse and repeated iteration. Membership keeps that loop smoother.',
        visual: 'Workflow',
        benefits: [
          'More monthly credits',
          'Reference and history reuse',
          'Failed-job refund protection'
        ]
      }
    }
  }
} as const;

function getPricingSource(kind: DeepFeaturePaywallKind, source?: string) {
  return source || `deep_feature_${kind}`;
}

export function DeepFeaturePaywallModal({
  open,
  kind,
  localePrefix,
  isAuthenticated,
  onClose,
  onContinue,
  source
}: DeepFeaturePaywallModalProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isEnglish = localePrefix === '/en-US';
  const copy = isEnglish ? COPY.en : COPY.zh;
  const content = copy.kinds[kind] || copy.kinds.workflow;
  const returnTo = collapsePaywallReturnTo(
    location.pathname,
    location.search,
    location.hash,
    `${localePrefix}/image`
  );
  const pricingSource = getPricingSource(kind, source);
  const prefersReducedMotion = useReducedMotion();
  const modalRef = useOverlayBehavior<HTMLElement>({
    open,
    onClose
  });

  const goPricing = () => {
    trackEvent('deep_feature_paywall_click', {
      kind,
      source: pricingSource,
      authenticated: isAuthenticated
    });
    const pricingHref = getWorkspacePricingHref(
      localePrefix,
      `?source=${pricingSource}&returnTo=${encodeURIComponent(returnTo)}`
    );
    if (!isAuthenticated) {
      navigate(
        `/login?redirect=${encodeURIComponent(pricingHref)}&source=${pricingSource}`
      );
      return;
    }
    navigate(pricingHref, {
      state: { returnTo }
    });
  };

  const continuePreview = () => {
    trackEvent('deep_feature_paywall_continue', {
      kind,
      source: pricingSource,
      authenticated: isAuthenticated
    });
    onClose();
    onContinue?.();
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="deep-feature-paywall-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionPresets.reduced.duration }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            ref={modalRef}
            className="deep-feature-paywall-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deep-feature-paywall-title"
            tabIndex={-1}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.98, y: 16 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.98, y: 16 }
            }
            transition={
              prefersReducedMotion
                ? { duration: motionPresets.reduced.duration }
                : motionPresets.uiSpring
            }
          >
        <div className="deep-feature-paywall-visual" aria-hidden="true">
          <img
            src={unlockPromptCaseImage}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="deep-feature-paywall-copy">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="deep-feature-paywall-close"
            aria-label={copy.close}
            onClick={onClose}
          >
            <X />
          </Button>
          <span className="deep-feature-paywall-badge">
            <Crown size={14} />
            {copy.badge}
          </span>
          <small>{copy.eyebrow}</small>
          <h2 id="deep-feature-paywall-title">{content.title}</h2>
          <p>{content.body}</p>
          <ul>
            {content.benefits.map((benefit) => (
              <li key={benefit}>
                <Check size={14} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="deep-feature-paywall-actions">
            <BeamCta tone="warm">
              <Button type="button" className="primary" onClick={goPricing}>
                <Lock data-icon="inline-start" />
                {isAuthenticated ? copy.cta : copy.loginCta}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </BeamCta>
            <Button type="button" variant="outline" onClick={continuePreview}>
              {copy.later}
            </Button>
          </div>
          <p className="deep-feature-paywall-footnote">{copy.footnote}</p>
        </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
