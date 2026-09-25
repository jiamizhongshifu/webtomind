import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import {
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_DOCUMENT_TYPES,
  ALL_SUPPORTED_TYPES
} from '../constants/chat';

const log = createLogger('useChatAttachments');

export interface PastedImage {
  id: string;
  data: string;
  mimeType: string;
  preview: string;
  previewUrl: string;
}

export interface PastedImagePreview {
  id: string;
  mimeType: string;
  preview: string;
  previewUrl: string;
}

export function useChatAttachments() {
  const { t } = useTranslation('workspace');
  const [pastedImages, setPastedImages] = useState<PastedImagePreview[]>([]);
  const pastedImagesRef = useRef<PastedImage[]>([]);
  const pendingImageReadsRef = useRef<Promise<void>[]>([]);
  const [isInputDragOver, setIsInputDragOver] = useState(false);

  const revokePreviewUrl = useCallback((previewUrl: string) => {
    if (previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
  }, []);

  const appendAttachment = useCallback(
    (attachment: PastedImage) => {
      pastedImagesRef.current = [...pastedImagesRef.current, attachment];
      setPastedImages((prev) => [
        ...prev,
        {
          id: attachment.id,
          mimeType: attachment.mimeType,
          preview: attachment.preview,
          previewUrl: attachment.previewUrl
        }
      ]);
    },
    []
  );

  const clearAttachments = useCallback(() => {
    pastedImagesRef.current.forEach((image) => revokePreviewUrl(image.previewUrl));
    pastedImagesRef.current = [];
    setPastedImages([]);
  }, [revokePreviewUrl]);

  useEffect(() => clearAttachments, [clearAttachments]);

  const queueRead = useCallback((readPromise: Promise<void>) => {
    pendingImageReadsRef.current = [...pendingImageReadsRef.current, readPromise];
    readPromise.finally(() => {
      pendingImageReadsRef.current = pendingImageReadsRef.current.filter(
        (pending) => pending !== readPromise
      );
    });
  }, []);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (!item.type.startsWith('image/')) {
          continue;
        }

        e.preventDefault();
        const file = item.getAsFile();
        if (!file) {
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        const readPromise = new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            if (!dataUrl) {
              revokePreviewUrl(previewUrl);
              resolve();
              return;
            }

            const commaIdx = dataUrl.indexOf(',');
            const match = commaIdx > 0 && dataUrl.startsWith('data:')
              ? [dataUrl, dataUrl.slice(5, dataUrl.indexOf(';')), dataUrl.slice(commaIdx + 1)]
              : null;
            if (match) {
              appendAttachment({
                id: crypto.randomUUID(),
                mimeType: match[1],
                data: match[2],
                preview: t('chat.pastedImage', {
                  index: pastedImagesRef.current.length + 1
                }),
                previewUrl
              });
            } else {
              revokePreviewUrl(previewUrl);
            }
            resolve();
          };
          reader.onerror = () => {
            revokePreviewUrl(previewUrl);
            log.error('[ChatAttachments] Failed to read pasted image');
            resolve();
          };
          reader.readAsDataURL(file);
        });

        queueRead(readPromise);
        break;
      }
    },
    [appendAttachment, queueRead, revokePreviewUrl, t]
  );

  const handleRemovePastedImage = useCallback(
    (imageId: string) => {
      const target = pastedImagesRef.current.find((image) => image.id === imageId);
      if (target) {
        revokePreviewUrl(target.previewUrl);
      }
      pastedImagesRef.current = pastedImagesRef.current.filter(
        (image) => image.id !== imageId
      );
      setPastedImages((prev) => prev.filter((image) => image.id !== imageId));
    },
    [revokePreviewUrl]
  );

  const readFiles = useCallback(
    (
      files: Iterable<File>,
      isSupported: (file: File) => boolean,
      unsupportedMessage: string,
      failureMessage: string,
      onComplete?: () => void
    ) => {
      for (const file of files) {
        if (!isSupported(file)) {
          log.warn(unsupportedMessage, file.type);
          continue;
        }

        const previewUrl = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : '';

        const readPromise = new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            if (!dataUrl) {
              revokePreviewUrl(previewUrl);
              resolve();
              return;
            }

            const commaIdx = dataUrl.indexOf(',');
            const match = commaIdx > 0 && dataUrl.startsWith('data:')
              ? [dataUrl, dataUrl.slice(5, dataUrl.indexOf(';')), dataUrl.slice(commaIdx + 1)]
              : null;
            if (match) {
              appendAttachment({
                id: crypto.randomUUID(),
                mimeType: match[1],
                data: match[2],
                preview: file.name,
                previewUrl
              });
            } else {
              revokePreviewUrl(previewUrl);
            }
            resolve();
          };
          reader.onerror = () => {
            revokePreviewUrl(previewUrl);
            log.error(failureMessage, file.name);
            resolve();
          };
          reader.readAsDataURL(file);
        });

        queueRead(readPromise);
      }

      if (onComplete) onComplete();
    },
    [appendAttachment, queueRead, revokePreviewUrl]
  );

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, onComplete?: () => void) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      readFiles(
        files,
        (file) => SUPPORTED_IMAGE_TYPES.includes(file.type),
        '[ChatAttachments] Unsupported image type:',
        '[ChatAttachments] Failed to read uploaded image:',
        onComplete
      );

      e.target.value = '';
    },
    [readFiles]
  );

  const handleDocumentUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, onComplete?: () => void) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      readFiles(
        files,
        (file) => SUPPORTED_DOCUMENT_TYPES.includes(file.type),
        '[ChatAttachments] Unsupported document type:',
        '[ChatAttachments] Failed to read uploaded document:',
        onComplete
      );

      e.target.value = '';
    },
    [readFiles]
  );

  const handleInputDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsInputDragOver(true);
    }
  }, []);

  const handleInputDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsInputDragOver(false);
    }
  }, []);

  const handleInputDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsInputDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      readFiles(
        files,
        (file) => ALL_SUPPORTED_TYPES.includes(file.type),
        '[ChatAttachments] Unsupported file type for input:',
        '[ChatAttachments] Failed to read dropped file:',
        undefined
      );
    },
    [readFiles]
  );

  return {
    pastedImages,
    pastedImagesRef,
    pendingImageReadsRef,
    isInputDragOver,
    clearAttachments,
    handlePaste,
    handleRemovePastedImage,
    handleImageUpload,
    handleDocumentUpload,
    handleInputDragOver,
    handleInputDragLeave,
    handleInputDrop
  };
}
