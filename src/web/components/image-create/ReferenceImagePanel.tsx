import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import {
  deleteImageReference,
  listImageReferences,
  uploadImageReference
} from '@/services/agent-api';
import {
  IMAGE_REFERENCE_ROLES,
  MAX_IMAGE_REFERENCE_IDS,
  type ImageReferenceAsset,
  type ImageReferenceRole
} from '@/shared/image-reference-types';
import { Button, IconButton } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';

interface ReferenceImagePanelProps {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  selectedReferenceIds: string[];
  onSelectedReferenceIdsChange: (ids: string[]) => void;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
}

const ROLE_LABELS: Record<ImageReferenceRole, string> = {
  character: '角色',
  style: '风格',
  pose: '姿势',
  scene: '场景',
  product: '产品'
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export function ReferenceImagePanel({
  isAuthenticated,
  onRequireLogin,
  selectedReferenceIds,
  onSelectedReferenceIdsChange,
  setError,
  setStatusText
}: ReferenceImagePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<ImageReferenceAsset[]>([]);
  const [role, setRole] = useState<ImageReferenceRole>('character');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setReferences([]);
      onSelectedReferenceIdsChange([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listImageReferences()
      .then((items) => {
        if (cancelled) return;
        setReferences(items);
        const available = new Set(items.map((item) => item.id));
        onSelectedReferenceIdsChange(
          selectedReferenceIds.filter((id) => available.has(id))
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : '参考图加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // 初次鉴权完成后加载一次;选择变化不应触发重复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const toggleReference = (referenceId: string) => {
    if (selectedReferenceIds.includes(referenceId)) {
      onSelectedReferenceIdsChange(
        selectedReferenceIds.filter((id) => id !== referenceId)
      );
      return;
    }
    if (selectedReferenceIds.length >= MAX_IMAGE_REFERENCE_IDS) {
      setError(`本次最多选择 ${MAX_IMAGE_REFERENCE_IDS} 张参考图`);
      return;
    }
    onSelectedReferenceIdsChange([...selectedReferenceIds, referenceId]);
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('仅支持图片格式');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const imageBase64 = await fileToDataUrl(file);
      const reference = await uploadImageReference({
        imageBase64,
        mimeType: file.type,
        role,
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 80)
      });
      setReferences((current) => [
        reference,
        ...current.filter((item) => item.id !== reference.id)
      ]);
      if (selectedReferenceIds.length < MAX_IMAGE_REFERENCE_IDS) {
        onSelectedReferenceIdsChange([...selectedReferenceIds, reference.id]);
      }
      setStatusText('参考图已上传');
    } catch (error) {
      setError(error instanceof Error ? error.message : '参考图上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (referenceId: string) => {
    setDeletingId(referenceId);
    setError('');
    try {
      await deleteImageReference(referenceId);
      setReferences((current) =>
        current.filter((item) => item.id !== referenceId)
      );
      onSelectedReferenceIdsChange(
        selectedReferenceIds.filter((id) => id !== referenceId)
      );
      setStatusText('参考图已删除');
    } catch (error) {
      setError(error instanceof Error ? error.message : '参考图删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="creator-subpanel reference-panel">
      <div className="creator-panel-head">
        <span>参考图</span>
        <strong>{selectedReferenceIds.length}</strong>
      </div>

      <div className="reference-upload-row">
        <Button
          type="button"
          variant="outline"
          className="reference-upload-primary"
          onClick={() =>
            isAuthenticated ? fileInputRef.current?.click() : onRequireLogin()
          }
          disabled={uploading}
          leadingIcon={
            uploading ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Upload size={15} />
            )
          }
        >
          上传
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) =>
            void handleUpload(event.target.files?.[0] || null)
          }
        />
        <div className="reference-role-inline">
          <span>上传后归类为</span>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as ImageReferenceRole)}
          >
            <SelectTrigger
              className="reference-role-trigger"
              aria-label="参考图类型"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {IMAGE_REFERENCE_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="reference-panel-note">
        选择的参考图会随生成请求一起提交。当前最多 {MAX_IMAGE_REFERENCE_IDS}{' '}
        张，角色卡会复用这些参考图。
      </p>

      {loading ? (
        <div className="reference-empty">
          <Loader2 size={16} className="spin" />
          加载参考图...
        </div>
      ) : references.length === 0 ? (
        <div className="reference-empty">
          <ImageIcon size={18} />
          上传角色、风格或姿势参考图。
        </div>
      ) : (
        <div className="reference-grid">
          {references.map((reference) => {
            const selected = selectedReferenceIds.includes(reference.id);
            return (
              <div
                key={reference.id}
                className={`reference-card${selected ? ' selected' : ''}`}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="reference-thumb"
                  onClick={() => toggleReference(reference.id)}
                  aria-pressed={selected}
                >
                  {reference.thumbnailUrl ? (
                    <img
                      src={reference.thumbnailUrl}
                      alt={reference.label}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <ImageIcon size={20} />
                  )}
                </Button>
                <div className="reference-card-meta">
                  <span>{reference.label}</span>
                  <small>{ROLE_LABELS[reference.role]}</small>
                </div>
                <IconButton
                  type="button"
                  variant="ghost"
                  className="reference-delete"
                  onClick={() => void handleDelete(reference.id)}
                  disabled={deletingId === reference.id}
                  label="删除参考图"
                  icon={
                    deletingId === reference.id ? (
                      <Loader2 className="spin" />
                    ) : (
                      <Trash2 />
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
