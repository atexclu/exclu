import { motion } from 'framer-motion';
import logo from '@/assets/logo-white.svg';
import { Twitter, Instagram, MessageCircle } from 'lucide-react';

const Footer = () => {
  const links = {
    product: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Creators', href: '/#creators' },
      { label: 'FAQ', href: '/#faq' },
    ],
    company: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
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
      { label: 'Contact', href: '/contact' },
    ],
  };

  const socials = [
    { icon: Twitter, label: 'Twitter', href: 'https://twitter.com' },
    { icon: Instagram, label: 'Instagram', href: 'https://instagram.com' },
    { icon: MessageCircle, label: 'Discord', href: 'https://discord.com' },
  ];

  return (
    <footer className="relative pt-20 pb-10 px-6 border-t border-white/20 bg-exclu-black text-exclu-cloud">
      {/* Subtle white/grey gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-white/10 opacity-25" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          {/* Logo & Tagline */}
          <div className="col-span-2 md:col-span-1">
            <img src={logo} alt="Exclu" className="h-6 mb-4" />
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
                  <a href={link.href} className="text-exclu-space hover:text-primary transition-colors text-sm">
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
            © 2026 Exclu. All rights reserved.
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
