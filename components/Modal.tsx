'use client'

import { ReactNode } from 'react'

interface ModalProps {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
    if (!open) return null
    return (
        <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-hd">
                    <h2>{title}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                {children}
            </div>
        </div>
    )
}
