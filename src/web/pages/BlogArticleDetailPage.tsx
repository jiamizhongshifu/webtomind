import { useParams } from 'react-router-dom';
import { USE_CASE_TUTORIALS } from '../data/marketing-content';
import { BlogDetailPage } from './BlogDetailPage';
import { UseCaseDetailPage } from './UseCaseDetailPage';

/**
 * The blog hub contains both editorial posts and tutorial-style SEO articles.
 * They share one public URL namespace while retaining their appropriate page
 * structure and structured-data type.
 */
export function BlogArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const isTutorial = USE_CASE_TUTORIALS.some((item) => item.slug === slug);

  return isTutorial ? <UseCaseDetailPage /> : <BlogDetailPage />;
}
