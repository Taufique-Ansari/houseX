import { format } from 'date-fns'

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const CUR_M = new Date().getMonth() + 1
export const CUR_Y = new Date().getFullYear()

export const fmtINR = (n: number) =>
    `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtM = (m: number, y: number) => `${MONTHS[m - 1]} ${y}`
export const fmtMonthFull = (m: number, y: number) => `${MONTH_NAMES[m - 1]} ${y}`
export const monthName = (m: number) => MONTH_NAMES[m - 1]

export const fmtDate = (d: string | Date) => {
    try { return format(new Date(d), 'dd MMM yyyy') } catch { return '—' }
}

export const fmtDateTime = (d: string | Date) => {
    try { return format(new Date(d), 'dd MMM yyyy, hh:mm a') } catch { return '—' }
}

export const getDaysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate()

export const getPrevMonth = (m: number, y: number): [number, number] =>
    m === 1 ? [12, y - 1] : [m - 1, y]

export const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: '#374151', text: '#9ca3af', label: 'Draft' },
    published: { bg: '#1e3a5f', text: '#93c5fd', label: 'Published' },
    partial: { bg: '#451a03', text: '#fde68a', label: 'Partial' },
    paid: { bg: '#052e16', text: '#6ee7b7', label: 'Paid' },
    overdue: { bg: '#450a0a', text: '#fca5a5', label: 'Overdue' },
    pending: { bg: '#451a03', text: '#fde68a', label: 'Pending' },
}

export const PAYMENT_METHODS = [
    { value: 'upi', label: '📱 UPI' },
    { value: 'cash', label: '💵 Cash' },
    { value: 'bank_transfer', label: '🏦 Bank Transfer' },
    { value: 'cheque', label: '📝 Cheque' },
    { value: 'other', label: '📋 Other' },
]
