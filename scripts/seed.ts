import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually (Next.js doesn't load it for standalone scripts)
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const value = trimmed.slice(eqIdx + 1)
    process.env[key] = value
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const users = [
    { email: 'admin@volttrack.app', password: 'Admin@123', name: 'Admin', username: 'admin', role: 'admin', flat: '' },
    { email: 'tenant1@volttrack.app', password: 'Tenant@123', name: 'Rahul Sharma', username: 'tenant1', role: 'tenant', flat: 'Flat 101' },
    { email: 'tenant2@volttrack.app', password: 'Tenant@123', name: 'Suresh Patil', username: 'tenant2', role: 'tenant', flat: 'Flat 102' },
]

async function seed() {
    for (const u of users) {
        const { data, error } = await supabase.auth.admin.createUser({
            email: u.email, password: u.password, email_confirm: true
        })
        if (error) { console.error(u.email, error); continue; }
        await supabase.from('profiles').insert({
            id: data.user.id, name: u.name, username: u.username, role: u.role, flat: u.flat
        })
        console.log('Created:', u.email)
    }
}

seed()
