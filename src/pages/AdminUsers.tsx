import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AdminUserSummary {
  id: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
  created_at: string | null;
  is_creator: boolean | null;
  is_admin: boolean | null;
  links_count: number;
  assets_count: number;
  total_sales: number;
  total_revenue_cents: number;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'created_desc' | 'created_asc' | 'best_sellers'>(
    'created_desc',
  );
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!session) {
        setError('You are not authenticated. Please sign in again.');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-get-users', {
        headers: {
          // Prevent the Functions gateway from trying to validate the user JWT
          // in the Authorization header; we pass it explicitly via x-supabase-auth.
          Authorization: '',
          'x-supabase-auth': session.access_token,
        },
        body: {
          page,
          pageSize,
          search: searchQuery.trim().length > 0 ? searchQuery.trim() : null,
        },
      });

      if (!isMounted) return;

      if (error) {
        console.error('Error loading users from admin-get-users', error);
        setError('Unable to load users. Make sure your account has admin access.');
        setIsLoading(false);
        return;
      }

      const payload = data as {
        users?: AdminUserSummary[];
        total?: number;
        page?: number;
        pageSize?: number;
      };
      setUsers(payload.users ?? []);
      setTotal(payload.total ?? (payload.users ? payload.users.length : 0));
      setIsLoading(false);
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, [page, pageSize, searchQuery]);

  const handleViewPublicProfile = (user: AdminUserSummary) => {
    if (user.handle) {
      window.open(`/${user.handle}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleViewDashboard = (user: AdminUserSummary) => {
    navigate(`/admin/users/${user.id}/overview`);
  };

  const filteredAndSortedUsers = users
    .slice()
    .sort((a, b) => {
      if (sortMode === 'best_sellers') {
        if (b.total_sales !== a.total_sales) {
          return b.total_sales - a.total_sales;
        }
        return b.total_revenue_cents - a.total_revenue_cents;
      }

      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;

      if (sortMode === 'created_asc') {
        return dateA - dateB;
      }

      // created_desc (default): newest first
      return dateB - dateA;
    });

  const totalCount = total || filteredAndSortedUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <AppShell>
      <main className="px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin – Users</h1>
              <p className="text-xs sm:text-sm text-exclu-space mt-1">
                Internal view of creator and user accounts. Only visible to Exclu admins.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher par nom, email ou id…"
                className="w-full sm:w-56 rounded-full bg-white border border-exclu-arsenic/70 px-3 py-1.5 text-xs text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary/70 focus:border-primary/70"
              />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                className="w-full sm:w-48 rounded-full bg-white border border-exclu-arsenic/70 px-3 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-primary/70 focus:border-primary/70"
              >
                <option value="created_desc">Date de création · plus récents</option>
                <option value="created_asc">Date de création · plus anciens</option>
                <option value="best_sellers">Meilleurs vendeurs</option>
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 shadow-lg shadow-black/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-exclu-arsenic/70 flex items-center justify-between">
              <span className="text-xs font-medium text-exclu-space uppercase tracking-wide">
                Users ({totalCount})
              </span>
            </div>

            {isLoading ? (
              <div className="px-4 py-6 text-sm text-exclu-space">Loading users…</div>
            ) : error ? (
              <div className="px-4 py-6 text-sm text-red-400">{error}</div>
            ) : filteredAndSortedUsers.length === 0 ? (
              <div className="px-4 py-6 text-sm text-exclu-space">No users found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="bg-exclu-ink/90 border-b border-exclu-arsenic/70">
                    <tr>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">User</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Creator</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Contenus</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Liens</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Created at</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedUsers.map((user) => (
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
                              <span className="text-[11px] text-exclu-space/80 truncate">
                                {user.email}
                              </span>
                            )}
                            <span className="text-[10px] text-exclu-space/60 truncate">{user.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space">
                          {user.is_creator ? 'Yes' : 'No'}
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space">
                          {user.assets_count}
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space">
                          {user.links_count}
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space text-[11px]">
                          {user.created_at ? new Date(user.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-2 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            {user.handle && (
                              <button
                                type="button"
                                onClick={() => handleViewPublicProfile(user)}
                                className="inline-flex items-center rounded-full border border-exclu-arsenic/70 px-3 py-1 text-[11px] text-exclu-space hover:text-exclu-cloud hover:border-exclu-cloud transition-colors"
                              >
                                View public
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewDashboard(user)}
                              className="inline-flex items-center rounded-full bg-exclu-cloud text-black px-3 py-1 text-[11px] font-medium hover:bg-white/90 transition-colors"
                            >
                              View dashboard
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-exclu-arsenic/70 flex items-center justify-between text-[11px] text-exclu-space/80">
                  <span>
                    Page {page} / {totalPages}
                  </span>
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
        </div>
      </main>
    </AppShell>
  );
};

export default AdminUsers;
