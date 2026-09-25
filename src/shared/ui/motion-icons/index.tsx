import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type SVGProps
} from 'react';
import { clsx } from 'clsx';

export type DynamicIconName =
  | 'copy'
  | 'external-link'
  | 'home'
  | 'inspiration'
  | 'prompt-library'
  | 'image-create'
  | 'video-create'
  | 'gallery'
  | 'characters'
  | 'apps'
  | 'tasks'
  | 'workspace';

export interface DynamicIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface DynamicIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'name'
> {
  name: DynamicIconName;
  size?: number;
  strokeWidth?: number;
}

interface MotionIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size: number;
  strokeWidth: number;
}

interface AnimatedSvgIconProps extends Omit<MotionIconProps, 'children'> {
  iconName: DynamicIconName;
  children: (isAnimated: boolean) => ReactNode;
}

const DEFAULT_ICON_SIZE = 16;
const DEFAULT_STROKE_WIDTH = 2;
const ICON_PART_TRANSITION =
  'transform 180ms ease, opacity 180ms ease, stroke-width 180ms ease';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function motionPartStyle(
  transform: string | undefined,
  options: CSSProperties = {}
): CSSProperties {
  return {
    transition: ICON_PART_TRANSITION,
    transformBox: 'fill-box',
    transformOrigin: 'center',
    ...options,
    transform
  };
}

const useIconAnimationState = (ref: Ref<DynamicIconHandle>) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);

  const setAnimated = useCallback((isAnimated: boolean) => {
    const element = svgRef.current;
    if (!element) return;
    const nextIsAnimated = isAnimated && !prefersReducedMotion();
    element.dataset.animating = nextIsAnimated ? 'true' : 'false';
    setIsAnimated(nextIsAnimated);
  }, []);

  const startAnimation = useCallback(() => setAnimated(true), [setAnimated]);
  const stopAnimation = useCallback(() => setAnimated(false), [setAnimated]);

  useImperativeHandle(ref, () => ({ startAnimation, stopAnimation }), [
    startAnimation,
    stopAnimation
  ]);

  return { svgRef, isAnimated, startAnimation, stopAnimation };
};

const AnimatedSvgIcon = forwardRef<DynamicIconHandle, AnimatedSvgIconProps>(
  (
    {
      iconName,
      size,
      strokeWidth,
      className,
      color = 'currentColor',
      children,
      style,
      ...props
    },
    ref
  ) => {
    const { svgRef, isAnimated, startAnimation, stopAnimation } =
      useIconAnimationState(ref);

    return (
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={clsx(
          'ui-dynamic-icon',
          `ui-dynamic-icon--${iconName}`,
          className
        )}
        data-icon-name={iconName}
        onMouseEnter={startAnimation}
        onMouseLeave={stopAnimation}
        onFocus={startAnimation}
        onBlur={stopAnimation}
        {...props}
        style={{ overflow: 'visible', ...style }}
      >
        {children(isAnimated)}
      </svg>
    );
  }
);

AnimatedSvgIcon.displayName = 'AnimatedSvgIcon';

// Adapted from itshover/itshover icon motion patterns (MIT).
const CopyMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => {
    return (
      <AnimatedSvgIcon ref={ref} iconName="copy" {...props}>
        {(isAnimated) => (
          <>
            <rect
              className="ui-dynamic-icon__copy-back"
              x="7"
              y="7"
              width="12"
              height="12"
              rx="2"
              style={motionPartStyle(
                isAnimated ? 'translate(-1px, 1px)' : 'translate(-2px, 2px)',
                { opacity: isAnimated ? 0.72 : 1 }
              )}
            />
            <rect
              className="ui-dynamic-icon__copy-front"
              x="5"
              y="5"
              width="12"
              height="12"
              rx="2"
              style={motionPartStyle(
                isAnimated ? 'translate(1px, -1px)' : undefined
              )}
            />
          </>
        )}
      </AnimatedSvgIcon>
    );
  }
);

CopyMotionIcon.displayName = 'CopyMotionIcon';

// Adapted from itshover/itshover icon motion patterns (MIT).
const ExternalLinkMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => {
    return (
      <AnimatedSvgIcon ref={ref} iconName="external-link" {...props}>
        {(isAnimated) => (
          <>
            <path
              className="ui-dynamic-icon__external-box"
              d="M15 3h6v6"
              style={motionPartStyle(
                isAnimated ? 'translate(1px, -1px)' : undefined
              )}
            />
            <path
              className="ui-dynamic-icon__external-arrow"
              d="M10 14 21 3"
              style={motionPartStyle(
                isAnimated ? 'translate(1px, -1px)' : undefined
              )}
            />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </>
        )}
      </AnimatedSvgIcon>
    );
  }
);

ExternalLinkMotionIcon.displayName = 'ExternalLinkMotionIcon';

const HomeMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="home" {...props}>
      {(isAnimated) => (
        <>
          <path
            d="M5 12 3 12 12 3l9 9h-2"
            style={motionPartStyle(
              isAnimated ? 'translateY(-1.5px)' : undefined,
              { opacity: isAnimated ? 0.8 : 1 }
            )}
          />
          <path
            d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
            style={motionPartStyle(isAnimated ? 'scale(1.04)' : undefined)}
          />
          <path
            d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"
            style={motionPartStyle(isAnimated ? 'scaleY(1.08)' : undefined, {
              transformOrigin: 'center bottom'
            })}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

HomeMotionIcon.displayName = 'HomeMotionIcon';

const InspirationMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="inspiration" {...props}>
      {(isAnimated) => (
        <>
          <path
            d="M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2z"
            style={motionPartStyle(
              isAnimated ? 'rotate(90deg) scale(1.08)' : undefined
            )}
          />
          <path
            d="M16 6a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2z"
            style={motionPartStyle(
              isAnimated ? 'rotate(-90deg) scale(0.94)' : undefined,
              { opacity: isAnimated ? 0.72 : 1 }
            )}
          />
          <path
            d="M9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6z"
            style={motionPartStyle(
              isAnimated ? 'rotate(18deg) scale(1.08)' : undefined
            )}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

InspirationMotionIcon.displayName = 'InspirationMotionIcon';

const PromptLibraryMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="prompt-library" {...props}>
      {(isAnimated) => (
        <>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
          <path
            d="M8 6h7"
            style={motionPartStyle(
              isAnimated ? 'translateX(1.5px)' : undefined
            )}
          />
          <path
            d="M8 10h5"
            style={motionPartStyle(isAnimated ? 'translateX(3px)' : undefined)}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

PromptLibraryMotionIcon.displayName = 'PromptLibraryMotionIcon';

const ImageCreateMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="image-create" {...props}>
      {(isAnimated) => (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle
            cx="8.5"
            cy="10"
            r="1.5"
            style={motionPartStyle(
              isAnimated ? 'translateY(-1px) scale(1.08)' : undefined
            )}
          />
          <path
            d="m21 15-5-5L5 19"
            style={motionPartStyle(
              isAnimated ? 'translateY(-1.5px)' : undefined
            )}
          />
          <path
            d="m14 19-3.5-3.5"
            style={motionPartStyle(isAnimated ? 'translateX(1px)' : undefined)}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

ImageCreateMotionIcon.displayName = 'ImageCreateMotionIcon';

const VideoCreateMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="video-create" {...props}>
      {(isAnimated) => (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path
            d="m10 8 6 4-6 4V8z"
            style={motionPartStyle(
              isAnimated ? 'translateX(1.5px) scale(1.08)' : undefined
            )}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

VideoCreateMotionIcon.displayName = 'VideoCreateMotionIcon';

const GalleryMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="gallery" {...props}>
      {(isAnimated) => (
        <>
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="2"
            style={motionPartStyle(
              isAnimated ? 'translate(1px, -1px)' : undefined
            )}
          />
          <path
            d="M3 7v10a4 4 0 0 0 4 4h10"
            style={motionPartStyle(
              isAnimated ? 'translate(-1px, 1px)' : undefined,
              { opacity: isAnimated ? 0.7 : 1 }
            )}
          />
          <path d="m8 15 3-3 2 2 3-4 3 5" />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

GalleryMotionIcon.displayName = 'GalleryMotionIcon';

const CharactersMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="characters" {...props}>
      {(isAnimated) => (
        <>
          <circle
            cx="12"
            cy="7.5"
            r="3"
            style={motionPartStyle(isAnimated ? 'translateY(-1px)' : undefined)}
          />
          <path
            d="M5 21a7 7 0 0 1 14 0"
            style={motionPartStyle(
              isAnimated ? 'translateY(1px) scaleX(1.04)' : undefined
            )}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

CharactersMotionIcon.displayName = 'CharactersMotionIcon';

const AppsMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="apps" {...props}>
      {(isAnimated) => (
        <>
          <rect
            x="4"
            y="4"
            width="6"
            height="6"
            rx="1"
            style={motionPartStyle(
              isAnimated ? 'translate(-1px, -1px)' : undefined
            )}
          />
          <rect
            x="14"
            y="4"
            width="6"
            height="6"
            rx="1"
            style={motionPartStyle(
              isAnimated ? 'translate(1px, -1px)' : undefined
            )}
          />
          <rect
            x="4"
            y="14"
            width="6"
            height="6"
            rx="1"
            style={motionPartStyle(
              isAnimated ? 'translate(-1px, 1px)' : undefined
            )}
          />
          <rect
            x="14"
            y="14"
            width="6"
            height="6"
            rx="1"
            style={motionPartStyle(
              isAnimated ? 'translate(1px, 1px)' : undefined
            )}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

AppsMotionIcon.displayName = 'AppsMotionIcon';

const TasksMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="tasks" {...props}>
      {(isAnimated) => (
        <>
          <path
            d="M8 21h8"
            style={motionPartStyle(isAnimated ? 'translateY(1px)' : undefined)}
          />
          <path
            d="M12 17v4"
            style={motionPartStyle(isAnimated ? 'translateY(1px)' : undefined)}
          />
          <path
            d="M7 4h10v5a5 5 0 0 1-10 0V4z"
            style={motionPartStyle(isAnimated ? 'translateY(-1px)' : undefined)}
          />
          <path d="M7 7H4a3 3 0 0 0 3 3" />
          <path d="M17 7h3a3 3 0 0 1-3 3" />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

TasksMotionIcon.displayName = 'TasksMotionIcon';

const WorkspaceMotionIcon = forwardRef<DynamicIconHandle, MotionIconProps>(
  (props, ref) => (
    <AnimatedSvgIcon ref={ref} iconName="workspace" {...props}>
      {(isAnimated) => (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path
            d="M3 9h18"
            style={motionPartStyle(isAnimated ? 'translateY(-1px)' : undefined)}
          />
          <path
            d="M9 21V9"
            style={motionPartStyle(isAnimated ? 'translateX(-1px)' : undefined)}
          />
          <path
            d="M14 13h4"
            style={motionPartStyle(isAnimated ? 'translateX(1px)' : undefined)}
          />
          <path
            d="M14 17h3"
            style={motionPartStyle(isAnimated ? 'translateX(2px)' : undefined)}
          />
        </>
      )}
    </AnimatedSvgIcon>
  )
);

WorkspaceMotionIcon.displayName = 'WorkspaceMotionIcon';

const DYNAMIC_ICON_COMPONENTS = {
  copy: CopyMotionIcon,
  'external-link': ExternalLinkMotionIcon,
  home: HomeMotionIcon,
  inspiration: InspirationMotionIcon,
  'prompt-library': PromptLibraryMotionIcon,
  'image-create': ImageCreateMotionIcon,
  'video-create': VideoCreateMotionIcon,
  gallery: GalleryMotionIcon,
  characters: CharactersMotionIcon,
  apps: AppsMotionIcon,
  tasks: TasksMotionIcon,
  workspace: WorkspaceMotionIcon
} satisfies Record<DynamicIconName, typeof CopyMotionIcon>;

export const DynamicIcon = forwardRef<DynamicIconHandle, DynamicIconProps>(
  (
    {
      name,
      size = DEFAULT_ICON_SIZE,
      strokeWidth = DEFAULT_STROKE_WIDTH,
      'aria-hidden': ariaHidden = true,
      focusable = false,
      ...props
    },
    ref
  ) => {
    const iconProps = {
      ...props,
      'aria-hidden': ariaHidden,
      focusable,
      size,
      strokeWidth
    };

    const Icon = DYNAMIC_ICON_COMPONENTS[name];
    return <Icon ref={ref} {...iconProps} />;
  }
);

DynamicIcon.displayName = 'DynamicIcon';
