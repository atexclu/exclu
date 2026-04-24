import { useRef } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Crown, BadgeCheck, Smartphone, CircleDot, DollarSign, MessageSquare, Building2, Upload, X } from 'lucide-react';
import { auroraGradients } from '@/lib/auroraGradients';

interface OptionsSectionProps {
  showJoinBanner: boolean;
  showCertification: boolean;
  showDeeplinks: boolean;
  showAvailableNow: boolean;
  chatEnabled: boolean;
  isPremium: boolean;
  auroraGradient?: string;
  tipsEnabled: boolean;
  customRequestsEnabled: boolean;
  minTipAmountCents: number;
  minCustomRequestCents: number;
  showAgencyBranding?: boolean;
  agencyName?: string | null;
  agencyLogoUrl?: string | null;
  onUpdate: (updates: { show_join_banner?: boolean; show_certification?: boolean; show_deeplinks?: boolean; show_available_now?: boolean; chat_enabled?: boolean; aurora_gradient?: string; tips_enabled?: boolean; custom_requests_enabled?: boolean; min_tip_amount_cents?: number; min_custom_request_cents?: number; show_agency_branding?: boolean }) => void;
  onAgencyNameChange?: (name: string) => void;
  onAgencyLogoUpload?: (file: File) => void;
  onAgencyLogoRemove?: () => void;
  isUploadingLogo?: boolean;
}

export function OptionsSection({ showJoinBanner, showCertification, showDeeplinks, showAvailableNow, chatEnabled, isPremium, auroraGradient = 'purple_dream', tipsEnabled, customRequestsEnabled, minTipAmountCents, minCustomRequestCents, showAgencyBranding, agencyName, agencyLogoUrl, onUpdate, onAgencyNameChange, onAgencyLogoUpload, onAgencyLogoRemove, isUploadingLogo }: OptionsSectionProps) {
  const hasAgency = Boolean(agencyName || agencyLogoUrl);
  const logoInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-6">
      {/* Profile Gradient Color */}
      <div className="space-y-4">
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

      {/* Chat */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-foreground">Chat</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Display a "Message" button on your public profile so fans can chat with you
            </p>
          </div>
          <Switch
            checked={chatEnabled}
            onCheckedChange={(checked) => onUpdate({ chat_enabled: checked })}
          />
        </div>
      </div>

      {/* Tips & Requests Section */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Tips & Custom Requests</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Allow fans to send you tips and request custom content directly from your profile
        </p>

        {/* Accept Tips toggle */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground">Accept Tips</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Fans can send you tips with an optional message from your public profile
              </p>
            </div>
            <Switch
              checked={tipsEnabled}
              onCheckedChange={(checked) => onUpdate({ tips_enabled: checked })}
            />
          </div>
          {tipsEnabled && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs text-muted-foreground">Minimum tip amount ($)</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={(minTipAmountCents / 100).toFixed(0)}
                onChange={(e) => {
                  const val = Math.max(100, Math.round(parseFloat(e.target.value || '1') * 100));
                  onUpdate({ min_tip_amount_cents: val });
                }}
                className="h-9 w-32 text-sm"
              />
            </div>
          )}
        </div>

        {/* Accept Custom Requests toggle */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground">Accept Custom Requests</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Fans can request custom content with a proposed price. You can accept or decline each request.
              </p>
            </div>
            <Switch
              checked={customRequestsEnabled}
              onCheckedChange={(checked) => onUpdate({ custom_requests_enabled: checked })}
            />
          </div>
          {customRequestsEnabled && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs text-muted-foreground">Minimum request amount ($)</label>
              <Input
                type="number"
                min={5}
                step={5}
                value={(minCustomRequestCents / 100).toFixed(0)}
                onChange={(e) => {
                  const val = Math.max(500, Math.round(parseFloat(e.target.value || '5') * 100));
                  onUpdate({ min_custom_request_cents: val });
                }}
                className="h-9 w-32 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Agency Branding Toggle — only visible for agency-managed profiles */}
      {hasAgency && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Agency Branding</h3>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Show Agency Branding</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Display "Managed by {agencyName || 'your agency'}" with the agency logo at the bottom of your public profile
                </p>
              </div>
              <Switch
                checked={showAgencyBranding ?? true}
                onCheckedChange={(checked) => onUpdate({ show_agency_branding: checked })}
              />
            </div>
          </div>

          {/* Agency Identity Card */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Agency Identity</h4>

            {/* Logo upload */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Agency Logo</label>
              <div className="flex items-center gap-3">
                {agencyLogoUrl ? (
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0">
                    <img src={agencyLogoUrl} alt="" className="w-full h-full object-contain" />
                    {onAgencyLogoRemove && (
                      <button
                        type="button"
                        onClick={onAgencyLogoRemove}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onAgencyLogoUpload) onAgencyLogoUpload(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
              </div>
            </div>

            {/* Agency name */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Agency Name</label>
              <Input
                value={agencyName || ''}
                onChange={(e) => onAgencyNameChange?.(e.target.value)}
                placeholder="e.g. TopModels Agency"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
