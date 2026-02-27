import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { DollarSign, MessageSquare, Check, X, Eye, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface FanProfile {
  display_name: string | null;
  avatar_url: string | null;
}

interface TipRecord {
  id: string;
  fan_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  message: string | null;
  is_anonymous: boolean;
  created_at: string;
  paid_at: string | null;
  read_at: string | null;
  creator_net_cents: number;
  platform_fee_cents: number;
  fan_email?: string | null;
  fan?: FanProfile | null;
}

interface RequestRecord {
  id: string;
  fan_id: string;
  description: string;
  proposed_amount_cents: number;
  final_amount_cents: number | null;
  currency: string;
  status: string;
  creator_response: string | null;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
  delivery_link_id: string | null;
  fan_email?: string | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  succeeded: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  refunded: 'bg-gray-500/20 text-gray-400',
  accepted: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-emerald-500/20 text-emerald-400',
  in_progress: 'bg-indigo-500/20 text-indigo-400',
  delivered: 'bg-green-500/20 text-green-400',
  completed: 'bg-green-500/20 text-green-400',
  refused: 'bg-red-500/20 text-red-400',
  expired: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

const CreatorTipsRequests = () => {
  const [activeTab, setActiveTab] = useState<'tips' | 'requests'>('tips');
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Response modal state
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [isResponding, setIsResponding] = useState(false);

  // Stats
  const totalTipsCents = tips
    .filter((t) => t.status === 'succeeded')
    .reduce((acc, t) => acc + (t.creator_net_cents || 0), 0);
  const totalRequestsCents = requests
    .filter((r) => ['paid', 'in_progress', 'delivered', 'completed'].includes(r.status))
    .reduce((acc, r) => acc + (r.final_amount_cents || r.proposed_amount_cents || 0), 0);
  const unreadTips = tips.filter((t) => !t.read_at && t.status === 'succeeded').length;
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await fetchData(user.id);
    };
    init();
  }, []);

  // Auto-mark tips as read on initial load (tips tab is default)
  useEffect(() => {
    if (!isLoading && tips.length > 0 && activeTab === 'tips') {
      markTipsAsRead();
    }
  }, [isLoading]);

  const fetchData = async (uid: string) => {
    setIsLoading(true);

    const [tipsResult, requestsResult] = await Promise.all([
      supabase
        .from('tips')
        .select('*, fan:profiles!tips_fan_id_fkey(display_name, avatar_url)')
        .eq('creator_id', uid)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('custom_requests')
        .select('*')
        .eq('creator_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (tipsResult.data) setTips(tipsResult.data as TipRecord[]);
    if (requestsResult.data) setRequests(requestsResult.data);

    setIsLoading(false);
  };

  const markTipsAsRead = async () => {
    if (!userId) return;
    const unreadIds = tips.filter((t) => !t.read_at).map((t) => t.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('tips')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);

    setTips((prev) => prev.map((t) => ({
      ...t,
      read_at: t.read_at || new Date().toISOString(),
    })));
  };

  const handleAcceptRequest = async (requestId: string) => {
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    const amount = finalAmount
      ? Math.round(parseFloat(finalAmount) * 100)
      : req.proposed_amount_cents;

    if (amount < 2000) {
      toast.error('Minimum amount is $20.00');
      return;
    }

    setIsResponding(true);
    try {
      const { error } = await supabase
        .from('custom_requests')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          final_amount_cents: amount,
          creator_response: responseText || null,
          read_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: 'accepted', final_amount_cents: amount, creator_response: responseText || null, read_at: new Date().toISOString() }
            : r
        )
      );
      toast.success('Request accepted');
      setRespondingTo(null);
      setResponseText('');
      setFinalAmount('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept request');
    } finally {
      setIsResponding(false);
    }
  };

  const handleRefuseRequest = async (requestId: string) => {
    setIsResponding(true);
    try {
      const { error } = await supabase
        .from('custom_requests')
        .update({
          status: 'refused',
          creator_response: responseText || null,
          read_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: 'refused', creator_response: responseText || null, read_at: new Date().toISOString() }
            : r
        )
      );
      toast.success('Request declined');
      setRespondingTo(null);
      setResponseText('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to decline request');
    } finally {
      setIsResponding(false);
    }
  };

  const tabs = [
    { key: 'tips' as const, label: 'Tips', icon: DollarSign, badge: unreadTips },
    { key: 'requests' as const, label: 'Requests', icon: MessageSquare, badge: pendingRequests },
  ];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Tips & Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage tips and custom content requests from your fans</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Tips Earned</p>
            <p className="text-xl font-bold text-foreground mt-1">${(totalTipsCents / 100).toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Unread Tips</p>
            <p className="text-xl font-bold text-foreground mt-1">{unreadTips}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Request Revenue</p>
            <p className="text-xl font-bold text-foreground mt-1">${(totalRequestsCents / 100).toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pending Requests</p>
            <p className="text-xl font-bold text-foreground mt-1">{pendingRequests}</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key === 'tips') markTipsAsRead();
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] text-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Tips Tab */}
        {!isLoading && activeTab === 'tips' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {tips.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No tips received yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Enable tips in your profile settings and fans will be able to tip you directly
                </p>
              </div>
            ) : (
              tips.map((tip) => (
                <div
                  key={tip.id}
                  className={`rounded-xl border bg-card p-4 transition-all ${
                    !tip.read_at ? 'border-primary/30 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Fan avatar */}
                      {!tip.is_anonymous && (
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-border flex-shrink-0 bg-muted">
                          {tip.fan?.avatar_url ? (
                            <img src={tip.fan.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-xs font-bold text-muted-foreground">
                                {(tip.fan?.display_name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {tip.is_anonymous
                              ? 'Anonymous'
                              : (tip.fan?.display_name || 'Fan')}
                          </p>
                          {!tip.read_at && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">
                              New
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(tip.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">
                        ${(tip.creator_net_cents / 100).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        net (${(tip.amount_cents / 100).toFixed(2)} total)
                      </p>
                    </div>
                  </div>
                  {tip.message && (
                    <div className="mt-3 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-foreground/80">{tip.message}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </motion.div>
        )}

        {/* Requests Tab */}
        {!isLoading && activeTab === 'requests' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {requests.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No custom requests yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Enable custom requests in your profile settings to start receiving them
                </p>
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  className={`rounded-xl border bg-card p-4 transition-all ${
                    !req.read_at && req.status === 'pending' ? 'border-primary/30 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground">Custom Request</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            statusColors[req.status] || 'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {req.expires_at && req.status === 'pending' && (
                          <span className="ml-2 text-yellow-500">
                            Expires {new Date(req.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-foreground">
                        ${((req.final_amount_cents || req.proposed_amount_cents) / 100).toFixed(2)}
                      </p>
                      {req.final_amount_cents && req.final_amount_cents !== req.proposed_amount_cents && (
                        <p className="text-[10px] text-muted-foreground line-through">
                          ${(req.proposed_amount_cents / 100).toFixed(2)} proposed
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{req.description}</p>
                  </div>

                  {req.creator_response && (
                    <div className="mt-2 pl-3 border-l-2 border-primary/30">
                      <p className="text-xs text-muted-foreground italic">Your response: {req.creator_response}</p>
                    </div>
                  )}

                  {/* Action buttons for pending requests */}
                  {req.status === 'pending' && (
                    <div className="mt-3">
                      {respondingTo === req.id ? (
                        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                          <Textarea
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder="Add a message (optional)"
                            maxLength={1000}
                            rows={2}
                            className="text-xs resize-none"
                          />
                          <div className="space-y-1.5">
                            <label className="text-xs text-muted-foreground">
                              Final amount (leave blank to keep ${(req.proposed_amount_cents / 100).toFixed(2)})
                            </label>
                            <div className="relative w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                              <Input
                                type="number"
                                min={20}
                                step={1}
                                value={finalAmount}
                                onChange={(e) => setFinalAmount(e.target.value)}
                                placeholder={(req.proposed_amount_cents / 100).toFixed(0)}
                                className="h-8 text-xs pl-6"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="rounded-xl text-xs"
                              onClick={() => handleAcceptRequest(req.id)}
                              disabled={isResponding}
                            >
                              {isResponding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                              onClick={() => handleRefuseRequest(req.id)}
                              disabled={isResponding}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-xl text-xs"
                              onClick={() => {
                                setRespondingTo(null);
                                setResponseText('');
                                setFinalAmount('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="rounded-xl text-xs"
                            onClick={() => setRespondingTo(req.id)}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Respond
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delivery action for paid/in_progress requests */}
                  {['paid', 'in_progress'].includes(req.status) && !req.delivery_link_id && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Create a link with the custom content and deliver it to the fan.
                      </p>
                      <Button
                        size="sm"
                        className="rounded-xl text-xs"
                        onClick={() => toast.info('Delivery feature coming soon. Create a link and share it manually for now.')}
                      >
                        <Package className="w-3 h-3 mr-1" />
                        Deliver Content
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </motion.div>
        )}
      </div>
    </AppShell>
  );
};

export default CreatorTipsRequests;
