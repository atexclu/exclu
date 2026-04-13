import AppShell from '@/components/AppShell';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
    Copy, Check, Mail,
    ExternalLink, Send, ChevronRight,
    Loader2,
} from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    SiX, SiInstagram, SiTelegram, SiSnapchat,
} from 'react-icons/si';

const COMMISSION_RATE = 0.35;
const MIN_PAYOUT_CENTS = 10000;

const SHARE_MSG = `Still giving away 20% to OnlyFans ? 😅\n\nSmart 🔞 creators are moving to Exclu.\n\n0% commission 💸\nGet paid fast 💵\nSell from your bio, anywhere 🔗\n\nEvery day you wait = money lost.\n\nSwitch now 📲 exclu.at\n\n(Limited FREE access link)`;

const ReferralDashboard = () => {
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(true);
    const [referralCode, setReferralCode] = useState<string | null>(null);
    const [affiliateEarningsCents, setAffiliateEarningsCents] = useState(0);
    const [referrals, setReferrals] = useState<any[]>([]);
    const [referralLinkCopied, setReferralLinkCopied] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [isRequestingPayout, setIsRequestingPayout] = useState(false);
    const [payoutRequested, setPayoutRequested] = useState(false);
    const [myReferralBonus, setMyReferralBonus] = useState<{ eligible: boolean; unlocked: boolean; daysLeft: number } | null>(null);

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            setIsLoading(true);

            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) { navigate('/auth'); return; }

            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name, handle, referral_code, affiliate_earnings_cents, affiliate_payout_requested_at')
                .eq('id', user.id)
                .single();

            if (!isMounted) return;

            if (profile) {
                setAffiliateEarningsCents(profile.affiliate_earnings_cents || 0);
                if (profile.affiliate_payout_requested_at) setPayoutRequested(true);

                let code = profile.referral_code;
                if (!code) {
                    const prefix = (profile.handle || 'exclu').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 6);
                    code = `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
                    await supabase.from('profiles').update({ referral_code: code }).eq('id', user.id);
                }
                setReferralCode(code);

                const { data: referralsData } = await supabase
                    .from('referrals')
                    .select('id, referred_id, status, commission_earned_cents, created_at')
                    .eq('referrer_id', user.id)
                    .order('created_at', { ascending: false });

                const { data: myReferralRow } = await supabase
                    .from('referrals')
                    .select('created_at, bonus_paid_to_referred')
                    .eq('referred_id', user.id)
                    .maybeSingle();

                if (myReferralRow && isMounted) {
                    const signupDate = new Date(myReferralRow.created_at);
                    const diffDays = (Date.now() - signupDate.getTime()) / (1000 * 3600 * 24);
                    setMyReferralBonus({
                        eligible: diffDays <= 90,
                        unlocked: myReferralRow.bonus_paid_to_referred === true,
                        daysLeft: Math.max(0, Math.ceil(90 - diffDays)),
                    });
                }

                if (referralsData && referralsData.length > 0 && isMounted) {
                    const referredIds = referralsData.map((r: any) => r.referred_id);
                    const { data: referredProfiles } = await supabase
                        .from('profiles')
                        .select('id, handle, display_name, avatar_url')
                        .in('id', referredIds);
                    const profileMap = new Map((referredProfiles || []).map((p: any) => [p.id, p]));
                    setReferrals(referralsData.map((r: any) => {
                        const rp = profileMap.get(r.referred_id);
                        return { ...r, referred_handle: rp?.handle || null, referred_display_name: rp?.display_name || null };
                    }));
                }
            }

            if (isMounted) setIsLoading(false);
        };

        load();
        return () => { isMounted = false; };
    }, [navigate]);

    const fmtAmt = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const referralLink = referralCode ? `${window.location.origin}/auth?mode=signup&ref=${referralCode}` : null;
    const totalReferred = referrals.length;
    const totalConverted = referrals.filter((r: any) => r.status === 'converted').length;
    const conversionRate = totalReferred > 0 ? Math.round((totalConverted / totalReferred) * 100) : 0;
    const canRequestPayout = affiliateEarningsCents >= MIN_PAYOUT_CENTS;

    const handleCopy = async () => {
        if (!referralLink) return;
        await navigator.clipboard.writeText(referralLink).catch(() => { });
        setReferralLinkCopied(true);
        setTimeout(() => setReferralLinkCopied(false), 2500);
    };

    const handleShare = (platform: string) => {
        if (!referralLink) return;
        const fullMsg = SHARE_MSG + '\n' + referralLink;
        const t = encodeURIComponent(fullMsg);
        const u = encodeURIComponent(referralLink);
        const m = encodeURIComponent(SHARE_MSG);
        if (platform === 'instagram') {
            navigator.clipboard.writeText(fullMsg).catch(() => { });
            toast.success('Message copied! Paste it on Instagram 📋');
            return;
        }
        const urls: Record<string, string> = {
            twitter: `https://twitter.com/intent/tweet?text=${t}`,
            telegram: `https://t.me/share/url?url=${u}&text=${m}`,
            snapchat: `https://www.snapchat.com/scan?attachmentUrl=${u}`,
        };
        if (urls[platform]) { window.open(urls[platform], '_blank', 'noopener,noreferrer'); }
        else { navigator.clipboard.writeText(fullMsg).catch(() => { }); }
    };

    const handleRequestPayout = async () => {
        setIsRequestingPayout(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const { error } = await supabase.functions.invoke('request-affiliate-payout', {
                body: {},
                headers: {
                    'x-supabase-auth': session?.access_token ?? '',
                },
            });
            if (error) throw error;
            setPayoutRequested(true);
            toast.success('Payout request sent! Our team will process it within 3 business days.');
        } catch {
            toast.error('Failed to send payout request. Please try again.');
        } finally {
            setIsRequestingPayout(false);
        }
    };

    const handleSendEmail = async () => {
        if (!inviteEmail || !inviteEmail.includes('@')) return;
        setIsSendingEmail(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const { error } = await supabase.functions.invoke('send-referral-invite', {
                body: { to_email: inviteEmail },
                headers: {
                    'x-supabase-auth': session?.access_token ?? '',
                },
            });
            if (!error) { setInviteEmail(''); toast.success(`Invite sent to ${inviteEmail}!`); }
            else { toast.error('Failed to send invite. Please try again.'); }
        } catch { toast.error('Failed to send invite. Please try again.'); }
        finally { setIsSendingEmail(false); }
    };

    const socialPlatformsList = [
        { p: 'twitter', label: 'X', icon: <SiX className="w-5 h-5" />, gradient: 'from-slate-900 to-slate-700' },
        { p: 'telegram', label: 'Telegram', icon: <SiTelegram className="w-5 h-5" />, gradient: 'from-sky-500 to-cyan-500' },
        { p: 'instagram', label: 'Instagram', icon: <SiInstagram className="w-5 h-5" />, gradient: 'from-[#f97316] to-[#ec4899]' },
        { p: 'snapchat', label: 'Snapchat', icon: <SiSnapchat className="w-5 h-5" />, gradient: 'from-yellow-300 to-yellow-500' },
    ];

    if (isLoading) {
        return (
            <AppShell>
                <main className="px-4 lg:px-6 pb-16 w-full overflow-x-hidden">
                    <div className="mt-16 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-exclu-space/60" />
                    </div>
                </main>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <main className="px-4 lg:px-6 pb-16 w-full overflow-x-hidden">
                {/* Header */}
                <section className="mt-4 sm:mt-6 mb-6">
                    <h1 className="text-xl sm:text-3xl font-extrabold text-exclu-cloud">Referral Program</h1>
                    <p className="text-sm text-exclu-space/70 mt-1">
                        Recruit creators and earn{' '}
                        <span className="text-primary font-semibold">{Math.round(COMMISSION_RATE * 100)}%</span>
                        {' '}of their premium subscription — recurring.
                    </p>
                </section>

                {/* Stat cards — identical to Dashboard referral tab */}
                <div className={`grid gap-4 grid-cols-2 ${myReferralBonus !== null ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} mb-6`}>
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70">
                        <p className="text-xs text-exclu-space mb-1">Affiliate earnings</p>
                        <div className="flex items-center gap-2">
                            <p className="text-2xl font-bold text-exclu-cloud">{fmtAmt(affiliateEarningsCents)}</p>
                            {payoutRequested && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Pending</span>
                            )}
                        </div>
                        <p className="text-[11px] text-exclu-space/80 mt-1">Cashout when earnings &gt; $100.</p>
                    </div>
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70">
                        <p className="text-xs text-exclu-space mb-1">Creators recruited</p>
                        <p className="text-2xl font-bold text-exclu-cloud">{totalReferred}</p>
                        <p className="text-[11px] text-exclu-space/80 mt-1">Signed up via your link.</p>
                    </div>
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70">
                        <p className="text-xs text-exclu-space mb-1">Conversion rate</p>
                        <p className="text-2xl font-bold text-exclu-cloud">{conversionRate}%</p>
                        <p className="text-[11px] text-exclu-space/80 mt-1">{totalConverted} premium out of {totalReferred}.</p>
                    </div>
                    {myReferralBonus !== null && (
                        <div className={`rounded-2xl border p-5 transition-colors ${myReferralBonus.unlocked ? 'border-green-500/60 bg-green-950/40 hover:border-green-400/70 hover:ring-1 hover:ring-green-400/70' : 'border-exclu-arsenic/60 bg-exclu-ink/80 hover:border-primary/70 hover:ring-1 hover:ring-primary/70'}`}>
                            <p className="text-xs text-exclu-space mb-1">Welcome bonus</p>
                            <p className={`text-2xl font-bold ${myReferralBonus.unlocked ? 'text-green-400' : 'text-exclu-cloud'}`}>$100.00</p>
                            <p className="text-[11px] text-exclu-space/80 mt-1">
                                {myReferralBonus.unlocked
                                    ? 'Unlocked — credited to your earnings.'
                                    : myReferralBonus.eligible
                                        ? `Make $1,000 in sales within ${myReferralBonus.daysLeft}d to unlock.`
                                        : 'Expired — $1,000 target not reached in time.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Payout request button */}
                {canRequestPayout && !payoutRequested && (
                    <div className="flex flex-col items-center gap-2 py-1 mb-6 max-w-full">
                        <Button
                            type="button"
                            variant="hero"
                            size="sm"
                            disabled={isRequestingPayout}
                            onClick={handleRequestPayout}
                            className="max-w-full whitespace-normal text-center h-auto py-2"
                        >
                            {isRequestingPayout
                                ? <><Loader2 className="w-4 h-4 animate-spin" />Sending request…</>
                                : <><ExternalLink className="w-4 h-4" /><span className="truncate">Request payout — {fmtAmt(affiliateEarningsCents)}</span></>}
                        </Button>
                        <p className="text-[10px] text-exclu-space/50 text-center">Payouts are processed manually within 3 business days.</p>
                    </div>
                )}

                {/* Referral link + email + social */}
                <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6 space-y-4 mb-4">
                    <div className="flex items-center gap-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Your referral link</p>
                        <div className="relative group/info">
                            <button type="button" className="w-4 h-4 rounded-full border border-exclu-arsenic/60 text-exclu-space/50 hover:text-exclu-cloud hover:border-exclu-space/60 transition-colors flex items-center justify-center">
                                <span className="text-[9px] font-bold leading-none">i</span>
                            </button>
                            <div className="
                                hidden sm:block
                                absolute left-0 bottom-[calc(100%+8px)] w-72 max-w-[calc(100vw-2rem)] z-50
                                rounded-2xl border border-slate-200 dark:border-exclu-arsenic/60
                                bg-white dark:bg-[#0e0e16]
                                shadow-xl p-4
                                opacity-0 translate-y-2 pointer-events-none
                                group-hover/info:opacity-100 group-hover/info:translate-y-0 group-hover/info:pointer-events-auto
                                transition-all duration-200 ease-out
                            ">
                                <p className="text-xs font-semibold text-slate-900 dark:text-exclu-cloud mb-2">How it works 💡</p>
                                <div className="space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-exclu-space/80">
                                    <p>
                                        <span className="font-medium text-slate-900 dark:text-exclu-cloud">For you :</span>{' '}
                                        We give you <span className="text-primary font-semibold">35%</span> of the revenue Exclu generates from your referrals. Withdrawals start at $100.
                                    </p>
                                    <p>
                                        <span className="font-medium text-slate-900 dark:text-exclu-cloud">For friends :</span>{' '}
                                        <span className="text-primary font-semibold">+$100</span> Bonus if they reach $1k in revenue within 90 days.
                                    </p>
                                    <p className="text-slate-400 dark:text-exclu-space/50 text-[10px] pt-1 border-t border-slate-200 dark:border-exclu-arsenic/40">
                                        *Each referral doubles as an entry ticket to win our monthly Mystery Box: Birkins, Cash Prizes.
                                    </p>
                                </div>
                                <div className="absolute -bottom-1.5 left-3 w-3 h-3 rotate-45 border-b border-r border-slate-200 dark:border-exclu-arsenic/60 bg-white dark:bg-[#0e0e16]" />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1 min-w-0 rounded-xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 px-4 py-3 flex items-center">
                            <p className="text-sm text-black dark:text-exclu-cloud font-mono truncate">{referralLink ?? 'Generating…'}</p>
                        </div>
                        <Button
                            type="button" size="lg"
                            variant={referralLinkCopied ? 'outline' : 'hero'}
                            className="rounded-xl px-5 flex-shrink-0 transition-all text-sm font-semibold"
                            onClick={handleCopy}
                            disabled={!referralLink}
                        >
                            {referralLinkCopied
                                ? <span className="flex items-center gap-1.5 text-green-400"><Check className="w-4 h-4" />Copied!</span>
                                : <span className="flex items-center gap-1.5"><Copy className="w-4 h-4" />Copy link</span>}
                        </Button>
                    </div>

                    <div>
                        <p className="text-[11px] text-exclu-space/60 mb-2 flex items-center gap-1.5"><Mail className="w-3 h-3" />Send a personal invite by email</p>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                placeholder="creator@example.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSendEmail(); }}
                                className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-exclu-arsenic/50 bg-white dark:bg-black/30 px-3 text-sm text-black dark:text-exclu-cloud placeholder:text-slate-400 dark:placeholder:text-exclu-space/40 outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            <Button
                                type="button" variant="hero" size="sm"
                                className="rounded-xl px-3 flex-shrink-0"
                                onClick={handleSendEmail}
                                disabled={isSendingEmail || !inviteEmail}
                            >
                                {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="flex items-center gap-1"><Send className="w-3 h-3" />Send</span>}
                            </Button>
                        </div>
                    </div>

                    <div>
                        <p className="text-[11px] text-exclu-space/60 mb-3">Share on social media</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {socialPlatformsList.map(({ p, label, icon, gradient }) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => handleShare(p)}
                                    className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border border-exclu-arsenic/60 bg-exclu-arsenic/10 hover:bg-exclu-arsenic/20 hover:border-exclu-arsenic/80 transition-all group"
                                >
                                    <div className={`w-9 h-9 rounded-full bg-gradient-to-r ${gradient} flex items-center justify-center text-white flex-shrink-0`}>
                                        {icon}
                                    </div>
                                    <p className="text-[10px] font-medium text-exclu-cloud/80 group-hover:text-exclu-cloud truncate w-full text-center">{label}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Activity table */}
                <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                    <div className="px-5 py-4 border-b border-exclu-arsenic/40 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Recruitment history</p>
                        {referrals.length > 0 && <p className="text-[11px] text-exclu-space/70">{referrals.length} creator{referrals.length > 1 ? 's' : ''}</p>}
                    </div>

                    {referrals.length === 0 && (
                        <p className="px-5 py-6 text-sm text-exclu-space/80">
                            No recruitments yet — share your link to start earning!
                        </p>
                    )}

                    {referrals.length > 0 && (
                        <>
                            {/* Desktop: table */}
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="text-xs uppercase text-exclu-space/70 border-b border-exclu-arsenic/60">
                                        <tr>
                                            <th className="px-5 py-2 text-left">Creator</th>
                                            <th className="px-3 py-2 text-left">Date</th>
                                            <th className="px-3 py-2 text-left">Status</th>
                                            <th className="px-3 py-2 text-right">Commission</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {referrals.map((r: any) => (
                                            <tr key={r.id} className="border-t border-exclu-arsenic/40 hover:bg-white/[0.02] transition-colors">
                                                <td className="px-5 py-3 text-exclu-cloud font-medium">
                                                    {r.referred_display_name || r.referred_handle || 'Anonymous'}
                                                    {r.referred_handle && <span className="ml-1.5 text-[11px] text-exclu-space/60">@{r.referred_handle}</span>}
                                                </td>
                                                <td className="px-3 py-3 text-exclu-space/80 text-xs">
                                                    {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === 'converted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                                                        : r.status === 'inactive' ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                                                            : 'bg-blue-500/10 text-blue-300 border border-blue-500/40'
                                                        }`}>
                                                        {r.status === 'converted' ? 'Premium' : r.status === 'inactive' ? 'Inactive' : 'Free'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right font-medium">
                                                    <span className={r.commission_earned_cents > 0 ? 'text-primary' : 'text-exclu-space/40'}>
                                                        {r.commission_earned_cents > 0 ? fmtAmt(r.commission_earned_cents) : '—'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Mobile: cards */}
                            <div className="sm:hidden divide-y divide-exclu-arsenic/40">
                                {referrals.map((r: any) => (
                                    <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-exclu-cloud font-medium truncate">
                                                {r.referred_display_name || r.referred_handle || 'Anonymous'}
                                            </p>
                                            <p className="text-[11px] text-exclu-space/60 mt-0.5">
                                                {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === 'converted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                                                : r.status === 'inactive' ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                                                    : 'bg-blue-500/10 text-blue-300 border border-blue-500/40'
                                                }`}>
                                                {r.status === 'converted' ? 'Premium' : r.status === 'inactive' ? 'Inactive' : 'Free'}
                                            </span>
                                            <span className={`text-xs font-medium ${r.commission_earned_cents > 0 ? 'text-primary' : 'text-exclu-space/40'}`}>
                                                {r.commission_earned_cents > 0 ? fmtAmt(r.commission_earned_cents) : '—'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </main>
        </AppShell>
    );
};

export default ReferralDashboard;
