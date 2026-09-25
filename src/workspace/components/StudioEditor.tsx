import { forwardRef, useImperativeHandle } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Node, mergeAttributes, type JSONContent } from '@tiptap/core';

interface StudioEditorProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export interface StudioEditorHandle {
  getSelectedOrCurrentText: () => string;
  isSelectionInSingleBlock: () => boolean;
  replaceSelectionWithText: (text: string) => void;
  insertParagraphAfterSelection: (text: string) => void;
  insertBlocks: (blocks: JSONContent[]) => void;
  insertMediaBlock: (url: string, alt?: string) => void;
  getJson: () => Record<string, unknown>;
}

const NoteBlock = Node.create({
  name: 'noteBlock',
  group: 'block',
  content: 'inline*',
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      sourceUrl: { default: '' },
      sourceTitle: { default: '' },
      sourceCardId: { default: '' }
    };
  },
  parseHTML() {
    return [
      { tag: 'section[data-note-block="true"]' },
      { tag: 'blockquote[data-note-block="true"]' }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const sourceTitle = String(HTMLAttributes.sourceTitle || '');
    const sourceUrl = String(HTMLAttributes.sourceUrl || '');
    const sourceLabel = sourceTitle || sourceUrl || '未命名素材';

    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-note-block': 'true',
        class:
          'group relative my-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm'
      }),
      [
        'div',
        {
          class: 'flex items-start justify-between gap-3 px-3 py-2'
        },
        [
          'div',
          { class: 'min-w-0 flex-1' },
          [
            'div',
            {
              class:
                'text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate'
            },
            sourceLabel
          ],
          [
            'div',
            {
              class:
                'mt-1 text-[12px] text-slate-500 truncate'
            },
            0
          ]
        ],
        [
          'div',
          {
            class:
              'flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 dark:border-slate-600 text-muted-foreground dark:text-slate-500 select-none'
          },
          '⋮⋮'
        ]
      ]
    ];
  }
});

const StudioImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      dataType: { default: 'image' },
      sourceCardId: { default: '' }
    };
  }
});

function ensureDocContent(content: Record<string, unknown>): JSONContent {
  const maybeType = content.type;
  if (maybeType === 'doc') {
    return content as JSONContent;
  }

  return {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  };
}

export const StudioEditor = forwardRef<StudioEditorHandle, StudioEditorProps>(
  function StudioEditor({ content, onChange }, ref) {
    const editor = useEditor({
      extensions: [StarterKit, NoteBlock, StudioImage],
      content: ensureDocContent(content),
      editorProps: {
        attributes: {
          class:
            'prose prose-slate dark:prose-invert max-w-none min-h-[320px] px-4 py-3 text-[15px] leading-7 focus:outline-none'
        }
      },
      onUpdate: ({ editor: currentEditor }) => {
        onChange(currentEditor.getJSON() as Record<string, unknown>);
      }
    });

    useImperativeHandle(
      ref,
      () => ({
        getSelectedOrCurrentText: () => {
          if (!editor) return '';
          const selected = editor.state.doc
            .textBetween(
              editor.state.selection.from,
              editor.state.selection.to,
              '\n'
            )
            .trim();
          if (selected) return selected;
          return editor.state.selection.$from.parent.textContent.trim();
        },
        isSelectionInSingleBlock: () => {
          if (!editor) return false;
          const startDepth = editor.state.selection.$from.depth;
          const endDepth = editor.state.selection.$to.depth;
          if (startDepth === 0 || endDepth === 0) return false;

          const startBlockPos = editor.state.selection.$from.start(startDepth);
          const endBlockPos = editor.state.selection.$to.start(endDepth);
          return startBlockPos === endBlockPos;
        },
        replaceSelectionWithText: (text: string) => {
          if (!editor) return;
          editor.chain().focus().insertContent(text).run();
        },
        insertParagraphAfterSelection: (text: string) => {
          if (!editor) return;
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'paragraph',
              content: [{ type: 'text', text }]
            })
            .run();
        },
        insertBlocks: (blocks: JSONContent[]) => {
          if (!editor || blocks.length === 0) return;
          editor.chain().focus().insertContent(blocks).run();
        },
        insertMediaBlock: (url: string, alt = '媒体素材') => {
          if (!editor || !url.trim()) return;
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'image',
              attrs: {
                src: url.trim(),
                alt,
                dataType: 'image'
              }
            })
            .run();
        },
        getJson: () => {
          if (!editor) {
            return { type: 'doc', content: [{ type: 'paragraph' }] };
          }
          return editor.getJSON() as Record<string, unknown>;
        }
      }),
      [editor]
    );

    if (!editor) {
      return (
        <div className="h-full flex items-center justify-center text-sm text-slate-500">
          编辑器加载中...
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    );
  }
);
