import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';
import { Instagram, Send } from 'lucide-react';

// X (Twitter) icon component
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const Footer = () => {
  const { resolvedTheme } = useTheme();
  
  const links = {
    product: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Creators', href: '/#creators' },
      { label: 'FAQ', href: '/#faq' },
    ],
    company: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '/blog' },
      { label: 'Careers', href: '#' },
      { label: 'Press', href: '#' },
    ],
    legal: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Cookies', href: '/cookies' },
    ],
    support: [
      { label: 'Help Center', href: '/help-center' },
      { label: 'Contact', href: 'https://telegram.me/exclu_support', external: true },
    ],
  };

  const socials = [
    { icon: Instagram, label: 'Instagram', href: 'https://www.instagram.com/exclu.at/' },
    { icon: XIcon, label: 'X', href: 'https://x.com/exclu_at' },
    { icon: Send, label: 'Telegram', href: 'https://t.me/exclu_alternative' },
  ];

  return (
    <footer className="relative pt-20 pb-10 px-6 border-t border-white/20 bg-exclu-black text-exclu-cloud">
      {/* Subtle white/grey gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-white/10 opacity-25" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          {/* Logo & Tagline */}
          <div className="col-span-2 md:col-span-1">
            <img src={resolvedTheme === 'light' ? logoBlack : logoWhite} alt="Exclu" className="h-6 mb-4" />
            <p className="text-exclu-space text-sm leading-relaxed">
              Your content. Your revenue. No middleman.
            </p>
            {/* Social Icons */}
            <div className="flex gap-4 mt-6">
              {socials.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl border border-exclu-arsenic/40 bg-exclu-phantom flex items-center justify-center text-exclu-cloud hover:text-primary hover:bg-primary/20 transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-exclu-cloud mb-4">Product</h4>
            <ul className="space-y-3">
              {links.product.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-exclu-space hover:text-primary transition-colors text-sm">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold text-exclu-cloud mb-4">Legal</h4>
            <ul className="space-y-3">
              {links.legal.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-exclu-space hover:text-primary transition-colors text-sm">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h4 className="font-semibold text-exclu-cloud mb-4">Support</h4>
            <ul className="space-y-3">
              {links.support.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-exclu-space hover:text-primary transition-colors text-sm"
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-exclu-arsenic/40 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-exclu-graphite text-sm">
            © {new Date().getFullYear()}{' '}
            <a href="/" className="hover:text-primary transition-colors">Exclu</a>. All rights reserved.
          </p>
          <p className="text-exclu-graphite text-sm">
            Made with 💜 for creators
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
