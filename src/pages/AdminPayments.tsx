/**
 * AdminPayments — /admin/payments
 *
 * Admin panel for managing withdrawal requests (payouts).
 * Lists all payouts, allows marking as completed or rejected.
 */

import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Check, X, Clock, CircleCheck, CircleX, Banknote, Search } from 'lucide-react';
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
  created_at: string;
  creator_name: string | null;
  creator_email: string | null;
  creator_handle: string | null;
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'rejected';

export default function AdminPayments({ embedded = false }: { embedded?: boolean }) {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPayouts();
  }, []);

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select('id, creator_id, amount_cents, currency, status, bank_iban, bank_holder_name, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_bic, bank_country, admin_notes, rejection_reason, requested_at, processed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching payouts:', error);
        throw error;
      }

      console.log('[AdminPayments] Fetched payouts:', data?.length ?? 0);

      // Fetch creator profiles for display names
      const creatorIds = [...new Set((data ?? []).map(p => p.creator_id))];
      let profileMap: Record<string, { display_name: string | null; handle: string | null; email?: string | null }> = {};

      if (creatorIds.length > 0) {
        // Profiles are readable by the owner via RLS, but we need all of them.
        // Use a workaround: fetch profiles individually (admin's own profile works, others may fail)
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
      }

      setPayouts((data ?? []).map(p => ({
        ...p,
        creator_name: profileMap[p.creator_id]?.display_name || profileMap[p.creator_id]?.handle || p.bank_holder_name || null,
        creator_email: null,
        creator_handle: profileMap[p.creator_id]?.handle || null,
      })));
    } catch (err) {
      console.error('Error fetching payouts:', err);
      toast.error('Failed to load payouts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcess = async (payoutId: string, action: 'complete' | 'reject') => {
    setProcessingId(payoutId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: {
          payout_id: payoutId,
          action,
          admin_notes: adminNotes[payoutId] || null,
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || `Failed to ${action} payout`);
      }

      toast.success(action === 'complete' ? 'Payout marked as completed' : 'Payout rejected, wallet re-credited');
      await fetchPayouts();
    } catch (err: any) {
      toast.error(err?.message || `Failed to ${action} payout`);
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = payouts.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
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
  });

  const pendingCount = payouts.filter(p => ['pending', 'approved', 'processing'].includes(p.status)).length;

  const content = (
      <div className={embedded ? '' : 'flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto w-full'}>
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
            {(['all', 'pending', 'completed', 'rejected'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  statusFilter === s
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? `All (${payouts.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${payouts.filter(p => s === 'pending' ? ['pending', 'approved', 'processing'].includes(p.status) : p.status === s).length})`}
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

              return (
                <motion.div
                  key={payout.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`rounded-2xl border bg-card p-5 ${
                    isPending ? 'border-yellow-500/30' : 'border-border/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 min-w-0">
                    {/* Left: creator info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-green-500/20' : isRejected ? 'bg-red-500/20' : 'bg-yellow-500/20'
                        }`}>
                          {isCompleted ? <CircleCheck className="w-4 h-4 text-green-400" /> :
                           isRejected ? <CircleX className="w-4 h-4 text-red-400" /> :
                           <Clock className="w-4 h-4 text-yellow-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {payout.creator_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {payout.creator_email || payout.creator_id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mt-3">
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-bold text-foreground text-sm">${(payout.amount_cents / 100).toFixed(2)}</p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <p className="text-muted-foreground">Bank details</p>
                          {(() => {
                            const type = payout.bank_account_type || 'iban';
                            const copyValue = type === 'iban' ? payout.bank_iban : payout.bank_account_number;
                            const label = type === 'iban' ? 'IBAN' : type === 'us' ? 'Acct' : type === 'au' ? 'Acct' : 'Acct';
                            if (!copyValue) return <p className="text-foreground">—</p>;
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(copyValue);
                                  toast.success(`${label} copied`);
                                }}
                                className="font-mono text-foreground text-left hover:text-primary transition-colors cursor-copy"
                                title={`Click to copy ${label}`}
                              >
                                {type === 'iban'
                                  ? copyValue.replace(/(.{4})/g, '$1 ').trim()
                                  : `${label}: ••••${copyValue.slice(-4)}`}
                                {type === 'us' && payout.bank_routing_number && <span className="text-muted-foreground ml-1">ABA: {payout.bank_routing_number}</span>}
                                {type === 'au' && payout.bank_bsb && <span className="text-muted-foreground ml-1">BSB: {payout.bank_bsb}</span>}
                              </button>
                            );
                          })()}
                        </div>
                        <div>
                          <p className="text-muted-foreground">Holder</p>
                          <p className="text-foreground">{payout.bank_holder_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Requested</p>
                          <p className="text-foreground">
                            {payout.requested_at
                              ? new Date(payout.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      {payout.processed_at && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Processed: {new Date(payout.processed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {payout.admin_notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">Note: {payout.admin_notes}</p>
                      )}
                    </div>

                    {/* Right: status + actions */}
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                        isCompleted ? 'bg-green-500/20 text-green-400' :
                        isRejected ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {payout.status}
                      </span>

                      {isPending && (
                        <div className="space-y-2 w-full sm:w-auto">
                          <Input
                            value={adminNotes[payout.id] || ''}
                            onChange={(e) => setAdminNotes(prev => ({ ...prev, [payout.id]: e.target.value }))}
                            placeholder="Admin notes (optional)"
                            className="h-9 text-xs bg-muted/30 border-border/60 rounded-xl w-full sm:w-56"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="hero"
                              onClick={() => handleProcess(payout.id, 'complete')}
                              disabled={processingId === payout.id}
                              className="flex-1"
                            >
                              {processingId === payout.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Mark paid
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleProcess(payout.id, 'reject')}
                              disabled={processingId === payout.id}
                              className="flex-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
  );

  if (embedded) return content;
  return <AppShell><main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto w-full">{content}</main></AppShell>;
}
