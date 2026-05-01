import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { CreatorProfile } from '@/contexts/ProfileContext';
import { cn } from '@/lib/utils';

/** Compact integer formatter (1.2k / 3.4M) so stats fit the 200px sidebar. */
function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

interface ProfileHealthCardProps {
  /** The active creator profile, used for the avatar fallback. */
  activeProfile: CreatorProfile;
  /** Completion percentage (0–100). */
  percent: number;
  /** Active fan subscribers count for this profile. */
  subscribersCount: number;
  /** Lifetime profile views. */
  profileViewCount: number;
  /** Lifetime succeeded sales on this profile's links. */
  salesCount: number;
  /** Whether all eight steps are done — switches the card to celebratory mode. */
  isComplete: boolean;
  /** Click handler — opens the parent-owned dialog. */
  onOpen: () => void;
}

/**
 * Compact "Profile health" card pinned at the top of the AppShell sidebar.
 *
 * Pure presentational component. State (data, dialog open, auto-popup) lives
 * in `AppShell` so the dialog survives unmount of either card instance — the
 * mobile drawer can close without taking the popup with it.
 */
export function ProfileHealthCard({
  activeProfile,
  percent,
  subscribersCount,
  profileViewCount,
  salesCount,
  isComplete,
  onOpen,
}: ProfileHealthCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border bg-card p-3 text-left transition-colors',
        isComplete
          ? 'border-primary/40 hover:border-primary/60'
          : 'border-border/60 hover:border-border hover:bg-muted/30'
      )}
      aria-label={
        isComplete
          ? 'Profile complete. View checklist.'
          : `Profile health ${percent} percent. Open checklist.`
      }
    >
      {/* Subtle aurora glow — stronger when the profile is complete. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full blur-2xl transition-opacity',
          isComplete
            ? 'bg-primary/35 opacity-90'
            : 'bg-primary/20 opacity-60 group-hover:opacity-100'
        )}
      />

      {/* Top row: tiny avatar + Earnings-style 3-metric block (subs / sales / views).
          No dividers — keeps the row breathy. Each tile centers its content so
          values of any width align cleanly on the same baseline. */}
      <div className="relative flex items-center gap-2">
        <Avatar
          avatarUrl={activeProfile.avatar_url}
          displayName={activeProfile.display_name ?? activeProfile.username ?? '—'}
        />
        <div className="min-w-0 flex-1 grid grid-cols-3">
          <Metric
            label="Subs"
            value={formatCompact(subscribersCount)}
            ariaLabel={`${subscribersCount} subscribers`}
          />
          <Metric
            label="Sales"
            value={formatCompact(salesCount)}
            ariaLabel={`${salesCount} sales`}
          />
          <Metric
            label="Views"
            value={formatCompact(profileViewCount)}
            ariaLabel={`${profileViewCount} profile views`}
          />
        </div>
      </div>

      {/* Profile health label + percent on a single line. The label flips to a
          celebratory check when 100% so the card stays useful as a re-entry
          point to the dialog instead of disappearing entirely. */}
      <div className="relative mt-3 flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] font-semibold',
            isComplete ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {isComplete && <Check className="h-3 w-3" />}
          {isComplete ? 'Profile complete' : 'Profile health'}
        </span>
        <span className="text-xs font-black tracking-tight text-foreground tabular-nums">
          {percent}%
        </span>
      </div>

      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-lime-400"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </motion.button>
  );
}

interface MetricProps {
  label: string;
  value: string;
  ariaLabel: string;
}

/**
 * Single sidebar metric tile. Earnings-style rhythm: small uppercase label
 * on top, bold tabular-nums value below. Centered content with uniform
 * padding so the three columns read evenly even when values are 1 or 4 digits.
 */
function Metric({ label, value, ariaLabel }: MetricProps) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1" aria-label={ariaLabel}>
      <span className="text-[8px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        {label}
      </span>
      <p className="text-[13px] font-extrabold leading-none tabular-nums text-foreground">{value}</p>
    </div>
  );
}

interface AvatarProps {
  avatarUrl: string | null;
  displayName: string;
}

function Avatar({ avatarUrl, displayName }: AvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-6 w-6 flex-shrink-0 rounded-full object-cover ring-1 ring-border/60"
        loading="lazy"
      />
    );
  }
  // First-letter fallback so the row stays balanced even pre-upload.
  const initial = displayName.trim().charAt(0).toUpperCase() || '·';
  return (
    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-lime-400/40 text-[10px] font-bold text-foreground">
      {initial}
    </div>
  );
}

/** Static placeholder so the sidebar layout doesn't jump while data loads. */
export function ProfileHealthCardSkeleton() {
  return (
    <div className="w-full rounded-xl border border-border/40 bg-card p-3" aria-hidden>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 flex-shrink-0 rounded-full bg-muted" />
        <div className="min-w-0 flex-1 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-1.5 w-8 rounded bg-muted/70" />
              <div className="h-2.5 w-5 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 h-2 w-20 rounded bg-muted/70" />
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted" />
    </div>
  );
}
