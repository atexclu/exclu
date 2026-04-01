import { ReactNode, useEffect, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut, User, LayoutDashboard, Plus, Link2, Image, ShieldCheck, Sun, Moon, Palette, MessageSquare, Gift, Building2, FileText, Wrench, DollarSign } from 'lucide-react';
import { useChatUnread } from '@/hooks/useChatUnread';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { useProfiles } from '@/contexts/ProfileContext';
import { ProfileSwitcherDropdown, ProfileSwitcherOverlay } from '@/components/ProfileSwitcher';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';

interface AppShellProps {
  children: ReactNode;
  rightActions?: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<any>;
  adminOnly?: boolean;
  agencyOnly?: boolean;
  mobileHidden?: boolean;
  hidden?: boolean;
}

const baseNavItems: NavItem[] = [
  { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/profile', label: 'Profile', icon: Palette },
  { path: '/app/links', label: 'Links', icon: Link2, mobileHidden: true },
  { path: '/app/content', label: 'Content', icon: Image, mobileHidden: true },
  { path: '/app/chat', label: 'Chat', icon: MessageSquare },
  { path: '/app/tips-requests', label: 'Tips', icon: DollarSign },
  { path: '/app/wishlist', label: 'Wishlist', icon: Gift },
  { path: '/admin/users?tab=blog', label: 'Admin', icon: ShieldCheck, adminOnly: true },
];

const AppShell = ({ children, rightActions }: AppShellProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const { activeProfile, profiles, isAgency, showProfileSwitcher } = useProfiles();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  const avatarUrl = activeProfile?.avatar_url ?? null;
  const chatUnreadCount = useChatUnread(activeProfile?.id ?? null);
  const isChatPage = location.pathname === '/app/chat';

  useEffect(() => {
    const fetchAdminStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (profile) {
        setIsAdmin(profile.is_admin === true);
      }
    };

    fetchAdminStatus();
  }, []);

  const isActive = (path: string) => {
    if (path === '/app/links') {
      return location.pathname === '/app/links' || location.pathname.startsWith('/app/links/');
    }
    if (path === '/app/content') {
      return location.pathname === '/app/content';
    }
    if (path === '/app/chat') {
      return location.pathname === '/app/chat';
    }
    if (path === '/app/wishlist') {
      return location.pathname === '/app/wishlist';
    }
    if (path === '/admin/users') {
      return location.pathname === '/admin/users' || location.pathname.startsWith('/admin/users/');
    }
    return location.pathname === path;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const visibleNavItems = useMemo(
    () => baseNavItems.filter((item) => {
      if (item.hidden) return false;
      if (item.adminOnly && !isAdmin) return false;
      if (item.agencyOnly && !isAgency) return false;
      return true;
    }),
    [isAdmin, isAgency]
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* App topbar */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link to="/app" className="inline-flex items-center flex-shrink-0">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu logo"
              className="h-5 sm:h-6 w-auto object-contain"
            />
          </Link>

          {/* Navigation */}
          <nav className="flex-1 flex items-center justify-center">
            <div className="relative flex items-center gap-0.5 sm:gap-1 rounded-2xl bg-muted/50 dark:bg-muted/30 p-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                const badge = item.path === '/app/chat' ? chatUnreadCount : 0;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative z-10 ${item.mobileHidden ? 'hidden sm:inline-block' : ''}`}
                  >
                    <motion.div
                      className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-colors duration-200 ${active
                        ? 'font-semibold text-black dark:text-foreground'
                        : 'font-medium text-muted-foreground hover:text-foreground'
                        }`}
                      whileHover={!active ? { scale: 1.04 } : {}}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      <div className="relative">
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </div>
                      <span className="hidden sm:inline">{item.label}</span>
                    </motion.div>
                    {active && (
                      <motion.div
                        layoutId="nav-active-pill"
                        className="absolute inset-0 rounded-xl bg-background dark:bg-white/10 shadow-sm dark:shadow-[0_0_12px_rgba(255,255,255,0.06)] border border-border/60 dark:border-white/10"
                        transition={{
                          type: 'spring',
                          stiffness: 350,
                          damping: 30,
                          mass: 0.8,
                        }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {rightActions && (
            <div className="flex items-center gap-2">
              {rightActions}
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            {isAgency && <ProfileSwitcherDropdown />}
            <Link
              to="/app/settings"
              className="group relative"
              aria-label="Profile settings"
            >
              <motion.div
                className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 transition-all ${location.pathname === '/app/settings'
                  ? 'border-primary shadow-[0_0_12px_rgba(var(--primary),0.3)]'
                  : 'border-border/60 group-hover:border-primary/50'
                  }`}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            </Link>
            {/* Dark/Light mode toggle — desktop only */}
            <motion.button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
              aria-label="Toggle theme"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
            </motion.button>
            <motion.div
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="hidden sm:block"
            >
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9 border-border/60"
                onClick={handleLogout}
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className={`pt-16 sm:pt-20 flex-1 flex flex-col ${isChatPage ? 'overflow-hidden' : 'pb-24 sm:pb-0'}`}>
        <main className={`flex-1 ${isChatPage ? 'overflow-hidden' : ''}`}>{children}</main>
      </div>

      {/* Mobile Floating Dock — hidden on chat page */}
      <div className={`fixed bottom-6 inset-x-0 z-50 flex justify-center sm:hidden pointer-events-none ${isChatPage ? 'hidden' : ''}`}>
        <div className="flex items-center gap-1 px-3 py-2 rounded-full bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl pointer-events-auto">
          {/* Links Button */}
          <Link to="/app/links">
            <motion.div
              className={`flex flex-col items-center justify-center w-11 h-11 rounded-full transition-colors ${location.pathname.startsWith('/app/links')
                ? 'text-white bg-white/10'
                : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              whileTap={{ scale: 0.9 }}
            >
              <Link2 className="w-5 h-5" />
              <span className="text-[9px] font-medium mt-0.5">Links</span>
            </motion.div>
          </Link>

          {/* Add Content Button (Center) */}
          <Link to="/app/links/new">
            <motion.div
              className="flex items-center justify-center w-14 h-14 rounded-full bg-[#E5FF7D] text-black shadow-lg shadow-[#E5FF7D]/20 border-4 border-black"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{ y: -16 }}
            >
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </motion.div>
          </Link>

          {/* Content Button */}
          <Link to="/app/content">
            <motion.div
              className={`flex flex-col items-center justify-center w-11 h-11 rounded-full transition-colors ${location.pathname === '/app/content' && !location.search.includes('action=new')
                ? 'text-white bg-white/10'
                : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              whileTap={{ scale: 0.9 }}
            >
              <Image className="w-5 h-5" />
              <span className="text-[9px] font-medium mt-0.5">Content</span>
            </motion.div>
          </Link>

        </div>
      </div>
      <AnimatePresence>
        {showProfileSwitcher && location.pathname.startsWith('/app') && <ProfileSwitcherOverlay />}
      </AnimatePresence>
    </div>
  );
};

export default AppShell;
