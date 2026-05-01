import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { LogOut, Link2, Image as ImageIcon, ShieldCheck, Sun, Moon, Palette, MessageSquare, Gift, DollarSign, UserPlus, Menu, Settings, Building2, X, HelpCircle, Plus } from 'lucide-react';
import { useChatUnread } from '@/hooks/useChatUnread';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import { useProfiles } from '@/contexts/ProfileContext';
import { ProfileSwitcherDropdown, ProfileSwitcherOverlay } from '@/components/ProfileSwitcher';
import { ProfileHealthCard, ProfileHealthCardSkeleton } from '@/components/ProfileHealthCard';
import { ProfileHealthDialog } from '@/components/ProfileHealthDialog';
import { useProfileHealth, type ProfileHealthStepId } from '@/hooks/useProfileHealth';
import { ProUpgradePopup } from './ProUpgradePopup';

const PROFILE_HEALTH_AUTO_OPEN_DELAY_MS = 450;
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
  external?: boolean;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'General',
    items: [
      { path: '/app/profile', label: 'Profile', icon: Palette },
      { path: '/app/dashboard', label: 'Earnings', icon: DollarSign },
      { path: '/app/links', label: 'Links', icon: Link2 },
      { path: '/app/content', label: 'Content', icon: ImageIcon },
      { path: '/app/chat', label: 'Chat', icon: MessageSquare },
      { path: '/app/wishlist', label: 'Wishlist', icon: Gift },
    ],
  },
  {
    label: 'Monetize',
    items: [
      { path: '/app/agency', label: 'Agency Panel', icon: Building2, agencyOnly: true },
      { path: '/app/referral', label: 'Referrals', icon: UserPlus },
    ],
  },
  {
    label: 'Support',
    items: [
      { path: 'https://t.me/exclu_alternative', label: 'Support', icon: HelpCircle, external: true },
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const chatUnreadCount = useChatUnread(activeProfile?.id ?? null);
  const isChatPage = location.pathname === '/app/chat';

  // ── Profile Health: hook + dialog live at the AppShell root ─────────
  // The dialog must be rendered OUTSIDE the mobile drawer's <motion.aside>.
  // Otherwise closing the drawer (which we do when the card is tapped on
  // mobile, to avoid a z-index stacking conflict) would unmount the dialog
  // mid-open. With state lifted up here, the drawer can come and go without
  // touching the popup.
  const profileHealth = useProfileHealth(activeProfile);
  const [profileHealthOpen, setProfileHealthOpen] = useState(false);
  const [profileHealthHighlight, setProfileHealthHighlight] = useState<ProfileHealthStepId | null>(null);

  // Auto-popup on a fresh step crossing. The hook only reports `justCompletedStepId`
  // for transitions that happened in this session and weren't acknowledged before,
  // so reloading the page won't re-trigger.
  useEffect(() => {
    const stepId = profileHealth.justCompletedStepId;
    if (!stepId) return;
    const timer = window.setTimeout(() => {
      setProfileHealthHighlight(stepId);
      setProfileHealthOpen(true);
      profileHealth.acknowledgeJustCompleted();
    }, PROFILE_HEALTH_AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [profileHealth.justCompletedStepId, profileHealth]);

  // Clear the highlight a moment after the dialog closes so a manual reopen
  // doesn't re-pulse a previously celebrated step.
  useEffect(() => {
    if (profileHealthOpen) return;
    if (!profileHealthHighlight) return;
    const timer = window.setTimeout(() => setProfileHealthHighlight(null), 800);
    return () => window.clearTimeout(timer);
  }, [profileHealthOpen, profileHealthHighlight]);

  const isProfileHealthComplete =
    profileHealth.isReady && profileHealth.completedCount === profileHealth.totalCount;

  /** Tap handler shared by both card instances. The mobile path also closes
      the drawer; on desktop `closeDrawer=false` keeps the sidebar in place. */
  const openProfileHealth = (closeDrawer = false) => {
    if (closeDrawer) setMobileDrawerOpen(false);
    setProfileHealthOpen(true);
  };

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

  // Close drawer on navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === '/app/dashboard')
      return location.pathname === '/app/dashboard' || location.pathname === '/app/earnings';
    if (path === '/app/profile') return location.pathname === '/app/profile';
    if (path === '/app/links') return location.pathname === '/app/links' || location.pathname.startsWith('/app/links/');
    if (path === '/app/content') return location.pathname === '/app/content';
    if (path === '/app/chat') return location.pathname === '/app/chat';
    if (path === '/app/wishlist') return location.pathname === '/app/wishlist';
    if (path === '/app/agency') return location.pathname === '/app/agency';
    if (path === '/app/referral') return location.pathname === '/app/referral';
    if (path === '/admin/users') return location.pathname === '/admin/users' || location.pathname.startsWith('/admin/users/');
    return location.pathname === path;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const filterNavItems = (items: NavItem[]) =>
    items.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.agencyOnly && !isAgency) return false;
      return true;
    });

  const sidebarWidth = 'w-[200px]';

  // Shared nav rendering used by both desktop sidebar and mobile drawer
  const renderNavSections = () =>
    navSections.map((section) => {
      const visibleItems = filterNavItems(section.items);
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
              const linkContent = (
                <div
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
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
              );
              return item.external ? (
                <a key={item.path} href={item.path} target="_blank" rel="noopener noreferrer" className="block">
                  {linkContent}
                </a>
              ) : (
                <Link key={item.path} to={item.path} className="block">
                  {linkContent}
                </Link>
              );
            })}
          </div>
        </div>
      );
    });

  // Shared sidebar bottom: profile switcher + 3 action icons
  const renderSidebarBottom = () => (
    <div className="p-3 border-t border-border/50 space-y-3">
      {/* Profile switcher for multi-profile accounts */}
      {profiles.length > 1 && (
        <ProfileSwitcherDropdown />
      )}

      {/* 3 action icons row */}
      <div className="flex items-center justify-around px-1">
        <Link
          to="/app/settings"
          className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-[18px] h-[18px]" />
        </Link>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Toggle theme"
          title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {resolvedTheme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-muted/50 transition-colors"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden">
      {/* ── Desktop Sidebar ─────────────────────────────────────────── */}
      <aside className={`fixed left-0 top-0 bottom-0 ${sidebarWidth} flex flex-col z-40 border-r border-border/50 bg-card hidden lg:flex`}>
        <div className="px-4 py-5 border-b border-border/50">
          <Link to="/app" className="inline-flex items-center">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu logo"
              className="h-6 w-auto object-contain"
            />
          </Link>
        </div>

        <div className="px-3 pt-3">
          {activeProfile && profileHealth.isReady ? (
            <ProfileHealthCard
              activeProfile={activeProfile}
              percent={profileHealth.percent}
              subscribersCount={profileHealth.subscribersCount}
              profileViewCount={profileHealth.profileViewCount}
              salesCount={profileHealth.salesCount}
              isComplete={isProfileHealthComplete}
              onOpen={() => openProfileHealth(false)}
            />
          ) : (
            <ProfileHealthCardSkeleton />
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {renderNavSections()}
        </nav>

        {renderSidebarBottom()}
      </aside>

      {/* ── Mobile Drawer (slide from left) ─────────────────────────── */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed left-0 top-0 bottom-0 w-[260px] flex flex-col z-[61] bg-card border-r border-border/50 lg:hidden"
            >
              <div className="px-4 py-5 border-b border-border/50 flex items-center justify-between">
                <Link to="/app" className="inline-flex items-center">
                  <img
                    src={resolvedTheme === 'light' ? logoBlack : logoWhite}
                    alt="Exclu logo"
                    className="h-6 w-auto object-contain"
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-3 pt-3">
                {/* The mobile instance closes the drawer when tapped — the
                    dialog itself lives at AppShell root so it survives the
                    drawer unmount. Without that lift-up the popup would
                    appear and immediately disappear with the drawer. */}
                {activeProfile && profileHealth.isReady ? (
                  <ProfileHealthCard
                    activeProfile={activeProfile}
                    percent={profileHealth.percent}
                    subscribersCount={profileHealth.subscribersCount}
                    profileViewCount={profileHealth.profileViewCount}
                    isComplete={isProfileHealthComplete}
                    onOpen={() => openProfileHealth(true)}
                  />
                ) : (
                  <ProfileHealthCardSkeleton />
                )}
              </div>

              <nav className="flex-1 overflow-y-auto py-4 px-3">
                {renderNavSections()}
              </nav>

              {renderSidebarBottom()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:ml-[200px] min-w-0 overflow-x-hidden">
        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl h-14 flex items-center justify-between px-4 lg:hidden">
          <Link to="/app" className="inline-flex items-center">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu logo"
              className="h-5 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-2">
            {profiles.length > 1 && <ProfileSwitcherDropdown openDirection="down" />}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content — chat gets full remaining height */}
        <div className="flex-1 flex flex-col">
          <main className={`flex-1 flex flex-col ${isChatPage ? 'overflow-hidden' : ''}`}>{children}</main>
        </div>
      </div>

      {/* Mobile floating action pill menu (Links · + · Content) */}
      {!isChatPage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 lg:hidden">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex items-center gap-1 rounded-full bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 px-2 py-2"
          >
            <button
              type="button"
              onClick={() => navigate('/app/links')}
              className="flex flex-col items-center justify-center min-w-[72px] px-3 py-1.5 rounded-full text-white/80 hover:text-white active:scale-95 transition-all"
              aria-label="Links"
            >
              <Link2 className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5">Links</span>
            </button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => navigate('/app/links/new')}
              className="w-12 h-12 rounded-full bg-[#CFFF16] text-black flex items-center justify-center shadow-[0_0_24px_6px_rgba(207,255,22,0.35)] mx-1"
              aria-label="New link"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </motion.button>

            <button
              type="button"
              onClick={() => navigate('/app/content')}
              className="flex flex-col items-center justify-center min-w-[72px] px-3 py-1.5 rounded-full text-white/80 hover:text-white active:scale-95 transition-all"
              aria-label="Content"
            >
              <ImageIcon className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5">Content</span>
            </button>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {showProfileSwitcher && location.pathname.startsWith('/app') && <ProfileSwitcherOverlay />}
      </AnimatePresence>

      {location.pathname.startsWith('/app') && <ProUpgradePopup />}

      {/* Profile Health dialog — rendered at AppShell root so it survives
          the mobile drawer unmounting (which happens when the card is tapped). */}
      <ProfileHealthDialog
        open={profileHealthOpen}
        onOpenChange={setProfileHealthOpen}
        steps={profileHealth.steps}
        percent={profileHealth.percent}
        completedCount={profileHealth.completedCount}
        totalCount={profileHealth.totalCount}
        highlightStepId={profileHealthHighlight}
        onToggleManualStep={profileHealth.toggleManualStep}
      />
    </div>
  );
};

export default AppShell;
