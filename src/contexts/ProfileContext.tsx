import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface CreatorProfile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  stripe_account_id: string | null;
  stripe_connect_status: string;
  profile_view_count: number;
  country: string | null;
  created_at: string;
}

interface ProfileContextValue {
  profiles: CreatorProfile[];
  activeProfile: CreatorProfile | null;
  setActiveProfileId: (profileId: string) => void;
  updateProfileAvatar: (profileId: string, avatarUrl: string | null) => void;
  isAgency: boolean;
  isLoading: boolean;
  refreshProfiles: () => Promise<void>;
  showProfileSwitcher: boolean;
  setShowProfileSwitcher: (show: boolean) => void;
}

const ACTIVE_PROFILE_KEY = 'exclu_active_profile_id';

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<CreatorProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_PROFILE_KEY)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

  const fetchProfiles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfiles([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('creator_profiles')
      .select('id, user_id, username, display_name, avatar_url, bio, is_active, stripe_account_id, stripe_connect_status, profile_view_count, country, created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching creator profiles', error);
      setProfiles([]);
      setIsLoading(false);
      return;
    }

    const profilesList = (data ?? []) as CreatorProfile[];
    setProfiles(profilesList);

    // Auto-select active profile
    if (profilesList.length > 0) {
      const storedId = localStorage.getItem(ACTIVE_PROFILE_KEY);
      const storedExists = profilesList.some((p) => p.id === storedId);

      if (!storedExists) {
        // Default to first profile
        const defaultId = profilesList[0].id;
        localStorage.setItem(ACTIVE_PROFILE_KEY, defaultId);
        setActiveProfileIdState(defaultId);
      }

      // Show profile selector overlay for multi-profile users on first load per session
      const sessionKey = 'exclu_profile_selected_this_session';
      if (profilesList.length > 1 && !sessionStorage.getItem(sessionKey)) {
        setShowProfileSwitcher(true);
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Listen for auth changes (login/logout)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        fetchProfiles();
      } else if (event === 'SIGNED_OUT') {
        setProfiles([]);
        setActiveProfileIdState(null);
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfiles]);

  const setActiveProfileId = useCallback((profileId: string) => {
    localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
    sessionStorage.setItem('exclu_profile_selected_this_session', '1');
    setActiveProfileIdState(profileId);
  }, []);

  const updateProfileAvatar = useCallback((profileId: string, avatarUrl: string | null) => {
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === profileId ? { ...profile, avatar_url: avatarUrl } : profile
      )
    );
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const isAgency = profiles.length > 1;

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        setActiveProfileId,
        updateProfileAvatar,
        isAgency,
        isLoading,
        refreshProfiles: fetchProfiles,
        showProfileSwitcher,
        setShowProfileSwitcher,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfiles must be used within a ProfileProvider');
  }
  return ctx;
}
