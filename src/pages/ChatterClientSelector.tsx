/**
 * ChatterClientSelector — /app/chatter/select
 *
 * Netflix-style profile selector for chatters managing multiple creators.
 * Shows creator bubbles with avatars, same UI/animations as ProfileSwitcherOverlay.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, User } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface ChatterClient {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_count: number;
}

function ClientAvatar({ client }: { client: ChatterClient }) {
  return client.avatar_url ? (
    <img
      src={client.avatar_url}
      alt={client.display_name || 'Creator'}
      className="w-24 h-24 rounded-full object-cover"
    />
  ) : (
    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-border/40 flex items-center justify-center font-semibold text-foreground/70 text-2xl">
      {(client.display_name || '?')[0]?.toUpperCase()}
    </div>
  );
}

export default function ChatterClientSelector() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ChatterClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }

      // Get accepted invitations
      const { data: invitations } = await supabase
        .from('chatter_invitations')
        .select('profile_id')
        .eq('chatter_id', user.id)
        .eq('status', 'accepted');

      if (!invitations || invitations.length === 0) {
        navigate('/app/chatter');
        return;
      }

      const invitedProfileIds = invitations.map((i: any) => i.profile_id);

      // Get creator user_ids from profiles
      const { data: invitedProfiles } = await supabase
        .from('creator_profiles')
        .select('user_id')
        .in('id', invitedProfileIds);

      const creatorUserIds = [...new Set((invitedProfiles ?? []).map((p: any) => p.user_id))];

      // Load ALL profiles for each creator
      const { data: allProfilesData } = await supabase
        .from('creator_profiles')
        .select('id, user_id')
        .in('user_id', creatorUserIds);

      const allProfiles = allProfilesData ?? [];

      // Get creator account info
      const { data: creatorAccounts } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', creatorUserIds);

      // Build clients list
      const loadedClients: ChatterClient[] = (creatorAccounts ?? []).map((account: any) => ({
        user_id: account.id,
        display_name: account.display_name,
        avatar_url: account.avatar_url,
        profile_count: allProfiles.filter((p: any) => p.user_id === account.id).length,
      }));

      setClients(loadedClients);

      // If only one client, auto-select and redirect
      if (loadedClients.length === 1) {
        handleSelect(loadedClients[0].user_id);
        return;
      }

      setIsLoading(false);
    };

    loadClients();
  }, [navigate]);

  const handleSelect = (userId: string) => {
    setSelectedId(userId);
    // Store selected client in sessionStorage for ChatterDashboard to read
    sessionStorage.setItem('chatter_selected_client', userId);
    // Small delay for animation, then navigate
    setTimeout(() => {
      navigate('/app/chatter');
    }, 300);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 30 }}
        className="text-center mb-12"
      >
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Who are you managing?
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Select a creator to manage their conversations
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 px-6 max-w-3xl">
        {clients.map((client, index) => (
          <motion.button
            key={client.user_id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
            onClick={() => handleSelect(client.user_id)}
            onMouseEnter={() => setHoveredId(client.user_id)}
            onMouseLeave={() => setHoveredId(null)}
            className="group flex flex-col items-center gap-3 outline-none"
          >
            <motion.div
              className={`relative rounded-full p-1 transition-all duration-200 ${
                hoveredId === client.user_id || selectedId === client.user_id
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'ring-2 ring-transparent'
              }`}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <ClientAvatar client={client} />
              {selectedId === client.user_id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg"
                >
                  <Check className="w-4 h-4 text-primary-foreground" />
                </motion.div>
              )}
            </motion.div>
            <div className="text-center">
              <p className={`text-sm font-medium transition-colors ${
                hoveredId === client.user_id ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {client.display_name || 'Creator'}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {client.profile_count} profile{client.profile_count > 1 ? 's' : ''}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
