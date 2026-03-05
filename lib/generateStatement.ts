import { supabaseAdmin } from './supabase-server'
import { monthName } from './utils'

export async function generateStatement(tenantId: string, month: number, year: number, adminId: string) {
    // 0. Check if existing statement is already paid
    const { data: existingStmt } = await supabaseAdmin
        .from('statements').select('status').eq('tenant_id', tenantId).eq('month', month).eq('year', year).single()
    if (existingStmt && existingStmt.status === 'paid') {
        throw new Error('Statement for this month is already paid and cannot be modified.')
    }

    // 1. Load tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants').select('*, profiles(name)').eq('id', tenantId).single()
    if (tenantErr || !tenant) throw new Error('Tenant not found')
    if (!tenant.is_active) throw new Error('Tenant is inactive')

    // 2. Load utility config
    const { data: config } = await supabaseAdmin
        .from('utility_config').select('*')
        .eq('month', month).eq('year', year).single()
    if (!config) throw new Error(`Utility config for ${monthName(month)} ${year} not set. Go to Utilities first.`)

    // 3. RENT — check proration
    let rentCharge = Number(tenant.rent_amount)
    let isProrated = false
    let proratedDays: number | null = null

    if (tenant.move_in_date) {
        const moveIn = new Date(tenant.move_in_date)
        if (moveIn.getFullYear() === year && moveIn.getMonth() + 1 === month && moveIn.getDate() > 1) {
            const daysInMonth = new Date(year, month, 0).getDate()
            proratedDays = daysInMonth - moveIn.getDate() + 1
            rentCharge = Math.round((Number(tenant.rent_amount) / daysInMonth) * proratedDays)
            isProrated = true
        }
    }

    // 4. ELECTRICITY
    let electricityCharge = 0
    let unitsUsed: number | null = null
    let prevReading: number | null = null
    let currReading: number | null = null

    if (config.electricity_per_unit_rate) {
        // The bill for month 'X' (e.g. March) covers rent for March, but electricity meant to arrive March 1st.
        // Thus, electricity uses (Reading for Month X) - (Reading for Month X-1) 
        // Example: March bill (X=3) uses (March reading) - (February reading)
        const [currM, currY] = [month, year]
        const [prevM, prevY] = month === 1 ? [12, year - 1] : [month - 1, year]

        const { data: curr } = await supabaseAdmin
            .from('meter_readings').select('*')
            .eq('tenant_id', tenantId).eq('month', currM).eq('year', currY).single()
        const { data: prev } = await supabaseAdmin
            .from('meter_readings').select('*')
            .eq('tenant_id', tenantId).eq('month', prevM).eq('year', prevY).single()

        if (curr && prev) {
            if (Number(curr.reading_value) < Number(prev.reading_value)) {
                throw new Error('Current meter reading is less than previous. Please verify readings.')
            }
            unitsUsed = Number(curr.reading_value) - Number(prev.reading_value)
            electricityCharge = Math.round(unitsUsed * Number(config.electricity_per_unit_rate) * 100) / 100
            prevReading = Number(prev.reading_value)
            currReading = Number(curr.reading_value)
        }
        // If no readings: electricity stays 0
    }

    // 5. WATER
    const waterCharge = Number(config.water_charge_per_tenant)

    // 6. WIFI
    const wifiCharge = tenant.wifi_opted_in ? Number(config.wifi_charge_per_tenant) : 0

    // 7. BALANCE CARRY FORWARD (DUES / CREDIT)
    const [prevStmtM, prevStmtY] = month === 1 ? [12, year - 1] : [month - 1, year]
    const { data: prevStatement } = await supabaseAdmin
        .from('statements').select('balance')
        .eq('tenant_id', tenantId).eq('month', prevStmtM).eq('year', prevStmtY).single()
    let previousDues = 0
    let creditFromPrevious = 0
    if (prevStatement) {
        const bal = Number(prevStatement.balance)
        if (bal > 0) previousDues = bal
        else if (bal < 0) creditFromPrevious = Math.abs(bal)
    }

    // 8. DUE DATE (Derived from Join Date / Move-in Date)
    const dueDay = tenant.move_in_date ? new Date(tenant.move_in_date).getDate() : tenant.rent_due_day
    const dueDate = new Date(year, month - 1, dueDay).toISOString().split('T')[0]

    // 9. UPSERT STATEMENT
    const { data: statement, error: stmtErr } = await supabaseAdmin
        .from('statements')
        .upsert({
            tenant_id: tenantId,
            month, year,
            rent_charge: rentCharge,
            electricity_charge: electricityCharge,
            electricity_units: unitsUsed,
            electricity_rate: config.electricity_per_unit_rate ? Number(config.electricity_per_unit_rate) : null,
            prev_meter_reading: prevReading,
            curr_meter_reading: currReading,
            water_charge: waterCharge,
            wifi_charge: wifiCharge,
            previous_dues: previousDues,
            credit_from_previous: creditFromPrevious,
            is_prorated: isProrated,
            proration_days: proratedDays,
            due_date: dueDate,
            status: existingStmt?.status !== 'draft' && existingStmt?.status ? existingStmt.status : 'draft',
            generated_by: adminId,
            generated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,month,year' })
        .select()
        .single()

    if (stmtErr) throw stmtErr

    // 10. LEDGER ENTRIES
    // Delete old ledger entries for this statement (in case of regeneration)
    await supabaseAdmin.from('ledger_entries').delete().eq('statement_id', statement.id).eq('type', 'charge')
    await supabaseAdmin.from('ledger_entries').delete().eq('statement_id', statement.id).eq('type', 'credit')

    const ledgerEntries = [
        { tenant_id: tenantId, statement_id: statement.id, type: 'charge', description: `Rent — ${monthName(month)} ${year}`, amount: rentCharge, created_by: adminId },
    ]

    if (electricityCharge > 0) {
        const [prevM, prevY] = month === 1 ? [12, year - 1] : [month - 1, year]
        ledgerEntries.push({ tenant_id: tenantId, statement_id: statement.id, type: 'charge', description: `Electricity (${unitsUsed} kWh) — ${monthName(prevM)} ${prevY}`, amount: electricityCharge, created_by: adminId })
    }

    ledgerEntries.push({ tenant_id: tenantId, statement_id: statement.id, type: 'charge', description: `Water — ${monthName(month)} ${year}`, amount: waterCharge, created_by: adminId })

    if (wifiCharge > 0) {
        ledgerEntries.push({ tenant_id: tenantId, statement_id: statement.id, type: 'charge', description: `WiFi — ${monthName(month)} ${year}`, amount: wifiCharge, created_by: adminId })
    }

    if (creditFromPrevious > 0) {
        ledgerEntries.push({ tenant_id: tenantId, statement_id: statement.id, type: 'credit' as const, description: `Credit from ${monthName(prevStmtM)} ${prevStmtY}`, amount: -creditFromPrevious, created_by: adminId })
    }

    if (previousDues > 0) {
        ledgerEntries.push({ tenant_id: tenantId, statement_id: statement.id, type: 'charge', description: `Previous Outstanding Balance`, amount: previousDues, created_by: adminId })
    }

    await supabaseAdmin.from('ledger_entries').insert(ledgerEntries)

    return statement
}
