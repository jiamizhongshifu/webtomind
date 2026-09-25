/** @type {import('tailwindcss').Config} */

/*
 * Dayos 无色精密风 — 全局调色板重映射
 * 把 Tailwind 默认调色板家族重定向到无色基调 + 绿/黄功能强调 + 红报错，
 * 一次性覆盖工作台 65 组件里 4000+ 硬编码 slate/blue/indigo... 工具类。
 *   slate/gray/zinc/neutral/stone → 中性灰（achromatic）
 *   blue/indigo/violet/purple/sky/cyan → 墨黑（冷强调色去色）
 *   green/emerald/teal → Dayos Action Green
 *   amber/yellow/orange → Dayos Alert Yellow（金/黄强调）
 *   red/rose → 报错红（保留语义）
 */
const GRAY = {
  50: '#f8f8f9', 100: '#f0f0f2', 200: '#e4e4e7', 300: '#d3d3d8',
  400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46',
  800: '#27272a', 900: '#18181b', 950: '#0a0a0b'
};
const INK = {
  50: '#f5f5f6', 100: '#e8e8ea', 200: '#d4d4d7', 300: '#b4b4b8',
  400: '#76767c', 500: '#3a3a3f', 600: '#202024', 700: '#161619',
  800: '#0e0e10', 900: '#08080a', 950: '#000000'
};
const GREEN = {
  50: '#f0fff0', 100: '#d1ffca', 200: '#b5f7ab', 300: '#92e886',
  400: '#69cf5c', 500: '#43b13a', 600: '#2f8f33', 700: '#266f2c',
  800: '#1f5325', 900: '#143619', 950: '#0a1f0e'
};
const YELLOW = {
  50: '#fffde7', 100: '#fff8b8', 200: '#ffef70', 300: '#ffe22e',
  400: '#fbcf00', 500: '#dcae00', 600: '#ad8500', 700: '#7d5f00',
  800: '#4f3c00', 900: '#2f2400', 950: '#1a1400'
};
const RED = {
  50: '#fef2f2', 100: '#fde0e0', 200: '#fbc5c5', 300: '#f59c9c',
  400: '#ed6a6a', 500: '#e23d3d', 600: '#c92a2a', 700: '#a61f1f',
  800: '#841c1c', 900: '#6b1d1d', 950: '#3f0d0d'
};

export default {
  darkMode: ['class'],
  content: [
    './public/**/*.html',
    './src/**/*.{ts,tsx,js,jsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },

        // —— Dayos 无色精密风调色板重映射 ——
        slate: GRAY,
        gray: GRAY,
        zinc: GRAY,
        neutral: GRAY,
        stone: GRAY,
        blue: INK,
        indigo: INK,
        violet: INK,
        purple: INK,
        sky: INK,
        cyan: INK,
        green: GREEN,
        emerald: GREEN,
        teal: GREEN,
        lime: GREEN,
        amber: YELLOW,
        yellow: YELLOW,
        orange: YELLOW,
        red: RED,
        rose: RED,
        pink: RED
      },
      borderRadius: {
        xl: 'var(--radius-xl)',
        lg: 'var(--radius)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        full: 'var(--radius-full)'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)'
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
