import { Switch } from '@/components/ui/switch';
import { Palette, Sparkles, Crown, Waves } from 'lucide-react';
import { auroraGradients } from '@/lib/auroraGradients';

interface OptionsSectionProps {
  themeColor: string;
  showJoinBanner: boolean;
  isPremium: boolean;
  auroraGradient?: string;
  onUpdate: (updates: { theme_color?: string; show_join_banner?: boolean; aurora_gradient?: string }) => void;
}

const themeOptions = [
  { id: 'pink', label: 'Pink', gradient: 'from-pink-500 to-rose-500' },
  { id: 'purple', label: 'Purple', gradient: 'from-purple-500 to-violet-500' },
  { id: 'blue', label: 'Blue', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'orange', label: 'Orange', gradient: 'from-orange-500 to-amber-500' },
  { id: 'green', label: 'Green', gradient: 'from-green-500 to-emerald-500' },
  { id: 'red', label: 'Red', gradient: 'from-red-500 to-rose-600' },
];

export function OptionsSection({ themeColor, showJoinBanner, isPremium, auroraGradient = 'aurora', onUpdate }: OptionsSectionProps) {
  return (
    <div className="space-y-6">
      {/* Aurora Background Gradient */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Waves className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Background Gradient</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose the animated gradient color for your profile background
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {auroraGradients.map((gradient) => (
            <button
              key={gradient.id}
              onClick={() => onUpdate({ aurora_gradient: gradient.id })}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                auroraGradient === gradient.id
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div 
                className="w-full h-12 rounded-lg shadow-lg"
                style={{ background: gradient.preview }}
              />
              <span className="text-xs font-medium text-foreground text-center">{gradient.name}</span>
              {auroraGradient === gradient.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-primary-foreground" />
                  </div>
                </div>
              )}
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
    </div>
  );
}
