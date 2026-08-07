// Shared CORS headers for Supabase Edge Functions.
//
// Edge Functions run on a different origin than the browser app, so every
// response — including errors and the OPTIONS preflight — needs these
// headers or the browser will block the request before our code ever sees
// the result.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
