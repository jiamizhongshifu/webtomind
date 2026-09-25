import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { BOOT_WATCHDOG_SOURCE } from './src/shared/boot-watchdog';

if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'production';
}
delete process.env.VITE_USER_NODE_ENV;

function copyDirSync(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const STATIC_ASSET_DIRECTORIES = [
  ['icons', 'icons'],
  ['contact', 'contact'],
  ['create-apps', 'create app covers'],
  ['prompt-cases', 'prompt case assets'],
  ['moodboards', 'moodboard assets'],
  ['discovery', 'discovery assets'],
  ['referral', 'referral assets']
] as const;

function copyStaticAssetDirectories(outDir: string) {
  for (const [directory, label] of STATIC_ASSET_DIRECTORIES) {
    const source = path.resolve(__dirname, 'public', directory);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(outDir, directory);
    copyDirSync(source, destination);
    console.log(`? Copied ${label} to`, destination);
  }
}

/** 生成 sw.js 缓存命名版本：包版本 + 最近提交，保证每次构建缓存名不同。 */
function getSwCacheVersion(): string {
  let packageVersion = 'dev';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
    );
    packageVersion = String(pkg.version || 'dev');
  } catch {
    // 读取失败时退回通用版本号。
  }
  let gitShort = 'dev';
  try {
    gitShort = execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      encoding: 'utf8'
    })
      .trim()
      .slice(0, 8);
  } catch {
    // CI/离线环境可能没有 git，退回 dev 标记。
  }
  return `${packageVersion}-${gitShort}`;
}

function writeServiceWorker(outDir: string) {
  const srcFile = path.resolve(__dirname, 'public', 'sw.js');
  const destFile = path.join(outDir, 'sw.js');
  if (!fs.existsSync(srcFile)) return;
  const source = fs.readFileSync(srcFile, 'utf8');
  const rendered = source.replace(/__SW_CACHE_VERSION__/g, getSwCacheVersion());
  fs.writeFileSync(destFile, rendered);
  console.log(`? Wrote sw.js (cache ${getSwCacheVersion()}) to`, destFile);
}

function renameHtmlPlugin(outDir: string): Plugin {
  return {
    name: 'rename-html',
    closeBundle() {
      const webHtml = path.join(outDir, 'web.html');
      const indexHtml = path.join(outDir, 'index.html');

      if (fs.existsSync(webHtml)) {
        if (fs.existsSync(indexHtml)) {
          fs.unlinkSync(indexHtml);
        }

        fs.renameSync(webHtml, indexHtml);
        console.log('\n? Renamed web.html to index.html');
      }

      copyStaticAssetDirectories(outDir);

      const srcFavicon = path.resolve(__dirname, 'favicon.ico');
      const destFavicon = path.join(outDir, 'favicon.ico');
      if (fs.existsSync(srcFavicon)) {
        fs.copyFileSync(srcFavicon, destFavicon);
        console.log('? Copied favicon.ico to', destFavicon);
      }

      const seoFiles = [
        'robots.txt',
        'sitemap.xml',
        'BingSiteAuth.xml',
        '6796cb3e5ebfec970163618c59bf9f2c.txt',
        'manifest.json',
        'sw.js',
        'llms.txt',
        'gtm-init.js',
        'clarity-init.js',
        'ads.txt'
      ];
      for (const fileName of seoFiles) {
        if (fileName === 'sw.js') {
          writeServiceWorker(outDir);
          continue;
        }
        const srcFile = path.resolve(__dirname, 'public', fileName);
        const destFile = path.join(outDir, fileName);
        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`? Copied ${fileName} to`, destFile);
        }
      }
    }
  };
}

function performanceHintsPlugin(supabaseUrl: string): Plugin {
  return {
    name: 'web-performance-hints',
    transformIndexHtml() {
      if (!supabaseUrl) return [];

      try {
        const origin = new URL(supabaseUrl).origin;
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preconnect',
              href: origin,
              crossorigin: ''
            },
            injectTo: 'head'
          },
          {
            tag: 'link',
            attrs: {
              rel: 'dns-prefetch',
              href: origin
            },
            injectTo: 'head'
          }
        ];
      } catch {
        return [];
      }
    }
  };
}

// Publish only the static dependency graph, never preview/workspace dynamic
// imports. The Worker selects these hints on library routes, not every page.
function promptRouteAssetsPlugin(): Plugin {
  return {
    name: 'prompt-route-assets',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const bundle = context.bundle;
        if (!bundle) return [];
        const route = Object.values(bundle).find(
          (item) =>
            item.type === 'chunk' &&
            item.facadeModuleId?.endsWith('/pages/PromptSeoLandingPage.tsx')
        );
        if (!route || route.type !== 'chunk') return [];
        const files = new Set<string>();
        const visit = (file: string) => {
          if (files.has(file)) return;
          const chunk = bundle[file];
          if (!chunk || chunk.type !== 'chunk' || chunk.isEntry) return;
          files.add(file);
          chunk.imports.forEach(visit);
        };
        visit(route.fileName);
        return [
          {
            tag: 'script',
            attrs: {
              id: 'webtomind-prompt-route-assets',
              type: 'application/json'
            },
            children: JSON.stringify([...files].map((file) => `/${file}`)),
            injectTo: 'head'
          }
        ];
      }
    }
  };
}

function webManualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  const nodeModuleParts = id.split('/node_modules/');
  const packagePath = nodeModuleParts[nodeModuleParts.length - 1];
  const packageName = packagePath.startsWith('@')
    ? packagePath.split('/').slice(0, 2).join('/')
    : packagePath.split('/')[0];

  if (
    packageName === 'react' ||
    packageName === 'react-dom' ||
    packageName === 'scheduler' ||
    packageName === 'use-sync-external-store' ||
    packageName === '@tanstack/react-virtual' ||
    packageName === '@tanstack/virtual-core'
  ) {
    return 'vendor-react';
  }
  if (
    packageName.startsWith('@supabase/') ||
    packageName === '@google/generative-ai'
  ) {
    return 'vendor-api';
  }
  if (
    packageName.startsWith('@tiptap/') ||
    packageName.startsWith('prosemirror-')
  ) {
    return 'vendor-editor';
  }
  if (packageName === 'katex') {
    return 'vendor-katex';
  }
  if (packageName === 'html2canvas') {
    return 'vendor-html2canvas';
  }
  if (
    packageName.startsWith('markdown-it') ||
    packageName === 'linkify-it' ||
    packageName === 'mdurl' ||
    packageName === 'entities' ||
    packageName === 'uc.micro'
  ) {
    return 'vendor-markdown';
  }
  if (packageName === 'lucide-react') {
    return 'vendor-icons';
  }
  if (packageName === 'i18next' || packageName === 'react-i18next') {
    return 'vendor-i18n';
  }
  if (
    packageName.startsWith('react-router') ||
    packageName.startsWith('@remix-run/')
  ) {
    return 'vendor-router';
  }
  if (
    packageName === 'dompurify' ||
    packageName === 'idb' ||
    packageName === 'zustand'
  ) {
    return 'vendor-browser';
  }
  if (packageName === 'yaml') {
    return 'vendor-yaml';
  }
  return undefined;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const getEnv = (key: string) => env[key] || process.env[key] || '';
  const googleClientId =
    getEnv('VITE_GOOGLE_CLIENT_ID') || process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const supabaseUrl = getEnv('VITE_SUPABASE_URL').trim();
  const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY').trim();
  const createWorkspaceFlags = getEnv('VITE_CREATE_WORKSPACE_FLAGS').trim();
  const buildOutDir =
    process.env.WEBTOMIND_BUILD_OUT_DIR?.trim() || 'server/public';

  if (command === 'build') {
    const missingSupabaseEnv = [
      !supabaseUrl ? 'VITE_SUPABASE_URL' : '',
      !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : ''
    ].filter(Boolean);

    if (
      missingSupabaseEnv.length > 0 ||
      supabaseUrl.includes('placeholder.supabase.co')
    ) {
      throw new Error(
        `[Vite Build] Missing production Supabase env: ${
          missingSupabaseEnv.join(', ') ||
          'VITE_SUPABASE_URL uses placeholder.supabase.co'
        }`
      );
    }
  }

  console.log('[Vite Build] Environment variables loaded:');
  console.log('  VITE_SUPABASE_URL:', supabaseUrl ? '?' : '? (empty)');
  console.log('  VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '?' : '? (empty)');
  console.log('  VITE_GOOGLE_CLIENT_ID:', googleClientId ? '?' : '? (empty)');

  return {
    plugins: [
      react(),
      {
        name: 'webtomind-boot-watchdog-dev',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use(
            '/boot-watchdog.js',
            (_request, response, next) => {
              if (response.headersSent) {
                next();
                return;
              }
              response.setHeader(
                'Content-Type',
                'application/javascript; charset=utf-8'
              );
              response.end(BOOT_WATCHDOG_SOURCE);
            }
          );
        }
      },
      performanceHintsPlugin(supabaseUrl),
      promptRouteAssetsPlugin(),
      renameHtmlPlugin(buildOutDir)
    ],
    envFile: false,
    esbuild: {
      jsx: 'automatic',
      jsxDev: false
    },
    resolve: {
      conditions: ['onnxruntime-web-use-extern-wasm'],
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    root: '.',
    publicDir: false,
    build: {
      outDir: buildOutDir,
      emptyOutDir: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'web.html')
        },
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
          manualChunks: webManualChunks
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.VITE_FORCE_HTTP_API': JSON.stringify('true'),
      'import.meta.env.VITE_API_BASE': JSON.stringify(getEnv('VITE_API_BASE')),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
      'import.meta.env.VITE_E2E_BYPASS_AUTH': JSON.stringify(
        getEnv('VITE_E2E_BYPASS_AUTH')
      ),
      'import.meta.env.VITE_CREATE_WORKSPACE_FLAGS':
        JSON.stringify(createWorkspaceFlags)
    }
  };
});
