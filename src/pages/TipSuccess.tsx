import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import StarBorder from '@/components/StarBorder';
import logoWhite from '@/assets/logo-white.svg';

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
    <div className="relative min-h-screen bg-black overflow-hidden flex flex-col items-center justify-center px-4">

      {/* Confetti + hearts */}
      <ConfettiCanvas />
      <FloatingHearts />

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(163,230,53,0.12) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/4 left-1/4 w-[300px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(250,204,21,0.07) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.3, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[250px] h-[250px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(244,114,182,0.07) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.2, 1], x: [0, -20, 0], y: [0, 20, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* Logo */}
      <motion.div
        className="fixed top-6 left-1/2 -translate-x-1/2 z-20"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <img src={logoWhite} alt="Exclu" className="h-5" />
      </motion.div>

      {/* Card */}
      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
            className="relative z-10 w-full max-w-sm"
          >
            <StarBorder
              as="div"
              className="w-full"
              color="#a3e635"
              speed="4s"
              thickness={1}
            >
              <div className="relative rounded-[19px] bg-[#050a00] overflow-hidden">

                {/* Top glow line */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-lime-400/60 to-transparent" />

                <div className="p-7 flex flex-col items-center gap-6">

                  {/* Icon burst */}
                  <motion.div
                    className="relative"
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.3 }}
                  >
                    <div className="w-20 h-20 rounded-full bg-lime-400/10 border border-lime-400/30 flex items-center justify-center">
                      <motion.div
                        animate={{ scale: [1, 1.18, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <Heart className="w-9 h-9 text-lime-400 fill-lime-400" />
                      </motion.div>
                    </div>
                    {/* Sparkles */}
                    {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{
                          top: '50%',
                          left: '50%',
                          originX: 0,
                          originY: 0,
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                        transition={{ duration: 1.5, delay: 0.5 + i * 0.1, repeat: Infinity, repeatDelay: 2 }}
                      >
                        <div
                          style={{
                            transform: `rotate(${deg}deg) translateX(38px)`,
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: COLORS[i % COLORS.length],
                          }}
                        />
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* Title */}
                  <motion.div
                    className="text-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <p className="text-xs font-medium tracking-widest text-lime-400/80 uppercase mb-2">
                      Tip sent successfully
                    </p>
                    <h1 className="text-5xl font-black text-white leading-none">
                      {amountDollars ? (
                        <>
                          <motion.span
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.5 }}
                            className="inline-block bg-gradient-to-r from-lime-400 to-yellow-300 bg-clip-text text-transparent"
                          >
                            ${amountDollars}
                          </motion.span>
                        </>
                      ) : (
                        <span className="bg-gradient-to-r from-lime-400 to-yellow-300 bg-clip-text text-transparent">
                          Thank you!
                        </span>
                      )}
                    </h1>
                    {amountDollars && (
                      <p className="text-sm text-white/50 mt-1">sent to your creator</p>
                    )}
                  </motion.div>

                  {/* Creator card */}
                  {creator && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55 }}
                      className="w-full"
                    >
                      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm group cursor-pointer"
                        onClick={() => navigate(`/${creator.handle}`)}
                      >
                        {/* Avatar banner */}
                        {creator.avatar_url && (
                          <div className="relative h-24 overflow-hidden">
                            <motion.img
                              src={creator.avatar_url}
                              alt=""
                              className="w-full h-full object-cover object-top"
                              style={{ filter: 'blur(2px)', transform: 'scale(1.1)' }}
                              whileHover={{ scale: 1.15 }}
                              transition={{ duration: 0.5 }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />
                          </div>
                        )}

                        <div className="flex items-center gap-3 p-3 -mt-6 relative">
                          <motion.div
                            className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-lime-400/60 flex-shrink-0 shadow-lg shadow-lime-400/20"
                            whileHover={{ scale: 1.05, rotate: 2 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          >
                            {creator.avatar_url ? (
                              <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-lime-400/10 flex items-center justify-center">
                                <span className="text-lg font-bold text-lime-400">
                                  {(creator.display_name || '?').charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </motion.div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {creator.display_name || creator.handle}
                            </p>
                            <p className="text-xs text-white/50">@{creator.handle}</p>
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
                      transition={{ delay: 0.65 }}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Your message
                      </p>
                      <p className="text-sm text-white/80 italic">"{message}"</p>
                    </motion.div>
                  )}

                  {/* Divider */}
                  <div className="w-full h-px bg-white/10" />

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
                    className="w-full flex flex-col gap-2.5"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    {creator?.handle && (
                      <Button
                        type="button"
                        className="w-full rounded-2xl h-12 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all duration-200 hover:shadow-[0_0_20px_rgba(163,230,53,0.4)]"
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

                </div>
              </div>
            </StarBorder>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default TipSuccess;
