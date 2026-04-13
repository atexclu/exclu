import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, FileText, Eye, Pencil, Archive, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppShell from '@/components/AppShell';
import { toast } from 'sonner';

type ArticleStatus = 'draft' | 'published' | 'scheduled' | 'archived';

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  status: ArticleStatus;
  category_id: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  blog_categories?: { name: string } | null;
}

const statusConfig: Record<ArticleStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'text-exclu-steel bg-exclu-steel/10', icon: FileText },
  published: { label: 'Published', color: 'text-green-400 bg-green-400/10', icon: CheckCircle2 },
  scheduled: { label: 'Scheduled', color: 'text-amber-400 bg-amber-400/10', icon: Clock },
  archived: { label: 'Archived', color: 'text-exclu-graphite bg-exclu-graphite/10', icon: Archive },
};

const AdminBlog = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | 'all'>('all');

  const fetchArticles = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'list' },
    });

    if (res.error) {
      toast.error('Failed to load articles');
      console.error(res.error);
    } else {
      setArticles(res.data?.articles || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleArchive = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'archive', id },
    });
    if (res.error) {
      toast.error('Failed to archive article');
    } else {
      toast.success('Article archived');
      fetchArticles();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this article?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'delete', id },
    });
    if (res.error) {
      toast.error('Failed to delete article');
    } else {
      toast.success('Article deleted');
      fetchArticles();
    }
  };

  const filtered = articles.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.slug.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: articles.length,
    draft: articles.filter((a) => a.status === 'draft').length,
    published: articles.filter((a) => a.status === 'published').length,
    scheduled: articles.filter((a) => a.status === 'scheduled').length,
    archived: articles.filter((a) => a.status === 'archived').length,
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Blog Management</h1>
            <p className="text-sm text-muted-foreground mt-1">{articles.length} article{articles.length !== 1 ? 's' : ''} total</p>
          </div>
          <Button onClick={() => navigate('/admin/blog/new')} variant="hero" size="sm" asChild>
            <span className="gap-2">
              <Plus className="w-4 h-4" /> New Article
            </span>
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {(['all', 'published', 'draft', 'scheduled', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Articles list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 p-4 animate-pulse">
                <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No articles found</p>
            <p className="text-sm mt-1">
              {search ? 'Try a different search term.' : 'Create your first article to get started.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((article) => {
              const cfg = statusConfig[article.status];
              const StatusIcon = cfg.icon;
              return (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group rounded-xl border border-border/50 bg-card/50 hover:bg-card/80 transition-colors p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link
                          to={`/admin/blog/${article.id}/edit`}
                          className="font-semibold text-foreground hover:text-primary truncate transition-colors"
                        >
                          {article.title}
                        </Link>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>/blog/{article.slug}</span>
                        {article.view_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {article.view_count.toLocaleString()}
                          </span>
                        )}
                        <span>
                          {article.status === 'published' && article.published_at
                            ? new Date(article.published_at).toLocaleDateString()
                            : article.status === 'scheduled' && article.scheduled_at
                            ? `Scheduled: ${new Date(article.scheduled_at).toLocaleDateString()}`
                            : `Created: ${new Date(article.created_at).toLocaleDateString()}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/admin/blog/${article.id}/edit`)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {article.status === 'published' && (
                        <a href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                      )}
                      {article.status !== 'archived' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-amber-400"
                          onClick={() => handleArchive(article.id)}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-400"
                        onClick={() => handleDelete(article.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default AdminBlog;
