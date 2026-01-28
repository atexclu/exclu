import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { CreditCard, Wallet, TrendingUp, Shield, DollarSign } from 'lucide-react';

const HelpPayoutsPricing = () => {
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
            <span className="text-exclu-cloud/80">Payouts & pricing</span>
          </div>

          <div className="flex items-start gap-3 mb-4">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <CreditCard className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-exclu-cloud mb-2">
                Payouts & pricing
              </h1>
              <p className="text-exclu-space text-sm sm:text-base max-w-2xl">
                Learn how pricing works on Exclu, what 0% commission means in practice and when you get paid.
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
                  <DollarSign className="h-4 w-4 text-primary" />
                  0% commission on eligible accounts
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  Exclu does not charge a platform commission on eligible premium creator accounts. When a fan pays $10
                  for your content, you receive the full $10, minus standard payment processing fees from the provider.
                </p>
                <p>
                  This makes it easier to predict your revenue and to compare Exclu with other platforms that take
                  higher cuts on each transaction.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wallet className="h-4 w-4 text-primary" />
                  When do I get paid?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  Payouts are batched and sent to your connected payout method on a regular basis. The exact delay
                  depends on the payment provider and your region, but our goal is to make funds available as fast as
                  possible.
                </p>
                <p>
                  You&apos;ll see a clear overview of completed payments, pending payouts and any failed transactions in your
                  creator dashboard.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-exclu-phantom/70 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-4 w-4 text-primary" />
                  Refunds and disputes
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-exclu-space space-y-3">
                <p>
                  In rare cases, fans may request a refund or open a dispute through the payment provider. When this
                  happens, we review the situation and may temporarily hold the related payout until it is resolved.
                </p>
                <p>
                  Providing clear descriptions and delivering exactly what you promise behind each link reduces the
                  likelihood of disputes.
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
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Your revenue without the usual platform cut.
                </p>
                <p className="text-xs text-exclu-space/80">
                  Imagine a $20 content pack sold 100 times. On Exclu, you keep the full $2,000 before payment fees.
                  On a 20% platform, you would lose $400 to fees alone.
                </p>
              </div>
            </div>

            <Card className="bg-exclu-ink/80 border-exclu-arsenic/70">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Best practices for pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs sm:text-sm text-exclu-space space-y-2.5">
                <p>
                  Start by testing a few different price points on smaller audiences before scaling. Watch how many fans
                  convert at each price to find the sweet spot.
                </p>
                <p>
                  Make sure the perceived value matches the price: communicate clearly what&apos;s inside, how exclusive it
                  is and what fans will get immediately after paying.
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

export default HelpPayoutsPricing;
