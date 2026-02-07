import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';

interface AppShellProps {
  children: ReactNode;
  rightActions?: ReactNode;
}

const AppShell = ({ children, rightActions }: AppShellProps) => {
  const { resolvedTheme } = useTheme();
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* App topbar */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-border bg-card backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <Link to="/app" className="inline-flex items-center">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu logo"
              className="h-5 sm:h-6 w-auto object-contain"
            />
          </Link>

          <nav className="flex-1 flex items-center justify-center gap-3 sm:gap-5 text-xs sm:text-sm">
            <Link
              to="/app"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/app/profile"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app/profile')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Profile
            </Link>
            <Link
              to="/app/links"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app/links')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Links
            </Link>
            <Link
              to="/app/content"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app/content')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Content
            </Link>
            {isAdmin && (
              <Link
                to="/admin/users"
                className={`px-3 py-1.5 rounded-full transition-all ${
                  isActive('/admin/users')
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          {rightActions && (
            <div className="flex items-center gap-2">
              {rightActions}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Link
              to="/app/settings"
              className={`relative w-8 h-8 rounded-full overflow-hidden border transition-all ${
                location.pathname === '/app/settings'
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/50'
              }`}
              aria-label="Profile settings"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </Link>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-8 w-8"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="pt-20 flex-1 flex flex-col">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
