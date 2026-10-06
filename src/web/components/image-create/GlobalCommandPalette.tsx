import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOverlayBehavior } from '@/shared/ui/useOverlayBehavior';

const GlobalCommandPaletteDialog = lazy(() =>
  import('./GlobalCommandPaletteDialog').then((module) => ({
    default: module.GlobalCommandPaletteDialog
  }))
);

interface GlobalCommandPaletteProps {
  localePrefix: '' | '/zh-CN' | '/en-US';
}

export function GlobalCommandPalette({
  localePrefix
}: GlobalCommandPaletteProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useOverlayBehavior<HTMLDivElement>({ open, onClose: close });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate]
  );

  return (
    <div className="global-command-palette" data-open={open ? 'true' : 'false'}>
      {open ? (
        <div
          className="global-command-palette-backdrop"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            tabIndex={-1}
            className="global-command-palette-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="命令面板"
          >
            <Suspense fallback={null}>
              <GlobalCommandPaletteDialog
                localePrefix={localePrefix}
                onNavigate={go}
              />
            </Suspense>
          </div>
        </div>
      ) : null}
    </div>
  );
}
