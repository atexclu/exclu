import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { PlanCard } from '@/components/pricing/PlanCard';

const Pricing = () => {
  const navigate = useNavigate();
  const goSubscribe = (plan: 'monthly' | 'annual') =>
    navigate(`/app/settings?subscribe=${plan}`);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-exclu-cloud mb-4">
            Pricing
          </h1>
          <p className="text-exclu-space text-base sm:text-lg max-w-xl mx-auto">
            Start for free and keep 100% of your revenue when you go Pro.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            <PlanCard
              name="Free"
              priceLabel="$0"
              priceSuffix="/forever"
              description="Start selling with no upfront cost."
              features={[
                '15% platform commission',
                '15% processing fee paid by the fan',
                'Unlimited links, tips, custom requests, and gifts',
                'Single creator profile',
              ]}
              ctaLabel="Current plan"
              onCta={() => {}}
              ctaDisabled
            />
            <PlanCard
              name="Pro Monthly"
              priceLabel="$39.99"
              priceSuffix="/month"
              description="Keep 100% of your sales. Up to 2 profiles included, $10/mo per extra profile."
              features={[
                '0% platform commission on every sale',
                'Up to 2 profiles included',
                'Additional profiles $10/mo each, billed monthly',
                'All Free features',
              ]}
              badge="Popular"
              highlighted
              ctaLabel="Upgrade to Monthly"
              onCta={() => goSubscribe('monthly')}
            />
            <PlanCard
              name="Pro Annual"
              priceLabel="$239.99"
              priceSuffix="/year"
              description="Best value. Unlimited profiles, save 50% vs monthly."
              features={[
                '0% platform commission',
                'Unlimited profiles (up to 50)',
                '2 months free vs monthly billing',
                'All Free features',
              ]}
              badge="Best value"
              ctaLabel="Upgrade to Annual"
              onCta={() => goSubscribe('annual')}
            />
          </div>

          <p className="mt-8 text-center text-sm text-exclu-space/80">
            On the Free plan, a 15% processing fee is added to the fan&apos;s checkout total. Pro plans have no platform commission — standard payment provider fees may apply.
          </p>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default Pricing;
