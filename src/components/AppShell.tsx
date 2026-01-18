import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
}

const AppShell = ({ children }: AppShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/app/links') {
      return location.pathname === '/app/links' || location.pathname.startsWith('/app/links/');
    }
    if (path === '/app/content') {
      return location.pathname === '/app/content';
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
      <header className="fixed top-0 inset-x-0 z-30 border-b border-exclu-arsenic/60 bg-gradient-to-b from-black/90 via-black/80 to-black/60 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/app" className="inline-flex items-center">
            <img
              src="/Logo white.png"
              alt="Exclu logo"
              className="h-7 w-auto object-contain"
            />
          </Link>

          <nav className="flex-1 flex items-center justify-center gap-3 sm:gap-5 text-xs sm:text-sm">
            <Link
              to="/app"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app')
                  ? 'bg-exclu-cloud text-black shadow-sm'
                  : 'text-exclu-space hover:text-exclu-cloud hover:bg-exclu-ink/70'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/app/links"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app/links')
                  ? 'bg-exclu-cloud text-black shadow-sm'
                  : 'text-exclu-space hover:text-exclu-cloud hover:bg-exclu-ink/70'
              }`}
            >
              Links
            </Link>
            <Link
              to="/app/content"
              className={`px-3 py-1.5 rounded-full transition-all ${
                isActive('/app/content')
                  ? 'bg-exclu-cloud text-black shadow-sm'
                  : 'text-exclu-space hover:text-exclu-cloud hover:bg-exclu-ink/70'
              }`}
            >
              Content
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full border-exclu-arsenic/70 bg-exclu-ink/80 hover:bg-exclu-phantom/80 h-8 w-8"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="pt-16 flex-1 flex flex-col">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
