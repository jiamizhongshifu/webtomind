/**
 * 个人素材编辑弹窗。
 *
 * 表单态完全自持:组件内部从 initialAsset 初始化草稿 + saving + error。
 * 父级只负责:提供要编辑的原始素材(initialAsset)、实际保存(onSave)、关闭(onClose)。
 * 用 key={asset.id} 保证切换素材时重新挂载、重置表单。
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2 } from 'lucide-react';
import type {
  ImagePromptAsset,
  ImagePromptSlot
} from '../../data/image-prompt-core';
import type { UserPromptAssetSaveInput } from '@/services/agent-api';
import {
  Button,
  DialogRoot,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@/shared/ui';
import { Field, FieldError, FieldLabel } from '@/shared/ui/radix/field';

interface SlotOption {
  id: ImagePromptSlot;
}

export interface AssetEditModalProps {
  initialAsset: ImagePromptAsset;
  slots: ReadonlyArray<SlotOption>;
  getSlotLabel: (slot: ImagePromptSlot) => string;
  onClose: () => void;
  /** 父级负责持久化 + 刷新列表;成功 resolve,失败 throw */
  onSave: (payload: UserPromptAssetSaveInput) => Promise<void>;
}

export function AssetEditModal({
  initialAsset,
  slots,
  getSlotLabel,
  onClose,
  onSave
}: AssetEditModalProps) {
  const { t } = useTranslation('imageCreate');
  const [draft, setDraft] = useState(() => ({
    id: initialAsset.id,
    slot: initialAsset.slot,
    title: initialAsset.title || '',
    subtitle: initialAsset.subtitle || '',
    prompt: initialAsset.prompt || initialAsset.promptZh || '',
    promptZh: '',
    negativePrompt:
      initialAsset.negativePrompt || initialAsset.negativePromptZh || '',
    negativePromptZh: '',
    tagsText: (initialAsset.tags || []).join(', '),
    thumbnailUrl: initialAsset.thumbnailUrl || ''
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (saving) return;
    const prompt = draft.prompt.trim();
    if (!prompt) {
      setError(t('upload.promptRequired') as string);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const tags = draft.tagsText
        .split(/[,，;；\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
      await onSave({
        id: draft.id, // 带 id 走 upsert,更新现有行
        slot: draft.slot,
        title: draft.title.trim() || (t('upload.untitled') as string),
        subtitle: draft.subtitle.trim(),
        prompt,
        promptZh: null,
        negativePrompt: draft.negativePrompt.trim() || null,
        negativePromptZh: null,
        tags,
        thumbnailUrl: draft.thumbnailUrl
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : (t('upload.saveFailed') as string)
      );
    } finally {
      setSaving(false);
    }
  };

  const title = t('mine.editTitle') as string;

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="creator-edit-modal"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader className="creator-edit-dialog-header">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="creator-edit-dialog-body">
          <div className="creator-preview-body creator-edit-body">
            <div className="creator-preview-image">
              {draft.thumbnailUrl ? (
                <img src={draft.thumbnailUrl} alt="" />
              ) : (
                <div className="creator-preview-image-empty" />
              )}
            </div>
            <div className="creator-preview-side creator-upload-form">
              <FieldError className="creator-error">{error}</FieldError>
              <div className="creator-edit-form">
                <div className="creator-upload-row-head">
                  <SelectRoot
                    value={draft.slot}
                    onValueChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        slot: value as ImagePromptSlot
                      }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger
                      className="creator-upload-row-slot"
                      aria-label={t('upload.fieldSlot') as string}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {slots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {getSlotLabel(slot.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                  <Input
                    className="creator-upload-row-title"
                    placeholder={t('upload.fieldTitle') as string}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        title: event.target.value
                      }))
                    }
                    disabled={saving}
                  />
                  <Input
                    className="creator-upload-row-subtitle"
                    placeholder={t('upload.fieldSubtitle') as string}
                    value={draft.subtitle}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        subtitle: event.target.value
                      }))
                    }
                    disabled={saving}
                  />
                </div>
                <Field
                  className="creator-upload-field"
                  data-invalid={Boolean(error)}
                >
                  <FieldLabel
                    className="creator-upload-field-label"
                    htmlFor="asset-edit-prompt"
                  >
                    {t('upload.fieldPrompt')}
                  </FieldLabel>
                  <Textarea
                    id="asset-edit-prompt"
                    rows={3}
                    value={draft.prompt}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        prompt: event.target.value
                      }))
                    }
                    disabled={saving}
                    aria-invalid={Boolean(error)}
                  />
                </Field>
                <Field className="creator-upload-field">
                  <FieldLabel
                    className="creator-upload-field-label"
                    htmlFor="asset-edit-negative-prompt"
                  >
                    {t('upload.fieldNegative')}
                  </FieldLabel>
                  <Textarea
                    id="asset-edit-negative-prompt"
                    rows={2}
                    value={draft.negativePrompt}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        negativePrompt: event.target.value
                      }))
                    }
                    disabled={saving}
                  />
                </Field>
                <Field className="creator-upload-field">
                  <FieldLabel
                    className="creator-upload-field-label"
                    htmlFor="asset-edit-tags"
                  >
                    {t('upload.fieldTags')}
                  </FieldLabel>
                  <Input
                    id="asset-edit-tags"
                    value={draft.tagsText}
                    placeholder={t('mine.editTagsPlaceholder') as string}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        tagsText: event.target.value
                      }))
                    }
                    disabled={saving}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="creator-edit-dialog-footer">
          <div className="creator-upload-actions">
            <Button
              type="button"
              variant="outline"
              className="creator-upload-cancel"
              onClick={handleClose}
              disabled={saving}
            >
              {t('upload.cancel')}
            </Button>
            <Button
              type="button"
              className="creator-upload-save"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={16} className="creator-spin-icon" />
              ) : (
                <Save size={16} />
              )}
              {t('mine.editSave')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
