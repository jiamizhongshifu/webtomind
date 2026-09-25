export type SrefExternalReference = {
  code: string;
  title: string;
  likes: number;
  sourceUrl: string;
};

export const SREF_EXTERNAL_SOURCE = {
  name: 'SREF Midjourney',
  url: 'https://sref-midjourney.com/zh',
  capturedAt: '2026-06-13'
} as const;

export const SREF_EXTERNAL_REFERENCES: SrefExternalReference[] = [
  {
    code: '3193102811',
    title: 'Celestial Charm',
    likes: 16122,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/3193102811'
  },
  {
    code: '2178024008',
    title: 'Futuristic Iridescence',
    likes: 13455,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/2178024008'
  },
  {
    code: '2809429389',
    title: 'Pale Blue Citrus',
    likes: 7763,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/2809429389'
  },
  {
    code: '159188116',
    title: 'Elegant Color Fusion',
    likes: 7120,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/159188116'
  },
  {
    code: '364111995',
    title: 'Retro Pop Oasis',
    likes: 6068,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/364111995'
  },
  {
    code: '3331600473',
    title: 'Blurred Lines',
    likes: 6499,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/3331600473'
  },
  {
    code: '698401885',
    title: 'Ethereal Dreams',
    likes: 5142,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/698401885'
  },
  {
    code: '2158083008',
    title: 'Noir Fantasy Fusion',
    likes: 4915,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/2158083008'
  },
  {
    code: '3117130089',
    title: 'Formal Photo',
    likes: 4048,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/3117130089'
  },
  {
    code: '3721090848',
    title: 'Modern Tranquility',
    likes: 4080,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/3721090848'
  },
  {
    code: '680572301',
    title: 'Whimsical Sunny Cat Portrait',
    likes: 2226,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/680572301'
  },
  {
    code: '1985921848',
    title: 'Dreamlike Serenity',
    likes: 4312,
    sourceUrl: 'https://sref-midjourney.com/zh/sref/1985921848'
  }
];
