'use client'

import { useState, useRef } from 'react'
import Spinner from './Spinner'
import { fmtINR } from '@/lib/utils'

interface BillData {
    units: number
    amount: number
}

interface BillUploadProps {
    onExtracted: (data: BillData) => void
}

export default function BillUpload({ onExtracted }: BillUploadProps) {
    const [imgUrl, setImgUrl] = useState<string | null>(null)
    const [ocr, setOcr] = useState<{ status: string; data: BillData | null }>({ status: 'idle', data: null })
    const fileRef = useRef<HTMLInputElement>(null)

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setOcr({ status: 'loading', data: null })

        // Show preview
        const reader = new FileReader()
        reader.onload = ev => setImgUrl(ev.target?.result as string)
        reader.readAsDataURL(file)

        // Call OCR API
        try {
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch('/api/ocr/bill', { method: 'POST', body: formData })
            const result = await res.json()

            if (result.success && result.units && result.amount) {
                const data = { units: result.units, amount: result.amount }
                setOcr({ status: 'done', data })
                onExtracted(data)
            } else {
                setOcr({ status: 'error', data: null })
            }
        } catch {
            setOcr({ status: 'error', data: null })
        }
    }

    return (
        <div>
            <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
            {!imgUrl ? (
                <div className="drop" onClick={() => fileRef.current?.click()}>
                    <div className="drop-icon">📄</div>
                    <div className="drop-text">Upload Mahavitaran Bill Image</div>
                    <div className="drop-sub">AI will extract total units &amp; total amount automatically</div>
                </div>
            ) : (
                <div>
                    <img src={imgUrl} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', marginBottom: '0.75rem' }} alt="Bill" />
                    {ocr.status === 'loading' && <div className="alert a-info">🤖 Extracting bill data... <Spinner /></div>}
                    {ocr.status === 'done' && ocr.data && (
                        <div className="alert a-ok">
                            ✓ Extracted — Units: <strong>{ocr.data.units} kWh</strong> · Amount: <strong>{fmtINR(ocr.data.amount)}</strong> — values filled below
                        </div>
                    )}
                    {ocr.status === 'error' && <div className="alert a-err">Could not parse bill. Please enter values manually below.</div>}
                    {ocr.status !== 'loading' && (
                        <button className="btn btn-ghost btn-sm mt2" onClick={() => { setImgUrl(null); setOcr({ status: 'idle', data: null }); }}>
                            Upload different bill
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
