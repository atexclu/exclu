import { useEffect, useRef, useState } from 'react';
import {
  Pin,
  ExternalLink,
  UserCog,
  Tags,
  EyeOff,
  Eye,
  MoreHorizontal,
  Image as ImageIcon,
  Link2,
  DollarSign,
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
  assets_count: number;
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
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (usd >= 1_000) return `${(usd / 1_000).toFixed(1).replace('.0', '')}k`;
  return `${Math.round(usd)}`;
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
  /** Sortable props applied to the whole card when showHandle = true. */
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
  const hasCategory = category !== null;
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

  // "Pinned" merges featured + positioned-but-not-featured into a single
  // visual state, matching the "Mis en avant" bucket the page renders.
  const isPinned = row.is_featured || row.position != null;

  // Card outline reflects state. Stay strictly within Exclu palette + lemon
  // accent; only red is allowed for the hidden-cat destructive state.
  let ring = 'ring-1 ring-white/10';
  if (isPinned) ring = 'ring-2 ring-[#CFFF16]';
  else if (row.is_hidden_for_category) ring = 'ring-2 ring-red-500/45';

  // Drag listeners go on the whole card when sortable. Buttons inside still
  // catch clicks because dnd-kit's PointerSensor uses distance: 5 activation.
  const dragProps = showHandle && dragAttributes && dragListeners
    ? { ...dragAttributes, ...dragListeners }
    : {};

  return (
    <div
      {...dragProps}
      className={`group relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#0a0a0e] ${ring} hover:ring-white/35 transition-all ${showHandle ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Photo / placeholder */}
      {row.avatar_url ? (
        <img
          src={row.avatar_url}
          alt={row.display_name || row.username || ''}
          loading="lazy"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-black/40 flex items-center justify-center">
          <span className="text-5xl font-bold text-white/15 tracking-tight">
            {(row.display_name || row.username || '?')[0]?.toUpperCase()}
          </span>
        </div>
      )}

      {/* Cat-hidden state — desaturate + dark tint */}
      {row.is_hidden_for_category && (
        <div className="absolute inset-0 bg-black/55 backdrop-grayscale-[0.6] pointer-events-none" />
      )}

      {/* Top-left: pin */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPatch(
            isPinned
              ? { is_featured: false, position: null }
              : { is_featured: true },
          );
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full backdrop-blur transition shadow-md ${
          isPinned
            ? 'bg-[#CFFF16] text-black hover:bg-[#CFFF16]/90'
            : 'bg-black/55 text-white hover:bg-black/80'
        }`}
        title={isPinned ? 'Retirer de Mis en avant' : 'Mettre en avant'}
      >
        <Pin className="w-3.5 h-3.5" />
      </button>

      {/* Top-right: kebab */}
      <div ref={menuRef} className="absolute top-2.5 right-2.5 z-10">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full backdrop-blur bg-black/55 text-white hover:bg-black/80 transition shadow-md"
          title="Plus"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-0 mt-1.5 w-52 rounded-xl border border-white/10 bg-[#0c0c10]/98 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <a
              href={`/${row.username}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-white/85 hover:bg-white/[0.06] transition"
            >
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              Profil public
            </a>
            <Link
              to={`/admin/users/${row.user_id}/overview`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-white/85 hover:bg-white/[0.06] transition"
            >
              <UserCog className="w-3.5 h-3.5 opacity-60" />
              Fiche admin
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenCategories();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/85 hover:bg-white/[0.06] transition text-left"
            >
              <Tags className="w-3.5 h-3.5 opacity-60" />
              Catégories
            </button>
            {hasCategory && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onPatch({ is_hidden: !row.is_hidden_for_category });
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/85 hover:bg-white/[0.06] transition text-left border-t border-white/5"
              >
                {row.is_hidden_for_category ? (
                  <>
                    <Eye className="w-3.5 h-3.5 opacity-60" />
                    Réafficher dans cette catégorie
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 opacity-60" />
                    Masquer dans cette catégorie
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Position pip — shown when card is pinned (merged bucket) */}
      {isPinned && row.position != null && (
        <span className="absolute top-12 left-2.5 z-10 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-black/65 backdrop-blur text-white text-[10px] font-mono font-semibold tracking-tight">
          #{row.position + 1}
        </span>
      )}

      {/* Bottom overlay: name + meta + metrics */}
      <div className="absolute inset-x-0 bottom-0 p-3 pt-10 z-10 bg-gradient-to-t from-black via-black/85 to-transparent">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate flex-1" title={row.display_name || row.username || ''}>
            {row.display_name || row.username || '—'}
          </p>
          {row.is_premium && (
            <span className="flex-shrink-0 inline-flex items-center px-1.5 h-[18px] rounded-full bg-[#CFFF16]/15 text-[#CFFF16] text-[9px] font-semibold uppercase tracking-wider border border-[#CFFF16]/25">
              Pro
            </span>
          )}
          {newBadge && (
            <span className="flex-shrink-0 inline-flex items-center px-1.5 h-[18px] rounded-full bg-white/12 text-white/90 text-[9px] font-semibold uppercase tracking-wider border border-white/15">
              New
            </span>
          )}
        </div>
        <p className="text-[10.5px] text-white/55 truncate mt-0.5">
          @{row.username ?? 'unknown'}
        </p>
        <div className="mt-1.5 flex items-center gap-x-2 text-[10.5px] text-white/70 font-mono tabular-nums whitespace-nowrap">
          <span className="inline-flex items-center gap-0.5" title="Vues">
            <Eye className="w-3 h-3 opacity-55" />
            {fmtCount(row.profile_view_count)}
          </span>
          <span className="inline-flex items-center gap-0.5" title="Contenus publiés">
            <ImageIcon className="w-3 h-3 opacity-55" />
            {fmtCount(row.assets_count)}
          </span>
          <span className="inline-flex items-center gap-0.5" title="Liens payants">
            <Link2 className="w-3 h-3 opacity-55" />
            {row.paid_links_count}
          </span>
          <span className="inline-flex items-center gap-0.5" title="Total gagné">
            <DollarSign className="w-3 h-3 opacity-55" />
            {fmtMoney(row.total_earned_cents)}
          </span>
        </div>
      </div>
    </div>
  );
}
