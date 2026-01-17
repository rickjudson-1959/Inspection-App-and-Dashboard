import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CRITICAL: Always use actual Supabase project URL (not custom domain) for auth operations
    // Custom domains (api.pipe-up.ca) do NOT handle /auth/v1/ routes correctly
    // Project ref: aatvckalnvojlykfgnmz
    const actualSupabaseUrl = 'https://aatvckalnvojlykfgnmz.supabase.co'
    
    const supabaseAdmin = createClient(
      actualSupabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Delete user from auth.users (requires service role)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)

    if (deleteError) {
      console.error('Error deleting user from auth:', deleteError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete user from authentication',
          details: deleteError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Successfully deleted user ${user_id} from auth.users`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `User ${user_id} has been deleted from authentication` 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in delete-user function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
