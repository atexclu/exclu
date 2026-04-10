import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, ChevronDown } from 'lucide-react';
import { useProfiles, CreatorProfile } from '@/contexts/ProfileContext';
import { useNavigate } from 'react-router-dom';

function ProfileAvatar({ profile, size = 'md' }: { profile: CreatorProfile; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-16 h-16 text-lg',
    lg: 'w-24 h-24 text-2xl',
  };

  return profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt={profile.display_name || profile.username || ''}
      className={`${sizeClasses[size]} rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-border/40 flex items-center justify-center font-semibold text-foreground/70`}
    >
      {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
    </div>
  );
}

export function ProfileSwitcherOverlay() {
  const { profiles, activeProfile, setActiveProfileId, setShowProfileSwitcher } = useProfiles();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelect = (profileId: string) => {
    setActiveProfileId(profileId);
    setShowProfileSwitcher(false);
    navigate('/app');
  };

  const handleAddProfile = () => {
    setShowProfileSwitcher(false);
    navigate('/app/profiles/new');
  };

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
          Who's creating?
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Select a profile to manage
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 px-6 max-w-3xl">
        {profiles.map((profile, index) => (
          <motion.button
            key={profile.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
            onClick={() => handleSelect(profile.id)}
            onMouseEnter={() => setHoveredId(profile.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="group flex flex-col items-center gap-3 outline-none"
          >
            <motion.div
              className={`relative rounded-full p-1 transition-all duration-200 ${
                hoveredId === profile.id || activeProfile?.id === profile.id
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'ring-2 ring-transparent'
              }`}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <ProfileAvatar profile={profile} size="lg" />
              {activeProfile?.id === profile.id && (
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
                hoveredId === profile.id ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {profile.display_name || profile.username || 'Unnamed'}
              </p>
              {profile.username && (
                <p className="text-xs text-muted-foreground/60">@{profile.username}</p>
              )}
            </div>
          </motion.button>
        ))}

        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + profiles.length * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
          onClick={handleAddProfile}
          className="group flex flex-col items-center gap-3 outline-none"
        >
          <motion.div
            className="w-24 h-24 rounded-full border-2 border-dashed border-border/60 flex items-center justify-center group-hover:border-primary/50 transition-colors"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <Plus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </motion.div>
          <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Add Profile
          </p>
        </motion.button>
      </div>

      {profiles.length > 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={() => setShowProfileSwitcher(false)}
          className="mt-12 px-6 py-2 text-sm text-muted-foreground hover:text-foreground border border-border/60 rounded-full hover:bg-muted/50 transition-colors"
        >
          Cancel
        </motion.button>
      )}
    </motion.div>
  );
}

export function ProfileSwitcherDropdown({ openDirection = 'up' }: { openDirection?: 'up' | 'down' } = {}) {
  const { profiles, activeProfile, setActiveProfileId, isAgency } = useProfiles();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!activeProfile || profiles.length <= 1) return null;

  const isUp = openDirection === 'up';

  const handleSwitch = (profileId: string) => {
    setActiveProfileId(profileId);
    setOpen(false);
  };

  return (
    <div className="relative">
      <motion.button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted/50 transition-colors w-full"
        whileTap={{ scale: 0.97 }}
      >
        <div className="w-7 h-7 rounded-full overflow-hidden border border-border/60 flex-shrink-0 bg-muted">
          {activeProfile.avatar_url ? (
            <img src={activeProfile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
              {(activeProfile.display_name || activeProfile.username || '?')[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-medium truncate text-foreground max-w-[140px]">
            {activeProfile.display_name || activeProfile.username}
          </p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: isUp ? -8 : 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: isUp ? -8 : 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`absolute ${
                isUp ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'
              } w-64 max-w-[calc(100vw-2rem)] z-50 rounded-xl border border-border/60 bg-card shadow-xl overflow-hidden`}
            >
              <div className="p-2 border-b border-border/40">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Switch Profile</p>
              </div>
              <div className="p-1.5 max-h-[280px] overflow-y-auto">
                {profiles.map((profile) => (
                  <motion.button
                    key={profile.id}
                    onClick={() => handleSwitch(profile.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      profile.id === activeProfile.id
                        ? 'bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                    whileTap={{ scale: 0.98 }}
                  >
                    <ProfileAvatar profile={profile} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {profile.display_name || profile.username || 'Unnamed'}
                      </p>
                      {profile.username && (
                        <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
                      )}
                    </div>
                    {profile.id === activeProfile.id && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </motion.button>
                ))}
              </div>
              <div className="p-1.5 border-t border-border/40">
                <motion.button
                  onClick={() => {
                    setOpen(false);
                    navigate('/app/profiles/new');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted/50 transition-colors"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-8 h-8 rounded-full border border-dashed border-border/60 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Add Profile</p>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
