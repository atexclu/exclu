import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Loader2,
  Landmark,
  ArrowDownToLine,
  Clock,
  CircleCheck,
  CircleX,
  AlertCircle,
  Check,
  Banknote,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import BankDetailsForm, { BankData, getBankDisplayFields } from '@/components/BankDetailsForm';

const Earnings = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Wallet state
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [walletTotalEarnedCents, setWalletTotalEarnedCents] = useState(0);
  const [walletPayouts, setWalletPayouts] = useState<any[]>([]);
  const [isRequestingWithdrawal, setIsRequestingWithdrawal] = useState(false);

  // Payout setup
  const [payoutSetupComplete, setPayoutSetupComplete] = useState(false);
  const [bankData, setBankData] = useState<BankData | null>(null);
  const [isEditingBank, setIsEditingBank] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }
      setUserId(user.id);

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance_cents, total_earned_cents, payout_setup_complete, bank_iban, bank_holder_name, bank_bic, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_country')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          setWalletBalanceCents(profile.wallet_balance_cents ?? 0);
          setWalletTotalEarnedCents(profile.total_earned_cents ?? 0);
          setPayoutSetupComplete(profile.payout_setup_complete === true);
          setBankData({
            bank_account_type: profile.bank_account_type ?? undefined,
            bank_iban: profile.bank_iban ?? undefined,
            bank_holder_name: profile.bank_holder_name ?? undefined,
            bank_bic: profile.bank_bic ?? undefined,
            bank_account_number: profile.bank_account_number ?? undefined,
            bank_routing_number: profile.bank_routing_number ?? undefined,
            bank_bsb: profile.bank_bsb ?? undefined,
            bank_country: profile.bank_country ?? undefined,
          });
        }

        const { data: payoutsData } = await supabase
          .from('payouts')
          .select('id, amount_cents, status, created_at, paid_at, requested_at, processed_at, admin_notes, rejection_reason')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (payoutsData) setWalletPayouts(payoutsData);
      } catch (err) {
        console.error('Error fetching earnings data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleRequestWithdrawal = async () => {
    if (!userId) return;
    if (walletBalanceCents < 5000) {
      toast.error('Minimum withdrawal is $50.00');
      return;
    }
    if (!payoutSetupComplete) {
      toast.error('Please set up your bank details first.');
      return;
    }
    setIsRequestingWithdrawal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('request-withdrawal', {
        body: {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Withdrawal request failed');
      }
      toast.success('Withdrawal requested! You will receive your funds within 7 business days.');
      if ((data as any)?.new_balance !== undefined) {
        setWalletBalanceCents((data as any).new_balance);
      }
      const { data: refreshedPayouts } = await supabase
        .from('payouts')
        .select('id, amount_cents, status, created_at, paid_at, requested_at, processed_at, admin_notes, rejection_reason')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (refreshedPayouts) setWalletPayouts(refreshedPayouts);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to request withdrawal');
    } finally {
      setIsRequestingWithdrawal(false);
    }
  };


  return (
    <AppShell>
      <main className="px-4 lg:px-6 pb-16 w-full">
        <section className="mt-4 sm:mt-6 mb-6">
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">Earnings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your wallet, withdraw funds, and set up your payout account.</p>
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Balance Card */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-5">Wallet Balance</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-muted/50 dark:bg-white/5 border border-border/60 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Available balance</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${(walletBalanceCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/50 dark:bg-white/5 border border-border/60 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total earned</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${(walletTotalEarnedCents / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Bank Status & Withdrawal */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Withdraw Funds</h2>

              <div className="rounded-xl bg-muted/50 dark:bg-white/5 border border-border/60 p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    payoutSetupComplete ? 'bg-green-500/20' : 'bg-yellow-500/20'
                  }`}>
                    {payoutSetupComplete ? (
                      <CircleCheck className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {payoutSetupComplete ? 'Bank account connected' : 'Bank account not set up'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payoutSetupComplete
                        ? `${(bankData?.bank_account_type || 'iban').toUpperCase()} account connected`
                        : 'Set up your bank details below to withdraw funds.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Minimum withdrawal: <span className="font-medium text-foreground">$50.00</span>. Funds are typically processed within 3–5 business days.
                </p>
                <Button
                  type="button"
                  onClick={handleRequestWithdrawal}
                  disabled={isRequestingWithdrawal || walletBalanceCents < 5000 || !payoutSetupComplete}
                  className="w-full sm:w-auto rounded-xl gap-2"
                >
                  {isRequestingWithdrawal ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Processing...</>
                  ) : (
                    <><ArrowDownToLine className="w-4 h-4" />Request Withdrawal — ${(walletBalanceCents / 100).toFixed(2)}</>
                  )}
                </Button>
              </div>
            </div>

            {/* Payout Account Card */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Payout Account</h2>

              {payoutSetupComplete && !isEditingBank ? (
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50 dark:bg-white/5 border border-border/60">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-500/15">
                    <Landmark className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">Bank Account</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-[10px] text-green-400 font-medium">
                        <Check className="w-3 h-3" />
                        Connected
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your bank account is set up. You can receive payouts from your wallet.
                    </p>
                    <div className="mt-2 space-y-1 text-sm">
                      {getBankDisplayFields(bankData).map((f) => (
                        <div key={f.label} className="flex justify-between">
                          <span className="text-muted-foreground">{f.label}</span>
                          <span className="text-foreground font-mono text-xs">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50 dark:bg-white/5 border border-border/60">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-muted">
                    <Landmark className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground">
                      {isEditingBank ? 'Edit Bank Details' : 'Set Up Payouts'}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add your bank account details to receive payouts from your earnings.
                    </p>
                  </div>
                </div>
              )}

              {(!payoutSetupComplete || isEditingBank) && (
                <div className="mt-4">
                  <BankDetailsForm
                    initialData={bankData}
                    payoutSetupComplete={payoutSetupComplete}
                    onSaved={(data) => {
                      setBankData(data);
                      setPayoutSetupComplete(true);
                      setIsEditingBank(false);
                    }}
                    onCancel={isEditingBank ? () => setIsEditingBank(false) : undefined}
                  />
                </div>
              )}

              {payoutSetupComplete && !isEditingBank && (
                <div className="mt-4">
                  <Button onClick={() => setIsEditingBank(true)} variant="outline" className="rounded-xl">
                    Edit bank details
                  </Button>
                </div>
              )}
            </div>

            {/* Withdrawal History */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Withdrawal History</h2>
              {walletPayouts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                    <Banknote className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No withdrawals yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {walletPayouts.map((payout) => {
                    const statusIcon = payout.status === 'completed' || payout.status === 'paid'
                      ? <CircleCheck className="w-4 h-4 text-green-400" />
                      : payout.status === 'failed' || payout.status === 'rejected'
                      ? <CircleX className="w-4 h-4 text-red-400" />
                      : <Clock className="w-4 h-4 text-yellow-400" />;
                    const statusColor = payout.status === 'completed' || payout.status === 'paid'
                      ? 'bg-green-500/20 text-green-400'
                      : payout.status === 'failed' || payout.status === 'rejected'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-yellow-500/20 text-yellow-400';
                    return (
                      <div key={payout.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 dark:bg-white/5 p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            payout.status === 'completed' || payout.status === 'paid' ? 'bg-green-500/20'
                            : payout.status === 'failed' || payout.status === 'rejected' ? 'bg-red-500/20'
                            : 'bg-yellow-500/20'
                          }`}>
                            {statusIcon}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              ${(payout.amount_cents / 100).toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {payout.paid_at && ` · Paid ${new Date(payout.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                          {payout.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </AppShell>
  );
};

export default Earnings;
