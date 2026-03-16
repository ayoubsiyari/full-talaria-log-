import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import { Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3, Pilcrow, List, ListOrdered, Quote, CheckSquare } from 'lucide-react';

const MenuBar = ({ editor }) => {
  if (!editor) {
    return null;
  }

  const menuItems = [
    { action: () => editor.chain().focus().toggleBold().run(), name: 'bold', icon: Bold },
    { action: () => editor.chain().focus().toggleItalic().run(), name: 'italic', icon: Italic },
    { action: () => editor.chain().focus().toggleStrike().run(), name: 'strike', icon: Strikethrough },
    { action: () => editor.chain().focus().toggleCode().run(), name: 'code', icon: Code },
    { action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), name: 'heading', level: 1, icon: Heading1 },
    { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), name: 'heading', level: 2, icon: Heading2 },
    { action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), name: 'heading', level: 3, icon: Heading3 },
    { action: () => editor.chain().focus().setParagraph().run(), name: 'paragraph', icon: Pilcrow },
    { action: () => editor.chain().focus().toggleBulletList().run(), name: 'bulletList', icon: List },
    { action: () => editor.chain().focus().toggleOrderedList().run(), name: 'orderedList', icon: ListOrdered },
    { action: () => editor.chain().focus().toggleTaskList().run(), name: 'taskList', icon: CheckSquare },
    { action: () => editor.chain().focus().toggleBlockquote().run(), name: 'blockquote', icon: Quote },
  ];

  return (
    <div className="flex items-center flex-wrap gap-1 p-2 border-b border-gray-700 mb-2">
      {menuItems.map((item, index) => (
        <button
          key={index}
          onClick={item.action}
          className={`p-2 rounded-md hover:bg-gray-700 transition-colors ${editor.isActive(item.name, item.level ? { level: item.level } : {}) ? 'bg-blue-600 text-white' : ''}`}
          title={item.name}
        >
          <item.icon size={16} />
        </button>
      ))}
    </div>
  );
};

const TiptapEditor = ({ content, onUpdate, limit }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: content,
    editorProps: {
        attributes: {
            class: 'prose dark:prose-invert max-w-none prose-sm sm:prose-base lg:prose-lg focus:outline-none px-4 min-h-[150px]',
        },
    },
    onUpdate: ({ editor }) => {
      if (onUpdate) {
        onUpdate(editor.getHTML());
      }
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  return (
    <div className="bg-[#1e1e1e] border border-gray-700 rounded-lg">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default TiptapEditor;
