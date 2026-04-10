import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  global: {
    fetch: customFetch
  }
});

// Anonymous client: never sends an Authorization header with a user JWT.
// Use this when you need anon RLS policies to apply regardless of auth state
// (e.g. post-checkout purchase verification in PublicLink.tsx).
// Uses a distinct storageKey to avoid "Multiple GoTrueClient instances" warning.
export const supabaseAnon = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-anon-auth-token' },
  global: { fetch: customFetch },
});
