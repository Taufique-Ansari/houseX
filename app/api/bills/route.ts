import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()

        let query = supabaseAdmin
            .from('bills')
            .select('*, profiles(name, flat)')
            .order('generated_at', { ascending: false })

        if (profile?.role !== 'admin') {
            query = query.eq('user_id', user.id)
        }

        const { data, error } = await query
        if (error) throw error
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch bills'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
