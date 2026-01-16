import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { HelpCircle, Rocket, Sparkles, MousePointerClick, Link2 } from 'lucide-react';

const HelpGettingStarted = () => {
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
            <span className="text-exclu-cloud/80">Getting started</span>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <HelpCircle className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-exclu-cloud mb-2">
                Getting started with Exclu
              </h1>
              <p className="text-exclu-space text-sm sm:text-base max-w-2xl">
                Understand what Exclu is built for, who it serves and how to publish your first paid link in a few
                minutes.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="space-y-6"
          >
            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-4 w-4 text-primary" />
                  What is Exclu?
                </CardTitle>
                <CardDescription>
                  A paywall layer for creators who want to sell exclusive content through simple paid links.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-invert max-w-none text-sm text-exclu-space">
                <p>
                  Exclu sits between your audience and your content. Instead of sending fans to complex platforms,
                  you share a single paid link. Once the payment is confirmed, fans instantly unlock your photos,
                  videos, files or access.
                </p>
                <p>
                  There is no mandatory fan account, no feed to maintain and no algorithm to fight. You stay in
                  control of what you sell and where you share it.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Rocket className="h-4 w-4 text-primary" />
                  Who is Exclu for?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>Exclu is designed for creators who:</p>
                <ul className="list-none space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>Sell photos, videos, packs or files directly to their audience.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>Promote content on social platforms without sending fans to a complex profile.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>Want a lightweight paywall they can plug anywhere in their online presence.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MousePointerClick className="h-4 w-4 text-primary" />
                  Your first paid link in 3 steps
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-exclu-space">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-exclu-ink/70 border border-exclu-arsenic/60 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-exclu-space/70 mb-1">Step 1</p>
                    <p className="font-medium text-exclu-cloud mb-1.5">Upload your content</p>
                    <p className="text-xs text-exclu-space/80">
                      Add photos, videos or files you want to sell. Set a clear title and short description.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-exclu-ink/70 border border-exclu-arsenic/60 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-exclu-space/70 mb-1">Step 2</p>
                    <p className="font-medium text-exclu-cloud mb-1.5">Choose the price</p>
                    <p className="text-xs text-exclu-space/80">
                      Set a one-time price that fits your audience. You keep 100% of the revenue on eligible accounts.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-exclu-ink/70 border border-exclu-arsenic/60 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-exclu-space/70 mb-1">Step 3</p>
                    <p className="font-medium text-exclu-cloud mb-1.5">Share the link</p>
                    <p className="text-xs text-exclu-space/80">
                      Copy your paid link and share it on social media, messaging apps, your website or link-in-bio.
                    </p>
                  </div>
                </div>
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
              <div className="relative">
                <p className="text-[11px] uppercase tracking-[0.18em] text-exclu-space/80 mb-2">Illustration</p>
                <p className="text-sm sm:text-base font-medium text-exclu-cloud mb-1.5">
                  A paywall built for links, not feeds.
                </p>
                <p className="text-xs text-exclu-space/80 mb-3">
                  Think of Exclu as a smart layer between your content and your audience. You choose what&apos;s behind the
                  paywall and where the link lives.
                </p>
                <div className="flex items-center gap-2 text-[11px] text-exclu-cloud/80">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
                    <Link2 className="h-3 w-3" />
                  </span>
                  <span>Social post → Exclu link → Instant unlock.</span>
                </div>
              </div>
            </div>

            <Card className="bg-exclu-ink/80 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Tips to get the most out of Exclu
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-exclu-space space-y-2.5">
                <p>
                  Start with one or two strong products instead of a long catalog. Make sure the value behind the
                  paywall is obvious from the title and preview.
                </p>
                <p>
                  Share your links where your audience already talks to you: DMs, group chats, private communities and
                  social posts with clear calls to action.
                </p>
                <Button variant="hero" size="sm" className="mt-1">
                  Explore payouts & pricing
                </Button>
              </CardContent>
            </Card>
          </motion.aside>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HelpGettingStarted;
