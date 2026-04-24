import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // In dev, this will surface clearly in the console if env is misconfigured
  // We avoid throwing in production build to prevent hard crashes on import.
  console.warn('Supabase environment variables are missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// Set VITE_USE_LOCAL_FUNCTIONS=false in .env.local to use production Edge Functions
// while running the frontend locally (Mode B testing — no local supabase functions serve needed).
const useLocalFunctions = import.meta.env.DEV && import.meta.env.VITE_USE_LOCAL_FUNCTIONS !== 'false';

const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  const urlString = url instanceof URL ? url.toString() : url as string;
  if (useLocalFunctions && typeof urlString === 'string' && urlString.includes('/functions/v1/')) {
    const localUrl = urlString.replace(supabaseUrl ?? '', 'http://127.0.0.1:54321');
    return fetch(localUrl, options);
  }
  return fetch(url, options);
};

// `lock: processLock` replaces the default navigator.locks-based mutex that
// gotrue-js uses to serialise token reads/writes. Under React Strict Mode
// (and any page that mounts several components calling `supabase.auth.*`
// concurrently — Navbar, Auth, ProfileContext, ThemeContext…) the default
// lock throws `AbortError: Lock broken by another request with the 'steal'
// option` because one caller steals the lock from another after a 5s timeout.
// `processLock` is a plain in-memory promise mutex that doesn't have this
// stealing behaviour, so parallel auth calls simply queue.
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: { lock: processLock },
  global: { fetch: customFetch },
});

// Anonymous client: never sends an Authorization header with a user JWT.
// Use this when you need anon RLS policies to apply regardless of auth state
// (e.g. post-checkout purchase verification in PublicLink.tsx).
// Uses a distinct storageKey to avoid "Multiple GoTrueClient instances" warning.
export const supabaseAnon = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: 'sb-anon-auth-token',
    lock: processLock,
  },
  global: { fetch: customFetch },
});
