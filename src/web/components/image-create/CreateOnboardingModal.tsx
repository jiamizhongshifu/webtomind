import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ClipboardList,
  ImagePlus,
  Layers3,
  Sparkles,
  Wand2,
  X
} from 'lucide-react';
import { Button, imageFetchPriority } from '@/shared/ui';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import onboardingAssetsImage from '../../assets/create/onboarding-assets.webp';
import onboardingPromptImage from '../../assets/create/onboarding-prompt.webp';
import onboardingReferenceImage from '../../assets/create/onboarding-reference.webp';
import onboardingTasksImage from '../../assets/create/onboarding-tasks.webp';
import { useModalScrollLock } from './useModalScrollLock';

export const CREATE_ONBOARDING_STORAGE_KEY =
  'webtomind:create-onboarding-seen:v1';

export function hasSeenCreateOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(CREATE_ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markCreateOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CREATE_ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // Persistence is best-effort; closing the modal still works in memory.
  }
}

interface CreateOnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

type OnboardingVisual = 'assets' | 'prompt' | 'reference' | 'tasks';

const ONBOARDING_VISUAL_IMAGES: Record<OnboardingVisual, string> = {
  assets: onboardingAssetsImage,
  prompt: onboardingPromptImage,
  reference: onboardingReferenceImage,
  tasks: onboardingTasksImage
};

interface OnboardingStep {
  icon: typeof Wand2;
  visual: OnboardingVisual;
  title: string;
  body: string;
  bullets: string[];
}

function CreateOnboardingVisual({ visual }: { visual: OnboardingVisual }) {
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const imageSrc = ONBOARDING_VISUAL_IMAGES[visual];

  useEffect(() => {
    setImageState('loading');
  }, [imageSrc]);

  return (
    <>
      {imageState !== 'ready' && (
        <div className="create-onboarding-visual-fallback" aria-hidden="true">
          <Sparkles size={22} />
          <span>WebToMind</span>
        </div>
      )}
      {imageState !== 'error' && (
        <img
          src={imageSrc}
          alt=""
          loading="eager"
          decoding="async"
          {...imageFetchPriority('high')}
          aria-hidden="true"
          className={imageState === 'ready' ? 'is-loaded' : ''}
          onLoad={() => setImageState('ready')}
          onError={() => setImageState('error')}
        />
      )}
    </>
  );
}

export function CreateOnboardingModal({
  open,
  onClose
}: CreateOnboardingModalProps) {
  const { t } = useTranslation('imageCreate');
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        icon: Layers3,
        visual: 'assets',
        title: t('onboarding.steps.assets.title'),
        body: t('onboarding.steps.assets.body'),
        bullets: [
          t('onboarding.steps.assets.bullets.0'),
          t('onboarding.steps.assets.bullets.1'),
          t('onboarding.steps.assets.bullets.2')
        ]
      },
      {
        icon: ClipboardList,
        visual: 'prompt',
        title: t('onboarding.steps.prompt.title'),
        body: t('onboarding.steps.prompt.body'),
        bullets: [
          t('onboarding.steps.prompt.bullets.0'),
          t('onboarding.steps.prompt.bullets.1'),
          t('onboarding.steps.prompt.bullets.2')
        ]
      },
      {
        icon: ImagePlus,
        visual: 'reference',
        title: t('onboarding.steps.reference.title'),
        body: t('onboarding.steps.reference.body'),
        bullets: [
          t('onboarding.steps.reference.bullets.0'),
          t('onboarding.steps.reference.bullets.1'),
          t('onboarding.steps.reference.bullets.2')
        ]
      },
      {
        icon: Wand2,
        visual: 'tasks',
        title: t('onboarding.steps.tasks.title'),
        body: t('onboarding.steps.tasks.body'),
        bullets: [
          t('onboarding.steps.tasks.bullets.0'),
          t('onboarding.steps.tasks.bullets.1'),
          t('onboarding.steps.tasks.bullets.2')
        ]
      }
    ],
    [t]
  );

  const close = useCallback(() => {
    markCreateOnboardingSeen();
    onClose();
  }, [onClose]);

  useModalScrollLock(open);

  useHotkeys(
    'arrowright,arrowleft',
    (event) => {
      if (event.key === 'ArrowRight') {
        setStepIndex((current) => Math.min(current + 1, steps.length - 1));
      } else if (event.key === 'ArrowLeft') {
        setStepIndex((current) => Math.max(current - 1, 0));
      }
    },
    { enabled: open },
    [open, steps.length]
  );

  if (!open) return null;

  const currentStep = steps[stepIndex];
  const StepIcon = currentStep.icon;
  const isLastStep = stepIndex === steps.length - 1;

  const goNext = () => {
    if (isLastStep) {
      close();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        className="create-onboarding-modal gap-0 p-0"
        overlayClassName="create-onboarding-backdrop"
        showCloseButton={false}
      >
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="create-onboarding-close"
            aria-label={t('onboarding.close')}
            leadingIcon={<X data-icon="only" />}
          ></Button>
        </DialogClose>

        <div className="create-onboarding-copy">
          <div className="create-onboarding-brand">
            <span>
              <Sparkles size={15} />
            </span>
            WebToMind
          </div>

          <div className="create-onboarding-step-icon">
            <StepIcon size={22} />
          </div>
          <DialogTitle asChild>
            <h1>{currentStep.title}</h1>
          </DialogTitle>
          <DialogDescription asChild>
            <p>{currentStep.body}</p>
          </DialogDescription>
          <ul>
            {currentStep.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>

          <div className="create-onboarding-actions">
            <Button
              type="button"
              className="create-onboarding-primary"
              onClick={goNext}
              trailingIcon={<ArrowRight data-icon="inline-end" />}
            >
              {isLastStep ? t('onboarding.start') : t('onboarding.next')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="create-onboarding-skip"
              onClick={close}
            >
              {t('onboarding.skip')}
            </Button>
          </div>

          <div
            className="create-onboarding-dots"
            aria-label={t('onboarding.progress')}
          >
            {steps.map((item, index) => (
              <Button
                key={item.visual}
                type="button"
                variant="ghost"
                size="icon"
                className={index === stepIndex ? 'active' : ''}
                onClick={() => setStepIndex(index)}
                aria-label={t('onboarding.goToStep', {
                  current: index + 1,
                  total: steps.length
                })}
              />
            ))}
          </div>
        </div>

        <div className="create-onboarding-visual">
          <CreateOnboardingVisual visual={currentStep.visual} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
