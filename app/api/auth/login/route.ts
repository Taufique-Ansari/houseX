import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json()

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey)

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (authError) {
            return NextResponse.json({ error: authError.message }, { status: 401 })
        }

        // Fetch user profile with role
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single()

        if (profileError) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        return NextResponse.json({
            user: authData.user,
            session: authData.session,
            profile,
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed'
        console.error('Login error:', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
