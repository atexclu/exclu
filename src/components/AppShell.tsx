import { ReactNode, useEffect, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut, User, LayoutDashboard, Plus, Link2, Image, ShieldCheck, Sun, Moon, Palette, MessageSquare, Gift, Settings, BarChart3, DollarSign } from 'lucide-react';
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
}

const navSections = [
  {
    label: 'General',
    items: [
      { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/app/profile', label: 'Profile', icon: Palette },
      { path: '/app/links', label: 'Links', icon: Link2 },
      { path: '/app/content', label: 'Content', icon: Image },
      { path: '/app/chat', label: 'Chat', icon: MessageSquare },
      { path: '/app/wishlist', label: 'Wishlist', icon: Gift },
    ],
  },
  {
    label: 'Monetize',
    items: [
      { path: '/app/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/app/earnings', label: 'Earnings', icon: DollarSign },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/app/referral', label: 'Referrals', icon: Gift },
      { path: '/admin/users?tab=blog', label: 'Admin', icon: ShieldCheck, adminOnly: true },
    ],
  },
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
      if (profile) setIsAdmin(profile.is_admin === true);
    };
    fetchAdminStatus();
  }, []);

  const isActive = (path: string) => {
    if (path === '/app/links') return location.pathname === '/app/links' || location.pathname.startsWith('/app/links/');
    if (path === '/app/content') return location.pathname === '/app/content';
    if (path === '/app/chat') return location.pathname === '/app/chat';
    if (path === '/app/wishlist') return location.pathname === '/app/wishlist';
    if (path === '/app/analytics') return location.pathname === '/app/analytics';
    if (path === '/app/earnings') return location.pathname === '/app/earnings';
    if (path === '/app/referral') return location.pathname === '/app/referral';
    if (path === '/admin/users') return location.pathname === '/admin/users' || location.pathname.startsWith('/admin/users/');
    return location.pathname === path;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const allNavItems = useMemo(() => {
    const items: NavItem[] = [];
    navSections.forEach((s) => s.items.forEach((i) => items.push(i)));
    return items;
  }, []);

  const visibleNavItems = useMemo(
    () => allNavItems.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      return true;
    }),
    [allNavItems, isAdmin]
  );

  const sidebarWidth = 'w-[200px]';

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Vertical Sidebar — X/Twitter style — hidden on mobile */}
      <aside className={`fixed left-0 top-0 bottom-0 ${sidebarWidth} flex flex-col z-40 border-r border-border/50 bg-card hidden lg:flex`}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border/50">
          <Link to="/app" className="inline-flex items-center">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu logo"
              className="h-6 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {navSections.map((section) => {
            const visibleItems = section.items.filter((item) => {
              if (item.adminOnly && !isAdmin) return false;
              return true;
            });
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label} className="mb-5">
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    const badge = item.path === '/app/chat' ? chatUnreadCount : 0;
                    return (
                      <Link key={item.path} to={item.path} className="block">
                        <div
                          className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                            active
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          {/* Active indicator dot */}
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary" />
                          )}
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          <span>{item.label}</span>
                          {badge > 0 && item.path === '/app/chat' && (
                            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* CTA + Theme + Profile at bottom */}
        <div className="p-3 border-t border-border/50 space-y-2">
          {/* Create Content CTA */}
          <Link to="/app/links/new" className="block">
            <Button
              className="w-full justify-start gap-2 rounded-xl h-11 font-semibold border-0"
              size="sm"
              style={{ backgroundColor: '#00e676', color: '#000' }}
            >
              <Plus className="w-4 h-4" />
              Create
            </Button>
          </Link>

          {/* Theme toggle + Settings row */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{resolvedTheme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <Link
              to="/app/settings"
              className="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>

          {/* Profile row */}
          <div className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-muted/50 transition-colors">
            <Link to="/app/settings" className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-border/60 flex-shrink-0 bg-muted">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {activeProfile?.display_name || 'User'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {activeProfile?.handle ? `@${activeProfile.handle}` : 'Creator'}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-[200px]">
        {/* Topbar for mobile + right actions */}
        <header className="sticky top-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl h-14 flex items-center justify-between px-4 lg:hidden">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-semibold text-foreground">{rightActions}</span>
          </div>
          <div className="flex items-center gap-2">
            {isAgency && <ProfileSwitcherDropdown />}
          </div>
        </header>

        {/* Page content */}
        <div className={`flex-1 flex flex-col ${isChatPage ? '' : 'pb-24 sm:pb-0'}`}>
          <main className={`flex-1 ${isChatPage ? 'overflow-hidden' : ''}`}>{children}</main>
        </div>
      </div>

      {/* Mobile Floating Dock */}
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
