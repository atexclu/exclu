/**
 * CustomRequestCard
 *
 * Rich card displayed in chat for custom request messages.
 * - Fan view: shows request status
 * - Creator/chatter view: shows accept/refuse buttons when pending
 */

import { useEffect, useState } from 'react';
import { Check, X, Loader2, DollarSign, FileText, Upload, Unlock } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface CustomRequestCardProps {
  requestId: string;
  viewerRole: 'fan' | 'creator' | 'chatter';
  fallbackContent: string | null;
  onDeliver?: (requestId: string) => void;
}

interface RequestData {
  id: string;
  description: string;
  proposed_amount_cents: number;
  status: string;
  creator_response: string | null;
  delivery_link_id: string | null;
  fan_id: string | null;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending review', color: 'text-yellow-400 bg-yellow-500/15' },
  accepted: { label: 'Accepted', color: 'text-blue-400 bg-blue-500/15' },
  delivered: { label: 'Delivered', color: 'text-green-400 bg-green-500/15' },
  refused: { label: 'Declined', color: 'text-red-400 bg-red-500/15' },
  expired: { label: 'Expired', color: 'text-gray-400 bg-gray-500/15' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400 bg-gray-500/15' },
};

export function CustomRequestCard({ requestId, viewerRole, fallbackContent, onDeliver }: CustomRequestCardProps) {
  const [request, setRequest] = useState<RequestData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [responseText, setResponseText] = useState('');

  useEffect(() => {
    supabase
      .from('custom_requests')
      .select('id, description, proposed_amount_cents, status, creator_response, delivery_link_id, fan_id, delivery_link:links!delivery_link_id(slug)')
      .eq('id', requestId)
      .single()
      .then(({ data }) => {
        if (data) setRequest(data);
        setIsLoading(false);
      });
  }, [requestId]);

  const handleDeliver = () => {
    if (!request || !onDeliver) return;
    onDeliver(request.id);
  };

  const handleRefuse = async () => {
    if (!request) return;
    setIsActing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('manage-request', {
        body: {
          action: 'cancel',
          request_id: request.id,
          creator_response: responseText || null,
        },
      });

      if (error || data?.error) throw new Error(data?.error || 'Failed to decline request');

      setRequest(prev => prev ? { ...prev, status: 'refused', creator_response: responseText || null } : null);
      toast.success('Request declined. The fan has been notified.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to decline request');
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 max-w-[300px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Loading request…</span>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-muted-foreground/60 italic px-3 py-1 rounded-full bg-muted/30">
          {fallbackContent || 'Custom request'}
        </span>
      </div>
    );
  }

  const status = statusLabels[request.status] || { label: request.status, color: 'text-gray-400 bg-gray-500/15' };
  const isPending = request.status === 'pending';
  const isCreatorView = viewerRole === 'creator' || viewerRole === 'chatter';
  const amountFormatted = `$${(request.proposed_amount_cents / 100).toFixed(2)}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-4 max-w-[320px] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Custom Request</p>
            <p className="text-[10px] text-white/40">{amountFormatted} on hold</p>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-white/70 leading-relaxed line-clamp-4">
        {request.description}
      </p>

      {/* Creator response (if any) */}
      {request.creator_response && (
        <div className="border-l-2 border-primary/30 pl-2.5 py-1">
          <p className="text-[10px] text-white/40 font-medium mb-0.5">Response</p>
          <p className="text-xs text-white/60 italic">{request.creator_response}</p>
        </div>
      )}

      {/* Action buttons for creator — only when pending */}
      {isCreatorView && isPending && (
        <div className="space-y-2 pt-1">
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Optional response message…"
            rows={2}
            className="w-full text-xs rounded-lg resize-none bg-white/5 border border-white/10 text-white placeholder:text-white/25 p-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRefuse}
              disabled={isActing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-all disabled:opacity-40"
            >
              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Decline
            </button>
            <button
              type="button"
              onClick={handleDeliver}
              disabled={isActing || !onDeliver}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#CFFF16]/15 text-[#CFFF16] border border-[#CFFF16]/20 hover:bg-[#CFFF16]/25 transition-all disabled:opacity-40"
            >
              <Upload className="w-3 h-3" />
              Deliver
            </button>
          </div>
        </div>
      )}

      {/* Fan view — delivered content link */}
      {!isCreatorView && request.status === 'delivered' && request.delivery_link_id && (
        <a
          href={`/l/${(request as any).delivery_link?.slug || request.delivery_link_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#CFFF16]/15 text-[#CFFF16] border border-[#CFFF16]/20 hover:bg-[#CFFF16]/25 transition-all"
        >
          <Unlock className="w-3 h-3" />
          View content
        </a>
      )}

      {/* Fan view — status info */}
      {!isCreatorView && isPending && (
        <p className="text-[10px] text-white/30 italic">
          Waiting for creator to review your request…
        </p>
      )}
    </div>
  );
}
