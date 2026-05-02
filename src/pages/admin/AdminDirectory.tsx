import { useEffect, useMemo, useState, useCallback } from 'react';
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
import { Pin, EyeOff, Eye, Tags, ExternalLink, UserCog, Search, Loader2, Star, Crown, Sparkles, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MODEL_CATEGORY_GROUPS, getModelCategoryLabel } from '@/lib/categories';
import CreatorCard, { type DirectoryCreator } from '@/components/directory/CreatorCard';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell';

const GLOBAL_TAB = '__global__';

const ALL_CATEGORY_OPTIONS = Object.entries(MODEL_CATEGORY_GROUPS).flatMap(
  ([group, options]) => options.map((o) => ({ ...o, group })),
);

interface DirectoryRow {
  creator_profile_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  niche: string | null;
  model_categories: string[] | null;
  profile_view_count: number | null;
  paid_links_count: number;
  is_premium: boolean;
  created_at: string | null;
  category: string | null;
  is_featured: boolean;
  position: number | null;
  is_hidden_for_category: boolean;
  display_rank: number;
}

type StatusFilter = 'all' | 'premium' | 'free';

const NEW_CREATOR_DAYS = 7;

const isNewCreator = (createdAt: string | null) => {
  if (!createdAt) return false;
  const ageDays = (Date.now() - Date.parse(createdAt)) / (1000 * 60 * 60 * 24);
  return ageDays <= NEW_CREATOR_DAYS;
};

const sortRows = (rows: DirectoryRow[]) =>
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

/* ─── Sortable card wrapper for drag & drop ─── */
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
  };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'ring-2 ring-[#CFFF16] rounded-3xl' : ''}>
      {children({ attributes, listeners })}
    </div>
  );
}

/* ─── Card overlay (badges + kebab actions) ─── */
function CardOverlay({
  row,
  category,
  onPatch,
  onOpenCategories,
  dragAttributes,
  dragListeners,
  showHandle,
}: {
  row: DirectoryRow;
  category: string | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onOpenCategories: () => void;
  dragAttributes?: ReturnType<typeof useSortable>['attributes'];
  dragListeners?: ReturnType<typeof useSortable>['listeners'];
  showHandle: boolean;
}) {
  const newBadge = isNewCreator(row.created_at);
  return (
    <>
      {/* Top-left badges */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
        {row.is_featured && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#CFFF16] text-black text-[10px] font-bold">
            <Star className="w-3 h-3" /> Featured
          </span>
        )}
        {row.is_premium && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/90 text-white text-[10px] font-semibold">
            <Crown className="w-3 h-3" /> Pro
          </span>
        )}
        {newBadge && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/90 text-white text-[10px] font-semibold">
            <Sparkles className="w-3 h-3" /> New
          </span>
        )}
      </div>

      {/* Top-right action cluster */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPatch({ is_featured: !row.is_featured });
          }}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition ${
            row.is_featured ? 'bg-[#CFFF16] text-black' : 'bg-black/60 text-white hover:bg-black/80'
          }`}
          title={row.is_featured ? 'Retirer du Featured' : 'Mettre en Featured'}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPatch({ is_hidden: !row.is_hidden_for_category });
          }}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition ${
            row.is_hidden_for_category ? 'bg-red-500/90 text-white' : 'bg-black/60 text-white hover:bg-black/80'
          }`}
          title={row.is_hidden_for_category ? 'Réafficher dans cette catégorie' : 'Masquer dans cette catégorie'}
        >
          {row.is_hidden_for_category ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenCategories();
          }}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
          title="Catégories du créateur"
        >
          <Tags className="w-3.5 h-3.5" />
        </button>
        <a
          href={`/${row.username}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
          title="Profil public"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <Link
          to={`/admin/users/${row.user_id}/overview`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
          title="Fiche admin"
        >
          <UserCog className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Drag handle (only when DnD is active) */}
      {showHandle && dragAttributes && dragListeners && (
        <button
          type="button"
          {...dragAttributes}
          {...dragListeners}
          onClick={(e) => e.preventDefault()}
          className="absolute bottom-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/70 text-white hover:bg-[#CFFF16] hover:text-black transition cursor-grab active:cursor-grabbing"
          title="Réordonner"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Bottom-left stats overlay */}
      <div className="absolute top-12 left-2 flex flex-col gap-1 z-10">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
          {row.profile_view_count ?? 0} vues
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
          {row.paid_links_count} liens
        </span>
      </div>

      {/* Hidden-cat ghost overlay */}
      {row.is_hidden_for_category && (
        <div className="absolute inset-0 bg-black/55 backdrop-grayscale pointer-events-none" />
      )}
    </>
  );
}

/* ─── Multi-category modal ─── */
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
  const [signupSort, setSignupSort] = useState<'newest' | 'oldest'>('newest');
  const [editingCategoriesFor, setEditingCategoriesFor] = useState<DirectoryRow | null>(null);

  const categoryFilter = activeTab === GLOBAL_TAB ? null : activeTab;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    if (categoryFilter === null) {
      // Global feed: read view directly with category is null
      const { data, error } = await supabase
        .from('v_directory_creators')
        .select('*')
        .is('category', null)
        .range(0, 9999);
      if (error) {
        toast.error('Échec chargement directory');
        setLoading(false);
        return;
      }
      setRows(sortRows((data || []) as DirectoryRow[]));
    } else {
      // Per-category: pull all creators that have this cat in model_categories,
      // then merge curation rows for that category.
      const [creatorsRes, curationRes] = await Promise.all([
        supabase
          .from('v_directory_creators')
          .select('*')
          .is('category', null)
          .contains('model_categories', [categoryFilter])
          .range(0, 9999),
        supabase
          .from('directory_curation')
          .select('*')
          .eq('category', categoryFilter),
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
      setRows(sortRows(merged));
    }
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /* ─── Optimistic local mutation helpers ─── */
  const patchLocal = (id: string, patch: Partial<DirectoryRow>) =>
    setRows((prev) =>
      sortRows(
        prev.map((r) => {
          if (r.creator_profile_id !== id) return r;
          const next = { ...r, ...patch } as DirectoryRow;
          // Recompute display_rank when featured/position change.
          if (next.is_featured) next.display_rank = 1;
          else if (next.position != null) next.display_rank = 2;
          else if (next.is_premium) next.display_rank = 3;
          else if (next.paid_links_count > 0) next.display_rank = 4;
          else next.display_rank = 5;
          return next;
        }),
      ),
    );

  const applyPatch = async (id: string, patch: Record<string, unknown>) => {
    // Optimistic
    patchLocal(id, patch as Partial<DirectoryRow>);
    const { error } = await supabase.rpc('admin_set_directory_curation', {
      p_creator_id: id,
      p_category: categoryFilter,
      p_patch: patch,
    });
    if (error) {
      toast.error('Échec mise à jour — refresh en cours');
      fetchRows();
      return;
    }
  };

  /* ─── DnD reorder ─── */
  const reorder = async (
    bucket: 'featured' | 'curated',
    activeId: string,
    overId: string,
  ) => {
    const ids = bucket === 'featured' ? featuredRows.map((r) => r.creator_profile_id) : curatedRows.map((r) => r.creator_profile_id);
    const oldIdx = ids.indexOf(activeId);
    const newIdx = ids.indexOf(overId);
    if (oldIdx === -1 || newIdx === -1) return;
    const ordered = arrayMove(ids, oldIdx, newIdx);

    // Optimistic
    setRows((prev) => {
      const next = prev.slice();
      ordered.forEach((cid, i) => {
        const idx = next.findIndex((r) => r.creator_profile_id === cid);
        if (idx >= 0) next[idx] = { ...next[idx], position: i };
      });
      return sortRows(next);
    });

    const { error } = await supabase.rpc('admin_reorder_directory', {
      p_category: categoryFilter,
      p_ordered_creator_ids: ordered,
    });
    if (error) {
      toast.error('Échec réordonnancement');
      fetchRows();
    }
  };

  /* ─── Filter & bucket the rows ─── */
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.display_name?.toLowerCase().includes(q) &&
          !r.username?.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter === 'premium' && !r.is_premium) return false;
      if (statusFilter === 'free' && r.is_premium) return false;
      return true;
    }).sort((a, b) => {
      // Within filtered view we still want display_rank → position to win,
      // but if user picked a signup sort, that supersedes the views/created_at
      // tiebreak only inside rank 5 (rest bucket). Keep it simple: apply only
      // to the fallback bucket so featured/curated keep their human order.
      if (a.display_rank !== b.display_rank) return a.display_rank - b.display_rank;
      const aPos = a.position == null ? Number.POSITIVE_INFINITY : a.position;
      const bPos = b.position == null ? Number.POSITIVE_INFINITY : b.position;
      if (aPos !== bPos) return aPos - bPos;
      const ad = a.created_at ? Date.parse(a.created_at) : 0;
      const bd = b.created_at ? Date.parse(b.created_at) : 0;
      return signupSort === 'newest' ? bd - ad : ad - bd;
    });
  }, [rows, search, statusFilter, signupSort]);

  const featuredRows = useMemo(() => filteredRows.filter((r) => r.is_featured), [filteredRows]);
  const curatedRows = useMemo(
    () => filteredRows.filter((r) => !r.is_featured && r.position != null),
    [filteredRows],
  );
  const fallbackRows = useMemo(
    () => filteredRows.filter((r) => !r.is_featured && r.position == null),
    [filteredRows],
  );

  const handleDragEnd = (bucket: 'featured' | 'curated') => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorder(bucket, String(active.id), String(over.id));
  };

  /* ─── Render ─── */
  const cardFor = (row: DirectoryRow, idx: number, sortable: boolean) => {
    const creator: DirectoryCreator = {
      creator_profile_id: row.creator_profile_id,
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      country: row.country,
      city: row.city,
      niche: row.niche,
      is_premium: row.is_premium,
    };
    const innerCard = (handleProps?: { attributes?: any; listeners?: any }) => (
      <CreatorCard
        creator={creator}
        index={idx}
        asChild
        overlay={
          <CardOverlay
            row={row}
            category={categoryFilter}
            onPatch={(patch) => applyPatch(row.creator_profile_id, patch)}
            onOpenCategories={() => setEditingCategoriesFor(row)}
            dragAttributes={handleProps?.attributes}
            dragListeners={handleProps?.listeners}
            showHandle={sortable}
          />
        }
      />
    );
    if (!sortable) return innerCard();
    return (
      <SortableAdminCard row={row} showHandle={sortable}>
        {innerCard}
      </SortableAdminCard>
    );
  };

  const content = (
    <div className={embedded ? '' : 'min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8'}>
      <div className={embedded ? '' : 'max-w-[1400px] mx-auto'}>
        {!embedded && (
          <header className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">Directory — curation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mettez en avant, masquez ou réordonnez les créatrices par catégorie. La table vide
              laisse l'algo automatique tourner — comportement actuel préservé.
            </p>
          </header>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 pb-3 border-b border-border overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab(GLOBAL_TAB)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              activeTab === GLOBAL_TAB
                ? 'bg-[#CFFF16] text-black'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            Featured global
          </button>
          {Object.entries(MODEL_CATEGORY_GROUPS).map(([group, options]) => (
            <div key={group} className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1">
                {group}
              </span>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setActiveTab(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
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

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par handle ou nom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">Tous (Pro + Free)</option>
            <option value="premium">Pro uniquement</option>
            <option value="free">Free uniquement</option>
          </select>
          <select
            value={signupSort}
            onChange={(e) => setSignupSort(e.target.value as 'newest' | 'oldest')}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="newest">Plus récents</option>
            <option value="oldest">Plus anciens</option>
          </select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredRows.length} créateur{filteredRows.length > 1 ? 's' : ''}
            {categoryFilter ? ` dans ${getModelCategoryLabel(categoryFilter)}` : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-10">
            {/* ── FEATURED CAROUSEL ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#CFFF16]" />
                  Mises en avant
                  <span className="text-xs font-normal normal-case">({featuredRows.length})</span>
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  Drag & drop pour réordonner — sauvegardé automatiquement
                </span>
              </div>
              {featuredRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-2xl">
                  Aucune créatrice en featured. Cliquez sur l'épingle d'une carte pour l'ajouter.
                </p>
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {featuredRows.map((row, i) => cardFor(row, i, true))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

            {/* ── CURATED GRID ── */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Curées (position fixée)
                <span className="text-xs font-normal normal-case ml-2">({curatedRows.length})</span>
              </h2>
              {curatedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-2xl">
                  Aucune position curée. Glissez une carte du fallback ici pour la fixer.
                </p>
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {curatedRows.map((row, i) => cardFor(row, i, true))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

            {/* ── FALLBACK GRID (read-only ordering) ── */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Tri automatique
                <span className="text-xs font-normal normal-case ml-2">
                  ({fallbackRows.length}) — Pro → liens payants → vues
                </span>
              </h2>
              {fallbackRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-2xl">
                  Vide.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {fallbackRows.map((row, i) => cardFor(row, i, false))}
                </div>
              )}
            </section>
          </div>
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
