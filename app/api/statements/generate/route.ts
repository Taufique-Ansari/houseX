import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerClient } from '@/lib/supabase-server'
import { generateStatement } from '@/lib/generateStatement'

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const client = createServerClient(token)
        const { data: { user } } = await client.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

        const { tenant_id, month, year } = await req.json()
        if (!tenant_id || !month || !year) {
            return NextResponse.json({ error: 'tenant_id, month, and year are required' }, { status: 400 })
        }

        const statement = await generateStatement(tenant_id, Number(month), Number(year), user.id)
        return NextResponse.json(statement)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to generate statement'
        console.error('[Generate Statement]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
