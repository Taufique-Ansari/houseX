import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        const { data, error } = await supabaseAdmin
            .from('statements')
            .update({ status: 'published', published_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', 'draft')
            .select()
            .single()

        if (error) throw error
        if (!data) return NextResponse.json({ error: 'Statement not found or already published' }, { status: 400 })
        return NextResponse.json(data)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to publish'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
