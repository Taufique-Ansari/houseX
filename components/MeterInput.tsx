'use client'

import { useState, useRef } from 'react'
import Spinner from './Spinner'

interface ImageData {
    url: string
    file: File
}

interface MeterInputProps {
    onConfirm: (value: number, imgData: ImageData | null) => void
}

const procImgPreview = (file: File): Promise<string> =>
    new Promise(res => {
        const reader = new FileReader()
        reader.onload = e => res(e.target?.result as string)
        reader.readAsDataURL(file)
    })

export default function MeterInput({ onConfirm }: MeterInputProps) {
    const [mode, setMode] = useState<'manual' | 'photo'>('manual')
    const [val, setVal] = useState('')
    const [imgData, setImgData] = useState<ImageData | null>(null)
    const [ocr, setOcr] = useState<{ status: string; result: string }>({ status: 'idle', result: '' })
    const fileRef = useRef<HTMLInputElement>(null)

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setOcr({ status: 'loading', result: '' })

        const previewUrl = await procImgPreview(file)
        const data: ImageData = { url: previewUrl, file }
        setImgData(data)

        // Call OCR API
        try {
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch('/api/ocr/meter', { method: 'POST', body: formData })
            const result = await res.json()

            if (result.success && result.reading) {
                setVal(String(result.reading))
                setOcr({ status: 'done', result: String(result.reading) })
            } else {
                setOcr({ status: 'error', result: '' })
            }
        } catch {
            setOcr({ status: 'error', result: '' })
        }
    }

    const confirm = () => {
        if (!val || isNaN(Number(val))) return
        onConfirm(parseFloat(val), imgData)
        setVal('')
        setImgData(null)
        setOcr({ status: 'idle', result: '' })
    }

    return (
        <div>
            <div className="row mb3">
                <button onClick={() => setMode('manual')} className={`btn btn-sm ${mode === 'manual' ? 'btn-amber' : 'btn-ghost'}`}>
                    ✏️ Manual Entry
                </button>
                <button onClick={() => setMode('photo')} className={`btn btn-sm ${mode === 'photo' ? 'btn-amber' : 'btn-ghost'}`}>
                    📷 Photo + OCR
                </button>
            </div>
            {mode === 'manual' ? (
                <>
                    <input
                        className="fi mb3"
                        type="number"
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        placeholder="e.g., 12345"
                        onKeyDown={e => e.key === 'Enter' && confirm()}
                    />
                    <button className="btn btn-amber" onClick={confirm} disabled={!val || isNaN(Number(val))}>
                        Confirm Reading →
                    </button>
                </>
            ) : (
                <>
                    <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
                    {!imgData ? (
                        <div className="drop" onClick={() => fileRef.current?.click()}>
                            <div className="drop-icon">📸</div>
                            <div className="drop-text">Tap to take photo or upload from gallery</div>
                            <div className="drop-sub">AI will read the meter automatically</div>
                        </div>
                    ) : (
                        <>
                            <img src={imgData.url} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', marginBottom: '0.75rem' }} alt="Meter" />
                            {ocr.status === 'loading' && <div className="alert a-info mb3">🤖 AI is reading the meter... <Spinner /></div>}
                            {ocr.status === 'done' && <div className="alert a-ok mb3">✓ Detected: <strong>{ocr.result}</strong> — confirm or correct below</div>}
                            {ocr.status === 'error' && <div className="alert a-warn mb3">⚠️ Could not read clearly. Please type the reading below.</div>}
                            {ocr.status !== 'loading' && (
                                <div>
                                    <input className="fi mb3" type="number" value={val} onChange={e => setVal(e.target.value)} placeholder="Confirm or enter reading" />
                                    <div className="row">
                                        <button className="btn btn-amber" onClick={confirm} disabled={!val || isNaN(Number(val))}>Confirm →</button>
                                        <button className="btn btn-ghost" onClick={() => { setImgData(null); setOcr({ status: 'idle', result: '' }); setVal(''); }}>Retake</button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}
