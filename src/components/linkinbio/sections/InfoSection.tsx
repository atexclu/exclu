import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MapPin } from 'lucide-react';
import { ModelCategoryDropdown } from '@/components/ui/ModelCategoryDropdown';

interface InfoSectionProps {
  displayName: string;
  handle: string;
  bio: string;
  location: string | null;
  modelCategories: string[];
  onUpdate: (updates: {
    display_name?: string;
    handle?: string;
    bio?: string;
    location?: string | null;
  }) => void;
  onModelCategoriesChange: (categories: string[]) => void;
}

export function InfoSection({ displayName, handle, bio, location, modelCategories, onUpdate, onModelCategoriesChange }: InfoSectionProps) {
  const bioLength = bio.length;
  const bioMaxLength = 300;

  return (
    <div className="space-y-6">
      {/* Display Name */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          Display Name <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-muted-foreground">How your fans will see you</p>
        <Input
          value={displayName}
          onChange={(e) => onUpdate({ display_name: e.target.value })}
          placeholder="Your Name"
          maxLength={50}
          className="h-12 bg-muted/50 border-border text-foreground text-base"
        />
        <p className="text-xs text-muted-foreground text-right">{displayName.length}/50</p>
      </div>

      {/* Handle */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          Username <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-muted-foreground">Your unique profile URL</p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">exclu.at/</span>
          <Input
            value={handle}
            onChange={(e) => {
              const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
              onUpdate({ handle: sanitized });
            }}
            placeholder="yourhandle"
            maxLength={30}
            className="h-12 bg-muted/50 border-border text-foreground text-base flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Only lowercase letters, numbers, and underscores
        </p>
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Bio</label>
        <p className="text-xs text-muted-foreground">Tell your fans about yourself</p>
        <Textarea
          value={bio}
          onChange={(e) => {
            if (e.target.value.length <= bioMaxLength) {
              onUpdate({ bio: e.target.value });
            }
          }}
          placeholder="Share a bit about yourself and your content..."
          className="min-h-[140px] bg-muted/50 border-border text-foreground text-base resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            This will appear on your public profile
          </p>
          <p className={`text-xs font-medium ${bioLength > bioMaxLength * 0.9 ? 'text-amber-500' : 'text-muted-foreground'}`}>
            {bioLength}/{bioMaxLength}
          </p>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Location
          <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
        </label>
        <p className="text-xs text-muted-foreground">Where are you based?</p>
        <Input
          value={location || ''}
          onChange={(e) => onUpdate({ location: e.target.value || null })}
          placeholder="e.g., Paris, France"
          maxLength={50}
          className="h-12 bg-muted/50 border-border text-foreground text-base"
        />
      </div>

      {/* Model Categories */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          Categories
          <span className="text-xs font-normal text-muted-foreground ml-1">(Optional)</span>
        </label>
        <p className="text-xs text-muted-foreground">
          Select categories that describe your content. This helps fans and agencies discover you in the directory.
        </p>
        <ModelCategoryDropdown
          value={modelCategories}
          onChange={onModelCategoriesChange}
        />
      </div>

    </div>
  );
}
