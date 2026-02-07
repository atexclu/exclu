import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';

const Navbar = () => {
  const { resolvedTheme } = useTheme();
  
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
            href="/"
            className="flex items-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <img src={resolvedTheme === 'light' ? logoBlack : logoWhite} alt="Exclu" className="h-7" />
          </motion.a>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="/#features" className="text-exclu-space hover:text-exclu-cloud transition-colors duration-300 text-sm font-medium link-underline">
              Features
            </a>
            <a href="/#how-it-works" className="text-exclu-space hover:text-exclu-cloud transition-colors duration-300 text-sm font-medium link-underline">
              How it works
            </a>
            <a href="/#pricing" className="text-exclu-space hover:text-exclu-cloud transition-colors duration-300 text-sm font-medium link-underline">
              Pricing
            </a>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-exclu-space hover:text-exclu-cloud" asChild>
              <a href="/auth">Log in</a>
            </Button>
            <Button variant="hero" size="sm" asChild>
              <a href="/auth">Start for free</a>
            </Button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
