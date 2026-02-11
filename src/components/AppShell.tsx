import { ReactNode, useEffect, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut, User, LayoutDashboard, Palette, Link2, Image, ShieldCheck, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';

interface AppShellProps {
  children: ReactNode;
  rightActions?: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { path: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/profile', label: 'Profile', icon: Palette },
  { path: '/app/links', label: 'Links', icon: Link2 },
  { path: '/app/content', label: 'Content', icon: Image },
  { path: '/admin/users', label: 'Admin', icon: ShieldCheck, adminOnly: true },
];

const AppShell = ({ children, rightActions }: AppShellProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchAvatar = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, is_admin')
        .eq('id', user.id)
        .single();

      if (profile) {
        if (profile.avatar_url) {
          setAvatarUrl(profile.avatar_url);
        }
        setIsAdmin(profile.is_admin === true);
      }
    };

    fetchAvatar();
  }, []);

  const isActive = (path: string) => {
    if (path === '/app/links') {
      return location.pathname === '/app/links' || location.pathname.startsWith('/app/links/');
    }
    if (path === '/app/content') {
      return location.pathname === '/app/content';
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
    () => navItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  const activeItem = visibleNavItems.find((item) => isActive(item.path));

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
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="relative z-10"
                  >
                    <motion.div
                      className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 ${
                        active
                          ? 'text-black dark:text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      whileHover={!active ? { scale: 1.04 } : {}}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
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
            <Link
              to="/app/settings"
              className="group relative"
              aria-label="Profile settings"
            >
              <motion.div
                className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 transition-all ${
                  location.pathname === '/app/settings'
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
            <motion.div
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
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
      <div className="pt-16 sm:pt-20 flex-1 flex flex-col">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
