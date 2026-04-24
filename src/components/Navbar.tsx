import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';
import { User } from '@supabase/supabase-js';
import { LogOut, LayoutDashboard, Menu, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

interface NavbarProps {
  user?: User | null;
  variant?: 'default' | 'blog';
  centerContent?: React.ReactNode;
  mobileTopContent?: React.ReactNode;
  hideDashboard?: boolean;
}

const Navbar = ({ user: userProp, variant = 'default', centerContent, mobileTopContent, hideDashboard = false }: NavbarProps) => {
  const { resolvedTheme } = useTheme();
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (userProp) return;
    supabase.auth.getSession().then(({ data }) => {
      setSessionUser(data.session?.user ?? null);
    });
  }, [userProp]);

  const user = userProp ?? sessionUser;

  // Close mobile menu when user scrolls or resizes to desktop
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mobileMenuOpen]);

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
    { href: '/pricing', label: 'Pricing' },
    { href: '/blog', label: 'Blog' },
  ];

  const blogLinks = [
    { href: '/blog', label: 'Articles' },
    { href: '/directory/creators', label: 'Creators' },
    { href: '/directory/agencies', label: 'Agencies' },
    { href: '/directory', label: 'Directory' },
  ];

  const navLinks = variant === 'blog' ? blogLinks : landingLinks;
  const showNavLinks = !centerContent;

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

          {/* Navigation Links — desktop */}
          {showNavLinks && (
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
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {!hideDashboard && (
                  <Button
                    variant="hero"
                    size="sm"
                    asChild
                  >
                    <a href="/app">
                      <LayoutDashboard className="w-4 h-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Dashboard</span>
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex text-exclu-space hover:text-exclu-cloud hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={handleSignOut}
                >
                  <LogOut className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </>
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

            {/* Mobile menu trigger */}
            {showNavLinks && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                className="md:hidden ml-1 inline-flex items-center justify-center w-9 h-9 rounded-xl border border-exclu-arsenic/40 bg-exclu-phantom/40 text-exclu-cloud hover:border-exclu-cloud/30 transition-colors"
              >
                <AnimatePresence initial={false} mode="wait">
                  {mobileMenuOpen ? (
                    <motion.span
                      key="x"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <X className="w-4 h-4" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Menu className="w-4 h-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}
          </div>
        </div>

        {/* Mobile dropdown panel */}
        <AnimatePresence>
          {mobileMenuOpen && showNavLinks && (
            <>
              <motion.button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden fixed inset-0 top-[72px] z-40 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="md:hidden relative z-50 mt-2 glass-strong rounded-2xl overflow-hidden"
              >
                <ul className="py-2">
                  {navLinks.map((link, i) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-between px-5 py-3 text-[15px] font-medium text-exclu-cloud hover:bg-white/5 transition-colors"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <span>{link.label}</span>
                        <span className="text-exclu-space/50 text-xs">→</span>
                      </a>
                    </li>
                  ))}
                  {user && (
                    <li className="border-t border-white/5 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleSignOut();
                        }}
                        className="w-full flex items-center justify-between px-5 py-3 text-[15px] font-medium text-exclu-space hover:text-red-400 hover:bg-white/5 transition-colors"
                      >
                        <span className="inline-flex items-center gap-2">
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </span>
                      </button>
                    </li>
                  )}
                  {!user && (
                    <li className="border-t border-white/5 mt-1 pt-1">
                      <a
                        href="/auth"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-between px-5 py-3 text-[15px] font-medium text-exclu-cloud hover:bg-white/5 transition-colors"
                      >
                        <span>Log in</span>
                        <span className="text-exclu-space/50 text-xs">→</span>
                      </a>
                    </li>
                  )}
                </ul>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
};

export default Navbar;
