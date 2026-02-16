import { Switch } from '@/components/ui/switch';
import { Crown, Palette, BadgeCheck, Smartphone, CircleDot } from 'lucide-react';
import { auroraGradients } from '@/lib/auroraGradients';

interface OptionsSectionProps {
  showJoinBanner: boolean;
  showCertification: boolean;
  showDeeplinks: boolean;
  showAvailableNow: boolean;
  isPremium: boolean;
  auroraGradient?: string;
  onUpdate: (updates: { show_join_banner?: boolean; show_certification?: boolean; show_deeplinks?: boolean; show_available_now?: boolean; aurora_gradient?: string }) => void;
}

export function OptionsSection({ showJoinBanner, showCertification, showDeeplinks, showAvailableNow, isPremium, auroraGradient = 'purple_dream', onUpdate }: OptionsSectionProps) {
  return (
    <div className="space-y-6">
      {/* Profile Gradient Color */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Profile Color</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Applies to the background animation, verified badge, exclusive content button, and link accents
        </p>

        <div className="flex flex-wrap gap-4">
          {auroraGradients.map((gradient) => (
            <button
              key={gradient.id}
              title={gradient.name}
              onClick={() => onUpdate({ aurora_gradient: gradient.id })}
              className="group focus:outline-none"
            >
              <div
                className={`w-12 h-12 rounded-full shadow-lg transition-all duration-300 ${auroraGradient === gradient.id
                  ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-background scale-110'
                  : 'ring-1 ring-border group-hover:ring-primary/50 group-hover:scale-105'
                  }`}
                style={{ background: gradient.preview }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Exclu Banner (Premium Only) */}
      {isPremium && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground">Exclu Join Banner</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] text-primary font-medium">
                  <Crown className="w-3 h-3" />
                  Premium
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Show or hide the "Join Exclu" banner at the bottom of your profile
              </p>
            </div>
            <Switch
              checked={showJoinBanner}
              onCheckedChange={(checked) => onUpdate({ show_join_banner: checked })}
            />
          </div>
        </div>
      )}

      {/* Certification Badge (Premium Only) */}
      {isPremium && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground">Certification Badge</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] text-primary font-medium">
                  <Crown className="w-3 h-3" />
                  Premium
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Show or hide the verified badge next to your display name
              </p>
            </div>
            <Switch
              checked={showCertification}
              onCheckedChange={(checked) => onUpdate({ show_certification: checked })}
            />
          </div>
        </div>
      )}

      {/* Deep Links (Premium Only) */}
      {isPremium && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground">Deep Links</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] text-primary font-medium">
                  <Crown className="w-3 h-3" />
                  Premium
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                On mobile, social links open directly in their native app instead of the browser
              </p>
            </div>
            <Switch
              checked={showDeeplinks}
              onCheckedChange={(checked) => onUpdate({ show_deeplinks: checked })}
            />
          </div>
        </div>
      )}

      {/* Available Now (Premium Only) */}
      {isPremium && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground">Available Now</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] text-primary font-medium">
                  <Crown className="w-3 h-3" />
                  Premium
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Display an "Available now" indicator next to your location on your public profile
              </p>
            </div>
            <Switch
              checked={showAvailableNow}
              onCheckedChange={(checked) => onUpdate({ show_available_now: checked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
