import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // In dev, this will surface clearly in the console if env is misconfigured
  // We avoid throwing in production build to prevent hard crashes on import.
  console.warn('Supabase environment variables are missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
