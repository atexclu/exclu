import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

const faqData = [
  {
    question: 'What is Exclu?',
    answer: 'Exclu is an all-in-one monetization platform that empowers creators to sell content directly to their audience without platform fees. Whether you\'re an influencer, model, coach, or artist, Exclu gives you full control, instant payouts, and a custom storefront.',
  },
  {
    question: 'Why should I choose Exclu over other platforms?',
    answer: 'Unlike traditional platforms that take up to 20% of your earnings and delay payments for weeks, Exclu charges 0% on creator earnings, pays out instantly, and supports custom domains, affiliate tools, and link-in-bio sales. It\'s built for freedom, speed, and profitability.',
  },
  {
    question: 'Is Exclu really free to use?',
    answer: 'Yes, signing up and using Exclu is completely free. We only take a small fee from customer transactions or offer premium tools for power users who want more advanced features.',
  },
  {
    question: 'How do I upload and sell my content?',
    answer: 'It\'s simple. Just drag and drop your videos, photos, ebooks, music, or any digital file onto your dashboard. Then set your price, publish the link, and start earning.',
  },
  {
    question: 'How do payouts work?',
    answer: 'You get paid instantly after every sale. Set up your bank account and cash out with just one click. No delays, no thresholds.',
  },
  {
    question: 'Is Exclu safe for my accounts and audience?',
    answer: 'Absolutely. Exclu uses secure payment processors, encrypted storage, and never asks for your social media login. Your audience stays yours, and your data is protected 24/7.',
  },
];

const FAQSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -80 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 100,
        damping: 15,
      },
    },
  };

  return (
    <section ref={ref} className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-exclu-phantom/20 to-transparent" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-10" />
      
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-exclu-steel text-sm font-semibold tracking-wider uppercase mb-4">
            Questions & Answers
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
            Frequently asked <span className="text-exclu-steel">questions</span>
          </h2>
          <p className="text-lg text-exclu-space max-w-2xl mx-auto">
            Everything you need to know about Exclu and how it works.
          </p>
        </motion.div>

        {/* FAQ Items */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="space-y-4"
        >
          {faqData.map((faq, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group"
            >
              <div
                className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${
                  openIndex === index
                    ? 'bg-exclu-phantom/60 border-exclu-arsenic/60'
                    : 'bg-exclu-phantom/30 border-exclu-arsenic/30 hover:bg-exclu-phantom/40 hover:border-exclu-arsenic/40'
                }`}
              >
                {/* Question */}
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full p-6 flex items-center justify-between gap-4 text-left"
                >
                  <span className={`text-lg font-semibold transition-colors duration-300 ${
                    openIndex === index ? 'text-white' : 'text-exclu-cloud'
                  }`}>
                    {faq.question}
                  </span>
                  <motion.div
                    animate={{ rotate: openIndex === index ? 45 : 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      openIndex === index
                        ? 'bg-white text-exclu-black'
                        : 'bg-exclu-arsenic/50 text-exclu-cloud group-hover:bg-exclu-arsenic'
                    }`}
                  >
                    <Plus className="w-5 h-5" />
                  </motion.div>
                </button>

                {/* Answer */}
                <motion.div
                  initial={false}
                  animate={{
                    height: openIndex === index ? 'auto' : 0,
                    opacity: openIndex === index ? 1 : 0,
                  }}
                  transition={{
                    height: { duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] },
                    opacity: { duration: 0.3, delay: openIndex === index ? 0.1 : 0 },
                  }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6">
                    <div className="h-px bg-exclu-arsenic/40 mb-4" />
                    <p className="text-exclu-space leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </motion.div>

                {/* Subtle left accent line */}
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: openIndex === index ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute left-0 top-0 bottom-0 w-1 bg-white origin-top"
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FAQSection;
