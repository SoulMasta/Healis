// Single source of truth: re-export from src so createClient is never called with empty env.
export { supabase } from './src/http/supabaseClient';
