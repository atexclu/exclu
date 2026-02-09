import { useTheme } from '@/contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';

export function ThemeToggleSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      onClick={handleToggle}
      className="relative inline-flex items-center gap-2 rounded-full bg-muted p-1 transition-colors hover:bg-muted/80"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Track */}
      <div className="relative flex items-center gap-1">
        {/* Sun icon */}
        <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${!isDark ? 'text-white' : 'text-muted-foreground'}`}>
          <Sun className="w-4 h-4" />
        </div>

        {/* Moon icon */}
        <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${isDark ? 'text-black' : 'text-muted-foreground'}`}>
          <Moon className="w-4 h-4" />
        </div>

        {/* Sliding background */}
        <motion.div
          className="absolute top-1 bottom-1 w-8 rounded-full bg-primary"
          initial={false}
          animate={{
            left: isDark ? 'calc(50% + 2px)' : '4px',
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
          }}
        />
      </div>
    </button>
  );
}
