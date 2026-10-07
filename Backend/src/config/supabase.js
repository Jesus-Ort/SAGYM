import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY deben estar configuradas')
}

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
)

export const createAuthenticatedSupabaseClient = (accessToken) => createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
)