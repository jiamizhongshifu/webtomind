import type { ReactNode } from 'react';
import { TopNav } from '../components/TopNav';
import { MarketingFooter } from '../components/MarketingFooter';
import { useMarketingLocale } from '../lib/marketing-locale';
import '../styles/marketing-pages.css';

interface MarketingPageShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  rootClassName?: string;
}

export function MarketingPageShell({
  title,
  subtitle,
  children,
  rootClassName
}: MarketingPageShellProps) {
  return (
    <div
      className={
        rootClassName
          ? `marketing-page-root ${rootClassName}`
          : 'marketing-page-root'
      }
    >
      <TopNav />

      <main className="marketing-page-main">
        <section className="marketing-page-title-row">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </section>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}

export { useMarketingLocale };
