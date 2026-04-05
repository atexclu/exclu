import { useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProfiles } from '@/contexts/ProfileContext';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

export const LinkInBioEditor = () => {
  const { activeProfile, refreshProfiles } = useProfiles();
  const [displayName, setDisplayName] = useState(activeProfile?.display_name || '');
  const [handle, setHandle] = useState(activeProfile?.username || '');
  const [bio, setBio] = useState(activeProfile?.bio || '');
  const [location, setLocation] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!activeProfile?.id) return;
    setIsSaving(true);
    
    const { error } = await supabase
      .from('creator_profiles')
      .update({
        display_name: displayName.trim() || null,
        username: handle.trim().toLowerCase() || null,
        bio: bio.trim() || null,
      })
      .eq('id', activeProfile.id);

    if (error) {
      toast.error('Failed to save profile');
    } else {
      toast.success('Profile updated!');
      refreshProfiles();
    }
    setIsSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center">
          {activeProfile?.avatar_url ? (
            <img src={activeProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <Camera className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div>
          <h3 className="font-semibold">{displayName || 'Your Name'}</h3>
          <p className="text-sm text-muted-foreground">@{handle || 'username'}</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4 max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground mr-2">@</span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="username"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Bio</label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell fans about yourself..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, Country"
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Preview note */}
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Use the <strong>Profile</strong> tab in the sidebar to access the full editor with live preview, social links, links manager, wishlist, and design options.
      </div>
    </div>
  );
};
