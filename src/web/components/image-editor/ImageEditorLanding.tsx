import { FolderOpen, LoaderCircle, Upload } from 'lucide-react';

interface ImageEditorLandingProps {
  isEnglish: boolean;
  importing?: boolean;
  error?: string;
  onUpload: () => void;
  onSelectAsset: () => void;
}

export function ImageEditorLanding({
  isEnglish,
  importing = false,
  error = '',
  onUpload,
  onSelectAsset
}: ImageEditorLandingProps) {
  return (
    <section className="image-editor-landing" aria-label="图片编辑">
      <div className="image-editor-landing-card">
        {importing ? (
          <div className="image-editor-landing-importing" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <strong>{isEnglish ? 'Loading image…' : '正在载入图片…'}</strong>
          </div>
        ) : (
          <>
            <span className="image-editor-landing-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <h1>{isEnglish ? 'Edit' : '图片编辑'}</h1>
            <p>
              {isEnglish
                ? 'Rearrange objects in your scene, blend elements from multiple images, place characters, or expand the edges.'
                : '重新排列画面中的物体、融合多张图片的元素、放置角色，或扩展画面边缘。'}
            </p>
            <div className="image-editor-landing-actions">
              <button type="button" className="image-editor-landing-primary" onClick={onUpload}>
                <Upload aria-hidden="true" />
                {isEnglish ? 'Upload image' : '上传图片'}
              </button>
              <button type="button" className="image-editor-landing-secondary" onClick={onSelectAsset}>
                <FolderOpen aria-hidden="true" />
                {isEnglish ? 'Select asset' : '选择资产'}
              </button>
            </div>
            <small>
              {isEnglish
                ? 'JPEG / PNG / WebP · up to 20 MB'
                : 'JPEG / PNG / WebP · 最大 20 MB'}
            </small>
            {error ? (
              <p className="image-editor-landing-error" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
