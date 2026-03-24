import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * Bridge component for paths that are server-rendered (SSR) on Vercel.
 *
 * On production: forces a full-page reload so the Vercel rewrite serves the
 * SSR response (blog-ssr, directory-ssr).
 *
 * On local dev (no SSR handler): shows a minimal fallback instead of
 * falling through to /:handle and displaying an empty creator profile.
 */
export default function SSRBridge() {
  const location = useLocation();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isLocal) {
      // Production: let Vercel SSR handle it via a real server request
      window.location.replace(window.location.pathname + window.location.search);
      return;
    }

    // Local dev: no SSR endpoint available, show fallback after a tick
    setShowFallback(true);
  }, [location.pathname]);

  if (showFallback) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <p className="text-lg font-semibold">This page is server-rendered</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{location.pathname}</code> is
          served by Vercel SSR in production. It is not available on the local dev server.
        </p>
        <a
          href={location.pathname}
          className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
        >
          Try full reload
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}
