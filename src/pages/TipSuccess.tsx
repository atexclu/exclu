import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import Aurora from '@/components/ui/Aurora';
import logo from '@/assets/logo-white.svg';

interface CreatorProfile {
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

/* ── Confetti particle ── */
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'rect' | 'circle' | 'star';
}

const COLORS = ['#a3e635', '#bef264', '#facc15', '#fb923c', '#f472b6', '#818cf8', '#38bdf8'];

function createParticle(id: number): Particle {
  return {
    id,
    x: Math.random() * window.innerWidth,
    y: -20,
    size: Math.random() * 8 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 3,
    vy: Math.random() * 3 + 2,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
    opacity: 1,
    shape: (['rect', 'circle', 'star'] as const)[Math.floor(Math.random() * 3)],
  };
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const spawnRef = useRef<number>(0);
  const spawnCount = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnBurst = () => {
      if (spawnCount.current < 180) {
        for (let i = 0; i < 6; i++) {
          particles.current.push(createParticle(Date.now() + i));
          spawnCount.current++;
        }
        spawnRef.current = window.setTimeout(spawnBurst, 40);
      }
    };
    spawnBurst();

    const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      const spikes = 5;
      const outerR = size;
      const innerR = size / 2;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      ctx.beginPath();
      ctx.moveTo(x, y - outerR);
      for (let i = 0; i < spikes; i++) {
        ctx.lineTo(x + Math.cos(rot) * outerR, y + Math.sin(rot) * outerR);
        rot += step;
        ctx.lineTo(x + Math.cos(rot) * innerR, y + Math.sin(rot) * innerR);
        rot += step;
      }
      ctx.lineTo(x, y - outerR);
      ctx.closePath();
    };

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current = particles.current.filter((p) => p.opacity > 0.01 && p.y < canvas.height + 40);

      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.rotation += p.rotationSpeed;
        if (p.y > canvas.height * 0.6) p.opacity -= 0.012;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'star') {
          drawStar(ctx, 0, 0, p.size / 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
      clearTimeout(spawnRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
      style={{ mixBlendMode: 'normal' }}
    />
  );
}

/* ── Floating hearts ── */
function FloatingHearts() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: `${10 + i * 11}%`, bottom: '-40px' }}
          animate={{ y: [0, -(window.innerHeight + 80)], opacity: [0, 0.7, 0] }}
          transition={{
            duration: 4 + Math.random() * 3,
            delay: i * 0.4,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        >
          <Heart
            className="fill-current"
            style={{
              color: COLORS[i % COLORS.length],
              width: `${12 + (i % 3) * 8}px`,
              height: `${12 + (i % 3) * 8}px`,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

/* ── Main page ── */
const TipSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  const handle = searchParams.get('creator');
  const amountCents = parseInt(searchParams.get('amount') || '0', 10);
  const message = searchParams.get('message');
  const amountDollars = amountCents > 0 ? (amountCents / 100).toFixed(2) : null;

  useEffect(() => {
    const load = async () => {
      if (handle) {
        const { data } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, handle')
          .eq('handle', handle)
          .maybeSingle();
        if (data) setCreator(data);
      }
      setIsLoading(false);
      setTimeout(() => setShowContent(true), 100);
    };
    load();
  }, [handle]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-lime-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black overflow-hidden flex flex-col text-white">

      {/* Aurora background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={['#a3e635', '#4ade80', '#86efac']}
          blend={0.45}
          amplitude={1.1}
          speed={0.8}
        />
      </div>

      {/* Confetti + hearts */}
      <ConfettiCanvas />
      <FloatingHearts />

      {/* Logo */}
      <motion.div
        className="fixed top-6 inset-x-0 z-20 flex justify-center pointer-events-none"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <img src={logo} alt="Exclu" className="h-5 w-auto pointer-events-auto" />
      </motion.div>

      {/* Content */}
      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22, delay: 0.1 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-24 gap-8 max-w-lg mx-auto w-full"
          >

            {/* Icon burst */}
            <motion.div
              className="relative"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.25 }}
            >
              <div className="w-24 h-24 rounded-full bg-lime-400/10 border border-lime-400/30 flex items-center justify-center backdrop-blur-sm">
                <motion.div
                  animate={{ scale: [1, 1.18, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Heart className="w-11 h-11 text-lime-400 fill-lime-400" />
                </motion.div>
              </div>
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{ top: '50%', left: '50%' }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                  transition={{ duration: 1.5, delay: 0.5 + i * 0.1, repeat: Infinity, repeatDelay: 2 }}
                >
                  <div
                    style={{
                      transform: `rotate(${deg}deg) translateX(46px)`,
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: COLORS[i % COLORS.length],
                    }}
                  />
                </motion.div>
              ))}
            </motion.div>

            {/* Title + amount */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <p className="text-xs font-semibold tracking-widest text-lime-400/80 uppercase mb-3">
                Tip sent successfully
              </p>
              <h1 className="text-7xl font-black leading-none">
                {amountDollars ? (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.5 }}
                    className="inline-block bg-gradient-to-r from-lime-400 to-yellow-300 bg-clip-text text-transparent"
                  >
                    ${amountDollars}
                  </motion.span>
                ) : (
                  <span className="bg-gradient-to-r from-lime-400 to-yellow-300 bg-clip-text text-transparent">
                    Thank you!
                  </span>
                )}
              </h1>
              {amountDollars && (
                <p className="text-base text-white/50 mt-2">sent to your creator</p>
              )}
            </motion.div>

            {/* Creator card */}
            {creator && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full"
              >
                <div
                  className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-md group cursor-pointer hover:border-lime-400/40 transition-colors"
                  onClick={() => navigate(`/${creator.handle}`)}
                >
                  {creator.avatar_url && (
                    <div className="relative h-28 overflow-hidden">
                      <motion.img
                        src={creator.avatar_url}
                        alt=""
                        className="w-full h-full object-cover object-top"
                        style={{ filter: 'blur(3px)', transform: 'scale(1.1)' }}
                        whileHover={{ scale: 1.15 }}
                        transition={{ duration: 0.5 }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-4 pb-4 -mt-7 relative">
                    <motion.div
                      className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-lime-400/60 flex-shrink-0 shadow-lg shadow-lime-400/20"
                      whileHover={{ scale: 1.05, rotate: 2 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    >
                      {creator.avatar_url ? (
                        <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-lime-400/10 flex items-center justify-center">
                          <span className="text-xl font-bold text-lime-400">
                            {(creator.display_name || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-white truncate">
                        {creator.display_name || creator.handle}
                      </p>
                      <p className="text-sm text-white/50">@{creator.handle}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-lime-400 transition-colors flex-shrink-0" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Message */}
            {message && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="w-full rounded-2xl border border-white/10 bg-black/20 backdrop-blur-sm px-5 py-4"
              >
                <p className="text-xs text-white/40 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  Your message
                </p>
                <p className="text-sm text-white/80 italic">"{message}"</p>
              </motion.div>
            )}

            {/* Thank you text */}
            <motion.p
              className="text-center text-sm text-white/50 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              Your support means the world to{' '}
              <span className="text-white/80 font-medium">
                {creator?.display_name || creator?.handle || 'this creator'}
              </span>
              . Thank you for being part of their journey ✨
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              className="w-full flex flex-col gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              {creator?.handle && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all duration-200 hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate(`/${creator.handle}`)}
                >
                  <ExternalLink className="w-4 h-4" />
                  Back to profile
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="w-full rounded-2xl h-11 text-white/40 hover:text-white/70 text-sm gap-2"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-4 h-4" />
                Go to home
              </Button>
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default TipSuccess;
