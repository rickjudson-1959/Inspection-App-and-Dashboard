import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  const errorMsg = 'Missing VITE_SUPABASE_URL environment variable. ' +
    (import.meta.env.PROD 
      ? 'Please add it in Vercel project settings → Environment Variables.'
      : 'Please check your .env file and restart the dev server.')
  console.error('❌', errorMsg)
  throw new Error(errorMsg)
}

if (!supabaseKey) {
  const errorMsg = 'Missing VITE_SUPABASE_ANON_KEY environment variable. ' +
    (import.meta.env.PROD 
      ? 'Please add it in Vercel project settings → Environment Variables.'
      : 'Please check your .env file and restart the dev server.')
  console.error('❌', errorMsg)
  throw new Error(errorMsg)
}

export const supabase = createClient(supabaseUrl, supabaseKey)
