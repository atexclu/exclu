import { ReactNode, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut, User, Plus, Link2, Image, MessageSquare, Gift, ShieldCheck, Sun, Moon, Home, DollarSign, Zap, BarChart3, Users, Settings } from 'lucide-react';
import { useChatUnread } from '@/hooks/useChatUnread';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { useProfiles } from '@/contexts/ProfileContext';
import { ProfileSwitcherOverlay } from '@/components/ProfileSwitcher';
import { ProUpgradeModal, shouldShowProModal, markProModalShown } from '@/components/ProUpgradeModal';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';

interface AppShellProps {
  children: ReactNode;
  rightActions?: ReactNode;
}

type Badge = { label: string; variant: 'new' | 'soon' | 'pro' };

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<any>;
  badge?: Badge;
  adminOnly?: boolean;
  agencyOnly?: boolean;
  mobileHidden?: boolean;
  hidden?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'General',
    items: [
      { path: '/app', label: 'Home', icon: Home },
      { path: '/app/profile', label: 'Profile', icon: User },
      { path: '/app/links', label: 'Links', icon: Link2, mobileHidden: true },
      { path: '/app/content', label: 'Content', icon: Image, mobileHidden: true },
      { path: '/app/chat', label: 'Chat', icon: MessageSquare },
      { path: '/app/wishlist', label: 'Wishlist', icon: Gift },
    ],
  },
  {
    title: 'Monetize',
    items: [
      { path: '/app/analytics', label: 'Analytics', icon: BarChart3, badge: { label: 'New', variant: 'new' } },
      { path: '/app/earnings', label: 'Earnings', icon: DollarSign },
    ],
  },
  {
    title: 'Tools',
    items: [
      { path: '/app/ai', label: 'AI Assistant', icon: Sparkles, badge: { label: 'Soon', variant: 'soon' } },
      { path: '/app/referral', label: 'Referrals', icon: Users, badge: { label: 'New', variant: 'new' } },
    ],
  },
  {
    items: [
      { path: '/admin/users?tab=blog', label: 'Admin', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

const AppShell = ({ children, rightActions }: AppShellProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const { activeProfile, isAgency, showProfileSwitcher } = useProfiles();
  const location = useLocation();
  const navigate = useNavigate();
  const [showProModal, setShowProModal] = useState(shouldShowProModal);

  const avatarUrl = activeProfile?.avatar_url ?? null;
  const chatUnreadCount = useChatUnread(activeProfile?.id ?? null);
  const isChatPage = location.pathname === '/app/chat';
  const isAdmin = false;

  const isActive = (path: string) => {
    const current = location.pathname;
    // Exact matches
    if (current === path) return true;
    // Prefix matches for sub-routes
    if (path === '/app' && current !== '/app') return false;
    if (path === '/app/links' && current.startsWith('/app/links')) return true;
    if (path === '/app/content' && current.startsWith('/app/content')) return true;
    if (path === '/app/chat' && current.startsWith('/app/chat')) return true;
    if (path === '/app/wishlist' && current.startsWith('/app/wishlist')) return true;
    if (path === '/app/profile' && current.startsWith('/app/profile')) return true;
    if (path === '/app/analytics' && current.startsWith('/app/analytics')) return true;
    if (path === '/app/earnings' && current.startsWith('/app/earnings')) return true;
    if (path === '/app/ai' && current.startsWith('/app/ai')) return true;
    if (path === '/app/referral' && current.startsWith('/app/referral')) return true;
    if (path === '/admin/users' && current.startsWith('/admin/users')) return true;
    if (path === '/app/settings' && current.startsWith('/app/settings')) return true;
    return false;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            if (item.hidden) return false;
            if (item.adminOnly && !isAdmin) return false;
            if (item.agencyOnly && !isAgency) return false;
            return true;
          }),
        }))
        .filter((section) => section.items.length > 0),
    [isAdmin, isAgency]
  );

  const badgeClasses = {
    new: 'bg-blue-500/20 text-blue-400 text-[8px] font-bold px-1.5 py-0.5 rounded-full',
    soon: 'bg-orange-500/20 text-orange-400 text-[8px] font-bold px-1.5 py-0.5 rounded-full',
    pro: 'bg-green-500/20 text-green-400 text-[8px] font-bold px-1.5 py-0.5 rounded-full',
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* ── Left Sidebar ── */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 w-[240px] flex flex-col bg-background border-r border-border/50">

        {/* Logo */}
        <div className="flex-shrink-0 px-5 py-5 border-b border-border/50">
          <Link to="/app" className="flex items-center gap-2.5">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu logo"
              className="h-7 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Navigation — scrollable */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {visibleSections.map((section, si) => (
            <div key={si}>
              {section.title && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  const badge = item.path === '/app/chat' ? chatUnreadCount : null;

                  return (
                    <Link key={item.path} to={item.path} className={`block ${item.mobileHidden ? 'hidden sm:block' : ''}`}>
                      <motion.div
                        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 group ${
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                        whileHover={!active ? { x: 2 } : {}}
                        transition={{ duration: 0.15 }}
                      >
                        {/* Active indicator */}
                        {active && (
                          <motion.div
                            layoutId="sidebar-active"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary"
                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                          />
                        )}

                        <Icon className="w-4 h-4 flex-shrink-0" />

                        <span className="flex-1 text-sm font-medium leading-none">{item.label}</span>

                        {/* Badge */}
                        {item.badge && (
                          <span className={badgeClasses[item.badge.variant]}>
                            {item.badge.label}
                          </span>
                        )}

                        {/* Chat unread count */}
                        {badge !== null && badge > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="flex-shrink-0 py-4 px-3 border-t border-border/50 space-y-0.5">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="text-sm font-medium">{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          {/* Settings */}
          <Link to="/app/settings" className="block">
            <div
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                location.pathname === '/app/settings'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Settings</span>
            </div>
          </Link>

          {/* Profile + Logout */}
          <div className="flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl bg-muted/30">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{activeProfile?.username || 'User'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{activeProfile ? 'Creator' : 'Not set'}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 ml-[240px] flex flex-col min-h-screen">
        {/* Topbar — only on chat page or when rightActions present */}
        {(isChatPage || rightActions) && (
          <header className="sticky top-0 z-20 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <Link to="/app" className="flex items-center gap-2">
                <img
                  src={resolvedTheme === 'light' ? logoBlack : logoWhite}
                  alt="Exclu"
                  className="h-6 w-auto"
                />
              </Link>
            </div>
            {rightActions && <div className="flex items-center gap-2">{rightActions}</div>}
          </header>
        )}

        {/* Page content */}
        <main className={`flex-1 ${isChatPage ? '' : 'pb-24 sm:pb-8'} px-4 sm:px-8`}>
          {children}
        </main>
      </div>

      {/* Mobile Floating Dock */}
      {!isChatPage && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center sm:hidden pointer-events-none">
          <div className="flex items-center gap-1 px-3 py-2 rounded-full bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl pointer-events-auto">
            <Link to="/app/links">
              <motion.div
                className={`flex flex-col items-center justify-center w-11 h-11 rounded-full transition-colors ${
                  location.pathname.startsWith('/app/links')
                    ? 'text-white bg-white/10'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                whileTap={{ scale: 0.9 }}
              >
                <Link2 className="w-5 h-5" />
                <span className="text-[9px] font-medium mt-0.5">Links</span>
              </motion.div>
            </Link>

            <Link to="/app/links/new">
              <motion.div
                className="flex items-center justify-center w-14 h-14 rounded-full bg-[#E5FF7D] text-black shadow-lg shadow-[#E5FF7D]/20 border-4 border-black -mt-3"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-7 h-7 stroke-[2.5]" />
              </motion.div>
            </Link>

            <Link to="/app/content">
              <motion.div
                className={`flex flex-col items-center justify-center w-11 h-11 rounded-full transition-colors ${
                  location.pathname === '/app/content' && !location.search.includes('action=new')
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
      )}

      <AnimatePresence>
        {showProfileSwitcher && location.pathname.startsWith('/app') && <ProfileSwitcherOverlay />}
      </AnimatePresence>
    </div>
  );
};

export default AppShell;
