import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { friendlyError } from './ajo'

/* ---------- Routing (hash-based so share links work on any static host) ---------- */

const current = () => location.hash.replace(/^#/, '') || '/'
export function useRoute() {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const on = () => { setRoute(current()); window.scrollTo(0, 0) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}
export const go = (path: string) => { location.hash = path }
export const joinLink = (code: string) => `${location.origin}${location.pathname}#/join/${code}`

/* ---------- Actions ---------- */

export function useAction() {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError('')
    try { await fn() } catch (e) { console.error(e); setError(friendlyError(e)) } finally { setBusy('') }
  }
  return { busy, error, run, setError }
}

/* ---------- Formatting ---------- */

// shortcut: fixed display rate; at launch take it from the naira anchor's SEP-38 quote.
export const NGN_PER_USDC = Number((import.meta as any).env?.VITE_NGN_RATE) || 1500
/** Money is held as USDC on Stellar and shown in naira. */
export const naira = (usd: number) => `₦${Math.round(usd * NGN_PER_USDC).toLocaleString('en-US')}`
export const usdc = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`
export const fromNaira = (ngn: string) => Math.round((Number(ngn) / NGN_PER_USDC) * 1e7) / 1e7
export const short = (pub: string) => `${pub.slice(0, 4)}…${pub.slice(-4)}`
export const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
export const day = (t?: number) => (t ? dayFmt.format(t) : '—')
export function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return day(t)
}
export function until(t?: number) {
  if (!t) return ''
  const d = Math.ceil((t - Date.now()) / 864e5)
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} late`
  if (d === 0) return 'due today'
  return d === 1 ? 'due tomorrow' : `due in ${d} days`
}

/* ---------- Small components ---------- */

export function Avatar({ name }: { name: string }) {
  return <span className="avatar" aria-hidden="true">{initials(name)}</span>
}

export function CopyButton({ text, label, className = 'btn btn-ghost btn-sm' }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600) } catch { prompt('Copy this:', text) }
    }}>
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  )
}

export function Spinner({ label }: { label: string }) {
  return <p className="muted small" role="status">{label}</p>
}

export function Skeleton({ h = 72 }: { h?: number }) {
  return <div className="skel" style={{ height: h }} aria-hidden="true" />
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return children ? <p className="error" role="alert">{children}</p> : null
}

/** Hand-built adire eleko motif: concentric rings and stitched dots, the resist-dye pattern the indigo comes from. */
export function Adire() {
  return (
    <svg className="adire" aria-hidden="true" preserveAspectRatio="xMidYMid slice" viewBox="0 0 240 160">
      <defs>
        <pattern id="adire" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="20" cy="20" r="1.6" fill="currentColor" />
          <circle cx="0" cy="0" r="2" fill="currentColor" />
          <circle cx="40" cy="0" r="2" fill="currentColor" />
          <circle cx="0" cy="40" r="2" fill="currentColor" />
          <circle cx="40" cy="40" r="2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="240" height="160" fill="url(#adire)" />
    </svg>
  )
}

export function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="10 4.14" />
      <circle cx="12" cy="3" r="2.4" fill="currentColor" />
    </svg>
  )
}

/* ---------- Sharing, reminders, QR ---------- */

export const circleLink = (code: string) => `${location.origin}${location.pathname}#/c/${code}`
export const scoreLink = (pub: string) => `${location.origin}${location.pathname}#/score/${pub}`
export const whatsapp = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

export function Qr({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    // The library emits black-on-white; recolour to currentColor so the QR follows the theme tokens.
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((s) => setSvg(s.replace(/#000000/g, 'currentColor').replace(/#ffffff/g, 'transparent')), () => setSvg(''))
  }, [text])
  return <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}
