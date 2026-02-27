import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';

const ReferralLandingSection = () => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-100px' });

    return (
        <section id="referral" className="relative py-24 sm:py-32 px-6 overflow-hidden bg-background">
            {/* Background subtleties */}
            <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-b from-primary/10 to-accent/10 rounded-full blur-[150px] pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-10" ref={ref}>
                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-12 sm:mb-16"
                >
                    <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wider uppercase mb-4 border border-primary/20">
                        Referral Program
                    </span>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-4 sm:mb-6">
                        Invite a friend and <span className="text-[#CFFF16]">Grow together</span>
                    </h2>
                    <p className="text-base sm:text-lg text-exclu-space">
                        How does it work ?
                    </p>
                </motion.div>

                {/* Cards container: Horizontal scroll on mobile, grid on desktop */}
                <div className="-mx-6 px-6 sm:mx-0 sm:px-0">
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="flex sm:grid sm:grid-cols-2 gap-6 pb-8 sm:pb-0 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scrollbar-hide"
                    >
                        {/* Card 1: For the recruiter */}
                        <div className="snap-center shrink-0 w-[85vw] sm:w-auto flex-1 relative rounded-[2rem] pt-8 px-6 pb-0 bg-gradient-to-br from-exclu-phantom/60 to-exclu-black/80 backdrop-blur-xl border border-exclu-arsenic/50 hover:border-[#CFFF16]/30 transition-colors duration-300 flex flex-col items-center justify-between text-center overflow-hidden">
                            <div className="mb-2 z-10 w-full">
                                <h3 className="text-2xl font-bold text-exclu-cloud mb-8">For you</h3>
                                <div className="text-6xl sm:text-[5.5rem] font-extrabold text-[#CFFF16] drop-shadow-[0_0_35px_rgba(207,255,22,0.4)] leading-none mb-10">
                                    +35%
                                    <div className="w-24 sm:w-48 h-[2px] mx-auto bg-gradient-to-r from-transparent via-[#CFFF16]/50 to-transparent mt-8" />
                                </div>
                                <p className="text-exclu-space text-base sm:text-lg mx-auto max-w-[280px]">
                                    We give you <span className="text-[#CFFF16]">35%</span> of the revenue Exclu generates from your referrals and <span className="text-[#CFFF16]">More*</span>...
                                </p>
                            </div>
                            <div className="mt-0 flex justify-center w-full">
                                <img
                                    src="/Referral gift for recruiter.png"
                                    alt="Referral gift for recruiter"
                                    className="max-h-48 sm:max-h-64 object-contain drop-shadow-2xl translate-y-4"
                                    loading="lazy"
                                />
                            </div>
                        </div>

                        {/* Card 2: For the friend */}
                        <div className="snap-center shrink-0 w-[85vw] sm:w-auto flex-1 relative rounded-[2rem] pt-8 px-6 pb-0 bg-gradient-to-br from-exclu-phantom/80 to-exclu-black/90 backdrop-blur-xl border-2 border-[#CFFF16]/20 shadow-glow-sm hover:shadow-glow-md transition-shadow duration-300 flex flex-col items-center justify-between text-center overflow-hidden">
                            <div className="mb-2 z-10 w-full">
                                <h3 className="text-2xl font-bold text-exclu-cloud mb-8">For friends</h3>
                                <div className="text-6xl sm:text-[5.5rem] font-extrabold text-[#CFFF16] drop-shadow-[0_0_35px_rgba(207,255,22,0.4)] leading-none mb-10">
                                    +$100
                                    <div className="w-24 sm:w-48 h-[2px] mx-auto bg-gradient-to-r from-transparent via-[#CFFF16]/50 to-transparent mt-8" />
                                </div>
                                <p className="text-exclu-space text-base sm:text-lg mx-auto max-w-[280px]">
                                    Bonus if they reach $1k in revenue within 90 days
                                </p>
                            </div>
                            <div className="mt-0 flex justify-center w-full">
                                <img
                                    src="/Referral gift for invited.png"
                                    alt="Referral gift for invited"
                                    className="max-h-56 sm:max-h-[22rem] object-contain drop-shadow-2xl translate-y-6 sm:translate-y-8 scale-105 sm:scale-110"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Mentions */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="text-center text-exclu-cloud/60 mt-4 sm:mt-6 text-[11px] sm:text-xs max-w-2xl mx-auto px-4"
                >
                    *Each referral doubles as an entry ticket to win our monthly Mystery Box: Birkins, Cash Prizes.
                </motion.p>
            </div>
        </section>
    );
};

export default ReferralLandingSection;
