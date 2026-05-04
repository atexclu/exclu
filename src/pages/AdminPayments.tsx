/**
 * AdminPayments — /admin/payments
 *
 * Admin panel for managing withdrawal requests (payouts).
 *
 * Confirming a payout opens a dialog where the admin can attach an optional
 * wire date, an optional proof file (PDF/image), and an optional message.
 * The proof file is uploaded to the private `payout-proofs` bucket via a
 * signed-upload URL minted by the `sign-payout-proof-upload` edge function;
 * the resulting `proof_path` is then handed to `process-payout` so the row
 * is updated transactionally.
 *
 * The header also exposes the global "Next platform payout date" field —
 * a single value displayed to every creator on their earnings tab.
 */

import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Check,
  X,
  Clock,
  CircleCheck,
  CircleX,
  Banknote,
  Search,
  Upload,
  FileText,
  CalendarClock,
  Copy,
  Download,
  Send,
  ArrowDownToLine,
  Landmark,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface PayoutRecord {
  id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  bank_iban: string | null;
  bank_holder_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_routing_number: string | null;
  bank_bsb: string | null;
  bank_bic: string | null;
  bank_country: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  requested_at: string | null;
  processed_at: string | null;
  paid_at: string | null;
  proof_path: string | null;
  admin_message: string | null;
  created_at: string;
  creator_name: string | null;
  creator_email: string | null;
  creator_handle: string | null;
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'rejected';

const ALLOWED_PROOF_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf']);
const PROOF_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches the storage policy

// Postgres DATE columns return as 'YYYY-MM-DD'; full TIMESTAMPTZ columns
// arrive as ISO strings. Both should format cleanly without "Invalid Date".
function formatDate(value: string | null | undefined, opts?: { withTime?: boolean }): string | null {
  if (!value) return null;
  const isoLike = value.includes('T') ? value : `${value}T00:00:00Z`;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(opts?.withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function getExtension(file: File): string | null {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ALLOWED_PROOF_EXTENSIONS.has(fromName)) return fromName;
  // Fallback: derive from MIME type for files that arrive without an extension.
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'application/pdf') return 'pdf';
  return null;
}

export default function AdminPayments({ embedded = false }: { embedded?: boolean }) {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});

  // Per-row "downloading proof" state — keyed by payout id.
  const [proofLoadingId, setProofLoadingId] = useState<string | null>(null);

  // Confirmation dialog state — keyed by the payout being confirmed.
  const [confirmTarget, setConfirmTarget] = useState<PayoutRecord | null>(null);
  const [confirmPaidAt, setConfirmPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [confirmMessage, setConfirmMessage] = useState<string>('');
  const [confirmFile, setConfirmFile] = useState<File | null>(null);
  const [confirmUploading, setConfirmUploading] = useState(false);

  // Global "Next platform payout date" header state.
  const [nextPayoutDate, setNextPayoutDate] = useState<string>('');
  const [nextPayoutDateInput, setNextPayoutDateInput] = useState<string>('');
  const [savingNextDate, setSavingNextDate] = useState(false);

  useEffect(() => {
    fetchPayouts();
    fetchNextPayoutDate();
  }, []);

  const fetchNextPayoutDate = async () => {
    const { data } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'next_payout_date')
      .maybeSingle();
    const stored = (data?.value as { date?: string | null } | null)?.date ?? '';
    setNextPayoutDate(stored ?? '');
    setNextPayoutDateInput(stored ?? '');
  };

  const handleSaveNextDate = async () => {
    setSavingNextDate(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const value = nextPayoutDateInput.trim() || null;
      const { data, error } = await supabase.functions.invoke('update-platform-setting', {
        body: { key: 'next_payout_date', value: { date: value } },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || !(data as any)?.ok) throw new Error((data as any)?.error || 'Save failed');
      setNextPayoutDate(value ?? '');
      toast.success(value ? `Next payout set to ${value}` : 'Next payout date cleared');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save next payout date');
    } finally {
      setSavingNextDate(false);
    }
  };

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select(
          'id, creator_id, amount_cents, currency, status, bank_iban, bank_holder_name, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_bic, bank_country, admin_notes, rejection_reason, requested_at, processed_at, paid_at, proof_path, admin_message, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching payouts:', error);
        throw error;
      }

      // Fetch creator profiles for display names. Profiles are owner-readable
      // via RLS, so we fetch one-by-one (admins go through this loop too —
      // it's small enough that batching isn't worth the extra plumbing).
      const creatorIds = [...new Set((data ?? []).map((p) => p.creator_id))];
      const profileMap: Record<string, { display_name: string | null; handle: string | null }> = {};

      for (const cid of creatorIds) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, display_name, handle')
          .eq('id', cid)
          .maybeSingle();
        if (prof) {
          profileMap[cid] = { display_name: prof.display_name, handle: prof.handle };
        }
      }

      setPayouts(
        (data ?? []).map((p) => ({
          ...p,
          creator_name:
            profileMap[p.creator_id]?.display_name ||
            profileMap[p.creator_id]?.handle ||
            p.bank_holder_name ||
            null,
          creator_email: null,
          creator_handle: profileMap[p.creator_id]?.handle || null,
        })),
      );
    } catch (err) {
      console.error('Error fetching payouts:', err);
      toast.error('Failed to load payouts');
    } finally {
      setIsLoading(false);
    }
  };

  // Open the confirm dialog for a given payout — initialises the form fields
  // to sensible defaults (today's date, empty message, no file).
  const openConfirmDialog = (payout: PayoutRecord) => {
    setConfirmTarget(payout);
    setConfirmPaidAt(new Date().toISOString().slice(0, 10));
    setConfirmMessage('');
    setConfirmFile(null);
  };

  const closeConfirmDialog = () => {
    setConfirmTarget(null);
    setConfirmPaidAt(new Date().toISOString().slice(0, 10));
    setConfirmMessage('');
    setConfirmFile(null);
  };

  // Confirm flow:
  //   1. (optional) upload the proof file via a signed-upload URL.
  //   2. Call process-payout with paid_at / proof_path / admin_message.
  // Either step is optional — admins can confirm with nothing extra.
  const handleConfirmSubmit = async () => {
    if (!confirmTarget) return;
    setConfirmUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Session expired, please sign in again');

      let proofPath: string | null = null;
      if (confirmFile) {
        if (confirmFile.size > PROOF_MAX_BYTES) {
          throw new Error('Proof file is larger than 10 MB');
        }
        const ext = getExtension(confirmFile);
        if (!ext) {
          throw new Error('Unsupported proof format (png, jpg, webp, pdf)');
        }

        // Mint a signed upload URL scoped to <creator_id>/<payout_id>.<ext>.
        const { data: signData, error: signErr } = await supabase.functions.invoke('sign-payout-proof-upload', {
          body: { payout_id: confirmTarget.id, extension: ext },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (signErr || !(signData as any)?.ok) {
          throw new Error((signData as any)?.error || 'Failed to prepare proof upload');
        }
        const path = (signData as any).path as string;
        const token = (signData as any).token as string;

        const { error: uploadErr } = await supabase.storage
          .from('payout-proofs')
          .uploadToSignedUrl(path, token, confirmFile, { contentType: confirmFile.type, upsert: true });
        if (uploadErr) {
          throw new Error(`Proof upload failed: ${uploadErr.message}`);
        }
        proofPath = path;
      }

      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: {
          payout_id: confirmTarget.id,
          action: 'complete',
          paid_at: confirmPaidAt || null,
          proof_path: proofPath,
          admin_message: confirmMessage.trim() || null,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to confirm payout');
      }

      toast.success('Payout marked as paid');
      closeConfirmDialog();
      await fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to confirm payout');
    } finally {
      setConfirmUploading(false);
    }
  };

  // Sign a 5-min download URL for an existing proof and open in a new tab.
  // Bucket is private — this is the only way to access the file.
  const handleDownloadProof = async (payoutId: string) => {
    setProofLoadingId(payoutId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('get-payout-proof-url', {
        body: { payout_id: payoutId },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || !(data as any)?.ok) {
        throw new Error((data as any)?.error || 'Failed to load proof');
      }
      window.open((data as any).url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to load proof');
    } finally {
      setProofLoadingId(null);
    }
  };

  // Reject keeps its inline workflow (no proof needed). Admin notes are still
  // collected via a small input next to the button.
  const handleReject = async (payoutId: string) => {
    setProcessingId(payoutId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: {
          payout_id: payoutId,
          action: 'reject',
          admin_notes: rejectNotes[payoutId] || null,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to reject payout');
      }
      toast.success('Payout rejected, wallet re-credited');
      await fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject payout');
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = useMemo(
    () =>
      payouts.filter((p) => {
        if (statusFilter !== 'all') {
          if (statusFilter === 'pending') {
            if (!['pending', 'approved', 'processing'].includes(p.status)) return false;
          } else if (p.status !== statusFilter) {
            return false;
          }
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            (p.creator_name || '').toLowerCase().includes(q) ||
            (p.creator_email || '').toLowerCase().includes(q) ||
            (p.creator_handle || '').toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [payouts, statusFilter, searchQuery],
  );

  const content = (
    <div className={embedded ? '' : 'flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto w-full'}>
      {/* Global "Next platform payout date" — informative banner shown to every creator */}
      <div className="mb-6 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Next platform payout date</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shown to every creator on their earnings tab. Leave empty to hide.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={nextPayoutDateInput}
              onChange={(e) => setNextPayoutDateInput(e.target.value)}
              className="h-9 text-xs bg-background border-border/60 rounded-xl w-full sm:w-44"
            />
            <Button
              type="button"
              size="sm"
              variant="hero"
              onClick={handleSaveNextDate}
              disabled={savingNextDate || nextPayoutDateInput === nextPayoutDate}
              className="rounded-xl"
            >
              {savingNextDate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or payout ID..."
            className="pl-9 h-10 bg-muted/30 border-border/60 rounded-xl"
          />
        </div>
        <div className="flex gap-1 rounded-xl bg-muted/30 p-1 overflow-x-auto scrollbar-none">
          {(['all', 'pending', 'completed', 'rejected'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                statusFilter === s
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all'
                ? `All (${payouts.length})`
                : `${s.charAt(0).toUpperCase() + s.slice(1)} (${payouts.filter((p) =>
                    s === 'pending'
                      ? ['pending', 'approved', 'processing'].includes(p.status)
                      : p.status === s,
                  ).length})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Banknote className="w-6 h-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">No payouts found</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((payout, i) => {
            const isPending = ['pending', 'approved', 'processing'].includes(payout.status);
            const isCompleted = payout.status === 'completed';
            const isRejected = payout.status === 'rejected' || payout.status === 'failed';

            // Bank details — single source of truth used by every state.
            const bankType = payout.bank_account_type || 'iban';
            const bankCopy = bankType === 'iban' ? payout.bank_iban : payout.bank_account_number;
            const bankLabel = bankType === 'iban' ? 'IBAN' : 'Account';
            const bankFormatted = bankCopy
              ? bankType === 'iban'
                ? bankCopy.replace(/(.{4})/g, '$1 ').trim()
                : `••••${bankCopy.slice(-4)}`
              : null;

            const requestedLabel = formatDate(payout.requested_at ?? payout.created_at);
            const processedLabel = formatDate(payout.processed_at, { withTime: true });
            const paidLabel = formatDate(payout.paid_at);

            return (
              <motion.div
                key={payout.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`rounded-2xl border bg-card overflow-hidden ${
                  isPending
                    ? 'border-yellow-500/30'
                    : isCompleted
                      ? 'border-emerald-500/20'
                      : 'border-border/60'
                }`}
              >
                {/* ─────────────── PENDING ─────────────── */}
                {isPending && (
                  <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-yellow-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{payout.creator_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">
                            {payout.creator_email || payout.creator_id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs mt-3">
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-bold text-foreground text-sm tabular-nums">
                            ${(payout.amount_cents / 100).toFixed(2)}
                          </p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <p className="text-muted-foreground">Bank details</p>
                          {bankCopy ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(bankCopy);
                                toast.success(`${bankLabel} copied`);
                              }}
                              className="font-mono text-foreground text-left hover:text-primary transition-colors cursor-copy"
                              title={`Click to copy ${bankLabel}`}
                            >
                              {bankFormatted}
                              {bankType === 'us' && payout.bank_routing_number && (
                                <span className="text-muted-foreground ml-1">ABA: {payout.bank_routing_number}</span>
                              )}
                              {bankType === 'au' && payout.bank_bsb && (
                                <span className="text-muted-foreground ml-1">BSB: {payout.bank_bsb}</span>
                              )}
                            </button>
                          ) : (
                            <p className="text-foreground">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-muted-foreground">Holder</p>
                          <p className="text-foreground">{payout.bank_holder_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Country</p>
                          <p className="text-foreground uppercase tracking-wide">{payout.bank_country || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Requested</p>
                          <p className="text-foreground">{requestedLabel || '—'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-yellow-500/20 text-yellow-400">
                        {payout.status}
                      </span>
                      <div className="space-y-2 w-full sm:w-auto">
                        <Input
                          value={rejectNotes[payout.id] || ''}
                          onChange={(e) => setRejectNotes((prev) => ({ ...prev, [payout.id]: e.target.value }))}
                          placeholder="Reject reason (optional)"
                          className="h-9 text-xs bg-muted/30 border-border/60 rounded-xl w-full sm:w-56"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="hero"
                            onClick={() => openConfirmDialog(payout)}
                            disabled={processingId === payout.id || confirmUploading}
                            className="flex-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Mark paid
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(payout.id)}
                            disabled={processingId === payout.id || confirmUploading}
                            className="flex-1"
                          >
                            {processingId === payout.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─────────────── COMPLETED ─────────────── */}
                {/* Three vertical strata: hero (identity + actions), bank
                    block (recipient verification at a glance), timeline
                    chips (date forensics), and an optional message quote. */}
                {isCompleted && (
                  <div>
                    {/* Hero — identity + amount + actions */}
                    <div className="p-5 flex items-start justify-between gap-4 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center flex-shrink-0">
                          <CircleCheck className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-2xl font-extrabold text-foreground tabular-nums leading-none">
                            ${(payout.amount_cents / 100).toFixed(2)}
                            <span className="ml-1.5 text-[10px] font-bold tracking-[0.18em] text-muted-foreground align-middle">USD</span>
                          </p>
                          <p className="text-sm font-medium text-foreground/85 mt-1.5 truncate">
                            {payout.creator_name || 'Unknown'}
                            {payout.creator_handle && (
                              <span className="text-muted-foreground font-normal"> · @{payout.creator_handle}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {payout.proof_path && (
                          <button
                            type="button"
                            onClick={() => handleDownloadProof(payout.id)}
                            disabled={proofLoadingId === payout.id}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                            title="Download proof of payment"
                            aria-label="Download proof of payment"
                          >
                            {proofLoadingId === payout.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                          </button>
                        )}
                        <span className="text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full font-semibold bg-emerald-500/12 text-emerald-500 border border-emerald-500/25">
                          {payout.status}
                        </span>
                      </div>
                    </div>

                    {/* Bank block — single horizontal strip. The visual
                        context (bank icon + monospace) makes the IBAN/Account
                        label redundant; holder + country sit as quiet meta. */}
                    <div className="px-5 pb-4">
                      <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center flex-shrink-0">
                          <Landmark className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm text-foreground truncate" title={bankCopy ?? undefined}>
                            {bankFormatted || '—'}
                            {bankType === 'us' && payout.bank_routing_number && (
                              <span className="text-muted-foreground ml-2">ABA {payout.bank_routing_number}</span>
                            )}
                            {bankType === 'au' && payout.bank_bsb && (
                              <span className="text-muted-foreground ml-2">BSB {payout.bank_bsb}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {payout.bank_holder_name || '—'}
                            {payout.bank_country && <span> · {payout.bank_country}</span>}
                          </p>
                        </div>
                        {bankCopy && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(bankCopy);
                              toast.success(`${bankLabel} copied`);
                            }}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-background border border-transparent hover:border-border/60 transition-colors flex-shrink-0"
                            title={`Copy ${bankLabel}`}
                            aria-label={`Copy ${bankLabel}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Timeline chips — requested → processed → wired */}
                    <div className="px-5 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {requestedLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Requested <span className="text-foreground/80">{requestedLabel}</span>
                        </span>
                      )}
                      {processedLabel && (
                        <>
                          <span className="text-border">·</span>
                          <span className="inline-flex items-center gap-1.5">
                            <CircleCheck className="w-3 h-3" />
                            Processed <span className="text-foreground/80">{processedLabel}</span>
                          </span>
                        </>
                      )}
                      {paidLabel && (
                        <>
                          <span className="text-border">·</span>
                          <span className="inline-flex items-center gap-1.5">
                            <Send className="w-3 h-3 text-emerald-500" />
                            Wired <span className="text-foreground/80">{paidLabel}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Message — quoted block, accent border, only if present */}
                    {(payout.admin_message || payout.admin_notes) && (
                      <div className="px-5 pb-5 pt-1 space-y-2">
                        {payout.admin_message && (
                          <div className="border-l-2 border-emerald-500/40 pl-3 py-1 text-sm text-foreground/85 italic">
                            “{payout.admin_message}”
                          </div>
                        )}
                        {payout.admin_notes && (
                          <p className="text-[11px] text-muted-foreground/80">
                            <span className="font-semibold text-foreground/70">Internal note: </span>
                            {payout.admin_notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ─────────────── REJECTED ─────────────── */}
                {isRejected && (
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center flex-shrink-0">
                          <CircleX className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-bold text-foreground tabular-nums">
                            ${(payout.amount_cents / 100).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {payout.creator_name || 'Unknown'}
                            {payout.creator_handle && <span> · @{payout.creator_handle}</span>}
                            {payout.bank_country && <span className="uppercase"> · {payout.bank_country}</span>}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-full font-semibold bg-red-500/15 text-red-500 border border-red-500/25 flex-shrink-0">
                        {payout.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {requestedLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Requested <span className="text-foreground/80">{requestedLabel}</span>
                        </span>
                      )}
                      {processedLabel && (
                        <>
                          <span className="text-border">·</span>
                          <span className="inline-flex items-center gap-1.5">
                            <CircleX className="w-3 h-3 text-red-500" />
                            Rejected <span className="text-foreground/80">{processedLabel}</span>
                          </span>
                        </>
                      )}
                    </div>
                    {(payout.rejection_reason || payout.admin_notes) && (
                      <div className="mt-3 border-l-2 border-red-500/40 pl-3 py-1 text-sm text-foreground/85">
                        {payout.rejection_reason || payout.admin_notes}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confirm payout dialog */}
      <Dialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) closeConfirmDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              Confirm payout
              {confirmTarget && (
                <span className="ml-2 text-muted-foreground font-normal">
                  ${(confirmTarget.amount_cents / 100).toFixed(2)} → {confirmTarget.creator_name || 'Unknown'}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              All fields are optional. Anything you fill is shown to the creator in their withdrawal history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Wire date</label>
              <Input
                type="date"
                value={confirmPaidAt}
                onChange={(e) => setConfirmPaidAt(e.target.value)}
                className="h-10 bg-muted/30 border-border/60 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Proof of payment</label>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="proof-file-input"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-muted/30 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-border cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {confirmFile ? 'Change file' : 'Choose file'}
                </label>
                <input
                  id="proof-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="sr-only"
                  onChange={(e) => setConfirmFile(e.target.files?.[0] ?? null)}
                />
                {confirmFile ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                    <span className="truncate">{confirmFile.name}</span>
                    <span className="text-foreground/40 text-[10px] flex-shrink-0">
                      ({(confirmFile.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmFile(null)}
                      className="text-foreground/40 hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">PNG, JPG, WEBP or PDF · max 10 MB</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Message to creator</label>
              <textarea
                value={confirmMessage}
                onChange={(e) => setConfirmMessage(e.target.value)}
                placeholder="Optional — visible in their withdrawal history"
                rows={3}
                maxLength={1000}
                className="w-full bg-muted/30 border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
              />
              <p className="text-[10px] text-muted-foreground/60 text-right">
                {confirmMessage.length} / 1000
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeConfirmDialog} disabled={confirmUploading}>
              Cancel
            </Button>
            <Button type="button" variant="hero" onClick={handleConfirmSubmit} disabled={confirmUploading}>
              {confirmUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Confirming…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirm payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) return content;
  return (
    <AppShell>
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto w-full">{content}</main>
    </AppShell>
  );
}
