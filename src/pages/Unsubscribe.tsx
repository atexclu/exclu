import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react';

type Status =
  | { kind: 'loading' }
  | { kind: 'success'; email: string }
  | { kind: 'error'; reason: string };

const friendlyReason = (reason: string): string => {
  switch (reason) {
    case 'missing':
    case 'malformed':
    case 'bad_email':
    case 'bad_email_encoding':
    case 'bad_sig_encoding':
      return 'This unsubscribe link is invalid or incomplete.';
    case 'bad_signature':
      return 'This unsubscribe link has expired or was tampered with. Please use a recent email.';
    case 'misconfigured':
      return 'The server is temporarily unavailable. Please try again in a moment.';
    case 'update_failed':
    case 'insert_failed':
      return 'We could not update your preferences right now. Please try again.';
    default:
      return 'Something went wrong. Please try again or contact support.';
  }
};

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') ?? searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!token) {
        if (!cancelled) setStatus({ kind: 'error', reason: 'missing' });
        return;
      }

      try {
        const res = await fetch('/api/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json.ok) {
          setStatus({ kind: 'success', email: String(json.email ?? '') });
        } else {
          setStatus({ kind: 'error', reason: String(json.reason ?? 'unknown') });
        }
      } catch (err) {
        console.error('Unsubscribe request failed', err);
        if (!cancelled) setStatus({ kind: 'error', reason: 'network' });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-xl mx-auto px-6 pt-32 pb-20">
        <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-8 sm:p-10 text-center">
          {status.kind === 'loading' && (
            <>
              <div className="inline-flex w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-5">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-exclu-cloud mb-2">Updating your preferences…</h1>
              <p className="text-sm text-exclu-space/80">One moment while we unsubscribe you.</p>
            </>
          )}

          {status.kind === 'success' && (
            <>
              <div className="inline-flex w-14 h-14 rounded-full bg-emerald-500/15 items-center justify-center mb-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold text-exclu-cloud mb-2">You have been unsubscribed</h1>
              <p className="text-sm text-exclu-space/80 mb-1">
                {status.email ? (
                  <>
                    <span className="font-medium text-exclu-cloud">{status.email}</span> will no longer receive
                    marketing emails from Exclu.
                  </>
                ) : (
                  'Your email has been removed from our marketing list.'
                )}
              </p>
              <p className="text-xs text-exclu-space/60 mt-4">
                Transactional emails (purchase receipts, tip notifications, account security alerts) will continue so you don't miss anything important about your account.
              </p>
              <p className="text-xs text-exclu-space/60 mt-6">
                Changed your mind? You can re-enable marketing emails any time from your account settings.
              </p>
            </>
          )}

          {status.kind === 'error' && (
            <>
              <div className="inline-flex w-14 h-14 rounded-full bg-red-500/15 items-center justify-center mb-5">
                <XCircle className="w-7 h-7 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-exclu-cloud mb-2">Could not unsubscribe</h1>
              <p className="text-sm text-exclu-space/80 mb-4">{friendlyReason(status.reason)}</p>
              <a
                href="mailto:contact@exclu.at"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Mail className="w-4 h-4" />
                Contact support
              </a>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Unsubscribe;
