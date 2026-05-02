import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  Search,
  Loader2,
  Star,
  X,
  ChevronDown,
  Filter,
  ArrowUpDown,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MODEL_CATEGORY_GROUPS, getModelCategoryLabel } from '@/lib/categories';
import AdminCreatorCard, { type AdminCardRow } from '@/components/directory/AdminCreatorCard';
import AppShell from '@/components/AppShell';

const GLOBAL_TAB = '__global__';

interface DirectoryRow extends AdminCardRow {
  bio: string | null;
  model_categories: string[] | null;
  category: string | null;
  display_rank: number;
}

type StatusFilter = 'all' | 'premium' | 'free';
type VisibilityFilter = 'all' | 'visible_global' | 'hidden_global' | 'hidden_cat';
type SortKey = 'curated' | 'views' | 'paid_links' | 'best_sellers' | 'newest' | 'oldest' | 'premium';
type AvatarFilter = 'all' | 'with_avatar' | 'no_avatar';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'curated', label: 'Tri curé (Featured → curé → algo)' },
  { value: 'views', label: 'Plus de vues' },
  { value: 'paid_links', label: 'Plus de liens payants' },
  { value: 'best_sellers', label: 'Meilleures ventes' },
  { value: 'premium', label: 'Pro en premier' },
  { value: 'newest', label: 'Plus récents' },
  { value: 'oldest', label: 'Plus anciens' },
];

const sortByCurated = (rows: DirectoryRow[]) =>
  rows.slice().sort((a, b) => {
    if (a.display_rank !== b.display_rank) return a.display_rank - b.display_rank;
    const aPos = a.position == null ? Number.POSITIVE_INFINITY : a.position;
    const bPos = b.position == null ? Number.POSITIVE_INFINITY : b.position;
    if (aPos !== bPos) return aPos - bPos;
    const dv = (b.profile_view_count ?? 0) - (a.profile_view_count ?? 0);
    if (dv !== 0) return dv;
    const ad = a.created_at ? Date.parse(a.created_at) : 0;
    const bd = b.created_at ? Date.parse(b.created_at) : 0;
    return bd - ad;
  });

const sortBy = (rows: DirectoryRow[], key: SortKey): DirectoryRow[] => {
  if (key === 'curated') return sortByCurated(rows);
  const arr = rows.slice();
  switch (key) {
    case 'views':
      return arr.sort((a, b) => (b.profile_view_count ?? 0) - (a.profile_view_count ?? 0));
    case 'paid_links':
      return arr.sort((a, b) => b.paid_links_count - a.paid_links_count);
    case 'best_sellers':
      return arr.sort((a, b) => Number(b.total_earned_cents) - Number(a.total_earned_cents));
    case 'premium':
      return arr.sort((a, b) => {
        if (a.is_premium !== b.is_premium) return a.is_premium ? -1 : 1;
        return (b.profile_view_count ?? 0) - (a.profile_view_count ?? 0);
      });
    case 'newest':
      return arr.sort(
        (a, b) =>
          (b.created_at ? Date.parse(b.created_at) : 0) -
          (a.created_at ? Date.parse(a.created_at) : 0),
      );
    case 'oldest':
      return arr.sort(
        (a, b) =>
          (a.created_at ? Date.parse(a.created_at) : 0) -
          (b.created_at ? Date.parse(b.created_at) : 0),
      );
  }
};

/* ─── Sortable card wrapper ─── */
function SortableAdminCard({
  row,
  showHandle,
  children,
}: {
  row: DirectoryRow;
  showHandle: boolean;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.creator_profile_id,
    disabled: !showHandle,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

/* ─── Reusable filter dropdown pill ─── */
function FilterPill<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
  width = 'w-56',
}: {
  icon: React.ReactNode;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const current = options.find((o) => o.value === value);
  const isDefault = options[0]?.value === value;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group inline-flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-full text-xs font-medium border transition whitespace-nowrap ${
          isDefault
            ? 'bg-exclu-ink/30 dark:bg-white/[0.04] text-exclu-cloud border-exclu-arsenic/40 hover:border-exclu-arsenic/70'
            : 'bg-[#CFFF16]/10 text-[#CFFF16] border-[#CFFF16]/40'
        }`}
      >
        <span className="opacity-70 group-hover:opacity-100">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-60">{label}</span>
        <span>{current?.label}</span>
        <ChevronDown className={`w-3 h-3 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute z-40 mt-1.5 left-0 ${width} rounded-xl border border-exclu-arsenic/60 bg-[#0a0a0e] shadow-2xl overflow-hidden`}>
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between ${
                  selected
                    ? 'bg-[#CFFF16]/10 text-[#CFFF16]'
                    : 'text-exclu-cloud hover:bg-exclu-arsenic/30'
                }`}
              >
                <span>{opt.label}</span>
                {selected && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Multi-category dialog ─── */
function CategoriesDialog({
  open,
  onOpenChange,
  creator,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creator: DirectoryRow | null;
  onSaved: (creatorProfileId: string, categories: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (creator) setSelected(creator.model_categories || []);
  }, [creator]);
  const toggle = (v: string) =>
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const save = async () => {
    if (!creator) return;
    setSaving(true);
    const { error } = await supabase
      .from('creator_profiles')
      .update({ model_categories: selected })
      .eq('id', creator.creator_profile_id);
    setSaving(false);
    if (error) {
      toast.error('Échec sauvegarde catégories');
      return;
    }
    toast.success('Catégories mises à jour');
    onSaved(creator.creator_profile_id, selected);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Catégories de {creator?.display_name || creator?.username || ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {Object.entries(MODEL_CATEGORY_GROUPS).map(([group, options]) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                {group}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {options.map((opt) => {
                  const checked = selected.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border hover:border-[#CFFF16]/40 cursor-pointer text-xs"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(opt.value)} />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main page ─── */
export default function AdminDirectory({ embedded = false }: { embedded?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState<string>(GLOBAL_TAB);
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [avatarFilter, setAvatarFilter] = useState<AvatarFilter>('with_avatar');
  const [sortKey, setSortKey] = useState<SortKey>('curated');
  const [editingCategoriesFor, setEditingCategoriesFor] = useState<DirectoryRow | null>(null);

  const categoryFilter = activeTab === GLOBAL_TAB ? null : activeTab;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    if (categoryFilter === null) {
      const { data, error } = await supabase
        .from('v_directory_creators_admin')
        .select('*')
        .is('category', null)
        .range(0, 49999);
      if (error) {
        toast.error('Échec chargement directory');
        setLoading(false);
        return;
      }
      setRows(sortByCurated((data || []) as DirectoryRow[]));
    } else {
      const [creatorsRes, curationRes] = await Promise.all([
        supabase
          .from('v_directory_creators_admin')
          .select('*')
          .is('category', null)
          .contains('model_categories', [categoryFilter])
          .range(0, 49999),
        supabase.from('directory_curation').select('*').eq('category', categoryFilter),
      ]);
      if (creatorsRes.error) {
        toast.error('Échec chargement créateurs');
        setLoading(false);
        return;
      }
      const curationMap = new Map<string, any>(
        (curationRes.data || []).map((c: any) => [c.creator_id, c]),
      );
      const merged: DirectoryRow[] = (creatorsRes.data || []).map((cp: any) => {
        const dc = curationMap.get(cp.creator_profile_id);
        const isFeatured = !!dc?.is_featured;
        const position = dc?.position ?? null;
        let displayRank = 5;
        if (isFeatured) displayRank = 1;
        else if (position != null) displayRank = 2;
        else if (cp.is_premium) displayRank = 3;
        else if ((cp.paid_links_count ?? 0) > 0) displayRank = 4;
        return {
          ...cp,
          category: categoryFilter,
          is_featured: isFeatured,
          position,
          is_hidden_for_category: !!dc?.is_hidden,
          display_rank: displayRank,
        } as DirectoryRow;
      });
      setRows(sortByCurated(merged));
    }
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /* ─── Optimistic patches ─── */
  const patchLocal = (id: string, patch: Partial<DirectoryRow>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.creator_profile_id !== id) return r;
        const next = { ...r, ...patch } as DirectoryRow;
        if (next.is_featured) next.display_rank = 1;
        else if (next.position != null) next.display_rank = 2;
        else if (next.is_premium) next.display_rank = 3;
        else if (next.paid_links_count > 0) next.display_rank = 4;
        else next.display_rank = 5;
        return next;
      }),
    );

  const applyPatch = async (id: string, patch: Record<string, unknown>) => {
    patchLocal(id, patch as Partial<DirectoryRow>);
    const { error } = await supabase.rpc('admin_set_directory_curation', {
      p_creator_id: id,
      p_category: categoryFilter,
      p_patch: patch,
    });
    if (error) {
      toast.error('Échec mise à jour — refresh en cours');
      fetchRows();
    }
  };

  /* ─── Filter + sort ─── */
  const filteredRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const ok =
          r.display_name?.toLowerCase().includes(q) ||
          r.username?.toLowerCase().includes(q) ||
          r.bio?.toLowerCase().includes(q);
        if (!ok) return false;
      }
      if (statusFilter === 'premium' && !r.is_premium) return false;
      if (statusFilter === 'free' && r.is_premium) return false;

      if (visibilityFilter === 'visible_global' && !r.is_directory_visible) return false;
      if (visibilityFilter === 'hidden_global' && r.is_directory_visible) return false;
      if (visibilityFilter === 'hidden_cat' && !r.is_hidden_for_category) return false;

      if (avatarFilter === 'with_avatar' && !r.avatar_url) return false;
      if (avatarFilter === 'no_avatar' && r.avatar_url) return false;
      return true;
    });
    return sortBy(filtered, sortKey);
  }, [rows, search, statusFilter, visibilityFilter, avatarFilter, sortKey]);

  // When sortKey is "curated" we render the 3 buckets. Otherwise a single grid.
  const usingCurated = sortKey === 'curated';
  const featuredRows = useMemo(
    () => (usingCurated ? filteredRows.filter((r) => r.is_featured) : []),
    [usingCurated, filteredRows],
  );
  const curatedRows = useMemo(
    () => (usingCurated ? filteredRows.filter((r) => !r.is_featured && r.position != null) : []),
    [usingCurated, filteredRows],
  );
  const fallbackRows = useMemo(
    () => (usingCurated ? filteredRows.filter((r) => !r.is_featured && r.position == null) : filteredRows),
    [usingCurated, filteredRows],
  );

  const handleDragEnd = (bucket: 'featured' | 'curated') => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids =
      bucket === 'featured'
        ? featuredRows.map((r) => r.creator_profile_id)
        : curatedRows.map((r) => r.creator_profile_id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const ordered = arrayMove(ids, oldIdx, newIdx);
    setRows((prev) => {
      const next = prev.slice();
      ordered.forEach((cid, i) => {
        const idx = next.findIndex((r) => r.creator_profile_id === cid);
        if (idx >= 0) next[idx] = { ...next[idx], position: i };
      });
      return sortByCurated(next);
    });
    supabase
      .rpc('admin_reorder_directory', {
        p_category: categoryFilter,
        p_ordered_creator_ids: ordered,
      })
      .then(({ error }) => {
        if (error) {
          toast.error('Échec réordonnancement');
          fetchRows();
        }
      });
  };

  const renderCard = (row: DirectoryRow, sortable: boolean) => {
    const inner = (handleProps?: { attributes?: any; listeners?: any }) => (
      <AdminCreatorCard
        row={row}
        category={categoryFilter}
        onPatch={(patch) => applyPatch(row.creator_profile_id, patch)}
        onOpenCategories={() => setEditingCategoriesFor(row)}
        dragAttributes={handleProps?.attributes}
        dragListeners={handleProps?.listeners}
        showHandle={sortable}
      />
    );
    if (!sortable) return inner();
    return (
      <SortableAdminCard row={row} showHandle={sortable}>
        {inner}
      </SortableAdminCard>
    );
  };

  /* ─── Render ─── */
  const totalAll = rows.length;
  const totalFiltered = filteredRows.length;

  const content = (
    <div className={embedded ? '' : 'min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8'}>
      <div className={embedded ? '' : 'max-w-[1400px] mx-auto'}>
        {!embedded && (
          <header className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">Directory — curation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mettez en avant, masquez ou réordonnez les créatrices par catégorie.
            </p>
          </header>
        )}

        {/* ── CATEGORY TABS ── */}
        <div className="-mx-1 px-1 mb-5 overflow-x-auto scrollbar-none">
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab(GLOBAL_TAB)}
              className={`px-3 h-7 inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition ${
                activeTab === GLOBAL_TAB
                  ? 'bg-[#CFFF16] text-black'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              <Star className="w-3 h-3" /> Featured global
            </button>
            {Object.entries(MODEL_CATEGORY_GROUPS).map(([group, options]) => (
              <div key={group} className="flex items-center gap-1">
                <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 px-1 select-none">
                  {group}
                </span>
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setActiveTab(opt.value)}
                    className={`px-2.5 h-7 inline-flex items-center rounded-full text-xs font-medium transition ${
                      activeTab === opt.value
                        ? 'bg-[#CFFF16] text-black'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── FILTER TOOLBAR ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher handle, nom, bio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 rounded-full bg-exclu-ink/30 dark:bg-white/[0.04] border-exclu-arsenic/40"
            />
          </div>

          <FilterPill<StatusFilter>
            icon={<Filter className="w-3 h-3" />}
            label="Plan"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'Pro + Free' },
              { value: 'premium', label: 'Pro uniquement' },
              { value: 'free', label: 'Free uniquement' },
            ]}
          />

          <FilterPill<VisibilityFilter>
            icon={<Layers className="w-3 h-3" />}
            label="Visibilité"
            value={visibilityFilter}
            onChange={setVisibilityFilter}
            width="w-64"
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'visible_global', label: 'Visible (global)' },
              { value: 'hidden_global', label: 'Masqué globalement' },
              { value: 'hidden_cat', label: 'Masqué dans cette catégorie' },
            ]}
          />

          <FilterPill<AvatarFilter>
            icon={<Filter className="w-3 h-3" />}
            label="Avatar"
            value={avatarFilter}
            onChange={setAvatarFilter}
            options={[
              { value: 'with_avatar', label: 'Avec avatar' },
              { value: 'all', label: 'Tous' },
              { value: 'no_avatar', label: 'Sans avatar' },
            ]}
          />

          <FilterPill<SortKey>
            icon={<ArrowUpDown className="w-3 h-3" />}
            label="Trier"
            value={sortKey}
            onChange={setSortKey}
            width="w-72"
            options={SORT_OPTIONS}
          />

          {(statusFilter !== 'all' ||
            visibilityFilter !== 'all' ||
            avatarFilter !== 'with_avatar' ||
            sortKey !== 'curated' ||
            search) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setVisibilityFilter('all');
                setAvatarFilter('with_avatar');
                setSortKey('curated');
                setSearch('');
              }}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}

          <div className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
            <span className="font-mono">
              {totalFiltered}
            </span>
            <span>/</span>
            <span className="font-mono opacity-60">{totalAll}</span>
            <span>
              créateur{totalFiltered > 1 ? 's' : ''}
              {categoryFilter ? ` · ${getModelCategoryLabel(categoryFilter)}` : ''}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Chargement…
          </div>
        ) : usingCurated ? (
          <div className="space-y-10">
            {/* ── FEATURED CAROUSEL ── */}
            <section>
              <SectionHeader
                title="Mises en avant"
                count={featuredRows.length}
                hint="Drag & drop pour réordonner — sauvegarde auto"
                accent
              />
              {featuredRows.length === 0 ? (
                <EmptyState text="Aucune en featured. Cliquez sur l'épingle d'une carte pour l'ajouter." />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd('featured')}
                >
                  <SortableContext
                    items={featuredRows.map((r) => r.creator_profile_id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                      {featuredRows.map((r) => renderCard(r, true))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

            {/* ── CURATED ── */}
            <section>
              <SectionHeader
                title="Curées"
                count={curatedRows.length}
                hint="Position fixée — drag & drop"
              />
              {curatedRows.length === 0 ? (
                <EmptyState text="Aucune position curée." />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd('curated')}
                >
                  <SortableContext
                    items={curatedRows.map((r) => r.creator_profile_id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                      {curatedRows.map((r) => renderCard(r, true))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

            {/* ── FALLBACK ── */}
            <section>
              <SectionHeader
                title="Tri automatique"
                count={fallbackRows.length}
                hint="Pro → liens payants → vues"
              />
              {fallbackRows.length === 0 ? (
                <EmptyState text="Vide." />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {fallbackRows.map((r) => renderCard(r, false))}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ── NON-CURATED SORT (single grid) ── */
          <section>
            <SectionHeader
              title={SORT_OPTIONS.find((s) => s.value === sortKey)?.label ?? ''}
              count={fallbackRows.length}
              hint="Tri appliqué sur toute la base — actions rapides via les épingles ⇒ les remontent dans le tri curé"
            />
            {fallbackRows.length === 0 ? (
              <EmptyState text="Aucun résultat avec ces filtres." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {fallbackRows.map((r) => renderCard(r, false))}
              </div>
            )}
          </section>
        )}
      </div>

      <CategoriesDialog
        open={!!editingCategoriesFor}
        onOpenChange={(v) => !v && setEditingCategoriesFor(null)}
        creator={editingCategoriesFor}
        onSaved={(id, cats) => patchLocal(id, { model_categories: cats })}
      />
    </div>
  );

  if (embedded) return content;
  return <AppShell>{content}</AppShell>;
}

function SectionHeader({
  title,
  count,
  hint,
  accent = false,
}: {
  title: string;
  count: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-end justify-between mb-3 px-0.5">
      <div className="flex items-baseline gap-2">
        <h2
          className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
            accent ? 'text-[#CFFF16]' : 'text-muted-foreground'
          }`}
        >
          {title}
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground/70 font-mono">
          {count.toString().padStart(2, '0')}
        </span>
      </div>
      {hint && <span className="text-[10px] text-muted-foreground/60">{hint}</span>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-xs text-muted-foreground py-8 text-center bg-muted/30 rounded-xl border border-dashed border-border">
      {text}
    </p>
  );
}
