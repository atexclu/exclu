/**
 * PostVisibilityToggle — Creator-only switch on each /app/home feed post.
 * Real switch (Radix Switch primitive) at top-right of the post, with a
 * label that reflects the current state. Optimistic update with rollback
 * on failure.
 *
 * `kind` decides which table we hit:
 *   'asset' → updates `assets.is_public`
 *   'link'  → updates `links.is_public`
 *
 * Only mounted when the parent passes `embed === true`. Fans never see it.
 */
import { useState } from 'react';
import { Globe, Lock, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabaseClient';

interface PostVisibilityToggleProps {
  postId: string;
  kind: 'asset' | 'link';
  isPublic: boolean;
  onChange: (next: boolean) => void;
  /**
   * Creator's aurora gradient (`profile.aurora_gradient` resolved to two
   * stops). Used to tint the switch's "checked" state so the toggle blends
   * with the creator's theme instead of the platform lime green. Optional —
   * the parent may pass `undefined`/empty when the profile gradient hasn't
   * resolved yet (initial render before the snapshot lands). We fall back to
   * the platform primary so the component never crashes on an undefined index.
   */
  gradientStops?: readonly [string, string] | string[] | null;
  /** Reorder hooks. Disabled (greyed out) when at the top / bottom of the feed. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

const FALLBACK_GRADIENT: [string, string] = ['#CFFF16', '#CFFF16'];

export function PostVisibilityToggle({
  postId,
  kind,
  isPublic,
  onChange,
  gradientStops,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: PostVisibilityToggleProps) {
  const [isSaving, setIsSaving] = useState(false);

  // Defensive: profile gradient may not be resolved on the first render
  // (parent passes undefined / empty array / single-stop array). Anything
  // shorter than 2 entries falls back to the platform lime so we never read
  // an undefined index.
  const safeStops: [string, string] =
    Array.isArray(gradientStops) && gradientStops.length >= 2 && gradientStops[0] && gradientStops[1]
      ? [gradientStops[0], gradientStops[1]]
      : FALLBACK_GRADIENT;

  const handleChange = async (next: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    onChange(next); // optimistic

    const table = kind === 'asset' ? 'assets' : 'links';
    const { error } = await supabase.from(table).update({ is_public: next }).eq('id', postId);

    if (error) {
      console.error(`[PostVisibilityToggle] update ${table} failed`, error);
      onChange(!next);
      toast.error('Failed to update visibility');
    } else {
      toast.success(next ? 'Post is now public' : 'Post is now subscribers-only');
    }
    setIsSaving(false);
  };

  // Tinted "checked" colour from the creator's gradient — first stop is the
  // dominant tone, used as the switch track + the active icon colour.
  const themedChecked: React.CSSProperties = { backgroundColor: safeStops[0] };
  const themedIcon: React.CSSProperties = { color: safeStops[0] };

  return (
    <div
      // stopPropagation so the wrapper click (which would open the FeedPost
      // detail / sub popup) doesn't fire when the creator interacts with the
      // toggle. Backdrop blur ensures legibility over media of any colour.
      onClick={(e) => e.stopPropagation()}
      className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-lg pointer-events-auto"
    >
      {(onMoveUp || onMoveDown) && (
        <div className="flex items-center gap-0.5 pr-1.5 mr-0.5 border-r border-white/15">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Move post up"
            className="p-1 rounded-full text-white/85 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Move post down"
            className="p-1 rounded-full text-white/85 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white">
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isPublic ? (
          <Globe className="w-3 h-3" style={themedIcon} />
        ) : (
          <Lock className="w-3 h-3 text-white/70" />
        )}
        {isPublic ? 'Public' : 'Subs'}
      </span>
      <Switch
        checked={isPublic}
        onCheckedChange={handleChange}
        disabled={isSaving}
        aria-label={isPublic ? 'Make post subscribers-only' : 'Make post public'}
        className="data-[state=unchecked]:bg-white/25"
        style={isPublic ? themedChecked : undefined}
      />
    </div>
  );
}
