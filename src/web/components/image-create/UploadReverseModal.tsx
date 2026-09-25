/**
 * 上传图片 → VLM 反推 → 多行确认入库弹窗。
 *
 * props-passthrough:uploadDraft 涉及多阶段上传流程(uploadStage)+ 动态行 +
 * 全选/全不选,与父级 userAssets / selection / activeSlot 强耦合,风险较高,
 * 故不下沉表单态。父级(ImageCreatePage)持有 draft + 行变更 + 保存逻辑,
 * 本组件只负责渲染 + 把交互回调上抛。
 */

import { useTranslation } from 'react-i18next';
import { X, Check, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import type { ImagePromptSlot } from '../../data/image-prompt-core';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@/shared/ui';
import { Field, FieldError, FieldLabel } from '@/shared/ui/radix/field';

export interface UploadDraftRow {
  key: string;
  selected: boolean;
  slot: ImagePromptSlot;
  title: string;
  subtitle: string;
  prompt: string;
  negativePrompt: string;
  tagsText: string;
}

interface SlotOption {
  id: ImagePromptSlot;
}

export interface UploadReverseModalProps {
  thumbnailUrl: string;
  sourcePrompt?: string;
  rows: UploadDraftRow[];
  /** uploadStage === 'saving',保存中禁用全部交互 */
  saving: boolean;
  error: string;
  slots: ReadonlyArray<SlotOption>;
  getSlotLabel: (slot: ImagePromptSlot) => string;
  onUpdateRow: (key: string, patch: Partial<UploadDraftRow>) => void;
  onRemoveRow: (key: string) => void;
  onAddRow: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function UploadReverseModal({
  thumbnailUrl,
  sourcePrompt,
  rows,
  saving,
  error,
  slots,
  getSlotLabel,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  onCancel,
  onSave
}: UploadReverseModalProps) {
  const { t } = useTranslation('imageCreate');
  const selectedCount = rows.filter((row) => row.selected).length;

  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
    >
      <DialogContent
        className="creator-upload-modal"
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (saving) event.preventDefault();
        }}
      >
        <DialogHeader className="creator-upload-dialog-header">
          <DialogTitle>{t('upload.confirmTitle')}</DialogTitle>
        </DialogHeader>
        <div className="creator-upload-dialog-body">
          <div className="creator-preview-body creator-upload-body">
            <div className="creator-preview-image">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" />
              ) : (
                <div className="creator-upload-source-prompt">
                  <span>{t('upload.sourcePromptTitle')}</span>
                  <p>{sourcePrompt || t('upload.sourcePromptEmpty')}</p>
                </div>
              )}
            </div>
            <div className="creator-preview-side creator-upload-form">
              <div className="creator-upload-summary">
                <p className="creator-upload-hint">
                  {t('upload.batchSubtitle', { count: rows.length })}
                </p>
              </div>
              <FieldError className="creator-error">{error}</FieldError>

              <div className="creator-upload-rows">
                {rows.map((row, idx) => (
                  <div
                    key={row.key}
                    className={`creator-upload-row ${
                      row.selected ? 'selected' : 'disabled'
                    }`}
                  >
                    <div className="creator-upload-row-head">
                      {/*
                          原小 checkbox + 数字编号易被忽略,改成视觉显眼的"保存/不保存"
                          切换按钮:选中=绿色实心,未选=灰描边。整张 row 在未选时降透明度
                          (.creator-upload-row.disabled),让用户一眼看清哪条会入库。
                        */}
                      <Button
                        type="button"
                        variant={row.selected ? 'primary' : 'outline'}
                        size="sm"
                        className={`creator-upload-row-save-toggle ${
                          row.selected ? 'is-on' : 'is-off'
                        }`}
                        aria-pressed={row.selected}
                        onClick={() =>
                          onUpdateRow(row.key, { selected: !row.selected })
                        }
                        disabled={saving}
                        title={`#${idx + 1}`}
                      >
                        {row.selected ? (
                          <>
                            <Check data-icon="inline-start" />
                            <span>{t('upload.saveThis')}</span>
                          </>
                        ) : (
                          <>
                            <X data-icon="inline-start" />
                            <span>{t('upload.skipThis')}</span>
                          </>
                        )}
                      </Button>
                      <SelectRoot
                        value={row.slot}
                        onValueChange={(value) =>
                          onUpdateRow(row.key, {
                            slot: value as ImagePromptSlot
                          })
                        }
                        disabled={saving}
                      >
                        <SelectTrigger className="creator-upload-row-slot">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {slots.map((slot) => (
                              <SelectItem key={slot.id} value={slot.id}>
                                {getSlotLabel(slot.id)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </SelectRoot>
                      <Input
                        className="creator-upload-row-title"
                        placeholder={t('upload.fieldTitle') as string}
                        value={row.title}
                        onChange={(event) =>
                          onUpdateRow(row.key, { title: event.target.value })
                        }
                        disabled={saving}
                      />
                      <Input
                        className="creator-upload-row-subtitle"
                        placeholder={t('upload.fieldSubtitle') as string}
                        value={row.subtitle}
                        onChange={(event) =>
                          onUpdateRow(row.key, {
                            subtitle: event.target.value
                          })
                        }
                        disabled={saving}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="creator-upload-row-remove"
                        aria-label={t('upload.removeRow') as string}
                        onClick={() => onRemoveRow(row.key)}
                        disabled={saving}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="creator-upload-row-body">
                      <Field className="creator-upload-field">
                        <FieldLabel
                          className="creator-upload-field-label"
                          htmlFor={`${row.key}-prompt`}
                        >
                          {t('upload.fieldPrompt')}
                        </FieldLabel>
                        <Textarea
                          id={`${row.key}-prompt`}
                          rows={3}
                          value={row.prompt}
                          onChange={(event) =>
                            onUpdateRow(row.key, {
                              prompt: event.target.value
                            })
                          }
                          disabled={saving}
                        />
                      </Field>
                      <Field className="creator-upload-field">
                        <FieldLabel
                          className="creator-upload-field-label"
                          htmlFor={`${row.key}-negative-prompt`}
                        >
                          {t('upload.fieldNegative')}
                        </FieldLabel>
                        <Textarea
                          id={`${row.key}-negative-prompt`}
                          rows={2}
                          value={row.negativePrompt}
                          onChange={(event) =>
                            onUpdateRow(row.key, {
                              negativePrompt: event.target.value
                            })
                          }
                          disabled={saving}
                        />
                      </Field>
                      <Field className="creator-upload-field">
                        <FieldLabel
                          className="creator-upload-field-label"
                          htmlFor={`${row.key}-tags`}
                        >
                          {t('upload.fieldTags')}
                        </FieldLabel>
                        <Input
                          id={`${row.key}-tags`}
                          value={row.tagsText}
                          onChange={(event) =>
                            onUpdateRow(row.key, {
                              tagsText: event.target.value
                            })
                          }
                          disabled={saving}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="creator-upload-add-row"
                  onClick={onAddRow}
                  disabled={saving}
                >
                  <Plus data-icon="inline-start" />
                  <span>{t('upload.addRow')}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="creator-upload-dialog-footer">
          <div className="creator-upload-actions">
            <Button
              type="button"
              variant="outline"
              className="creator-upload-cancel"
              onClick={onCancel}
              disabled={saving}
            >
              {t('upload.cancel')}
            </Button>
            <Button
              className="creator-preview-reedit"
              size="sm"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2
                  className="creator-spin-icon"
                  data-icon="inline-start"
                />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {t('upload.saveBatch', { count: selectedCount })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
