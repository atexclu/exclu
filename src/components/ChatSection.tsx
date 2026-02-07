import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { MessageCircle, Heart, DollarSign, Users } from 'lucide-react';

const ChatSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const [visibleCount, setVisibleCount] = useState(0);

  const messages = [
    { isCreator: false, text: "Hey! Love your content 💜", time: "2:34 PM" },
    { isCreator: true, text: "Thank you so much! 🥰 I have some exclusive stuff you might like", time: "2:35 PM" },
    { isCreator: false, text: "Yes please! What do you have?", time: "2:35 PM" },
    { isCreator: true, text: "Check out my new photo set, I just sent you the link!", time: "2:36 PM" },
  ];

  // Reveal messages one by one when the section comes into view
  useEffect(() => {
    if (!isInView) return;
    if (visibleCount >= messages.length) return;

    const timeout = setTimeout(() => {
      setVisibleCount((prev) => (prev < messages.length ? prev + 1 : prev));
    }, 700);

    return () => clearTimeout(timeout);
  }, [isInView, visibleCount, messages.length]);

  return (
    <section className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[150px]" />

      <div className="max-w-7xl mx-auto relative z-10" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block text-primary text-sm font-semibold tracking-wider uppercase mb-4">
              Real Conversations
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
              Human chat.{' '}
              <span className="text-[#CFFF16]">Real connection.</span>
            </h2>
            <p className="text-lg text-exclu-space mb-8 leading-relaxed">
              Forget AI bots and automated replies. Exclu is built for authentic creator-fan relationships. Real conversations lead to real trust and real sales.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-6">
              {[
                { icon: Users, value: '3x', label: 'Higher engagement' },
                { icon: DollarSign, value: '45%', label: 'More revenue per fan' },
                { icon: Heart, value: '92%', label: 'Fan satisfaction' },
                { icon: MessageCircle, value: '24/7', label: 'Your schedule' },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                  className="glass-card rounded-2xl p-5"
                >
                  <stat.icon className="w-6 h-6 text-primary mb-3" />
                  <p className="text-2xl font-bold text-[#CFFF16]">{stat.value}</p>
                  <p className="text-sm text-exclu-graphite">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Chat Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="relative max-w-md mx-auto">
              {/* Chat Window */}
              <div className="glass-card rounded-3xl p-6 shadow-glow">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-exclu-arsenic/30">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-exclu-arsenic/60 bg-gradient-to-br from-primary/40 to-accent/40">
                    <img
                      src="/creators/IMG_8266.jpg"
                      alt="Creator profile"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-exclu-cloud">Sarah ✨</p>
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Online now
                    </p>
                  </div>
                  <div className="ml-auto">
                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                      Premium Fan
                    </span>
                  </div>
                </div>

                {/* Messages */}
                <div className="space-y-4 mb-6">
                  {messages.slice(0, visibleCount).map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                      transition={{ delay: 0.5 + index * 0.15, duration: 0.4 }}
                      className={`flex ${msg.isCreator ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          msg.isCreator
                            ? 'bg-gradient-to-r from-primary to-accent'
                            : 'bg-exclu-arsenic/80 border border-exclu-graphite/30'
                        }`}
                      >
                        <p className={`text-sm ${msg.isCreator ? 'text-exclu-black' : 'text-exclu-cloud'}`}>
                          {msg.text}
                        </p>
                        <p className={`text-[10px] mt-1 ${msg.isCreator ? 'text-exclu-graphite' : 'text-exclu-graphite'}`}>
                          {msg.time}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Input */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 glass rounded-xl px-4 py-3">
                    <span className="text-exclu-graphite text-sm">Type a message...</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>

              {/* Notification Bubble */}
              <motion.div
                className="absolute -top-4 -right-4 glass-card rounded-xl px-4 py-2"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-exclu-cloud">+$24.99</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ChatSection;
