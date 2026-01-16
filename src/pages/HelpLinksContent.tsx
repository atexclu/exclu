import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Link2, Image, Film, MessageCircle, Share2 } from 'lucide-react';

const HelpLinksContent = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 pt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <div className="mb-4 text-xs sm:text-sm text-exclu-space flex items-center gap-2">
            <a href="/help-center" className="hover:text-primary transition-colors">Help Center</a>
            <span>/</span>
            <span className="text-exclu-cloud/80">Links & content</span>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Link2 className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-exclu-cloud mb-2">
                Links & content
              </h1>
              <p className="text-exclu-space text-sm sm:text-base max-w-2xl">
                Learn how paywalled links work on Exclu, which file types you can sell and how the fan experience looks
                like.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="space-y-6"
          >
            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-4 w-4 text-primary" />
                  What is a paywalled link?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  A paywalled link is a URL that leads to a secure purchase page for a specific piece of content or
                  content pack. Fans see a clear title, description, price and sometimes a preview before paying.
                </p>
                <p>
                  Once the payment is confirmed, the paywall disappears and the content becomes available instantly.
                  Fans can view, download or access it depending on the type of product you&apos;re selling.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Image className="h-4 w-4 text-primary" />
                  Supported content types
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  Exclu is built for visual and file-based content: photos, videos, bundles, PDFs and more. Over time,
                  more formats and interactive experiences will be added based on creator feedback.
                </p>
                <p>
                  Always make sure you have the rights to distribute the content you upload, and that it respects local
                  laws and platform policies.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Film className="h-4 w-4 text-primary" />
                  How fans experience unlocks
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  Fans land on a clean, focused page: title, price, short description and a secure payment button. After
                  payment, the content unlocks instantly without forcing them to create a full account.
                </p>
                <p>
                  This low-friction flow is designed to maximise conversions from social posts and DMs, where attention
                  spans are short.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-4"
          >
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-exclu-iris/20 to-exclu-ink/90 border border-exclu-arsenic/70 p-5">
              <div className="absolute -top-10 -right-6 h-32 w-32 bg-primary/40 blur-3xl" />
              <div className="relative space-y-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-exclu-space/80">Illustration</p>
                <p className="text-sm sm:text-base font-medium text-exclu-cloud flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  From social post to instant unlock.
                </p>
                <p className="text-xs text-exclu-space/80">
                  Share your link in a tweet, story or DM. Fans tap, pay and unlock in a few seconds, then can return to
                  their feed without friction.
                </p>
              </div>
            </div>

            <Card className="bg-exclu-ink/80 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Best practices for previews
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-exclu-space space-y-2.5">
                <p>
                  Use clear, honest previews that show the style and theme of your content without giving everything
                  away. Fans should understand what they are about to unlock.
                </p>
                <p>
                  Avoid clickbait: disappointed fans are less likely to buy again and more likely to ask for refunds or
                  open disputes.
                </p>
              </CardContent>
            </Card>
          </motion.aside>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HelpLinksContent;
