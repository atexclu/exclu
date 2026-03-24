import AppShell from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, LayoutDashboard, Plus, FileText, Eye, Pencil, Archive, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';

interface AdminUserSummary {
  id: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
  created_at: string | null;
  is_creator: boolean | null;
  is_admin: boolean | null;
  is_agency: boolean | null;
  links_count: number;
  assets_count: number;
  total_sales: number;
  total_revenue_cents: number;
  profile_view_count: number;
}

type RoleFilter = 'all' | 'creator' | 'fan' | 'agency';
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

const authInputClass = 'h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm';
const selectClass = 'h-11 rounded-md bg-black border border-white text-white text-sm px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer';

const AdminUsers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTab = (searchParams.get('tab') || 'users') as 'users' | 'blog';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialSearch = searchParams.get('search') || '';
  const initialSort = (searchParams.get('sort') || 'created_desc') as string;
  const initialRole = (searchParams.get('role') || 'all') as RoleFilter;

  const [activeTab, setActiveTab] = useState<'users' | 'blog'>(initialTab);

  // ── Users state ──
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sortMode, setSortMode] = useState(initialSort);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(initialRole);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [agencyUserIds, setAgencyUserIds] = useState<Set<string>>(new Set());

  // ── Blog state ──
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogSearch, setBlogSearch] = useState('');
  const [blogStatusFilter, setBlogStatusFilter] = useState<ArticleStatus | 'all'>('all');

  // Fetch agency user IDs once
  useEffect(() => {
    const fetchAgencyIds = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .not('agency_name', 'is', null);
      if (data) {
        setAgencyUserIds(new Set(data.map((p) => p.id)));
      }
    };
    fetchAgencyIds();
  }, []);

  // Load users
  useEffect(() => {
    if (activeTab !== 'users') return;
    let isMounted = true;

    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (!session) {
        setError('You are not authenticated. Please sign in again.');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-get-users', {
        headers: { Authorization: '', 'x-supabase-auth': session.access_token },
        body: {
          page,
          pageSize,
          search: searchQuery.trim().length > 0 ? searchQuery.trim() : null,
          sortBy: sortMode,
        },
      });

      if (!isMounted) return;
      if (error) {
        console.error('Error loading users from admin-get-users', error);
        setError('Unable to load users. Make sure your account has admin access.');
        setIsLoading(false);
        return;
      }

      const payload = data as { users?: AdminUserSummary[]; total?: number };
      setUsers(payload.users ?? []);
      setTotal(payload.total ?? (payload.users ? payload.users.length : 0));
      setIsLoading(false);
    };

    loadUsers();
    return () => { isMounted = false; };
  }, [page, pageSize, searchQuery, sortMode, activeTab]);

  // Load blog articles
  const fetchArticles = useCallback(async () => {
    setBlogLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBlogLoading(false); return; }
    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'list' },
    });
    if (res.error) {
      toast.error('Failed to load articles');
    } else {
      setArticles(res.data?.articles || []);
    }
    setBlogLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'blog') fetchArticles();
  }, [activeTab, fetchArticles]);

  const handleArchive = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'archive', id },
    });
    if (res.error) toast.error('Failed to archive article');
    else { toast.success('Article archived'); fetchArticles(); }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this article?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-blog-manage', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'delete', id },
    });
    if (res.error) toast.error('Failed to delete article');
    else { toast.success('Article deleted'); fetchArticles(); }
  };

  // ── Derived data ──
  const getUserType = (u: AdminUserSummary): string => {
    if (u.is_admin) return 'Admin';
    if (agencyUserIds.has(u.id)) return 'Agence';
    if (u.is_creator) return 'Créateur';
    return 'Fan';
  };

  const getTypeBadgeClass = (type: string): string => {
    switch (type) {
      case 'Admin': return 'bg-red-500/20 text-red-400';
      case 'Agence': return 'bg-purple-500/20 text-purple-400';
      case 'Créateur': return 'bg-primary/20 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter === 'all') return true;
    const type = getUserType(u);
    if (roleFilter === 'creator') return type === 'Créateur';
    if (roleFilter === 'fan') return type === 'Fan';
    if (roleFilter === 'agency') return type === 'Agence';
    return true;
  });

  const totalCount = roleFilter === 'all' ? (total || filteredUsers.length) : filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil((roleFilter === 'all' ? total : filteredUsers.length) / pageSize));

  const handleViewPublicProfile = (user: AdminUserSummary) => {
    if (user.handle) window.open(`/${user.handle}`, '_blank', 'noopener,noreferrer');
  };

  const handleViewDashboard = (user: AdminUserSummary) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('search', searchQuery);
    params.set('sort', sortMode);
    params.set('tab', activeTab);
    window.open(`/admin/users/${user.id}/overview?returnTo=${encodeURIComponent(`/admin/users?${params.toString()}`)}`, '_blank', 'noopener,noreferrer');
  };

  const filteredArticles = articles.filter((a) => {
    if (blogStatusFilter !== 'all' && a.status !== blogStatusFilter) return false;
    if (blogSearch) {
      const q = blogSearch.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.slug.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const blogCounts = {
    all: articles.length,
    draft: articles.filter((a) => a.status === 'draft').length,
    published: articles.filter((a) => a.status === 'published').length,
    scheduled: articles.filter((a) => a.status === 'scheduled').length,
    archived: articles.filter((a) => a.status === 'archived').length,
  };

  const switchTab = (tab: 'users' | 'blog') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <AppShell>
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-8">
        <div className="space-y-4">
          {/* Header with tabs */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin</h1>
              <p className="text-xs sm:text-sm text-exclu-space mt-1">
                Internal dashboard. Only visible to Exclu admins.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => switchTab('blog')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  activeTab === 'blog'
                    ? 'bg-[#CFFF16]/10 text-[#CFFF16] border border-[#CFFF16]/20'
                    : 'text-exclu-space hover:text-exclu-cloud hover:bg-exclu-arsenic/20'
                }`}
              >
                Blog
              </button>
            </div>
          </div>

          {/* ═══ USERS TAB ═══ */}
          {activeTab === 'users' && (
            <>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Rechercher par nom, email ou id…"
                  className={`w-full sm:w-64 ${authInputClass}`}
                />
                <select
                  value={roleFilter}
                  onChange={(e) => { setRoleFilter(e.target.value as RoleFilter); setPage(1); }}
                  className={selectClass}
                >
                  <option value="all">Tous les types</option>
                  <option value="creator">Par créateur</option>
                  <option value="fan">Par fan</option>
                  <option value="agency">Par agence</option>
                </select>
                <select
                  value={sortMode}
                  onChange={(e) => { setSortMode(e.target.value); setPage(1); }}
                  className={`${selectClass} sm:w-48 w-full`}
                >
                  <option value="created_desc">Plus récents</option>
                  <option value="created_asc">Plus anciens</option>
                  <option value="best_sellers">Meilleurs vendeurs</option>
                  <option value="most_viewed">Plus de vues</option>
                  <option value="most_content">Plus de contenus</option>
                  <option value="most_links">Plus de liens</option>
                </select>
              </div>

              <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-exclu-arsenic/70">
                  <span className="text-xs font-medium text-exclu-space uppercase tracking-wide">
                    Users ({totalCount})
                  </span>
                </div>

                {isLoading ? (
                  <div className="px-4 py-6 text-sm text-exclu-space">Loading users…</div>
                ) : error ? (
                  <div className="px-4 py-6 text-sm text-red-400">{error}</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-exclu-space">No users found.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs sm:text-sm">
                        <thead className="bg-exclu-ink/90 border-b border-exclu-arsenic/70">
                          <tr>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">User</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Type</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Contenus</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Liens</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Vues</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Ventes</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user) => {
                            const type = getUserType(user);
                            return (
                              <tr
                                key={user.id}
                                className="border-b border-exclu-arsenic/40 last:border-b-0 transition-colors duration-150 hover:bg-exclu-ink/80"
                              >
                                <td className="px-4 py-2 align-middle">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium text-exclu-cloud text-xs sm:text-sm">
                                      {user.display_name || '—'}
                                    </span>
                                    {user.email && (
                                      <span className="text-[11px] text-exclu-space/80 truncate">{user.email}</span>
                                    )}
                                    <span className="text-[10px] text-exclu-space/60 truncate">{user.id}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 align-middle">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getTypeBadgeClass(type)}`}>
                                    {type}
                                  </span>
                                </td>
                                <td className="px-4 py-2 align-middle text-exclu-space">{user.assets_count}</td>
                                <td className="px-4 py-2 align-middle text-exclu-space">{user.links_count}</td>
                                <td className="px-4 py-2 align-middle text-exclu-space">
                                  {(user.profile_view_count || 0).toLocaleString('en-US')}
                                </td>
                                <td className="px-4 py-2 align-middle">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-exclu-cloud font-medium text-xs">
                                      {user.total_sales} vente{user.total_sales !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-[10px] text-exclu-space/60">
                                      {(user.total_revenue_cents / 100).toFixed(2)} €
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 align-middle text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {user.handle && (
                                      <button
                                        type="button"
                                        onClick={() => handleViewPublicProfile(user)}
                                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud hover:border-exclu-cloud transition-colors"
                                        title="View public profile"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleViewDashboard(user)}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                      title="View dashboard"
                                    >
                                      <LayoutDashboard className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-t border-exclu-arsenic/70 flex items-center justify-between text-[11px] text-exclu-space/80">
                      <span>Page {page} / {totalPages}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1 rounded-full border border-exclu-arsenic/70 disabled:opacity-50 disabled:cursor-not-allowed bg-exclu-ink/80 text-xs"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          className="px-3 py-1 rounded-full border border-exclu-arsenic/70 disabled:opacity-50 disabled:cursor-not-allowed bg-exclu-ink/80 text-xs"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ═══ BLOG TAB ═══ */}
          {activeTab === 'blog' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="text"
                    value={blogSearch}
                    onChange={(e) => setBlogSearch(e.target.value)}
                    placeholder="Rechercher par titre ou slug…"
                    className={`w-full sm:w-64 ${authInputClass}`}
                  />
                </div>
                <button
                  onClick={() => navigate('/admin/blog/new')}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New Article
                </button>
              </div>

              {/* Status pills */}
              <div className="flex items-center gap-1 overflow-x-auto">
                {(['all', 'published', 'draft', 'scheduled', 'archived'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setBlogStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      blogStatusFilter === s
                        ? 'bg-primary text-primary-foreground'
                        : 'text-exclu-space hover:text-exclu-cloud hover:bg-exclu-ink/80 border border-exclu-arsenic/70'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({blogCounts[s]})
                  </button>
                ))}
              </div>

              {/* Articles list */}
              <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-exclu-arsenic/70">
                  <span className="text-xs font-medium text-exclu-space uppercase tracking-wide">
                    Articles ({filteredArticles.length})
                  </span>
                </div>

                {blogLoading ? (
                  <div className="px-4 py-6 text-sm text-exclu-space">Loading articles…</div>
                ) : filteredArticles.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-exclu-space text-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>{blogSearch ? 'No articles match your search.' : 'No articles yet.'}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-exclu-arsenic/40">
                    {filteredArticles.map((article) => {
                      const cfg = statusConfig[article.status];
                      const StatusIcon = cfg.icon;
                      return (
                        <div
                          key={article.id}
                          className="group px-4 py-3 flex items-start justify-between gap-4 hover:bg-exclu-ink/80 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Link
                                to={`/admin/blog/${article.id}/edit`}
                                className="font-semibold text-exclu-cloud hover:text-primary truncate transition-colors text-sm"
                              >
                                {article.title}
                              </Link>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-exclu-space">
                              <span>/blog/{article.slug}</span>
                              {article.view_count > 0 && (
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" /> {article.view_count.toLocaleString()}
                                </span>
                              )}
                              <span>
                                {article.status === 'published' && article.published_at
                                  ? new Date(article.published_at).toLocaleDateString()
                                  : `Created: ${new Date(article.created_at).toLocaleDateString()}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => navigate(`/admin/blog/${article.id}/edit`)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {article.status === 'published' && (
                              <a href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer">
                                <button className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud transition-colors" title="View">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </a>
                            )}
                            {article.status !== 'archived' && (
                              <button
                                onClick={() => handleArchive(article.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-amber-400 transition-colors"
                                title="Archive"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteArticle(article.id)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
};

export default AdminUsers;
