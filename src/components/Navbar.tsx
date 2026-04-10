import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';
import { User } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

interface NavbarProps {
  user?: User | null;
  variant?: 'default' | 'blog';
  centerContent?: React.ReactNode;
  mobileTopContent?: React.ReactNode;
}

const Navbar = ({ user: userProp, variant = 'default', centerContent, mobileTopContent }: NavbarProps) => {
  const { resolvedTheme } = useTheme();
  const [sessionUser, setSessionUser] = useState<User | null>(null);

  useEffect(() => {
    if (userProp) return;
    supabase.auth.getSession().then(({ data }) => {
      setSessionUser(data.session?.user ?? null);
    });
  }, [userProp]);

  const user = userProp ?? sessionUser;

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Error signing out');
    } else {
      window.location.href = '/auth';
    }
  };

  const landingLinks = [
    { href: '/#features', label: 'Features' },
    { href: '/#how-it-works', label: 'How it works' },
    { href: '/#pricing', label: 'Pricing' },
    { href: '/blog', label: 'Blog' },
  ];

  const blogLinks = [
    { href: '/blog', label: 'Articles' },
    { href: '/directory/creators', label: 'Creators' },
    { href: '/directory/agencies', label: 'Agencies' },
    { href: '/directory', label: 'Directory' },
  ];

  const navLinks = variant === 'blog' ? blogLinks : landingLinks;

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto">
        <div className="glass-strong rounded-2xl px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <motion.a
            href={user ? "/app" : "/"}
            className="flex items-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <img src={resolvedTheme === 'light' ? logoBlack : logoWhite} alt="Exclu" className="h-7" />
          </motion.a>

          {/* Navigation Links */}
          {!user && !centerContent && (
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-exclu-space hover:text-exclu-cloud transition-colors duration-300 text-sm font-medium link-underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {/* Center content (e.g. onboarding step bubbles) */}
          {centerContent && (
            <div className="hidden sm:flex items-center justify-center flex-1">
              {centerContent}
            </div>
          )}

          {/* Mobile-only inline content (e.g. FOMO timer) */}
          {mobileTopContent && (
            <div className="sm:hidden flex items-center">
              {mobileTopContent}
            </div>
          )}

          {/* CTA Buttons or User Menu */}
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-exclu-space hover:text-exclu-cloud hover:bg-black/5 dark:hover:bg-white/5"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-exclu-space hover:text-exclu-cloud" asChild>
                  <a href="/auth">Log in</a>
                </Button>
                <Button variant="hero" size="sm" asChild>
                  <a href="/auth">Start for free</a>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
