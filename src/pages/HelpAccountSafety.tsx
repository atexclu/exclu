import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Shield, User, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';

const HelpAccountSafety = () => {
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
            <span className="text-exclu-cloud/80">Account & safety</span>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Shield className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-exclu-cloud mb-2">
                Account & safety
              </h1>
              <p className="text-exclu-space text-sm sm:text-base max-w-2xl">
                Learn how to keep your creator account secure, protect your audience and report suspicious activity.
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
                  <User className="h-4 w-4 text-primary" />
                  Updating your creator profile
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  Keep your public information accurate: display name, bio and links should reflect what you actually
                  offer on Exclu. This builds trust with fans and reduces confusion.
                </p>
                <p>
                  If you change your main social handles or want to reposition your content, update your description and
                  key links so new fans always land in the right place.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lock className="h-4 w-4 text-primary" />
                  Security best practices
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  Use a strong, unique password for your Exclu account and avoid reusing credentials across platforms.
                </p>
                <p>
                  Be cautious with links or messages claiming to be &quot;official support&quot; if they do not come from known
                  channels. When in doubt, contact the team through the official Help Center.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Reporting fraudulent activity
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  If you suspect someone is abusing your content, impersonating you or scamming your fans, gather as
                  much evidence as possible: screenshots, URLs, timestamps and any relevant messages.
                </p>
                <p>
                  Then reach out to our support team from the contact form in the Help Center. Provide all details so we
                  can review, escalate and take appropriate action.
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
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-emerald-400/10 to-exclu-ink/90 border border-exclu-arsenic/70 p-5">
              <div className="absolute -top-10 -right-6 h-32 w-32 bg-primary/40 blur-3xl" />
              <div className="relative space-y-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-exclu-space/80">Illustration</p>
                <p className="text-sm sm:text-base font-medium text-exclu-cloud flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  A safer space for premium content.
                </p>
                <p className="text-xs text-exclu-space/80">
                  Exclu is built for premium creators and their audiences. Good safety habits on both sides keep the
                  ecosystem healthy.
                </p>
              </div>
            </div>

            <Card className="bg-exclu-ink/80 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Quick checklist
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-exclu-space space-y-1.5">
                <p>• Use a unique password for your account.</p>
                <p>• Keep your contact email up to date.</p>
                <p>• Double-check URLs before logging in or sharing sensitive info.</p>
              </CardContent>
            </Card>
          </motion.aside>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HelpAccountSafety;
