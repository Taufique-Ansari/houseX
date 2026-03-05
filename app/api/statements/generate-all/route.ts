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

        const { month, year } = await req.json()
        if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 })

        const { data: tenants } = await supabaseAdmin
            .from('tenants').select('id, profiles(name)').eq('is_active', true)

        const results: { tenant_id: string; name: string; success: boolean; error?: string }[] = []

        for (const t of (tenants || [])) {
            const profileName = (t.profiles as unknown as { name: string } | null)?.name || 'Unknown'
            try {
                await generateStatement(t.id, Number(month), Number(year), user.id)
                results.push({ tenant_id: t.id, name: profileName, success: true })
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed'
                results.push({ tenant_id: t.id, name: profileName, success: false, error: message })
            }
        }

        return NextResponse.json({ results })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to generate all'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
