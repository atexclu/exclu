/**
 * DeletedUserBadge
 *
 * Placeholder used in historical surfaces (chat threads, transaction history)
 * where a row references a soft-deleted user. The audit row stays visible
 * so the fan / creator keeps their history, but the personal info
 * (display_name, avatar_url) is hidden behind this neutral badge.
 *
 * Used only on class-B history surfaces. Discoverability surfaces are
 * already filtered in Task 9 and never see deleted profiles.
 */

type Props = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export function DeletedUserBadge({ className = '', size = 'md' }: Props) {
  const avatarSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';
  return (
    <span className={`inline-flex items-center gap-2 text-muted-foreground italic ${className}`}>
      <span
        className={`${avatarSize} rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 shrink-0`}
        aria-hidden
      />
      <span className={textSize}>[Deleted user]</span>
    </span>
  );
}
