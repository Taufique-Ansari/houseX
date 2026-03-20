'use client'

import { fmtINR, fmtM, CUR_M, CUR_Y } from '@/lib/utils'
import type { Bill, Profile, MeterReading, ElectricityRate } from '@/lib/types'

interface OverviewTabProps {
    bills: Bill[]
    rates: ElectricityRate[]
    readings: MeterReading[]
    users: Profile[]
}

export default function OverviewTab({ bills, rates, readings, users }: OverviewTabProps) {
    const tenants = users.filter(u => u.role === 'tenant')
    const pendingBills = bills.filter(b => b.status === 'pending')
    const paidBills = bills.filter(b => b.status === 'paid')
    const totalPending = pendingBills.reduce((s, b) => s + b.amount, 0)
    const currentRate = rates.find(r => {
        if (!r.effective_date) return false
        const d = new Date(r.effective_date)
        return d.getMonth() + 1 === CUR_M && d.getFullYear() === CUR_Y
    })

    const tenantCards = tenants.map(t => ({
        ...t,
        bill: bills.find(b => b.tenant_id === t.id && b.month === CUR_M && b.year === CUR_Y),
        dues: bills.filter(b => b.tenant_id === t.id && b.status === 'pending').reduce((s, b) => s + b.amount, 0),
        lastReading: readings
            .filter(r => r.tenant_id === t.id)
            .sort((a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime())[0]
    }))

    return (
        <div className="page">
            <div className="g4 mb6">
                {[
                    { label: 'Tenants', value: tenants.length, note: 'Active units', cls: '' },
                    { label: 'Pending Bills', value: pendingBills.length, note: `${fmtINR(totalPending)} due`, cls: 'red' },
                    { label: 'Paid Bills', value: paidBills.length, note: 'All time', cls: 'green' },
                    { label: `Rate ${fmtM(CUR_M, CUR_Y)}`, value: currentRate ? `₹${currentRate.per_unit_rate.toFixed(2)}` : '—', note: 'Per unit', cls: 'amber' }
                ].map(s => (
                    <div className="stat" key={s.label}>
                        <div className="stat-label">{s.label}</div>
                        <div className={`stat-num ${s.cls}`}>{s.value}</div>
                        <div className="stat-note">{s.note}</div>
                    </div>
                ))}
            </div>

            <div className="bold mb3" style={{ color: '#f8fafc', fontSize: '0.95rem' }}>
                Tenant Summary — {fmtM(CUR_M, CUR_Y)}
            </div>
            <div className="g2">
                {tenantCards.map(t => (
                    <div className="card" key={t.id}>
                        <div className="row between mb3">
                            <div>
                                <div className="bold" style={{ color: '#f8fafc' }}>{t.name}</div>
                                <div className="small">{(t as any).flat}</div>
                            </div>
                            <span className={`badge ${t.dues > 0 ? 'b-pending' : 'b-paid'}`}>
                                {t.dues > 0 ? `₹${t.dues.toFixed(0)} due` : 'All Clear'}
                            </span>
                        </div>
                        <div className="div" />
                        <div className="small muted mb1">Current Month</div>
                        {t.bill
                            ? <div className="row between">
                                <span className="mono amber bold">{fmtINR(t.bill.amount)}</span>
                                <span className={`badge ${t.bill.status === 'paid' ? 'b-paid' : 'b-pending'}`}>{t.bill.status}</span>
                            </div>
                            : <span className="muted small">No bill generated yet</span>}
                        <div className="mt2 small muted">
                            Last reading: {t.lastReading
                                ? `${t.lastReading.reading_value} on ${new Date(t.lastReading.submitted_at || 0).toLocaleDateString('en-IN')}`
                                : 'None submitted'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
