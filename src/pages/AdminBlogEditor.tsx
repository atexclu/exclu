import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Send, X, Image as ImageIcon, Loader2, Bold, Italic,
  Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Quote, Code,
  Heading1, Heading2, Heading3, Link as LinkIcon, Undo, Redo, AlignLeft,
  AlignCenter, AlignRight, Minus, Plus, Video, Eye, EyeOff, Type, Upload, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppShell from '@/components/AppShell';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { toast } from 'sonner';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExt from '@tiptap/extension-image';
import LinkExt from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';

interface BlogCategory {
  id: string;
  slug: string;
  name: string;
}

interface ArticleData {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: Record<string, unknown>;
  content_html: string;
  cover_image_url: string;
  cover_image_alt: string;
  category_id: string;
  tags: string[];
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image_url: string;
  focus_keyword: string;
  author_name: string;
  author_url: string;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
}

const emptyArticle: ArticleData = {
  title: '',
  slug: '',
  excerpt: '',
  content: {},
  content_html: '',
  cover_image_url: '',
  cover_image_alt: '',
  category_id: '',
  tags: [],
  meta_title: '',
  meta_description: '',
  canonical_url: '',
  og_image_url: '',
  focus_keyword: '',
  author_name: 'Exclu Team',
  author_url: '',
  status: 'draft',
  published_at: null,
  scheduled_at: null,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

// ─── Slash Command Menu ──────────────────────────────────────────────
interface SlashMenuItem {
  label: string;
  icon: React.ElementType;
  description: string;
  action: (editor: any) => void;
}

const slashMenuItems: SlashMenuItem[] = [
  { label: 'Text', icon: Type, description: 'Plain text paragraph', action: (ed) => ed.chain().focus().setParagraph().run() },
  { label: 'Heading 1', icon: Heading1, description: 'Large section heading', action: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', icon: Heading2, description: 'Medium section heading', action: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', icon: Heading3, description: 'Small section heading', action: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Bullet List', icon: List, description: 'Unordered list', action: (ed) => ed.chain().focus().toggleBulletList().run() },
  { label: 'Numbered List', icon: ListOrdered, description: 'Ordered list', action: (ed) => ed.chain().focus().toggleOrderedList().run() },
  { label: 'Quote', icon: Quote, description: 'Blockquote', action: (ed) => ed.chain().focus().toggleBlockquote().run() },
  { label: 'Code Block', icon: Code, description: 'Code snippet', action: (ed) => ed.chain().focus().toggleCodeBlock().run() },
  { label: 'Divider', icon: Minus, description: 'Horizontal line', action: (ed) => ed.chain().focus().setHorizontalRule().run() },
  { label: 'Image', icon: ImageIcon, description: 'Upload or paste image URL', action: () => {} },
  { label: 'Video', icon: Video, description: 'Embed YouTube video', action: () => {} },
  { label: 'Link', icon: LinkIcon, description: 'Insert a hyperlink', action: () => {} },
];

function SlashCommandMenu({
  query,
  onSelect,
  onClose,
  position,
}: {
  query: string;
  onSelect: (item: SlashMenuItem) => void;
  onClose: () => void;
  position: { top: number; left: number };
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = slashMenuItems.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-exclu-arsenic/70 bg-exclu-ink shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-3 py-2 border-b border-exclu-arsenic/50">
        <p className="text-[10px] font-medium text-exclu-space uppercase tracking-wider">Insert block</p>
      </div>
      {filtered.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            onClick={() => onSelect(item)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
              i === selectedIndex ? 'bg-primary/10 text-primary' : 'text-exclu-cloud hover:bg-white/5'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              i === selectedIndex ? 'bg-primary/20' : 'bg-white/5'
            }`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.label}</p>
              <p className="text-[11px] text-exclu-space truncate">{item.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Upload helper ───────────────────────────────────────────────────
async function uploadBlogImage(file: File): Promise<string | null> {
  if (file.size > 10 * 1024 * 1024) {
    toast.error('Image must be under 10MB');
    return null;
  }
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `content/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('blog-images').upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    toast.error('Upload failed: ' + error.message);
    return null;
  }
  const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(path);
  return urlData.publicUrl;
}

// ─── Enhanced Tiptap Editor ──────────────────────────────────────────
interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  onJsonChange?: (json: Record<string, unknown>) => void;
}

function TiptapEditor({ content, onChange, onJsonChange }: TiptapEditorProps) {
  const isInternalUpdate = useRef(false);
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; query: string; position: { top: number; left: number } }>({
    open: false,
    query: '',
    position: { top: 0, left: 0 },
  });
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMenuPos, setAddMenuPos] = useState({ top: 0, left: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageAction = useRef<'slash' | 'add' | 'toolbar'>('toolbar');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExt,
      ImageExt.configure({
        allowBase64: true,
        inline: true,
        HTMLAttributes: { class: 'rounded-xl max-w-full my-4' },
      }),
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { 
          class: 'text-lime-400 underline underline-offset-2 hover:text-lime-300 cursor-pointer',
          style: 'color: #bef264; text-decoration: underline;'
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Heading...';
          return 'Write something, or type "/" for commands...';
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Youtube.configure({
        inline: false,
        HTMLAttributes: { class: 'rounded-xl my-4' },
        width: 640,
        height: 360,
      }),
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm sm:prose-base max-w-none min-h-[500px] px-4 py-4 focus:outline-none prose-headings:text-exclu-cloud prose-p:text-exclu-space prose-a:text-lime-400 prose-blockquote:border-lime-400/30 prose-img:rounded-xl',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === '/' && !slashMenu.open) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSlashMenu({
              open: true,
              query: '',
              position: { top: rect.bottom + 8, left: rect.left },
            });
          }
          return false;
        }
        if (slashMenu.open) {
          if (event.key === 'Backspace') {
            if (slashMenu.query.length === 0) {
              setSlashMenu({ open: false, query: '', position: { top: 0, left: 0 } });
              return false;
            }
            setSlashMenu((prev) => ({ ...prev, query: prev.query.slice(0, -1) }));
            return true;
          }
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            setSlashMenu((prev) => ({ ...prev, query: prev.query + event.key }));
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          const file = files[0];
          if (file.type.startsWith('image/')) {
            uploadBlogImage(file).then((url) => {
              if (url && editor) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            });
            return true;
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            uploadBlogImage(file).then((url) => {
              if (url && editor) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            });
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      onChange(ed.getHTML());
      if (onJsonChange) onJsonChange(ed.getJSON() as Record<string, unknown>);
    },
  });

  useEffect(() => {
    if (!editor || !content) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    if (editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  const handleSlashSelect = useCallback((item: SlashMenuItem) => {
    if (!editor) return;

    // Delete the "/" character that triggered the menu
    const { from } = editor.state.selection;
    const slashLength = 1 + slashMenu.query.length;
    editor.chain().focus().deleteRange({ from: from - slashLength, to: from }).run();

    if (item.label === 'Image') {
      pendingImageAction.current = 'slash';
      fileInputRef.current?.click();
    } else if (item.label === 'Video') {
      const url = prompt('Paste YouTube URL:');
      if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
    } else if (item.label === 'Link') {
      const url = prompt('Link URL:');
      if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      item.action(editor);
    }

    setSlashMenu({ open: false, query: '', position: { top: 0, left: 0 } });
  }, [editor, slashMenu.query]);

  const handleAddBlock = useCallback((item: SlashMenuItem) => {
    if (!editor) return;

    if (item.label === 'Image') {
      pendingImageAction.current = 'add';
      fileInputRef.current?.click();
    } else if (item.label === 'Video') {
      const url = prompt('Paste YouTube URL:');
      if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
    } else if (item.label === 'Link') {
      const url = prompt('Link URL:');
      if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    } else {
      item.action(editor);
    }

    setShowAddMenu(false);
  }, [editor]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const url = await uploadBlogImage(file);
    if (url) editor.chain().focus().setImage({ src: url }).run();
    e.target.value = '';
  };

  const handleAddButtonClick = () => {
    if (!editor) return;
    // Position the add menu near the cursor
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setAddMenuPos({ top: rect.bottom + 8, left: rect.left });
    }
    setShowAddMenu(!showAddMenu);
  };

  if (!editor) return null;

  const setLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = prompt('Link URL:');
    if (!url) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const ToolBtn = ({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-primary/20 text-primary' : 'text-exclu-space hover:text-exclu-cloud hover:bg-white/10'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-xl border border-exclu-arsenic/70 overflow-hidden bg-exclu-ink/50">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-exclu-arsenic/50 bg-exclu-ink/80">
        {/* Add block button */}
        <button
          type="button"
          onClick={handleAddButtonClick}
          title="Add block"
          className="p-1.5 rounded text-primary hover:bg-primary/20 transition-colors mr-1"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-exclu-arsenic/50 mx-0.5" />

        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className="w-4 h-4" />
        </ToolBtn>
        <div className="w-px h-5 bg-exclu-arsenic/50 mx-0.5" />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className="w-4 h-4" />
        </ToolBtn>
        <div className="w-px h-5 bg-exclu-arsenic/50 mx-0.5" />
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
          <AlignLeft className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">
          <AlignCenter className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
          <AlignRight className="w-4 h-4" />
        </ToolBtn>
        <div className="w-px h-5 bg-exclu-arsenic/50 mx-0.5" />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">
          <ListOrdered className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          <Quote className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
          <Code className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus className="w-4 h-4" />
        </ToolBtn>
        <div className="w-px h-5 bg-exclu-arsenic/50 mx-0.5" />
        <ToolBtn onClick={setLink} active={editor.isActive('link')} title="Link">
          <LinkIcon className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => { pendingImageAction.current = 'toolbar'; fileInputRef.current?.click(); }} title="Upload image">
          <ImageIcon className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => {
          const url = prompt('Paste YouTube URL:');
          if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
        }} title="YouTube video">
          <Video className="w-4 h-4" />
        </ToolBtn>
        <div className="w-px h-5 bg-exclu-arsenic/50 mx-0.5" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo className="w-4 h-4" />
        </ToolBtn>
      </div>

      <EditorContent editor={editor} />

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Slash command menu */}
      {slashMenu.open && (
        <SlashCommandMenu
          query={slashMenu.query}
          position={slashMenu.position}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu({ open: false, query: '', position: { top: 0, left: 0 } })}
        />
      )}

      {/* Add block menu (triggered by + button) */}
      {showAddMenu && (
        <SlashCommandMenu
          query=""
          position={addMenuPos}
          onSelect={handleAddBlock}
          onClose={() => setShowAddMenu(false)}
        />
      )}
    </div>
  );
}

// ─── Preview Component ───────────────────────────────────────────────
function ArticlePreview({ article }: { article: ArticleData }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <Navbar variant="blog" />
      <main className="relative z-10 pt-32 pb-24 px-4 sm:px-6">
        <article className="max-w-3xl mx-auto">
          {article.cover_image_url && (
            <div className="mb-8 rounded-2xl overflow-hidden">
              <img
                src={article.cover_image_url}
                alt={article.cover_image_alt || article.title}
                className="w-full max-h-[420px] object-cover"
              />
            </div>
          )}
          <header>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-exclu-cloud leading-tight mb-4">
              {article.title || 'Untitled'}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-exclu-steel mb-8 pb-8 border-b border-white/5">
              <span>{article.author_name || 'Exclu Team'}</span>
              <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </header>
          <div
            className="prose prose-invert prose-sm sm:prose-base max-w-none
              prose-headings:text-exclu-cloud prose-headings:font-bold
              prose-p:text-exclu-space prose-p:leading-relaxed
              prose-a:text-lime-400 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-exclu-cloud
              prose-blockquote:border-lime-400/30 prose-blockquote:text-exclu-steel
              prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/5
              prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: article.content_html || '<p>Start writing to see a preview...</p>' }}
          />
        </article>
      </main>
      <Footer />
    </div>
  );
}

// ─── Main Editor Page ────────────────────────────────────────────────
const AdminBlogEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [article, setArticle] = useState<ArticleData>(emptyArticle);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase.from('blog_categories').select('id, slug, name').order('sort_order');
      if (data) setCategories(data);
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!id) return;
    const fetchArticle = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); navigate('/admin/users?tab=blog'); return; }
      const res = await supabase.functions.invoke('admin-blog-manage', {
        headers: { 'x-supabase-auth': session.access_token },
        body: { action: 'get', id },
      });
      if (res.data?.article) {
        const a = res.data.article;
        setArticle({
          id: a.id,
          title: a.title || '',
          slug: a.slug || '',
          excerpt: a.excerpt || '',
          content: a.content || {},
          content_html: a.content_html || '',
          cover_image_url: a.cover_image_url || '',
          cover_image_alt: a.cover_image_alt || '',
          category_id: a.category_id || '',
          tags: a.tags || [],
          meta_title: a.meta_title || '',
          meta_description: a.meta_description || '',
          canonical_url: a.canonical_url || '',
          og_image_url: a.og_image_url || '',
          focus_keyword: a.focus_keyword || '',
          author_name: a.author_name || 'Exclu Team',
          author_url: a.author_url || '',
          status: a.status || 'draft',
          published_at: a.published_at,
          scheduled_at: a.scheduled_at || null,
        });
        setTagsInput((a.tags || []).join(', '));
        setSlugManual(true);
      } else {
        toast.error('Article not found');
        navigate('/admin/users?tab=blog');
      }
      setLoading(false);
    };
    fetchArticle();
  }, [id, navigate]);

  const handleTitleChange = (value: string) => {
    setArticle((prev) => ({
      ...prev,
      title: value,
      slug: slugManual ? prev.slug : slugify(value),
    }));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setUploadingCover(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('blog-images').upload(path, file, {
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      toast.error('Upload failed: ' + error.message);
    } else {
      const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(path);
      setArticle((prev) => ({ ...prev, cover_image_url: urlData.publicUrl }));
      toast.success('Cover image uploaded');
    }
    setUploadingCover(false);
  };

  const handleSave = async (targetStatus?: string) => {
    if (!article.title.trim()) { toast.error('Title is required'); return; }
    if (!article.slug.trim()) { toast.error('Slug is required'); return; }

    setSaving(true);

    const rawMetaTitle = article.meta_title.trim() || article.title.trim();
    const metaTitleValue = rawMetaTitle ? rawMetaTitle.slice(0, 70) : null;
    const rawMetaDesc = article.meta_description.trim();
    const metaDescValue = rawMetaDesc ? rawMetaDesc.slice(0, 170) : null;
    
    const payload: Record<string, unknown> = {
      action: isEditing ? 'update' : 'create',
      ...(isEditing && { id }),
      title: article.title.trim(),
      slug: article.slug.trim(),
      excerpt: article.excerpt.trim() || null,
      content: article.content,
      content_html: article.content_html.trim() || null,
      cover_image_url: article.cover_image_url || null,
      cover_image_alt: article.cover_image_alt || null,
      category_id: article.category_id || null,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      meta_title: metaTitleValue || null,
      meta_description: metaDescValue || null,
      canonical_url: article.canonical_url || null,
      og_image_url: article.og_image_url || article.cover_image_url || null,
      focus_keyword: article.focus_keyword || null,
      author_name: article.author_name.trim() || 'Exclu Team',
      author_url: article.author_url || null,
    };

    if (targetStatus === 'published') {
      payload.status = 'published';
      payload.published_at = new Date().toISOString();
    } else if (targetStatus === 'scheduled') {
      if (!article.scheduled_at) {
        toast.error('Please set a schedule date first');
        setSaving(false);
        return;
      }
      payload.status = 'scheduled';
      payload.scheduled_at = article.scheduled_at;
    } else if (targetStatus) {
      payload.status = targetStatus;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); toast.error('Not authenticated'); return; }
    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: payload,
    });

    if (res.error) {
      toast.error('Save failed: ' + (res.error.message || 'Unknown error'));
    } else {
      toast.success(
        targetStatus === 'published' ? 'Article published!' :
        targetStatus === 'scheduled' ? 'Article scheduled!' :
        'Article saved'
      );
      if (targetStatus === 'published' || targetStatus === 'scheduled') {
        navigate('/admin/users?tab=blog');
        return;
      }
      if (!isEditing && res.data?.article?.id) {
        navigate(`/admin/blog/${res.data.article.id}/edit`, { replace: true });
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  // ─── Preview mode ──────────────────────────────────────────────────
  if (previewMode) {
    return (
      <div className="relative">
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-exclu-ink border border-exclu-arsenic/70 text-sm font-medium text-exclu-cloud hover:bg-exclu-ink/80 transition-colors shadow-lg"
          >
            <EyeOff className="w-4 h-4" /> Exit Preview
          </button>
        </div>
        <ArticlePreview article={article} />
      </div>
    );
  }

  // ─── Editor mode ───────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <button
            onClick={() => navigate('/admin/users?tab=blog')}
            className="inline-flex items-center gap-1.5 text-sm text-exclu-space hover:text-exclu-cloud transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to articles
          </button>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setPreviewMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-exclu-arsenic/70 text-xs font-medium text-exclu-space hover:text-exclu-cloud hover:border-exclu-cloud transition-colors"
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
            <Button variant="outline" onClick={() => handleSave()} disabled={saving} className="flex-1 sm:flex-initial">
              <Save className="w-4 h-4 mr-1.5" /> Save Draft
            </Button>
            <Button variant="outline" onClick={() => handleSave('scheduled')} disabled={saving} className="flex-1 sm:flex-initial">
              <Clock className="w-4 h-4 mr-1.5" /> Schedule
            </Button>
            <Button onClick={() => handleSave('published')} disabled={saving} className="flex-1 sm:flex-initial">
              <Send className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          </div>
        </div>

        {/* Cover Image — at the very top */}
        <div className="mb-6">
          {article.cover_image_url ? (
            <div className="relative rounded-2xl overflow-hidden border border-exclu-arsenic/50">
              <img src={article.cover_image_url} alt={article.cover_image_alt || 'Cover'} className="w-full h-56 sm:h-72 object-cover" />
              <button
                onClick={() => setArticle((prev) => ({ ...prev, cover_image_url: '' }))}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-3">
                <input
                  value={article.cover_image_alt}
                  onChange={(e) => setArticle((prev) => ({ ...prev, cover_image_alt: e.target.value }))}
                  placeholder="Alt text..."
                  className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-3 h-40 rounded-2xl border-2 border-dashed border-exclu-arsenic/50 cursor-pointer hover:border-primary/30 hover:bg-white/[0.02] transition-all group">
              {uploadingCover ? (
                <Loader2 className="w-5 h-5 animate-spin text-exclu-space" />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-exclu-space group-hover:text-primary transition-colors" />
                  <span className="text-sm text-exclu-space group-hover:text-exclu-cloud transition-colors">Add cover image</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
            </label>
          )}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main editor column */}
          <div className="space-y-5">
            {/* Title */}
            <input
              value={article.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Article title..."
              className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-0 border-b border-exclu-arsenic/30 pb-3 text-exclu-cloud placeholder:text-exclu-space/40 focus:outline-none focus:border-primary/50 transition-colors"
            />

            {/* Excerpt */}
            <Input
              value={article.excerpt}
              onChange={(e) => setArticle((prev) => ({ ...prev, excerpt: e.target.value }))}
              placeholder="Brief summary of the article..."
              maxLength={500}
              className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
            />

            {/* Editor */}
            <TiptapEditor
              content={article.content_html}
              onChange={(html) => setArticle((prev) => ({ ...prev, content_html: html }))}
              onJsonChange={(json) => setArticle((prev) => ({ ...prev, content: json }))}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Status */}
            <div className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/50 p-4">
              <h3 className="text-xs font-semibold text-exclu-space uppercase tracking-wider mb-2">Status</h3>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                article.status === 'published' ? 'text-green-400 bg-green-400/10' :
                article.status === 'scheduled' ? 'text-amber-400 bg-amber-400/10' :
                article.status === 'archived' ? 'text-exclu-space bg-exclu-space/10' :
                'text-exclu-space bg-exclu-space/10'
              }`}>
                {article.status === 'scheduled' && <Clock className="w-3 h-3" />}
                {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
              </span>
            </div>

            {/* Schedule Date */}
            <div className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/50 p-4">
              <h3 className="text-xs font-semibold text-exclu-space uppercase tracking-wider mb-2">Schedule Date</h3>
              <input
                type="datetime-local"
                value={article.scheduled_at ? new Date(article.scheduled_at).toISOString().slice(0, 16) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setArticle((prev) => ({ ...prev, scheduled_at: val ? new Date(val).toISOString() : null }));
                }}
                className="w-full h-9 rounded-lg border border-exclu-arsenic/50 bg-exclu-ink/80 px-3 text-xs text-exclu-cloud focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-[10px] text-exclu-space/50 mt-1.5">Set a date to auto-publish this article</p>
            </div>

            {/* Category */}
            <div className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/50 p-4">
              <h3 className="text-xs font-semibold text-exclu-space uppercase tracking-wider mb-2">Category</h3>
              <select
                value={article.category_id}
                onChange={(e) => setArticle((prev) => ({ ...prev, category_id: e.target.value }))}
                className="w-full h-11 rounded-md bg-black border border-white text-white text-sm px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/50 p-4">
              <h3 className="text-xs font-semibold text-exclu-space uppercase tracking-wider mb-2">Tags</h3>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="tag1, tag2, tag3..."
                className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
              />
              <p className="text-[10px] text-exclu-space mt-1">Comma-separated</p>
            </div>

            {/* Author */}
            <div className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/50 p-4">
              <h3 className="text-xs font-semibold text-exclu-space uppercase tracking-wider mb-2">Author</h3>
              <Input
                value={article.author_name}
                onChange={(e) => setArticle((prev) => ({ ...prev, author_name: e.target.value }))}
                placeholder="Author name"
                className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
              />
            </div>

            {/* SEO */}
            <div className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/50 p-4">
              <h3 className="text-xs font-semibold text-exclu-space uppercase tracking-wider mb-3">SEO</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-exclu-space block mb-1">URL Slug</label>
                  <div className="flex items-center text-[10px] text-exclu-space/60 mb-1">/blog/{article.slug || '...'}</div>
                  <Input
                    value={article.slug}
                    onChange={(e) => { setSlugManual(true); setArticle((prev) => ({ ...prev, slug: slugify(e.target.value) })); }}
                    className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-exclu-space block mb-1">Meta Description</label>
                  <Input
                    value={article.meta_description}
                    onChange={(e) => setArticle((prev) => ({ ...prev, meta_description: e.target.value }))}
                    placeholder={article.excerpt || 'Meta description...'}
                    maxLength={170}
                    className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                  />
                  <p className="text-[10px] text-exclu-space/60 mt-0.5">{article.meta_description.length}/170</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default AdminBlogEditor;
