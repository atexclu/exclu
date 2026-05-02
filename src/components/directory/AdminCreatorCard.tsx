import { useEffect, useRef, useState } from 'react';
import {
  Pin,
  EyeOff,
  Eye,
  Tags,
  ExternalLink,
  UserCog,
  Star,
  Crown,
  Sparkles,
  GripVertical,
  EyeClosed,
  MoreHorizontal,
  MapPin,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { useSortable } from '@dnd-kit/sortable';

export interface AdminCardRow {
  creator_profile_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
  niche: string | null;
  is_premium: boolean;
  profile_view_count: number | null;
  paid_links_count: number;
  total_earned_cents: number;
  created_at: string | null;
  is_featured: boolean;
  position: number | null;
  is_hidden_for_category: boolean;
  is_directory_visible: boolean;
}

const fmtCount = (n: number | null | undefined) => {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace('.0', '')}k`;
  return String(v);
};

const fmtMoney = (cents: number) => {
  const usd = cents / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1).replace('.0', '')}k`;
  return `$${Math.round(usd)}`;
};

const NEW_DAYS = 7;
const isNew = (createdAt: string | null) => {
  if (!createdAt) return false;
  const ageDays = (Date.now() - Date.parse(createdAt)) / (1000 * 60 * 60 * 24);
  return ageDays <= NEW_DAYS;
};

interface AdminCreatorCardProps {
  row: AdminCardRow;
  category: string | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onOpenCategories: () => void;
  /** Drag handle props (only when card is sortable). */
  dragAttributes?: ReturnType<typeof useSortable>['attributes'];
  dragListeners?: ReturnType<typeof useSortable>['listeners'];
  showHandle?: boolean;
}

export default function AdminCreatorCard({
  row,
  category,
  onPatch,
  onOpenCategories,
  dragAttributes,
  dragListeners,
  showHandle = false,
}: AdminCreatorCardProps) {
  const newBadge = isNew(row.created_at);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // Outline ring color reflects the dominant state.
  let ringClass = 'ring-1 ring-exclu-arsenic/40';
  if (row.is_featured) ringClass = 'ring-2 ring-[#CFFF16]';
  else if (row.is_hidden_for_category) ringClass = 'ring-2 ring-red-500/70';
  else if (!row.is_directory_visible) ringClass = 'ring-2 ring-amber-500/60';

  return (
    <div
      className={`group relative rounded-2xl bg-exclu-ink/40 dark:bg-[#0a0a0e] overflow-hidden ${ringClass} transition-all hover:ring-[#CFFF16]/40`}
    >
      {/* Photo */}
      <div className="aspect-[3/4] relative overflow-hidden">
        {row.avatar_url ? (
          <img
            src={row.avatar_url}
            alt={row.display_name || row.username || ''}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-exclu-arsenic/40 to-black/60 flex items-center justify-center">
            <span className="text-5xl font-extrabold text-white/15 tracking-tight font-serif">
              {(row.display_name || row.username || '?')[0]?.toUpperCase()}
            </span>
          </div>
        )}

        {/* Top badges (left) */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10">
          {row.is_featured && (
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-[#CFFF16] text-black text-[10px] font-semibold tracking-tight shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
              <Star className="w-2.5 h-2.5" /> Featured
            </span>
          )}
          {row.position != null && !row.is_featured && (
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-blue-500/90 text-white text-[10px] font-semibold tracking-tight">
              #{row.position + 1}
            </span>
          )}
          {row.is_premium && (
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-purple-500/95 text-white text-[10px] font-semibold tracking-tight">
              <Crown className="w-2.5 h-2.5" /> Pro
            </span>
          )}
          {newBadge && (
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-sky-500/90 text-white text-[10px] font-semibold tracking-tight">
              <Sparkles className="w-2.5 h-2.5" /> New
            </span>
          )}
        </div>

        {/* Hide states */}
        {row.is_hidden_for_category && (
          <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-red-500/90 text-white text-[10px] font-semibold">
            <EyeOff className="w-2.5 h-2.5" /> Cat. masqué
          </div>
        )}
        {!row.is_directory_visible && !row.is_hidden_for_category && (
          <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-amber-500/95 text-black text-[10px] font-semibold">
            <EyeClosed className="w-2.5 h-2.5" /> Global hidden
          </div>
        )}

        {/* Drag handle (top-left, replaces nothing — sits above other badges if showHandle) */}
        {showHandle && dragAttributes && dragListeners && (
          <button
            type="button"
            {...dragAttributes}
            {...dragListeners}
            onClick={(e) => e.preventDefault()}
            className="absolute bottom-2 left-2 z-20 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/70 text-white hover:bg-[#CFFF16] hover:text-black transition cursor-grab active:cursor-grabbing"
            title="Réordonner"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Hidden-cat ghost overlay */}
        {row.is_hidden_for_category && (
          <div className="absolute inset-0 bg-black/55 pointer-events-none" />
        )}
      </div>

      {/* Meta */}
      <div className="px-3 pt-2.5 pb-3 space-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-exclu-cloud truncate" title={row.display_name || row.username || ''}>
            {row.display_name || row.username || '—'}
          </p>
          <p className="text-[11px] text-exclu-steel truncate">@{row.username ?? 'unknown'}</p>
        </div>

        {/* Stats — monospace numerics, tiny icons */}
        <div className="grid grid-cols-3 gap-1 text-[10.5px] tabular-nums">
          <span
            className="inline-flex items-center justify-start gap-1 text-exclu-steel"
            title="Vues totales"
          >
            <Eye className="w-3 h-3 opacity-60" />
            <span className="font-mono">{fmtCount(row.profile_view_count)}</span>
          </span>
          <span
            className="inline-flex items-center justify-start gap-1 text-exclu-steel"
            title="Liens payants publiés"
          >
            <Tags className="w-3 h-3 opacity-60" />
            <span className="font-mono">{row.paid_links_count}</span>
          </span>
          <span
            className="inline-flex items-center justify-start gap-1 text-exclu-steel"
            title="Total gagné"
          >
            <span className="opacity-60 font-mono">$</span>
            <span className="font-mono">{fmtMoney(row.total_earned_cents).replace('$', '')}</span>
          </span>
        </div>

        {(row.city || row.country) && (
          <p className="text-[10px] text-exclu-space/70 inline-flex items-center gap-1 truncate">
            <MapPin className="w-2.5 h-2.5" />
            {[row.city, row.country].filter(Boolean).join(', ')}
          </p>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between gap-1 pt-1">
          <button
            type="button"
            onClick={() => onPatch({ is_featured: !row.is_featured })}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
              row.is_featured
                ? 'bg-[#CFFF16] text-black hover:bg-[#CFFF16]/90'
                : 'bg-exclu-arsenic/40 text-exclu-cloud hover:bg-exclu-arsenic/60'
            }`}
            title={row.is_featured ? 'Retirer du Featured' : 'Mettre en Featured'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onPatch({ is_hidden: !row.is_hidden_for_category })}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
              row.is_hidden_for_category
                ? 'bg-red-500/90 text-white hover:bg-red-500'
                : 'bg-exclu-arsenic/40 text-exclu-cloud hover:bg-exclu-arsenic/60'
            }`}
            title={row.is_hidden_for_category ? 'Réafficher dans cette catégorie' : 'Masquer dans cette catégorie'}
          >
            {row.is_hidden_for_category ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onOpenCategories}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-exclu-arsenic/40 text-exclu-cloud hover:bg-exclu-arsenic/60 transition"
            title="Catégories du créateur"
          >
            <Tags className="w-3.5 h-3.5" />
          </button>

          {/* Kebab → public profile + admin overview */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-exclu-arsenic/40 text-exclu-cloud hover:bg-exclu-arsenic/60 transition"
              title="Plus"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-48 rounded-lg border border-exclu-arsenic/60 bg-[#0a0a0e] shadow-xl z-30 overflow-hidden">
                <a
                  href={`/${row.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs text-exclu-cloud hover:bg-exclu-arsenic/40 transition"
                  onClick={() => setMenuOpen(false)}
                >
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" /> Profil public
                </a>
                <Link
                  to={`/admin/users/${row.user_id}/overview`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-exclu-cloud hover:bg-exclu-arsenic/40 transition"
                  onClick={() => setMenuOpen(false)}
                >
                  <UserCog className="w-3.5 h-3.5 opacity-70" /> Fiche admin
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
