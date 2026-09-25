/**
 * 左侧创作参数面板:模型 / 尺寸 / 画质 / 格式。
 *
 * 纯展示:composer 态(settings)由页面持有并传入,
 * 本组件只渲染 + 上抛交互。
 */

import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { ImagePromptSettings } from '../../data/image-prompt-core';
import {
  getAspectRatioForImageSize,
  getImageSizeOption,
  getImageSizeOptionsForModel,
  type ImageCreatorModelOption,
  imageSizeOptions,
  modelGroupLabels,
  modelGroupOrder,
  modelOptions as fallbackModelOptions,
  outputFormatOptions,
  qualityOptions,
  resolveRecommendedImageSettingsForModel
} from '../../data/image-creator-options';
import { Badge } from '@/shared/ui/radix/badge';
import { Field, FieldLabel } from '@/shared/ui/radix/field';
import {
  Button,
  SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/shared/ui';

export interface CreatorControlsProps {
  settings: ImagePromptSettings;
  onSettingsChange: Dispatch<SetStateAction<ImagePromptSettings>>;
  models?: ImageCreatorModelOption[];
}

export function CreatorControls({
  settings,
  onSettingsChange,
  models = fallbackModelOptions
}: CreatorControlsProps) {
  const { t } = useTranslation('imageCreate');
  const currentSize =
    getImageSizeOption(settings.imageSize) || imageSizeOptions[0];
  const currentModel =
    models.find((model) => model.value === settings.model) || models[0];
  const allowedImageSizeOptions = getImageSizeOptionsForModel(currentModel);
  const visibleImageSizeOptions = allowedImageSizeOptions.some(
    (option) => option.value === settings.imageSize
  )
    ? allowedImageSizeOptions
    : [
        ...allowedImageSizeOptions,
        ...imageSizeOptions.filter(
          (option) => option.value === settings.imageSize
        )
      ];
  const qualityHelp = t(`controls.quality.help.${settings.quality}`, {
    defaultValue: t('controls.quality.help.auto')
  });

  return (
    <aside className="creator-panel creator-controls">
      <div className="creator-panel-head">
        <span>{t('controls.title')}</span>
        <SlidersHorizontal size={18} />
      </div>

      <Field className="creator-control-group creator-control-model">
        <FieldLabel className="creator-control-label" htmlFor="creator-model">
          {t('controls.model')}
        </FieldLabel>
        <div className="creator-select">
          <SelectRoot
            value={settings.model}
            onValueChange={(value) =>
              onSettingsChange((current) => ({
                ...current,
                model: value,
                ...resolveRecommendedImageSettingsForModel(
                  models.find((model) => model.value === value),
                  current.imageSize
                )
              }))
            }
          >
            <SelectTrigger
              id="creator-model"
              className="creator-select-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelGroupOrder.map((group) => {
                const groupedModels = models.filter(
                  (model) => model.group === group
                );
                if (groupedModels.length === 0) return null;
                return (
                  <SelectGroup key={group}>
                    <SelectLabel>{modelGroupLabels[group]}</SelectLabel>
                    {groupedModels.map((model) => (
                      <SelectItem
                        key={model.value}
                        value={model.value}
                        disabled={model.status === 'unavailable'}
                      >
                        {model.label} · x{model.creditMultiplier}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </SelectRoot>
        </div>
        {currentModel && (
          <div className="creator-model-summary">
            <p>{currentModel.description}</p>
            <div className="creator-model-badges">
              {currentModel.badges.map((badge) => (
                <Badge
                  key={badge}
                  variant="secondary"
                  className="creator-model-badge"
                >
                  {badge}
                </Badge>
              ))}
              <Badge variant="secondary" className="creator-model-badge">
                {currentModel.supportsReferenceImage ? '支持参考图' : '纯文本'}
              </Badge>
              <Badge variant="secondary" className="creator-model-badge">
                {currentModel.supportsMultipleImages ? '支持多图' : '单图'}
              </Badge>
            </div>
          </div>
        )}
      </Field>

      <Field className="creator-control-group creator-control-size">
        <FieldLabel
          className="creator-control-label"
          htmlFor="creator-image-size"
        >
          {t('controls.size')}
        </FieldLabel>
        <div className="creator-select creator-size-select">
          <SelectRoot
            value={settings.imageSize}
            onValueChange={(nextSize) => {
              onSettingsChange((current) => ({
                ...current,
                imageSize: nextSize,
                aspectRatio: getAspectRatioForImageSize(nextSize)
              }));
            }}
          >
            <SelectTrigger
              id="creator-image-size"
              className="creator-select-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {visibleImageSizeOptions.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    {t(size.labelKey)} · {t(size.detailKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        </div>
        <p className="creator-size-summary">
          <strong>{t(currentSize.labelKey)}</strong>
          <span>{t(currentSize.detailKey)}</span>
        </p>
      </Field>

      <Field className="creator-control-group creator-control-quality">
        <FieldLabel className="creator-control-label" htmlFor="creator-quality">
          {t('controls.quality.label')}
        </FieldLabel>
        <div className="creator-segment-row creator-desktop-segment">
          {qualityOptions.map((quality) => (
            <Button
              key={quality.value}
              type="button"
              variant="outline"
              className={settings.quality === quality.value ? 'active' : ''}
              onClick={() => {
                onSettingsChange((current) => ({
                  ...current,
                  quality: quality.value
                }));
              }}
            >
              {t(quality.labelKey)}
            </Button>
          ))}
        </div>
        <div className="creator-select creator-mobile-select">
          <SelectRoot
            value={settings.quality}
            onValueChange={(nextQuality) => {
              onSettingsChange((current) => ({
                ...current,
                quality: nextQuality
              }));
            }}
          >
            <SelectTrigger
              id="creator-quality"
              className="creator-select-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {qualityOptions.map((quality) => (
                  <SelectItem key={quality.value} value={quality.value}>
                    {t(quality.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        </div>
        <p className="creator-control-help">{qualityHelp}</p>
      </Field>

      <Field className="creator-control-group creator-control-format">
        <FieldLabel
          className="creator-control-label"
          htmlFor="creator-output-format"
        >
          {t('controls.outputFormat.label')}
        </FieldLabel>
        <div className="creator-segment-row creator-desktop-segment">
          {outputFormatOptions.map((format) => (
            <Button
              key={format.value}
              type="button"
              variant="outline"
              className={settings.outputFormat === format.value ? 'active' : ''}
              onClick={() =>
                onSettingsChange((current) => ({
                  ...current,
                  outputFormat: format.value
                }))
              }
            >
              {t(format.labelKey)}
            </Button>
          ))}
        </div>
        <div className="creator-select creator-mobile-select">
          <SelectRoot
            value={settings.outputFormat}
            onValueChange={(value) =>
              onSettingsChange((current) => ({
                ...current,
                outputFormat: value
              }))
            }
          >
            <SelectTrigger
              id="creator-output-format"
              className="creator-select-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {outputFormatOptions.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {t(format.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        </div>
      </Field>
    </aside>
  );
}
