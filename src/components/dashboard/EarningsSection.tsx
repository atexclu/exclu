import { Wallet, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

export const EarningsSection = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Available Balance</span>
          </div>
          <div className="text-3xl font-bold">$0.00</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-muted-foreground">Total Earned</span>
          </div>
          <div className="text-3xl font-bold">$0.00</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownRight className="w-4 h-4 text-red-500" />
            <span className="text-sm text-muted-foreground">Total Paid Out</span>
          </div>
          <div className="text-3xl font-bold">$0.00</div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent Transactions</h3>
          <button className="text-sm text-primary hover:underline">View all</button>
        </div>
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <div className="text-center">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No transactions yet</p>
            <p className="text-xs mt-1">Start earning by sharing your profile!</p>
          </div>
        </div>
      </div>

      {/* Payout method */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Payout Method</h3>
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          <div className="text-center">
            <p>No payout method configured</p>
            <button className="text-primary text-sm mt-2 hover:underline">Set up payout</button>
          </div>
        </div>
      </div>
    </div>
  );
};
