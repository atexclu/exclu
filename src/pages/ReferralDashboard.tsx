import AppShell from '@/components/AppShell';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Copy, Check, Mail, Users, TrendingUp, DollarSign,
    ExternalLink, Send, ChevronRight,
    Loader2, Share2, Clock, Zap,
} from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    SiX, SiInstagram, SiTiktok, SiTelegram, SiSnapchat,
} from 'react-icons/si';
import { getAuroraGradient } from '@/lib/auroraGradients';

// Commission rate (35%)
const COMMISSION_RATE = 0.35;
// Monthly Exclu premium price in USD (used for display only)
const PREMIUM_MONTHLY_USD = 39;
// Minimum payout threshold in cents
const MIN_PAYOUT_CENTS = 10000; // $100

interface ReferralRow {
    id: string;
    referred_id: string;
    status: 'pending' | 'converted' | 'inactive';
    commission_earned_cents: number;
    created_at: string;
    converted_at: string | null;
    // Joined from profiles
    referred_handle: string | null;
    referred_display_name: string | null;
    referred_avatar_url: string | null;
}

const SHARE_MESSAGE =
    `Still giving away 20% to OnlyFans ? 😅

Smart 🔞 creators are moving to Exclu.

0% commission 💸
Get paid fast 💵
Sell from your bio, anywhere 🔗

Every day you wait = money lost.

Switch now 📲 exclu.at

(Limited FREE access link)`;

const ReferralDashboard = () => {
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(true);
    const [referralCode, setReferralCode] = useState<string | null>(null);
    const [affiliateEarningsCents, setAffiliateEarningsCents] = useState(0);
    const [referrals, setReferrals] = useState<ReferralRow[]>([]);
    const [linkCopied, setLinkCopied] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const referralLink = referralCode
        ? `${window.location.origin}/auth?mode=signup&ref=${referralCode}`
        : null;

    // Stats derived from referrals
    const totalReferred = referrals.length;
    const totalConverted = referrals.filter((r) => r.status === 'converted').length;
    const conversionRate = totalReferred > 0 ? Math.round((totalConverted / totalReferred) * 100) : 0;

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            setIsLoading(true);

            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                navigate('/auth');
                return;
            }

            // Load profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name, handle, referral_code, affiliate_earnings_cents')
                .eq('id', user.id)
                .single();

            if (!isMounted) return;

            if (profile) {
                setAffiliateEarningsCents(profile.affiliate_earnings_cents || 0);

                let code = profile.referral_code;

                // Auto-generate referral code if missing (safety net)
                if (!code) {
                    const handlePrefix = (profile.handle || 'exclu').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 6);
                    const randomSuffix = Math.random().toString(36).substring(2, 8);
                    code = `${handlePrefix}-${randomSuffix}`;
                    await supabase.from('profiles').update({ referral_code: code }).eq('id', user.id);
                }

                setReferralCode(code);

                // Load referrals with joined profile data
                const { data: referralsData } = await supabase
                    .from('referrals')
                    .select('id, referred_id, status, commission_earned_cents, created_at, converted_at')
                    .eq('referrer_id', user.id)
                    .order('created_at', { ascending: false });

                if (!isMounted) return;

                if (referralsData && referralsData.length > 0) {
                    // Fetch referred profiles
                    const referredIds = referralsData.map((r: any) => r.referred_id);
                    const { data: referredProfiles } = await supabase
                        .from('profiles')
                        .select('id, handle, display_name, avatar_url')
                        .in('id', referredIds);

                    const profileMap = new Map<string, any>(
                        (referredProfiles || []).map((p: any) => [p.id, p])
                    );

                    const enriched: ReferralRow[] = referralsData.map((r: any) => {
                        const rp = profileMap.get(r.referred_id);
                        return {
                            ...r,
                            referred_handle: rp?.handle || null,
                            referred_display_name: rp?.display_name || null,
                            referred_avatar_url: rp?.avatar_url || null,
                        };
                    });

                    if (!isMounted) return;
                    setReferrals(enriched);
                }
            }

            if (isMounted) setIsLoading(false);
        };

        load();
        return () => { isMounted = false; };
    }, [navigate]);

    const handleCopyLink = async () => {
        if (!referralLink) return;
        try {
            await navigator.clipboard.writeText(referralLink);
            setLinkCopied(true);
            toast.success('Referral link copied!');
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2500);
        } catch {
            toast.error('Failed to copy link');
        }
    };

    const handleSendEmail = async () => {
        if (!inviteEmail || !inviteEmail.includes('@')) {
            toast.error('Please enter a valid email address');
            return;
        }

        setIsSendingEmail(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('Not authenticated');

            const { error } = await supabase.functions.invoke('send-referral-invite', {
                body: { to_email: inviteEmail },
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (error) throw error;

            toast.success(`Invite sent to ${inviteEmail}!`);
            setInviteEmail('');
        } catch (err: any) {
            console.error('[ReferralDashboard] send-referral-invite error:', err);
            toast.error('Failed to send invite. Please try again.');
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleSocialShare = (platform: string) => {
        if (!referralLink) return;
        const fullMessage = `${SHARE_MESSAGE}\n${referralLink}`;
        const text = encodeURIComponent(fullMessage);
        const encodedLink = encodeURIComponent(referralLink);
        const encodedMsg = encodeURIComponent(SHARE_MESSAGE);

        const urls: Record<string, string> = {
            twitter: `https://twitter.com/intent/tweet?text=${text}`,
            telegram: `https://t.me/share/url?url=${encodedLink}&text=${encodedMsg}`,
            snapchat: `https://www.snapchat.com/scan?attachmentUrl=${encodedLink}`,
        };

        const url = urls[platform];
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            // Instagram / TikTok — copy link + message since they don't support direct share URLs
            navigator.clipboard.writeText(fullMessage).catch(() => { });
            toast.info(`Message & link copied! Paste it on ${platform === 'instagram' ? 'Instagram' : 'TikTok'}.`);
        }
    };

    const formatAmount = (cents: number) =>
        `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const canRequestPayout = affiliateEarningsCents >= MIN_PAYOUT_CENTS;
    const gradientPreview = getAuroraGradient('purple_dream').preview;

    if (isLoading) {
        return (
            <AppShell>
                <main className="px-4 pb-16 max-w-4xl mx-auto">
                    <div className="mt-16 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-exclu-space/60" />
                    </div>
                </main>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <main className="px-4 pb-16 max-w-4xl mx-auto">
                {/* Header */}
                <section className="mt-4 sm:mt-6 mb-6">
                    <div className="flex items-center gap-2 mb-1">
                        <RouterLink
                            to="/app"
                            className="text-[11px] text-exclu-space/60 hover:text-exclu-space transition-colors"
                        >
                            Dashboard
                        </RouterLink>
                        <ChevronRight className="w-3 h-3 text-exclu-space/40" />
                        <span className="text-[11px] text-exclu-cloud/80">Referral</span>
                    </div>
                    <h1 className="text-xl sm:text-3xl font-extrabold text-exclu-cloud">
                        Referral Program
                    </h1>
                    <p className="text-sm text-exclu-space/70 mt-1">
                        Recruit creators and earn{' '}
                        <span className="text-primary font-semibold">{Math.round(COMMISSION_RATE * 100)}%</span>
                        {' '}of their premium subscription — recurring.
                    </p>
                </section>

                {/* Stats cards */}
                <section className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
                    {/* Earnings */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                        className="col-span-2 lg:col-span-1 rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                                <DollarSign className="w-4 h-4 text-primary" />
                            </div>
                            <p className="text-xs text-exclu-space">Total earned</p>
                        </div>
                        <p className="text-2xl font-bold text-exclu-cloud">
                            {formatAmount(affiliateEarningsCents)}
                        </p>
                        <p className="text-[11px] text-exclu-space/70 mt-1">
                            Credited to your earnings pot
                        </p>
                    </motion.div>

                    {/* Recruited */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center">
                                <Users className="w-4 h-4 text-blue-400" />
                            </div>
                            <p className="text-xs text-exclu-space">Recruited</p>
                        </div>
                        <p className="text-2xl font-bold text-exclu-cloud">{totalReferred}</p>
                        <p className="text-[11px] text-exclu-space/70 mt-1">Creators referred</p>
                    </motion.div>

                    {/* Converted */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-green-400" />
                            </div>
                            <p className="text-xs text-exclu-space">Conversion</p>
                        </div>
                        <p className="text-2xl font-bold text-exclu-cloud">{conversionRate}%</p>
                        <p className="text-[11px] text-exclu-space/70 mt-1">
                            {totalConverted} premium out of {totalReferred}
                        </p>
                    </motion.div>

                    {/* Payout */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
                                <Zap className="w-4 h-4 text-amber-400" />
                            </div>
                            <p className="text-xs text-exclu-space">Payout status</p>
                        </div>
                        <p className={`text-sm font-semibold ${canRequestPayout ? 'text-green-400' : 'text-exclu-space/60'}`}>
                            {canRequestPayout ? 'Ready to claim' : `${formatAmount(MIN_PAYOUT_CENTS - affiliateEarningsCents)} to go`}
                        </p>
                        <p className="text-[11px] text-exclu-space/70 mt-1">
                            Min. {formatAmount(MIN_PAYOUT_CENTS)} to request payout
                        </p>
                    </motion.div>
                </section>

                {/* How it works banner */}
                <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                    className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
                >
                    <p className="text-sm font-semibold text-exclu-cloud mb-1">
                        How it works 💡
                    </p>
                    <p className="text-xs text-exclu-space/80 leading-relaxed">
                        When a creator signs up with your link and goes premium, you earn{' '}
                        <span className="text-primary font-semibold">{Math.round(COMMISSION_RATE * 100)}%</span>
                        {' '}of their monthly subscription (≈{' '}
                        <span className="text-primary font-semibold">
                            {formatAmount(Math.round(PREMIUM_MONTHLY_USD * COMMISSION_RATE * 100))} / month
                        </span>
                        {' '}per creator), credited to your earnings pot as long as they stay premium.
                        Payouts are processed manually once you reach ${MIN_PAYOUT_CENTS / 100}.
                    </p>
                </motion.section>

                {/* Tab toggle */}
                <section className="mb-5">
                    <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
                        {[
                            { key: 'overview' as const, label: 'Share & Invite' },
                            { key: 'history' as const, label: `Activity (${totalReferred})` },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-4 py-1.5 rounded-full font-medium transition-all ${activeTab === tab.key
                                    ? 'bg-primary text-white dark:text-black shadow-sm'
                                    : 'hover:text-exclu-cloud'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </section>

                <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-4"
                        >
                            {/* Referral link card */}
                            <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Share2 className="w-4 h-4 text-exclu-space/60" />
                                    <p className="text-sm font-semibold text-exclu-cloud">Your referral link</p>
                                </div>

                                {referralLink ? (
                                    <div className="space-y-4">
                                        {/* Link display + copy */}
                                        <div className="flex gap-2">
                                            <div className="flex-1 min-w-0 rounded-xl border border-exclu-arsenic/50 bg-black/20 px-3 py-2.5">
                                                <p className="text-xs text-exclu-space/80 font-mono truncate">
                                                    {referralLink}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={linkCopied ? 'outline' : 'hero'}
                                                className="rounded-xl px-4 flex-shrink-0 transition-all"
                                                onClick={handleCopyLink}
                                            >
                                                {linkCopied ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <Check className="w-3.5 h-3.5 text-green-400" />
                                                        <span className="text-green-400">Copied!</span>
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5">
                                                        <Copy className="w-3.5 h-3.5" />
                                                        Copy
                                                    </span>
                                                )}
                                            </Button>
                                        </div>

                                        {/* Email invite */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Mail className="w-3.5 h-3.5 text-exclu-space/50" />
                                                <p className="text-xs text-exclu-space/60">Send a personal invite by email</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="email"
                                                    placeholder="creator@example.com"
                                                    value={inviteEmail}
                                                    onChange={(e) => setInviteEmail(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendEmail(); }}
                                                    className="flex-1 h-10 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="hero"
                                                    size="sm"
                                                    className="rounded-xl px-4 flex-shrink-0"
                                                    onClick={handleSendEmail}
                                                    disabled={isSendingEmail || !inviteEmail}
                                                >
                                                    {isSendingEmail ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <span className="flex items-center gap-1.5">
                                                            <Send className="w-3.5 h-3.5" />
                                                            Send
                                                        </span>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Social share buttons */}
                                        <div>
                                            <p className="text-[11px] text-exclu-space/60 mb-2">Share on social media</p>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    {
                                                        platform: 'twitter',
                                                        label: 'X (Twitter)',
                                                        icon: <SiX className="w-3.5 h-3.5" />,
                                                        gradient: 'from-slate-700 to-slate-900',
                                                    },
                                                    {
                                                        platform: 'telegram',
                                                        label: 'Telegram',
                                                        icon: <SiTelegram className="w-3.5 h-3.5" />,
                                                        gradient: 'from-sky-500 to-cyan-500',
                                                    },
                                                    {
                                                        platform: 'instagram',
                                                        label: 'Instagram',
                                                        icon: <SiInstagram className="w-3.5 h-3.5" />,
                                                        gradient: 'from-orange-500 to-pink-500',
                                                    },
                                                    {
                                                        platform: 'tiktok',
                                                        label: 'TikTok',
                                                        icon: <SiTiktok className="w-3.5 h-3.5" />,
                                                        gradient: 'from-[#ff0050] to-[#00f2ea]',
                                                    },
                                                    {
                                                        platform: 'snapchat',
                                                        label: 'Snapchat',
                                                        icon: <SiSnapchat className="w-3.5 h-3.5" />,
                                                        gradient: 'from-yellow-300 to-yellow-500',
                                                    },
                                                ].map(({ platform, label, icon, gradient }) => (
                                                    <motion.button
                                                        key={platform}
                                                        type="button"
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={() => handleSocialShare(platform)}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white bg-gradient-to-r ${gradient} shadow-sm`}
                                                    >
                                                        {icon}
                                                        {label}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-exclu-space/60">Generating your referral code…</p>
                                )}
                            </div>

                            {/* Payout / Earnings pot */}
                            <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <DollarSign className="w-4 h-4 text-exclu-space/60" />
                                    <p className="text-sm font-semibold text-exclu-cloud">Your earnings pot</p>
                                </div>
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-3xl font-bold text-exclu-cloud">
                                            {formatAmount(affiliateEarningsCents)}
                                        </p>
                                        <p className="text-xs text-exclu-space/60 mt-1">
                                            {canRequestPayout
                                                ? 'Payout available — contact us to request a withdrawal.'
                                                : `Accumulate ${formatAmount(MIN_PAYOUT_CENTS)} to unlock your first payout.`}
                                        </p>
                                    </div>
                                    {canRequestPayout && (
                                        <a
                                            href="mailto:hello@exclu.at?subject=Affiliate payout request"
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-black hover:opacity-90 transition-opacity"
                                            style={{ background: gradientPreview }}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Request payout
                                        </a>
                                    )}
                                </div>

                                {/* Progress bar */}
                                <div className="mt-4">
                                    <div className="h-1.5 rounded-full bg-exclu-arsenic/40 overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{
                                                background: gradientPreview,
                                                width: `${Math.min(100, (affiliateEarningsCents / MIN_PAYOUT_CENTS) * 100)}%`,
                                            }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, (affiliateEarningsCents / MIN_PAYOUT_CENTS) * 100)}%` }}
                                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                                        />
                                    </div>
                                    <div className="mt-1 flex justify-between">
                                        <span className="text-[10px] text-exclu-space/50">$0</span>
                                        <span className="text-[10px] text-exclu-space/50">${MIN_PAYOUT_CENTS / 100} min.</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.25 }}
                        >
                            <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                                {referrals.length === 0 ? (
                                    <div className="p-10 flex flex-col items-center gap-3 text-center">
                                        <div className="w-12 h-12 rounded-full bg-exclu-arsenic/30 flex items-center justify-center">
                                            <Users className="w-5 h-5 text-exclu-space/40" />
                                        </div>
                                        <p className="text-sm text-exclu-space/60">
                                            No recruitments yet — share your link to start earning!
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Table header */}
                                        <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-exclu-arsenic/40 text-[10px] uppercase tracking-widest text-exclu-space/50">
                                            <div className="col-span-5">Creator</div>
                                            <div className="col-span-3">Date</div>
                                            <div className="col-span-2">Status</div>
                                            <div className="col-span-2 text-right">Commission</div>
                                        </div>

                                        {/* Rows */}
                                        <div className="divide-y divide-exclu-arsenic/30">
                                            {referrals.map((referral, index) => (
                                                <motion.div
                                                    key={referral.id}
                                                    initial={{ opacity: 0, x: -8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ duration: 0.3, delay: index * 0.04 }}
                                                    className="grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-white/[0.02] transition-colors"
                                                >
                                                    {/* Creator */}
                                                    <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-exclu-arsenic/40">
                                                            {referral.referred_avatar_url ? (
                                                                <img
                                                                    src={referral.referred_avatar_url}
                                                                    alt={referral.referred_display_name || ''}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-exclu-space/60">
                                                                    {(referral.referred_display_name || referral.referred_handle || '?').charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-medium text-exclu-cloud truncate">
                                                                {referral.referred_display_name || referral.referred_handle || 'Anonymous'}
                                                            </p>
                                                            {referral.referred_handle && (
                                                                <p className="text-[10px] text-exclu-space/50 truncate">
                                                                    @{referral.referred_handle}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Date */}
                                                    <div className="col-span-3">
                                                        <p className="text-xs text-exclu-space/70 flex items-center gap-1">
                                                            <Clock className="w-3 h-3 text-exclu-space/40 flex-shrink-0" />
                                                            {formatDate(referral.created_at)}
                                                        </p>
                                                    </div>

                                                    {/* Status */}
                                                    <div className="col-span-2">
                                                        <span
                                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${referral.status === 'converted'
                                                                ? 'bg-green-500/15 text-green-400'
                                                                : referral.status === 'inactive'
                                                                    ? 'bg-red-500/10 text-red-400/80'
                                                                    : 'bg-amber-500/15 text-amber-400'
                                                                }`}
                                                        >
                                                            {referral.status === 'converted'
                                                                ? 'Premium'
                                                                : referral.status === 'inactive'
                                                                    ? 'Inactive'
                                                                    : 'Pending'}
                                                        </span>
                                                    </div>

                                                    {/* Commission */}
                                                    <div className="col-span-2 text-right">
                                                        <p className={`text-xs font-semibold ${referral.commission_earned_cents > 0 ? 'text-primary' : 'text-exclu-space/40'}`}>
                                                            {referral.commission_earned_cents > 0
                                                                ? formatAmount(referral.commission_earned_cents)
                                                                : '—'}
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </AppShell>
    );
};

export default ReferralDashboard;
