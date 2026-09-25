export interface SeoConfig {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string;
  alternates?: Array<{ hreflang: string; href: string }>;
  ogType?: string;
  ogImage?: string;
  ogLocale?: string;
  htmlLang?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  twitterSite?: string;
  twitterCreator?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

interface HeadSnapshot {
  title: string;
  htmlLang: string | null;
  entries: Map<string, string | null>;
  createdKeys: Set<string>;
  createdCanonical: boolean;
  createdJsonLd: boolean;
  previousJsonLd: string | null;
  alternateLinks: HTMLLinkElement[];
  removedAlternateLinks: Array<{
    link: HTMLLinkElement;
    parent: Node;
    nextSibling: ChildNode | null;
  }>;
}

const JSON_LD_ID = 'webtomind-seo-jsonld';

function upsertMeta(
  key: string,
  attr: 'name' | 'property',
  value: string,
  snapshot: HeadSnapshot
) {
  const selector = `meta[${attr}="${key}"]`;
  let meta = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
    snapshot.createdKeys.add(`${attr}:${key}`);
  }

  if (!snapshot.entries.has(`${attr}:${key}`)) {
    snapshot.entries.set(`${attr}:${key}`, meta.getAttribute('content'));
  }

  meta.setAttribute('content', value);
}

function removeOrRestoreMeta(
  key: string,
  attr: 'name' | 'property',
  snapshot: HeadSnapshot
) {
  const selector = `meta[${attr}="${key}"]`;
  const meta = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!meta) return;

  const entryKey = `${attr}:${key}`;
  if (!snapshot.entries.has(entryKey) && !snapshot.createdKeys.has(entryKey)) {
    return;
  }

  const previous = snapshot.entries.get(entryKey);
  if (snapshot.createdKeys.has(entryKey)) {
    meta.remove();
    return;
  }

  if (previous === null || previous === undefined) {
    meta.removeAttribute('content');
    return;
  }

  meta.setAttribute('content', previous);
}

export function applySeo(config: SeoConfig): () => void {
  const snapshot: HeadSnapshot = {
    title: document.title,
    htmlLang: document.documentElement.getAttribute('lang'),
    entries: new Map(),
    createdKeys: new Set(),
    createdCanonical: false,
    createdJsonLd: false,
    previousJsonLd: null,
    alternateLinks: [],
    removedAlternateLinks: []
  };

  document.title = config.title;

  const description = config.description || '';
  const canonical = config.canonical || window.location.href;
  const robots = config.robots || 'index,follow';
  const ogType = config.ogType || 'website';
  const twitterCard = config.twitterCard || 'summary_large_image';

  if (config.htmlLang) {
    document.documentElement.lang = config.htmlLang;
  }

  upsertMeta('description', 'name', description, snapshot);
  upsertMeta('robots', 'name', robots, snapshot);

  upsertMeta('og:title', 'property', config.title, snapshot);
  upsertMeta('og:description', 'property', description, snapshot);
  upsertMeta('og:type', 'property', ogType, snapshot);
  upsertMeta('og:url', 'property', canonical, snapshot);
  if (config.ogImage) {
    upsertMeta('og:image', 'property', config.ogImage, snapshot);
  }
  if (config.ogLocale) {
    upsertMeta('og:locale', 'property', config.ogLocale, snapshot);
  }

  upsertMeta('twitter:card', 'name', twitterCard, snapshot);
  upsertMeta('twitter:title', 'name', config.title, snapshot);
  upsertMeta('twitter:description', 'name', description, snapshot);
  if (config.ogImage) {
    upsertMeta('twitter:image', 'name', config.ogImage, snapshot);
  }
  if (config.twitterSite) {
    upsertMeta('twitter:site', 'name', config.twitterSite, snapshot);
  }
  if (config.twitterCreator) {
    upsertMeta('twitter:creator', 'name', config.twitterCreator, snapshot);
  }

  let canonicalLink = document.head.querySelector(
    'link[rel="canonical"]'
  ) as HTMLLinkElement | null;
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.appendChild(canonicalLink);
    snapshot.createdCanonical = true;
  }
  snapshot.entries.set('canonical:href', canonicalLink.getAttribute('href'));
  canonicalLink.href = canonical;

  document.head.querySelectorAll('link[rel="alternate"]').forEach((node) => {
    snapshot.removedAlternateLinks.push({
      link: node as HTMLLinkElement,
      parent: node.parentNode || document.head,
      nextSibling: node.nextSibling
    });
    node.remove();
  });
  (config.alternates || []).forEach((alt) => {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = alt.hreflang;
    link.href = alt.href;
    link.setAttribute('data-seo-alternate', '1');
    document.head.appendChild(link);
    snapshot.alternateLinks.push(link);
  });

  if (config.jsonLd) {
    let script = document.getElementById(
      JSON_LD_ID
    ) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = JSON_LD_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
      snapshot.createdJsonLd = true;
    }
    snapshot.previousJsonLd = script.textContent;
    script.textContent = JSON.stringify(config.jsonLd);
  }

  return () => {
    document.title = snapshot.title;

    if (snapshot.htmlLang === null) {
      document.documentElement.removeAttribute('lang');
    } else {
      document.documentElement.lang = snapshot.htmlLang;
    }

    removeOrRestoreMeta('description', 'name', snapshot);
    removeOrRestoreMeta('robots', 'name', snapshot);
    removeOrRestoreMeta('og:title', 'property', snapshot);
    removeOrRestoreMeta('og:description', 'property', snapshot);
    removeOrRestoreMeta('og:type', 'property', snapshot);
    removeOrRestoreMeta('og:url', 'property', snapshot);
    removeOrRestoreMeta('og:image', 'property', snapshot);
    removeOrRestoreMeta('og:locale', 'property', snapshot);
    removeOrRestoreMeta('twitter:card', 'name', snapshot);
    removeOrRestoreMeta('twitter:title', 'name', snapshot);
    removeOrRestoreMeta('twitter:description', 'name', snapshot);
    removeOrRestoreMeta('twitter:image', 'name', snapshot);
    removeOrRestoreMeta('twitter:site', 'name', snapshot);
    removeOrRestoreMeta('twitter:creator', 'name', snapshot);

    const canonicalOnCleanup = document.head.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement | null;
    if (canonicalOnCleanup) {
      const previousCanonical = snapshot.entries.get('canonical:href');
      if (snapshot.createdCanonical) {
        canonicalOnCleanup.remove();
      } else if (
        previousCanonical !== undefined &&
        previousCanonical !== null
      ) {
        canonicalOnCleanup.href = previousCanonical;
      }
    }

    const jsonLdScript = document.getElementById(JSON_LD_ID);
    if (jsonLdScript) {
      if (snapshot.createdJsonLd) {
        jsonLdScript.remove();
      } else {
        jsonLdScript.textContent = snapshot.previousJsonLd;
      }
    }

    snapshot.alternateLinks.forEach((link) => {
      if (link.parentNode) {
        link.remove();
      }
    });

    snapshot.removedAlternateLinks.forEach(({ link, parent, nextSibling }) => {
      if (link.parentNode) return;
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(link, nextSibling);
        return;
      }
      parent.appendChild(link);
    });
  };
}
