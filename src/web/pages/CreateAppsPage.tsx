import { ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  getLocalizedCreateAppContentItems,
  type CreateAppLocale
} from '@/shared/create-apps';
import { CreateWorkspaceFrame } from '@/web/components/image-create/CreateWorkspaceFrame';
import { applySeo } from '@/web/lib/seo';
import '@/web/styles/image-tools.css';

export function CreateAppsPage() {
  const { pathname } = useLocation();
  const isZh = !pathname.startsWith('/en-US');
  const locale: CreateAppLocale = isZh ? 'zh-CN' : 'en-US';
  const apps = getLocalizedCreateAppContentItems(locale);
  const prefix = isZh ? '/zh-CN' : '/en-US';

  useEffect(
    () =>
      applySeo({
        title: isZh
          ? '免费在线图片工具 | WebToMind'
          : 'Free Online Image Tools | WebToMind',
        description: isZh
          ? '一组专注、可直接使用的在线图片工具：从 AI 放大、局部修复到图片整理与导出。'
          : 'Focused online tools for image creation cleanup, local repair, and file preparation.',
        htmlLang: isZh ? 'zh-CN' : 'en'
      }),
    [isZh]
  );

  return (
    <CreateWorkspaceFrame className="create-apps-route image-tools-directory">
      <div className="image-tools-directory-main">
        <header className="image-tools-directory-header">
          <p className="image-tools-directory-eyebrow">
            {isZh ? '在线图片工具' : 'Online image tools'}
          </p>
          <h1>
            {isZh
              ? '图片工具，打开就能用'
              : 'Image tools that get straight to work'}
          </h1>
          <p>
            {isZh
              ? '选择一个任务，上传图片，在独立工作台完成处理与下载。'
              : 'Choose a task, upload an image, and finish it in a focused workspace.'}
          </p>
        </header>

        <section
          className="image-tools-directory-grid"
          aria-label={isZh ? '图片工具列表' : 'Image tool list'}
        >
          {apps.map((tool, index) => (
            <Link
              className={`image-tools-directory-card${tool.featured ? ' featured' : ''}`}
              key={tool.slug}
              to={`${prefix}${tool.href}`}
            >
              <div className="image-tools-directory-card-media">
                <img
                  src={tool.coverImage}
                  alt={`${tool.title}工具封面`}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={index < 2 ? 'high' : 'auto'}
                />
                <span className="tool-index">
                  {tool.featured ? (
                    <Sparkles size={13} aria-hidden="true" />
                  ) : null}
                  {isZh ? '工具' : 'Tool'} {String(index + 1).padStart(2, '0')}
                </span>
                <span className="image-tools-directory-processing">
                  <LockKeyhole size={12} aria-hidden="true" />
                  {tool.processing === 'local'
                    ? isZh
                      ? '本地处理'
                      : 'Local'
                    : tool.processing === 'service'
                      ? isZh
                        ? '服务处理'
                        : 'Service'
                      : isZh
                        ? '本地优先'
                        : 'Local first'}
                </span>
              </div>
              <div className="image-tools-directory-card-copy">
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
                <footer>
                  <span>
                    {tool.inputFormats.slice(0, 3).join(' · ')}
                    {' → '}
                    {tool.outputFormats.slice(0, 3).join(' · ')}
                  </span>
                  <span>
                    {isZh ? '打开' : 'Open'}
                    <ArrowUpRight aria-hidden="true" />
                  </span>
                </footer>
              </div>
            </Link>
          ))}
        </section>
        <p className="image-tools-directory-note">
          <LockKeyhole size={14} aria-hidden="true" />{' '}
          {isZh
            ? '本地工具不会上传或保存图片；只有 GPT Image 2 强力重绘在你明确提交后使用云端。'
            : 'Local tools never upload or retain images. Only the explicitly submitted GPT Image 2 redraw uses the cloud.'}
        </p>
      </div>
    </CreateWorkspaceFrame>
  );
}
