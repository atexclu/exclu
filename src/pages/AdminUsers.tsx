import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, LayoutDashboard, Plus, FileText, Eye, EyeOff, Pencil, Archive, Trash2, CheckCircle2, Clock, Building2, Loader2, X, Save, ChevronDown, ImagePlus, Inbox, Download, SlidersHorizontal, Check } from 'lucide-react';
import { AgencyCategoryConfig, type AgencyCategoryData } from '@/components/ui/AgencyCategoryConfig';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import AdminPayments from './AdminPayments';

interface AdminUserSummary {
  id: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
  avatar_url: string | null;
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

const EXPORT_COLUMNS: { key: string; label: string; defaultOn: boolean }[] = [
  { key: 'username', label: 'Username', defaultOn: true },
  { key: 'display_name', label: 'Display name', defaultOn: false },
  { key: 'handle', label: 'Handle', defaultOn: false },
  { key: 'email', label: 'Email', defaultOn: true },
  { key: 'account_type', label: 'Account type', defaultOn: true },
  { key: 'country', label: 'Country', defaultOn: true },
  { key: 'phone', label: 'Phone', defaultOn: false },
  { key: 'created_at', label: 'Created at', defaultOn: true },
  { key: 'subscription', label: 'Subscription', defaultOn: false },
  { key: 'wallet_balance', label: 'Wallet balance ($)', defaultOn: false },
  { key: 'total_earned', label: 'Total earned ($)', defaultOn: false },
  { key: 'total_withdrawn', label: 'Total withdrawn ($)', defaultOn: false },
  { key: 'links_count', label: 'Links count', defaultOn: false },
  { key: 'total_sales', label: 'Total sales', defaultOn: false },
  { key: 'total_revenue', label: 'Total revenue ($)', defaultOn: false },
  { key: 'profile_views', label: 'Profile views', defaultOn: false },
  { key: 'bank_country', label: 'Bank country', defaultOn: false },
];

type RoleFilter = 'all' | 'creator' | 'fan' | 'agency';
type ArticleStatus = 'draft' | 'published' | 'scheduled' | 'archived';
type AdminTab = 'users' | 'blog' | 'agencies' | 'payments';

interface DirectoryAgency {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  contact_email: string | null;
  country: string;
  city: string | null;
  services: string[];
  creator_profile_ids: string[];
  is_visible: boolean;
  is_featured: boolean;
  sort_order: number;
  pricing_structure: string | null;
  target_market: string[];
  services_offered: string[];
  platform_focus: string[];
  geography: string[];
  growth_strategy: string[];
}

interface ClaimRequest {
  id: string;
  agency_id: string | null;
  profile_agency_id: string | null;
  agency_name: string | null;
  requester_email: string;
  requester_name: string | null;
  requester_company: string | null;
  requester_whatsapp: string | null;
  requester_telegram: string | null;
  requester_monthly_revenue: string | null;
  requester_message: string | null;
  is_creator_agency: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  created_at: string;
  directory_agencies?: { name: string } | null;
}

const PRICING_OPTIONS = [
  { value: 'high_commission', label: 'High Commission (50%+)' },
  { value: 'mid_commission', label: 'Mid Commission (30–50%)' },
  { value: 'low_commission', label: 'Low Commission (<30%)' },
  { value: 'fixed_fee', label: 'Fixed Fee (Flat)' },
];

const TARGET_MARKET_OPTIONS = [
  'beginner_models', 'mid_tier_creators', 'top_creators', 'niche_models', 'ai_models',
];

const SERVICES_OPTIONS = ['full_management', 'chatting', 'marketing'];

const PLATFORM_OPTIONS = ['onlyfans', 'multi_platform', 'exclu'];

const GROWTH_STRATEGY_OPTIONS = [
  'paid_traffic', 'reddit', 'twitter', 'snapchat', 'organic', 'ai', 'viral_insta_tiktok', 'adult_traffic', 'sfs',
];

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Argentina','Australia','Austria','Bangladesh','Belgium',
  'Bolivia','Brazil','Bulgaria','Canada','Chile','China','Colombia','Croatia','Czech Republic',
  'Denmark','Ecuador','Egypt','Ethiopia','Finland','France','Germany','Ghana','Greece',
  'Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Japan','Jordan',
  'Kenya','Lebanon','Malaysia','Mexico','Morocco','Netherlands','New Zealand','Nigeria',
  'Norway','Pakistan','Peru','Philippines','Poland','Portugal','Romania','Russia','Saudi Arabia',
  'Senegal','Serbia','Singapore','South Africa','South Korea','Spain','Sudan','Sweden',
  'Switzerland','Thailand','Tunisia','Turkey','UAE','UK','US','Ukraine','Venezuela','Vietnam',
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

const emptyAgencyForm = {
  slug: '', name: '', logo_url: '', description: '', website_url: '', contact_email: '',
  country: '', city: '', services: [] as string[], pricing_structure: '' as string,
  target_market: [] as string[], services_offered: [] as string[], platform_focus: [] as string[],
  geography: [] as string[], growth_strategy: [] as string[], model_categories: [] as string[],
  is_visible: true, is_featured: false, sort_order: 0,
};

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

const authInputClass = 'h-11 bg-white dark:bg-black border-border dark:border-white text-foreground dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm';
const selectClass = 'h-11 rounded-md bg-white dark:bg-black border border-border dark:border-white text-foreground dark:text-white text-sm px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer';
const darkInputClass = 'h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm';
const darkSelectClass = 'h-11 rounded-md bg-black border border-white text-white text-sm px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer';

const AdminUsers = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTab = (searchParams.get('tab') || 'users') as AdminTab;
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialSearch = searchParams.get('search') || '';
  const initialSort = (searchParams.get('sort') || 'created_desc') as string;
  const initialRole = (searchParams.get('role') || 'all') as RoleFilter;

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  // ── Users state ──
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportConfig, setShowExportConfig] = useState(false);
  const [exportColumns, setExportColumns] = useState<Set<string>>(
    new Set(EXPORT_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
  );
  const exportConfigRef = useRef<HTMLDivElement>(null);
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

  // ── Agencies state ──
  const [dirAgencies, setDirAgencies] = useState<DirectoryAgency[]>([]);
  const [agenciesLoading, setAgenciesLoading] = useState(false);
  const [agencySearch, setAgencySearch] = useState('');
  const [showAgencyForm, setShowAgencyForm] = useState(false);
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [agencyForm, setAgencyForm] = useState(emptyAgencyForm);
  const [savingAgency, setSavingAgency] = useState(false);
  const [claimRequests, setClaimRequests] = useState<ClaimRequest[]>([]);
  const [pendingPayoutsCount, setPendingPayoutsCount] = useState(0);
  const [showClaimRequests, setShowClaimRequests] = useState(false);
  const [claimFilter, setClaimFilter] = useState<'pending' | 'processed' | 'all'>('pending');
  const [showAdvancedAgency, setShowAdvancedAgency] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  // Close export popover on click outside
  useEffect(() => {
    if (!showExportConfig) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportConfigRef.current && !exportConfigRef.current.contains(e.target as Node)) {
        setShowExportConfig(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportConfig]);

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
        headers: { 'x-supabase-auth': session.access_token },
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

  // Load directory agencies + profile-based agencies
  const fetchDirAgencies = useCallback(async () => {
    setAgenciesLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAgenciesLoading(false); return; }

    // Fetch directory agencies via edge function
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'list' },
    });
    const directoryAgencies: DirectoryAgency[] = (res.data?.agencies ?? []).map((a: DirectoryAgency) => ({
      ...a,
      _source: 'directory',
    }));

    // Also fetch profile-based agencies (profiles with agency_name)
    const { data: profileAgencies } = await supabase
      .from('profiles')
      .select('id, agency_name, agency_logo_url, country')
      .not('agency_name', 'is', null);

    const profileBased: DirectoryAgency[] = (profileAgencies ?? [])
      .filter((p: any) => p.agency_name?.trim())
      .map((p: any) => ({
        id: `profile-${p.id}`,
        slug: (p.agency_name || '').toLowerCase().replace(/\s+/g, '-'),
        name: p.agency_name || '',
        logo_url: p.agency_logo_url || null,
        description: null,
        website_url: null,
        contact_email: null,
        country: p.country || '',
        city: null,
        services: [],
        creator_profile_ids: [],
        is_visible: true,
        is_featured: false,
        sort_order: 999,
        pricing_structure: null,
        target_market: [],
        services_offered: [],
        platform_focus: [],
        geography: [],
        growth_strategy: [],
        _source: 'profile',
      }));

    // Merge: directory agencies first, then profile-based
    setDirAgencies([...directoryAgencies, ...profileBased]);

    // Fetch all claim requests (pending first)
    const { data: claims } = await supabase
      .from('agency_claim_requests')
      .select('*, directory_agencies(name)')
      .order('status', { ascending: true })   // 'pending' < 'processed' alphabetically
      .order('created_at', { ascending: false });
    if (claims) setClaimRequests(claims as ClaimRequest[]);

    setAgenciesLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'agencies') fetchDirAgencies();
  }, [activeTab, fetchDirAgencies]);

  // Fetch pending payouts count for badge
  useEffect(() => {
    supabase
      .from('payouts')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'approved', 'processing'])
      .then(({ count }) => setPendingPayoutsCount(count ?? 0));
  }, [activeTab]);

  const handleAdminLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const fileExt = file.name.split('.').pop() ?? 'png';
    const filePath = `agency-logos/${agencyForm.slug || slugify(agencyForm.name) || 'new'}/logo.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });
    if (uploadError) {
      toast.error('Upload failed');
      setLogoUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    setAgencyForm((p) => ({ ...p, logo_url: `${urlData.publicUrl}?t=${Date.now()}` }));
    setLogoUploading(false);
    toast.success('Logo uploaded');
  };

  const handleSaveAgency = async () => {
    if (!agencyForm.name.trim() || !agencyForm.country.trim()) {
      toast.error('Name and country are required');
      return;
    }
    setSavingAgency(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSavingAgency(false); return; }

    const payload = {
      action: editingAgencyId ? 'update' : 'create',
      ...(editingAgencyId && { id: editingAgencyId }),
      ...agencyForm,
      slug: agencyForm.slug || slugify(agencyForm.name),
      logo_url: agencyForm.logo_url || null,
      description: agencyForm.description || null,
      website_url: agencyForm.website_url || null,
      contact_email: agencyForm.contact_email || null,
      city: agencyForm.city || null,
      pricing_structure: agencyForm.pricing_structure || null,
    };

    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: payload,
    });
    if (res.error) {
      toast.error('Save failed');
    } else {
      toast.success(editingAgencyId ? 'Agency updated' : 'Agency created');
      setShowAgencyForm(false);
      setEditingAgencyId(null);
      setAgencyForm(emptyAgencyForm);
      fetchDirAgencies();
    }
    setSavingAgency(false);
  };

  const handleToggleAgencyVisibility = async (agency: DirectoryAgency) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'update', id: agency.id, is_visible: !agency.is_visible },
    });
    if (!res.error) {
      toast.success(agency.is_visible ? 'Agency hidden' : 'Agency visible');
      fetchDirAgencies();
    }
  };

  const handleDeleteAgency = async (id: string) => {
    if (!confirm('Delete this agency permanently?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'delete', id },
    });
    if (!res.error) { toast.success('Agency deleted'); fetchDirAgencies(); }
  };

  const startEditAgency = (agency: DirectoryAgency) => {
    setEditingAgencyId(agency.id);
    setAgencyForm({
      slug: agency.slug, name: agency.name, logo_url: agency.logo_url || '',
      description: agency.description || '', website_url: agency.website_url || '',
      contact_email: agency.contact_email || '', country: agency.country, city: agency.city || '',
      services: agency.services || [], pricing_structure: agency.pricing_structure || '',
      target_market: agency.target_market || [], services_offered: agency.services_offered || [],
      platform_focus: agency.platform_focus || [], geography: agency.geography || [],
      growth_strategy: agency.growth_strategy || [], model_categories: (agency as any).model_categories || [],
      is_visible: agency.is_visible, is_featured: agency.is_featured, sort_order: agency.sort_order,
    });
    setShowAgencyForm(true);
  };

  const handleMarkClaimProcessed = async (claimId: string) => {
    const { error: updateErr } = await supabase
      .from('agency_claim_requests')
      .update({ status: 'processed', reviewed_at: new Date().toISOString() })
      .eq('id', claimId);
    if (updateErr) { toast.error('Failed to update claim'); return; }
    toast.success('Marked as processed');
    fetchDirAgencies();
  };

  const handleApproveContact = async (claimId: string) => {
    const res = await supabase.functions.invoke('admin-approve-agency-contact', {
      body: { contactId: claimId, action: 'approve' },
    });
    if (res.error || res.data?.error) {
      toast.error(res.data?.error || 'Failed to approve request');
      return;
    }
    toast.success('Request approved — email forwarded to the agency');
    fetchDirAgencies();
  };

  const handleRejectContact = async (claimId: string) => {
    const res = await supabase.functions.invoke('admin-approve-agency-contact', {
      body: { contactId: claimId, action: 'reject' },
    });
    if (res.error || res.data?.error) {
      toast.error(res.data?.error || 'Failed to reject request');
      return;
    }
    toast.success('Request rejected');
    fetchDirAgencies();
  };

  const filteredDirAgencies = dirAgencies.filter((a) => {
    if (!agencySearch) return true;
    const q = agencySearch.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.country.toLowerCase().includes(q);
  });

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

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

  const toggleExportColumn = (key: string) => {
    setExportColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleExportCSV = async () => {
    if (exportColumns.size === 0) { toast.error('Select at least one column'); return; }
    setIsExporting(true);
    setShowExportConfig(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not authenticated'); return; }

      const res = await supabase.functions.invoke('admin-export-users-csv', {
        headers: { 'x-supabase-auth': session.access_token },
        body: { columns: Array.from(exportColumns) },
      });

      if (res.error) { toast.error('Export failed'); return; }

      const csvString = typeof res.data === 'string' ? res.data : await res.data?.text?.() ?? '';
      const blob = new Blob([csvString], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exclu-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <AppShell>
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-8 overflow-x-hidden">
        <div className="space-y-4 min-w-0">
          {/* Header with tabs — stacked on mobile, inline on sm+ */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin</h1>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 scrollbar-none">
              {(['users', 'blog', 'agencies', 'payments', 'mailing'] as const).map((tab) => {
                const isMailing = tab === 'mailing';
                const isActive = !isMailing && activeTab === tab;
                const labelMap = {
                  users: 'Users',
                  blog: 'Blog',
                  agencies: 'Agencies',
                  payments: 'Payments',
                  mailing: 'Mailing',
                } as const;
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      if (isMailing) {
                        navigate('/admin/emails');
                      } else {
                        switchTab(tab as AdminTab);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize whitespace-nowrap flex-shrink-0 ${
                      isActive
                        ? 'bg-[#CFFF16]/10 text-black dark:text-[#CFFF16] border border-[#CFFF16]/20'
                        : 'text-foreground/60 dark:text-exclu-space hover:text-foreground dark:hover:text-exclu-cloud hover:bg-foreground/5 dark:hover:bg-exclu-arsenic/20'
                    }`}
                  >
                    {labelMap[tab]}
                    {tab === 'payments' && pendingPayoutsCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[9px] text-white font-bold">
                        {pendingPayoutsCount}
                      </span>
                    )}
                    {tab === 'agencies' && claimRequests.filter((c) => c.status === 'pending').length > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[9px] text-white font-bold">
                        {claimRequests.filter((c) => c.status === 'pending').length}
                      </span>
                    )}
                  </button>
                );
              })}
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
                <div className="relative sm:ml-auto flex-shrink-0" ref={exportConfigRef}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExportConfig(!showExportConfig)}
                    disabled={isExporting}
                    className="rounded-full"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
                    Export CSV
                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>

                  {showExportConfig && (
                    <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Select columns</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setExportColumns(new Set(EXPORT_COLUMNS.map(c => c.key)))}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setExportColumns(new Set(EXPORT_COLUMNS.filter(c => c.defaultOn).map(c => c.key)))}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {EXPORT_COLUMNS.map((col) => (
                          <button
                            key={col.key}
                            type="button"
                            onClick={() => toggleExportColumn(col.key)}
                            className="w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              exportColumns.has(col.key)
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-border'
                            }`}>
                              {exportColumns.has(col.key) && <Check className="w-3 h-3" />}
                            </span>
                            <span className="text-foreground">{col.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="px-4 py-3 border-t border-border">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleExportCSV}
                          disabled={isExporting || exportColumns.size === 0}
                          className="w-full rounded-lg gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Export {exportColumns.size} column{exportColumns.size !== 1 ? 's' : ''}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
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
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-exclu-arsenic/50 flex items-center justify-center">
                                      {user.avatar_url ? (
                                        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-[11px] font-bold text-exclu-space/60">
                                          {(user.display_name || user.handle || '?')[0].toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                      <span className="font-medium text-exclu-cloud text-xs sm:text-sm">
                                        {user.display_name || '—'}
                                      </span>
                                      {user.email && (
                                        <span className="text-[11px] text-exclu-space/80 truncate">{user.email}</span>
                                      )}
                                      <span className="text-[10px] text-exclu-space/60 truncate">{user.id}</span>
                                    </div>
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
                                      {(user.total_revenue_cents / 100).toFixed(2)} $
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                  <Input
                    type="text"
                    value={blogSearch}
                    onChange={(e) => setBlogSearch(e.target.value)}
                    placeholder="Rechercher par titre ou slug…"
                    className={`w-full sm:w-64 ${authInputClass}`}
                  />
                  {/* Status pills - inline on desktop, separate on mobile */}
                  <div className="flex items-center gap-1 overflow-x-auto sm:flex-nowrap">
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
                </div>
                <Button onClick={() => navigate('/admin/blog/new')} variant="hero" size="sm" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> New Article
                </Button>
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

          {/* ═══ AGENCIES TAB ═══ */}
          {activeTab === 'agencies' && (
            <>
              {/* Header + buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="text"
                    value={agencySearch}
                    onChange={(e) => setAgencySearch(e.target.value)}
                    placeholder="Search agencies…"
                    className={`w-full sm:w-64 ${authInputClass}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowClaimRequests((v) => !v)}
                    className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      showClaimRequests
                        ? 'bg-[#CFFF16]/10 text-[#CFFF16] border-[#CFFF16]/20'
                        : 'text-exclu-space border-exclu-arsenic/70 hover:text-exclu-cloud hover:bg-exclu-arsenic/20'
                    }`}
                  >
                    <Inbox className="w-4 h-4" />
                    Claims
                    {claimRequests.filter((c) => c.status === 'pending').length > 0 && (
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[9px] text-white font-bold">
                        {claimRequests.filter((c) => c.status === 'pending').length}
                      </span>
                    )}
                  </button>
                  <Button onClick={() => { setShowAgencyForm(true); setEditingAgencyId(null); setAgencyForm(emptyAgencyForm); }} variant="hero" size="sm" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add Agency
                  </Button>
                </div>
              </div>

              {/* Claim requests panel */}
              {showClaimRequests && (
                <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
                  <div className="px-4 py-3 border-b border-exclu-arsenic/70 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-exclu-space uppercase tracking-wide">Claim Requests</span>
                    <div className="flex items-center gap-1">
                      {(['pending', 'processed', 'all'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setClaimFilter(f)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                            claimFilter === f
                              ? 'bg-[#CFFF16]/10 text-[#CFFF16]'
                              : 'text-exclu-space hover:text-exclu-cloud'
                          }`}
                        >
                          {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Processed'}
                          {f === 'pending' && claimRequests.filter((c) => c.status === 'pending').length > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] text-white font-bold">
                              {claimRequests.filter((c) => c.status === 'pending').length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const isHandled = (s: string) => s !== 'pending';
                    const filtered = claimRequests.filter((c) =>
                      claimFilter === 'all' ? true :
                      claimFilter === 'pending' ? c.status === 'pending' :
                      isHandled(c.status)
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="px-4 py-8 text-center text-sm text-exclu-space">
                          <Inbox className="w-6 h-6 mx-auto mb-2 opacity-40" />
                          {claimFilter === 'pending' ? 'No pending requests.' : claimFilter === 'processed' ? 'No handled requests yet.' : 'No contact requests yet.'}
                        </div>
                      );
                    }
                    return (
                      <div className="divide-y divide-exclu-arsenic/40">
                        {filtered.map((claim) => {
                          const agencyDisplayName = claim.agency_name || claim.directory_agencies?.name || 'Unknown agency';
                          const statusBadge = {
                            pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                            approved: 'bg-green-500/10 text-green-400 border-green-500/20',
                            rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
                            processed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                          }[claim.status] ?? 'bg-white/5 text-exclu-space border-white/10';
                          const statusLabel = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', processed: 'Processed' }[claim.status] ?? claim.status;

                          return (
                            <div key={claim.id} className="px-4 py-3 flex items-start justify-between gap-4">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-exclu-cloud">{agencyDisplayName}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${statusBadge}`}>
                                    {statusLabel}
                                  </span>
                                  {claim.is_creator_agency && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                      Creator agency
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-exclu-space">
                                  {claim.requester_email}
                                  {claim.requester_name && ` · ${claim.requester_name}`}
                                  {claim.requester_company && ` · ${claim.requester_company}`}
                                </p>
                                {(claim.requester_whatsapp || claim.requester_telegram || claim.requester_monthly_revenue) && (
                                  <p className="text-xs text-exclu-steel">
                                    {claim.requester_whatsapp && `WhatsApp: ${claim.requester_whatsapp}`}
                                    {claim.requester_telegram && `${claim.requester_whatsapp ? ' · ' : ''}Telegram: ${claim.requester_telegram}`}
                                    {claim.requester_monthly_revenue && `${(claim.requester_whatsapp || claim.requester_telegram) ? ' · ' : ''}Revenue: ${claim.requester_monthly_revenue}`}
                                  </p>
                                )}
                                {claim.requester_message && (
                                  <p className="text-xs text-exclu-steel italic">"{claim.requester_message}"</p>
                                )}
                                <p className="text-[10px] text-exclu-graphite">
                                  {new Date(claim.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                              {claim.status === 'pending' && (
                                <div className="flex-shrink-0 flex flex-col gap-1.5">
                                  {claim.is_creator_agency ? (
                                    <>
                                      <button
                                        onClick={() => handleApproveContact(claim.id)}
                                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleRejectContact(claim.id)}
                                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => handleMarkClaimProcessed(claim.id)}
                                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-exclu-cloud hover:bg-white/10 transition-colors"
                                    >
                                      Mark as processed
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Agency Form */}
              {showAgencyForm && (
                <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 sm:px-5 py-3 border-b border-exclu-arsenic/70 flex items-center justify-between">
                    <h2 className="font-semibold text-sm text-exclu-cloud">
                      {editingAgencyId ? 'Edit Agency' : 'New Agency'}
                    </h2>
                    <button onClick={() => { setShowAgencyForm(false); setEditingAgencyId(null); setShowAdvancedAgency(false); }} className="text-exclu-space hover:text-exclu-cloud">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="px-4 sm:px-5 py-4 space-y-4">
                    {/* Essential fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Agency Name *</label>
                        <Input
                          value={agencyForm.name}
                          onChange={(e) => setAgencyForm((p) => ({ ...p, name: e.target.value, slug: editingAgencyId ? p.slug : slugify(e.target.value) }))}
                          placeholder="e.g. Elite Models Agency"
                          className={authInputClass}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Country *</label>
                        <select
                          value={agencyForm.country}
                          onChange={(e) => setAgencyForm((p) => ({ ...p, country: e.target.value }))}
                          className={selectClass + ' w-full'}
                        >
                          <option value="">— Select country —</option>
                          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">City</label>
                        <Input value={agencyForm.city} onChange={(e) => setAgencyForm((p) => ({ ...p, city: e.target.value }))} placeholder="e.g. Los Angeles" className={authInputClass} />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Description</label>
                      <textarea
                        value={agencyForm.description}
                        onChange={(e) => setAgencyForm((p) => ({ ...p, description: e.target.value }))}
                        rows={2}
                        placeholder="Brief description of the agency…"
                        className="w-full px-3 py-2.5 bg-white dark:bg-black border border-border dark:border-white rounded-lg text-sm text-foreground dark:text-white resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    {/* Contact & branding */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Website</label>
                        <Input value={agencyForm.website_url} onChange={(e) => setAgencyForm((p) => ({ ...p, website_url: e.target.value }))} placeholder="https://…" className={authInputClass} />
                      </div>
                      <div>
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Contact Email</label>
                        <Input value={agencyForm.contact_email} onChange={(e) => setAgencyForm((p) => ({ ...p, contact_email: e.target.value }))} placeholder="contact@agency.com" className={authInputClass} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Agency Logo</label>
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={logoUploading}
                          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-exclu-arsenic/50 hover:border-exclu-arsenic/80 transition-colors cursor-pointer text-left disabled:opacity-50"
                        >
                          {agencyForm.logo_url ? (
                            <img src={agencyForm.logo_url} alt="logo" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-exclu-arsenic/30 flex items-center justify-center flex-shrink-0">
                              {logoUploading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-exclu-space" />
                              ) : (
                                <ImagePlus className="w-5 h-5 text-exclu-space/60" />
                              )}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-exclu-cloud">
                              {logoUploading ? 'Uploading…' : agencyForm.logo_url ? 'Change photo' : 'Upload logo'}
                            </p>
                            <p className="text-xs text-exclu-space mt-0.5">PNG, JPG, WEBP — click to browse</p>
                          </div>
                        </button>
                        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleAdminLogoUpload} />
                      </div>
                    </div>

                    {/* Slug (show only when editing) */}
                    {editingAgencyId && (
                      <div>
                        <label className="text-[11px] text-exclu-space uppercase tracking-wide block mb-1">Slug</label>
                        <Input value={agencyForm.slug} onChange={(e) => setAgencyForm((p) => ({ ...p, slug: e.target.value }))} className={authInputClass} />
                      </div>
                    )}

                    {/* Collapsible advanced section */}
                    <button
                      type="button"
                      onClick={() => setShowAdvancedAgency((v) => !v)}
                      className="w-full flex items-center justify-between py-2 text-xs text-exclu-space hover:text-exclu-cloud transition-colors"
                    >
                      <span className="font-medium uppercase tracking-wide">Advanced details</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showAdvancedAgency ? 'rotate-180' : ''}`} />
                    </button>

                    {showAdvancedAgency && (
                      <div className="pt-1">
                        <AgencyCategoryConfig
                          value={{
                            pricing: agencyForm.pricing_structure,
                            targetMarket: agencyForm.target_market,
                            services: agencyForm.services_offered,
                            platform: agencyForm.platform_focus,
                            growthStrategy: agencyForm.growth_strategy,
                            modelTypes: agencyForm.model_categories,
                          }}
                          onChange={(data: AgencyCategoryData) => setAgencyForm((p) => ({
                            ...p,
                            pricing_structure: data.pricing,
                            target_market: data.targetMarket,
                            services_offered: data.services,
                            platform_focus: data.platform,
                            growth_strategy: data.growthStrategy,
                            model_categories: data.modelTypes,
                          }))}
                        />
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className="px-4 sm:px-5 py-3 border-t border-exclu-arsenic/70 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button
                      onClick={() => { setShowAgencyForm(false); setEditingAgencyId(null); setShowAdvancedAgency(false); }}
                      className="px-4 py-2 rounded-full text-xs font-medium text-exclu-space hover:text-exclu-cloud border border-exclu-arsenic/70 transition-colors text-center"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAgency}
                      disabled={savingAgency}
                      className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingAgency ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {editingAgencyId ? 'Update Agency' : 'Create Agency'}
                    </button>
                  </div>
                </div>
              )}

              {/* Agencies list */}
              <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-exclu-arsenic/70">
                  <span className="text-xs font-medium text-exclu-space uppercase tracking-wide">
                    Directory Agencies ({filteredDirAgencies.length})
                  </span>
                </div>

                {agenciesLoading ? (
                  <div className="px-4 py-6 text-sm text-exclu-space">Loading agencies…</div>
                ) : filteredDirAgencies.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-exclu-space text-center">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>{agencySearch ? 'No agencies match your search.' : 'No agencies yet. Add one above.'}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-exclu-arsenic/40">
                    {filteredDirAgencies.map((agency) => (
                      <div
                        key={agency.id}
                        className="group px-4 py-3 flex items-center justify-between gap-4 hover:bg-exclu-ink/80 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {agency.logo_url ? (
                            <img src={agency.logo_url} alt={agency.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-exclu-arsenic/30 flex items-center justify-center text-xs font-bold text-exclu-space flex-shrink-0">
                              {agency.name[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-exclu-cloud truncate">{agency.name}</p>
                              {(agency as any)._source === 'profile' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">account</span>
                              )}
                              {!agency.is_visible && (agency as any)._source !== 'profile' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">hidden</span>
                              )}
                            </div>
                            <p className="text-[11px] text-exclu-space">
                              {agency.country}{agency.city ? `, ${agency.city}` : ''}
                              {agency.services_offered?.length > 0 && ` · ${agency.services_offered.map((s) => s.replace(/_/g, ' ')).join(', ')}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {(agency as any)._source === 'profile' ? (
                            <button
                              onClick={() => navigate(`/admin/users/${agency.id.replace('profile-', '')}?returnTo=/admin/users`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud transition-colors"
                              title="View user account"
                            >
                              <ExternalLink className="w-3 h-3" /> View account
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditAgency(agency)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleAgencyVisibility(agency)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud transition-colors"
                                title={agency.is_visible ? 'Hide' : 'Show'}
                              >
                                {agency.is_visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <a href={`/directory/agencies/${agency.slug}`} target="_blank" rel="noopener noreferrer">
                                <button className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud transition-colors" title="View">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </a>
                              <button
                                onClick={() => handleDeleteAgency(agency.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'payments' && (
            <AdminPayments embedded />
          )}
        </div>
      </main>
    </AppShell>
  );
};

export default AdminUsers;
