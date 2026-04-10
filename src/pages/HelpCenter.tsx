import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Search, CreditCard, Link2, Shield, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const HelpCenter = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        {/* Hero + Search */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-3">
              Help Center
            </h1>
            <p className="text-exclu-space text-base sm:text-lg max-w-2xl mx-auto">
              Find answers about payouts, paywalled links, account security and getting started with Exclu.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-2xl mx-auto"
          >
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-exclu-phantom/60 border border-exclu-arsenic/60 rounded-2xl px-4 py-3 shadow-glow-sm">
              <div className="flex items-center gap-3 flex-1">
                <Search className="w-5 h-5 text-exclu-graphite" />
                <Input
                  placeholder="Search help articles (e.g. payouts, pricing, links)"
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm sm:text-base"
                />
              </div>
              <Button
                type="button"
                variant="hero"
                size="sm"
                className="whitespace-nowrap px-5"
              >
                Search
              </Button>
            </div>
          </motion.div>
        </section>

        {/* Categories */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            <a
              href="/help-center/getting-started"
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-3xl"
            >
              <Card className="bg-exclu-phantom/60 border-exclu-arsenic/70 group-hover:border-primary/50 transition-colors duration-300">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <HelpCircle className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">Getting started</CardTitle>
                  </div>
                  <CardDescription>
                    Learn how Exclu works, who it&apos;s for, and how to publish your first paid link.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-exclu-space space-y-1">
                  <p>• What is Exclu and how does it work?</p>
                  <p>• Which content can I sell?</p>
                  <p>• How do fans unlock my content?</p>
                </CardContent>
              </Card>
            </a>

            <a
              href="/help-center/payouts-pricing"
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-3xl"
            >
              <Card className="bg-exclu-phantom/60 border-exclu-arsenic/70 group-hover:border-primary/50 transition-colors duration-300">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">Payouts & pricing</CardTitle>
                  </div>
                  <CardDescription>
                    Understand pricing, 0% commission, payout timelines and supported currencies.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-exclu-space space-y-1">
                  <p>• How does 0% commission work?</p>
                  <p>• When do I get paid?</p>
                  <p>• How are refunds handled?</p>
                </CardContent>
              </Card>
            </a>

            <a
              href="/help-center/links-content"
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-3xl"
            >
              <Card className="bg-exclu-phantom/60 border-exclu-arsenic/70 group-hover:border-primary/50 transition-colors duration-300">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Link2 className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">Links & content</CardTitle>
                  </div>
                  <CardDescription>
                    Details on paywalled links, file types, previews and how fans experience unlocks.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-exclu-space space-y-1">
                  <p>• Creating a paid link</p>
                  <p>• Updating or disabling content</p>
                  <p>• Sharing links on social platforms</p>
                </CardContent>
              </Card>
            </a>

            <a
              href="/help-center/account-safety"
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-3xl"
            >
              <Card className="bg-exclu-phantom/60 border-exclu-arsenic/70 group-hover:border-primary/50 transition-colors duration-300">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">Account & safety</CardTitle>
                  </div>
                  <CardDescription>
                    Manage your creator account, security settings and fan safety.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-exclu-space space-y-1">
                  <p>• Updating your profile</p>
                  <p>• Security best practices</p>
                  <p>• Reporting fraudulent activity</p>
                </CardContent>
              </Card>
            </a>
          </motion.div>
        </section>

        {/* FAQ snapshot */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-exclu-cloud mb-4 text-center">
              Frequently asked questions
            </h2>
            <p className="text-exclu-space text-sm sm:text-base mb-6 text-center">
              A quick overview of the questions creators ask most often when getting started with Exclu.
            </p>

            <Accordion type="single" collapsible className="bg-exclu-phantom/60 border border-exclu-arsenic/70 rounded-2xl px-4 sm:px-6">
              <AccordionItem value="what-is-exclu">
                <AccordionTrigger className="text-left text-exclu-cloud">
                  What is Exclu and who is it for?
                </AccordionTrigger>
                <AccordionContent className="text-exclu-space text-sm sm:text-base">
                  Exclu is a paywall platform built for creators who want to sell photos, videos, files or exclusive
                  access using simple paid links. Fans unlock in one click without creating an account, and premium
                  creators keep 100% of their revenue.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="payouts">
                <AccordionTrigger className="text-left text-exclu-cloud">
                  How do payouts and 0% commission work?
                </AccordionTrigger>
                <AccordionContent className="text-exclu-space text-sm sm:text-base">
                  Exclu does not charge a platform commission on eligible premium accounts. You receive the full
                  amount your fans pay, minus standard payment processing fees from the provider. Payouts are processed
                  frequently so funds hit your account as fast as possible.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="fan-experience">
                <AccordionTrigger className="text-left text-exclu-cloud">
                  Do fans need to create an account to unlock content?
                </AccordionTrigger>
                <AccordionContent className="text-exclu-space text-sm sm:text-base">
                  No. Fans simply click your paid link, complete a secure payment and instantly unlock your content.
                  Removing mandatory account creation significantly reduces friction and boosts conversion.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="support">
                <AccordionTrigger className="text-left text-exclu-cloud">
                  How can I contact support if something goes wrong?
                </AccordionTrigger>
                <AccordionContent className="text-exclu-space text-sm sm:text-base">
                  If you&apos;re experiencing an issue with payouts, links or content access, you can reach our team
                  directly from the Contact page. Share as much detail as possible (links, screenshots, timestamps) so
                  we can investigate and resolve the problem quickly.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        </section>

        {/* Contact CTA */}
        <section>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="max-w-4xl mx-auto"
          >
            <div className="relative p-[1px] rounded-[28px] bg-gradient-to-br from-primary/60 via-exclu-iris/40 to-exclu-phantom/10">
              <div className="relative bg-exclu-phantom/80 backdrop-blur-xl border border-exclu-arsenic/70 rounded-[26px] px-6 sm:px-8 py-8 sm:py-10 overflow-hidden">
                <div className="pointer-events-none absolute -top-24 -right-10 h-56 w-56 bg-primary/20 blur-3xl" />

                <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)] items-start">
                  <div className="space-y-4">
                    <p className="inline-flex items-center gap-2 rounded-full bg-exclu-ink/80 px-3 py-1 text-[11px] font-medium text-exclu-cloud/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Typically replies in under 24 hours
                    </p>
                    <h3 className="text-xl sm:text-2xl font-semibold text-exclu-cloud">
                      Still need help?
                    </h3>
                    <p className="text-sm sm:text-base text-exclu-space">
                      Describe your issue, share your Exclu links and tell us what happened. Our team will investigate
                      and get back to you as soon as possible.
                    </p>
                    <ul className="space-y-1.5 text-xs sm:text-sm text-exclu-space/80">
                      <li className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        Priority support for premium creators
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        Issues with payouts, paywalled links or content access
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        Suggestions to improve the product
                      </li>
                    </ul>
                  </div>

                  <form
                    className="space-y-4"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-exclu-space mb-1" htmlFor="help-name">
                          Name
                        </label>
                        <Input
                          id="help-name"
                          placeholder="How should we call you?"
                          className="bg-exclu-ink/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/60 focus-visible:ring-primary/60 focus-visible:ring-offset-0"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-exclu-space mb-1" htmlFor="help-email">
                          Email
                        </label>
                        <Input
                          id="help-email"
                          type="email"
                          placeholder="you@example.com"
                          pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
                          title="Please enter a valid email address"
                          className="bg-exclu-ink/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/60 focus-visible:ring-primary/60 focus-visible:ring-offset-0"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-exclu-space mb-1" htmlFor="help-subject">
                        Subject
                      </label>
                      <Input
                        id="help-subject"
                        placeholder="Payout issue, link not working, feature request..."
                        className="bg-exclu-ink/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/60 focus-visible:ring-primary/60 focus-visible:ring-offset-0"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-exclu-space mb-1" htmlFor="help-message">
                        What can we help you with?
                      </label>
                      <textarea
                        id="help-message"
                        placeholder="Share as much detail as you can – links, timestamps, what you expected vs what happened."
                        className="w-full min-h-[120px] rounded-2xl bg-exclu-ink/60 border border-exclu-arsenic/70 px-3 py-2 text-sm text-exclu-cloud placeholder:text-exclu-space/60 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent resize-none"
                        required
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-[11px] text-exclu-space/70">
                        We use your email only to reply to your request. No spam, ever.
                      </p>
                      <Button
                        type="submit"
                        variant="hero"
                        size="lg"
                        className="inline-flex items-center gap-2 px-6"
                      >
                        Send message
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[10px]">
                          ↗
                        </span>
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HelpCenter;
