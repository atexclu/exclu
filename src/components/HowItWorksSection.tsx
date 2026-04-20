import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Upload, Link2, Share2, Unlock, Wallet } from 'lucide-react';

const steps = [
  {
    icon: Upload,
    number: '01',
    title: 'Upload your content',
    description: 'Photos, videos, exclusive files, anything you want to monetize. It takes seconds.',
  },
  {
    icon: Link2,
    number: '02',
    title: 'Set your price',
    description: 'Choose how much your content is worth. You\'re in control of your value.',
  },
  {
    icon: Share2,
    number: '03',
    title: 'Share your link',
    description: 'Post it anywhere: Instagram, TikTok, Telegram, or your link-in-bio.',
  },
  {
    icon: Unlock,
    number: '04',
    title: 'Fans unlock instantly',
    description: 'One payment, immediate access. No signup, no friction, no lost sales.',
  },
  {
    icon: Wallet,
    number: '05',
    title: 'Get paid',
    description: 'Money hits your account fast. Real earnings, real fast.',
  },
];

const StepCard = ({ step }: { step: typeof steps[number] }) => (
  <div className="text-center group">
    <div className="relative mb-6 inline-flex">
      <div className="w-20 h-20 rounded-3xl bg-exclu-arsenic/60 border border-exclu-graphite/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 group-hover:shadow-glow">
        <step.icon className="w-8 h-8 text-primary" />
      </div>
      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-exclu-black">
        {step.number}
      </div>
    </div>
    <h3 className="text-lg font-bold text-exclu-cloud mb-2">{step.title}</h3>
    <p className="text-sm text-exclu-space leading-relaxed">{step.description}</p>
  </div>
);

const HowItWorksSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    loop: false,
    skipSnaps: false,
    containScroll: 'trimSnaps',
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <section id="how-it-works" className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

      <div className="max-w-6xl mx-auto relative z-10" ref={ref}>
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16 sm:mb-20"
        >
          <span className="inline-block text-primary text-sm font-semibold tracking-wider uppercase mb-4">
            How it works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
            From upload to payout in{' '}
            <span className="text-[#CFFF16]">minutes</span>
          </h2>
          <p className="text-lg text-exclu-space max-w-2xl mx-auto">
            No complicated setup. No approval process. Start earning from your content today.
          </p>
        </motion.div>

        {/* Steps — desktop grid */}
        <div className="hidden md:block relative">
          <div className="hidden lg:block absolute top-1/2 left-1/2 w-[80%] -translate-x-1/2 h-0.5 bg-gradient-to-r from-transparent via-exclu-arsenic to-transparent -translate-y-1/2" />

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 50 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="relative"
              >
                <StepCard step={step} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Steps — mobile Embla carousel */}
        <div className="md:hidden">
          <div className="overflow-hidden -mx-6 px-6" ref={emblaRef}>
            <div className="flex gap-4 touch-pan-y">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className="flex-[0_0_82%] min-w-0 first:pl-0"
                >
                  <div className="relative h-full rounded-3xl border border-exclu-arsenic/40 bg-gradient-to-b from-exclu-ink/80 to-exclu-black/40 p-6 backdrop-blur-sm">
                    <StepCard step={step} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dot indicators */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                onClick={() => emblaApi?.scrollTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === selectedIndex
                    ? 'w-6 bg-[#CFFF16]'
                    : 'w-1.5 bg-exclu-arsenic/80 hover:bg-exclu-space/80'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
