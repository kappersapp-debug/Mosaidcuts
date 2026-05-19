'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

/* ─── Types ──────────────────────────────────────────────── */
interface Service { id: string; name: string; price: number; duration: number; desc: string }
interface SlotInfo { time: string; available: boolean }
interface BookingResult { code: string; service: string; price: number; duration: number; date: string; time: string; name: string }

/* ─── Constants ──────────────────────────────────────────── */
const FALLBACK_SERVICES: Service[] = [
  { id: 'knipbeurt', name: 'Normale Knipbeurt', price: 15, duration: 30, desc: '30 minuten' },
  { id: 'baard', name: 'Baard Trimmen', price: 10, duration: 20, desc: '20 minuten' },
  { id: 'knipbeurt-baard', name: 'Knipbeurt + Baard', price: 20, duration: 30, desc: '30 minuten' },
]

const NL_DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const NL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const NL_DAYS_LONG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

/* ─── Helpers ────────────────────────────────────────────── */
function formatDateNL(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${NL_DAYS_LONG[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function downloadICS(booking: BookingResult) {
  const [year, month, day] = booking.date.split('-').map(Number)
  const [hour, min] = booking.time.split(':').map(Number)
  const start = new Date(year, month - 1, day, hour, min)
  const end = new Date(start.getTime() + booking.duration * 60000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MoSaidCuts//NL',
    'BEGIN:VEVENT',
    `UID:${booking.code}@mosaidcuts.nl`,
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${booking.service} bij MoSaidCuts`,
    `DESCRIPTION:Boekingscode: ${booking.code}\\nNaam: ${booking.name}`,
    'LOCATION:MoSaidCuts Barbershop',
    `DTSTAMP:${fmt(new Date())}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `mosaidcuts-${booking.code}.ics`; a.click()
  URL.revokeObjectURL(url)
}

function googleCalLink(booking: BookingResult) {
  const [year, month, day] = booking.date.split('-').map(Number)
  const [hour, min] = booking.time.split(':').map(Number)
  const start = new Date(year, month - 1, day, hour, min)
  const end = new Date(start.getTime() + booking.duration * 60000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${booking.service} bij MoSaidCuts`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Boekingscode: ${booking.code}`,
    location: 'MoSaidCuts Barbershop',
  })
  return `https://www.google.com/calendar/render?${p}`
}

/* ─── Calendar Component ─────────────────────────────────── */
function Calendar({ value, onChange, availability, blockedDates, slotAvailability, onMonthChange }: {
  value: string
  onChange: (date: string) => void
  availability: Record<string, boolean>
  blockedDates: string[]
  slotAvailability?: Record<string, { available: number; total: number }>
  onMonthChange?: (month: string) => void
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7
  const cells: (Date | null)[] = Array(startOffset).fill(null)
  for (let i = 1; i <= lastDay.getDate(); i++) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i))
  }

  const prevMonth = () => {
    const m = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
    setViewMonth(m)
    onMonthChange?.(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const m = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
    setViewMonth(m)
    onMonthChange?.(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  const canPrev = viewMonth > new Date(today.getFullYear(), today.getMonth(), 1)

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} disabled={!canPrev}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[#2176d4] font-bold text-lg">‹</button>
        <span className="font-bold text-white capitalize">
          {viewMonth.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={nextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1e1e1e] hover:bg-[#2a2a2a] transition-colors text-[#2176d4] font-bold text-lg">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {NL_DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-bold text-gray-600 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const ds = toDateStr(day)
          const dow = day.getDay()
          const isPast = day < today
          const isDayOff = availability[String(dow)] === false
          const isBlocked = blockedDates.includes(ds)
          const disabled = isPast || isDayOff || isBlocked
          const selected = ds === value
          const isToday = day.getTime() === today.getTime()
          const sa = slotAvailability?.[ds]
          const isFull = sa && sa.total > 0 && sa.available === 0
          const isLow = sa && sa.available > 0 && sa.available <= 2
          return (
            <button key={i} disabled={disabled} onClick={() => onChange(ds)}
              className={[
                'aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-semibold transition-all gap-0.5',
                selected ? 'bg-[#2176d4] text-white shadow-[0_0_12px_rgba(33,118,212,0.35)]' : '',
                isToday && !selected ? 'ring-1 ring-[#2176d4] text-[#2176d4] bg-[#2176d4]/10' : '',
                disabled ? 'text-gray-700 cursor-not-allowed' : !selected ? 'hover:bg-[#2176d4]/15 text-gray-400 hover:text-white' : '',
              ].join(' ')}>
              <span className="leading-none">{day.getDate()}</span>
              {!disabled && sa && (
                <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white/60' : isFull ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-400'}`}/>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Progress Indicator ─────────────────────────────────── */
function Progress({ step }: { step: number }) {
  const labels = ['Dienst', 'Datum', 'Tijd', 'Gegevens', 'Verificatie']
  return (
    <div className="flex items-start justify-between mb-8">
      {labels.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={n} className="flex flex-col items-center flex-1 relative">
            {i > 0 && (
              <div className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${n <= step ? 'bg-[#2176d4]' : 'bg-[#333]'}`} />
            )}
            <div className={[
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black mb-1 relative z-10 transition-all',
              done ? 'bg-[#2176d4] text-white' : active ? 'bg-[#2176d4] text-white ring-4 ring-[#2176d4]/20' : 'bg-[#222] text-gray-600',
            ].join(' ')}>
              {done ? '✓' : n}
            </div>
            <span className={`text-xs font-semibold ${active || done ? 'text-[#2176d4]' : 'text-gray-600'}`}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Main Booking Page ──────────────────────────────────── */
export default function BookingPage() {
  const [step, setStep] = useState<number | 'confirmation' | 'banned'>(1)
  const [service, setService] = useState<Service | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])
  const [booking, setBooking] = useState<BookingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})
  const [services, setServices] = useState<Service[]>(FALLBACK_SERVICES)
  const [availability, setAvailability] = useState<Record<string, boolean>>({
    '0': false, '1': true, '2': true, '3': true, '4': true, '5': true, '6': false,
  })
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelStatus, setCancelStatus] = useState<'idle'|'checking'|'active'|'cancelled'|'not_found'>('idle')
  const [emailSent, setEmailSent] = useState(true)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [cancelEmail, setCancelEmail] = useState('')
  const [lookup, setLookup] = useState(false)
  const [lookupCode, setLookupCode] = useState('')
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookupResult, setLookupResult] = useState<{code:string;name:string;service:string;price:number;date:string;time:string}|null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [isReturning, setIsReturning] = useState(false)
  const savedEmailRef = useRef('')
  const [cookieConsent, setCookieConsent] = useState<'yes'|'no'|null>(null)
  const [slotAvailability, setSlotAvailability] = useState<Record<string, { available: number; total: number }>>({})
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlistForm, setWaitlistForm] = useState({ name: '', phone: '', email: '', note: '' })
  const [waitlistStep, setWaitlistStep] = useState<'form'|'verify'>('form')
  const [waitlistCodeDigits, setWaitlistCodeDigits] = useState(['','','','','',''])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')
  const [waitlistResendCooldown, setWaitlistResendCooldown] = useState(0)
  const [waitlistDone, setWaitlistDone] = useState(false)
  const waitlistCodeRefs = useRef<(HTMLInputElement|null)[]>([])
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  function getCookie(name: string) {
    return document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=').slice(1).join('=') ?? null
  }

  function saveCustomerCookie(name: string, phone: string, email: string) {
    if (getCookie('msc_consent') !== 'yes') return
    const val = encodeURIComponent(JSON.stringify({ name, phone, email }))
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `msc_customer=${val}; expires=${expires}; path=/; SameSite=Lax`
  }

  function acceptCookies() {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `msc_consent=yes; expires=${expires}; path=/; SameSite=Lax`
    setCookieConsent('yes')
  }

  function declineCookies() {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `msc_consent=no; expires=${expires}; path=/; SameSite=Lax`
    document.cookie = 'msc_customer=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    setCookieConsent('no')
    setIsReturning(false)
  }

  useEffect(() => {
    const consent = getCookie('msc_consent')
    if (consent) {
      setCookieConsent(consent as 'yes'|'no')
      if (consent === 'yes') {
        const raw = getCookie('msc_customer')
        if (raw) {
          try {
            const saved = JSON.parse(decodeURIComponent(raw))
            if (saved.email && saved.name) {
              setContact({ name: saved.name, phone: saved.phone ?? '', email: saved.email })
              setWaitlistForm(f => ({ ...f, name: saved.name, phone: saved.phone ?? '', email: saved.email }))
              savedEmailRef.current = saved.email
              setIsReturning(true)
            }
          } catch { /* ignore */ }
        }
      }
    }
  }, [])

  useEffect(() => {
    fetch('/api/portaal/settings')
      .then(r => r.json())
      .then(d => {
        const s = d.settings ?? {}
        if (s.services) setServices(JSON.parse(s.services))
        if (s.day_schedule) {
          const sched: Record<string, {open: boolean}> = JSON.parse(s.day_schedule)
          const avail: Record<string, boolean> = {}
          for (const [k, v] of Object.entries(sched)) avail[k] = v.open
          setAvailability(avail)
        } else if (s.availability) {
          setAvailability(JSON.parse(s.availability))
        }
        if (s.blocked_dates) setBlockedDates(JSON.parse(s.blocked_dates))
      })
      .catch(() => {})

    // Handle cancel link from email (?annuleer=MSCXXXXX)
    const params = new URLSearchParams(window.location.search)
    const cancelCode = params.get('annuleer')
    if (cancelCode) {
      const code = cancelCode.toUpperCase()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBooking({ code, service: '', price: 0, duration: 0, date: '', time: '', name: '' })
      setStep('confirmation')
      setCancelStatus('checking')
      fetch(`/api/bookings/cancel?code=${encodeURIComponent(code)}`)
        .then(r => r.json())
        .then(d => {
          setCancelStatus(d.status)
          if (d.status === 'active') setCancelConfirm(true)
        })
        .catch(() => setCancelStatus('active'))
    }
  }, [])

  async function fetchMonthAvailability(month: string, dur: number) {
    try {
      const r = await fetch(`/api/availability?month=${month}&duration=${dur}`)
      if (!r.ok) return
      const d = await r.json()
      setSlotAvailability(prev => ({ ...prev, ...(d.days ?? {}) }))
    } catch { /* non-fatal */ }
  }

  async function fetchSlots(d: string, dur: number) {
    setSlotsLoading(true)
    setSlots([])
    try {
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
      const nowParam = d === todayStr
        ? `&now=${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`
        : ''
      const r = await fetch(`/api/slots?date=${d}&duration=${dur}${nowParam}`)
      const data = await r.json()
      setSlots(data.slots ?? [])
    } finally {
      setSlotsLoading(false)
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const errs: Record<string,string> = {}
    if (!contact.name.trim()) errs.name = 'Naam is verplicht'
    if (!contact.phone.trim()) errs.phone = 'Telefoonnummer is verplicht'
    if (!contact.email.trim()) errs.email = 'E-mailadres is verplicht'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) errs.email = 'Ongeldig e-mailadres'
    if (Object.keys(errs).length) { setFieldErrors(errs); return }
    setFieldErrors({})
    setLoading(true)

    if (isReturning && contact.email.toLowerCase() === savedEmailRef.current.toLowerCase()) {
      try {
        const br = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: contact.name, phone: contact.phone, email: contact.email,
            service: service!.name, price: service!.price, duration: service!.duration,
            date, time,
          }),
        })
        const bd = await br.json()
        if (!br.ok) { setError(bd.error ?? 'Boeking mislukt'); return }
        saveCustomerCookie(contact.name, contact.phone, contact.email)
        setBooking(bd)
        setStep('confirmation')
      } catch {
        setError('Netwerkfout, probeer opnieuw')
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const r = await fetch('/api/verify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.email }),
      })
      const data = await r.json()
      if (data.banned) { setStep('banned'); return }
      if (!r.ok) { setError(data.error ?? 'Fout bij verzenden code'); return }
      setEmailSent(data.emailSent ?? true)
      if (data.devCode) setCodeDigits(data.devCode.split(''))
      setStep(5)
      setResendCooldown(60)
      const interval = setInterval(() => {
        setResendCooldown(s => { if (s <= 1) { clearInterval(interval); return 0 } return s - 1 })
      }, 1000)
    } catch {
      setError('Netwerkfout, probeer opnieuw')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(overrideDigits?: string[]) {
    setError('')
    setLoading(true)
    const code = (overrideDigits ?? codeDigits).join('')
    try {
      const vr = await fetch('/api/verify/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.email, code }),
      })
      const vd = await vr.json()
      if (!vr.ok || !vd.valid) { setError(vd.error ?? 'Ongeldige code'); return }

      const br = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contact.name, phone: contact.phone, email: contact.email,
          service: service!.name, price: service!.price, duration: service!.duration,
          date, time,
        }),
      })
      const bd = await br.json()
      if (!br.ok) { setError(bd.error ?? 'Boeking mislukt'); return }
      saveCustomerCookie(contact.name, contact.phone, contact.email)
      savedEmailRef.current = contact.email
      setIsReturning(true)
      setBooking(bd)
      setStep('confirmation')
    } catch {
      setError('Netwerkfout, probeer opnieuw')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0) return
    setError('')
    setCodeDigits(['', '', '', '', '', ''])
    await fetch('/api/verify/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: contact.email }),
    })
    codeRefs.current[0]?.focus()
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(interval); return 0 }
        return s - 1
      })
    }, 1000)
  }

  async function handleCancel() {
    if (!booking) return
    const emailToUse = contact.email || cancelEmail
    if (!emailToUse) return
    setLoading(true)
    try {
      const r = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: booking.code, email: emailToUse }),
      })
      if (!r.ok) { setError('Annuleren mislukt. Controleer uw e-mailadres.'); return }
      setStep(1); setService(null); setDate(''); setTime('')
      setContact({ name: '', phone: '', email: '' }); setBooking(null); setCancelConfirm(false); setCancelEmail('')
    } finally {
      setLoading(false)
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    setLookupError(''); setLookupResult(null); setLookupLoading(true)
    try {
      const r = await fetch(`/api/bookings/lookup?code=${encodeURIComponent(lookupCode.trim().toUpperCase())}&email=${encodeURIComponent(lookupEmail.trim())}`)
      const d = await r.json()
      if (!r.ok) { setLookupError('Geen afspraak gevonden. Controleer uw code en e-mailadres.'); return }
      setLookupResult(d.booking)
    } finally { setLookupLoading(false) }
  }

  function handleCodeInput(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...codeDigits]; next[i] = digit; setCodeDigits(next)
    if (digit && i < 5) { codeRefs.current[i + 1]?.focus() }
    else if (digit && i === 5 && next.every(d => d !== '')) { setTimeout(() => handleVerify(next), 50) }
  }

  function handleCodeKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !codeDigits[i] && i > 0) codeRefs.current[i - 1]?.focus()
  }

  async function handleWaitlistSubmit() {
    setWaitlistError('')
    if (!waitlistForm.name.trim() || !waitlistForm.phone.trim()) return
    if (waitlistForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitlistForm.email)) {
      setWaitlistError('Ongeldig e-mailadres'); return
    }
    setWaitlistLoading(true)
    const skipVerify = !waitlistForm.email || (isReturning && waitlistForm.email.toLowerCase() === savedEmailRef.current.toLowerCase())
    if (skipVerify) {
      try {
        const wr = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: waitlistForm.name, phone: waitlistForm.phone, email: waitlistForm.email, note: waitlistForm.note, preferred_date: date, service: service?.name ?? '' }) })
        const wd = await wr.json()
        if (!wr.ok) { setWaitlistError(wd.error ?? 'Aanmelding mislukt'); setWaitlistLoading(false); return }
      } catch { setWaitlistError('Netwerkfout'); setWaitlistLoading(false); return }
      if (waitlistForm.email) {
        saveCustomerCookie(waitlistForm.name, waitlistForm.phone, waitlistForm.email)
        savedEmailRef.current = waitlistForm.email
        setIsReturning(true)
        setContact({ name: waitlistForm.name, phone: waitlistForm.phone, email: waitlistForm.email })
      }
      setWaitlistLoading(false); setWaitlistDone(true); return
    }
    try {
      const r = await fetch('/api/verify/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: waitlistForm.email }) })
      const d = await r.json()
      if (!r.ok) { setWaitlistError(d.error ?? 'Fout bij verzenden code'); setWaitlistLoading(false); return }
      if (d.devCode) setWaitlistCodeDigits(d.devCode.split(''))
      setWaitlistStep('verify')
      setWaitlistResendCooldown(60)
      const interval = setInterval(() => setWaitlistResendCooldown(s => { if (s <= 1) { clearInterval(interval); return 0 } return s - 1 }), 1000)
    } catch { setWaitlistError('Netwerkfout') }
    setWaitlistLoading(false)
  }

  function handleWaitlistCodeInput(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...waitlistCodeDigits]; next[i] = digit; setWaitlistCodeDigits(next)
    if (digit && i < 5) { waitlistCodeRefs.current[i + 1]?.focus() }
    else if (digit && i === 5 && next.every(d => d !== '')) { setTimeout(() => handleWaitlistVerify(next), 50) }
  }

  function handleWaitlistCodeKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !waitlistCodeDigits[i] && i > 0) waitlistCodeRefs.current[i - 1]?.focus()
  }

  function handleWaitlistCodePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) { setWaitlistCodeDigits(text.split('')); waitlistCodeRefs.current[5]?.focus(); e.preventDefault() }
  }

  async function handleWaitlistVerify(overrideDigits?: string[]) {
    setWaitlistError(''); setWaitlistLoading(true)
    try {
      const vr = await fetch('/api/verify/check', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: waitlistForm.email, code: (overrideDigits ?? waitlistCodeDigits).join('') }) })
      const vd = await vr.json()
      if (!vr.ok || !vd.valid) { setWaitlistError(vd.error ?? 'Ongeldige code'); setWaitlistLoading(false); return }
      const wr = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: waitlistForm.name, phone: waitlistForm.phone, email: waitlistForm.email, note: waitlistForm.note, preferred_date: date, service: service?.name ?? '' }) })
      const wd = await wr.json()
      if (!wr.ok) { setWaitlistError(wd.error ?? 'Aanmelding mislukt'); setWaitlistLoading(false); return }
      saveCustomerCookie(waitlistForm.name, waitlistForm.phone, waitlistForm.email)
      savedEmailRef.current = waitlistForm.email
      setIsReturning(true)
      setContact({ name: waitlistForm.name, phone: waitlistForm.phone, email: waitlistForm.email })
      setWaitlistDone(true)
    } catch { setWaitlistError('Netwerkfout') }
    setWaitlistLoading(false)
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) { setCodeDigits(text.split('')); codeRefs.current[5]?.focus(); e.preventDefault() }
  }

  // Auto-open waitlist when all slots on a day are full
  useEffect(() => {
    if (step === 3 && !slotsLoading && slots.length > 0 && !slots.some(s => s.available) && !waitlistDone) {
      setShowWaitlist(true)
    }
  }, [step, slotsLoading, slots, waitlistDone])

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex flex-col font-[family-name:var(--font-barlow)]">
      <header className="bg-[#0e0e0e] border-b border-[#1e1e1e]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="MoSaidCuts" width={38} height={38} className="rounded-full object-cover ring-2 ring-[#2176d4]/30 shrink-0"/>
            <div>
              <h1 className="text-white font-[family-name:var(--font-bebas)] tracking-widest text-xl leading-none">MoSaidCuts</h1>
              <p className="text-gray-600 text-[10px] tracking-wider uppercase">Barbershop</p>
            </div>
          </div>
          <button onClick={() => setLookup(true)}
            className="text-xs font-semibold text-gray-500 hover:text-[#2176d4] transition-colors whitespace-nowrap">
            Afspraak opzoeken
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-lg bg-[#141414] rounded-2xl border border-[#2a2a2a] overflow-hidden shadow-2xl">

          {step === 'banned' && (
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✗</div>
              <h2 className="text-xl font-bold text-white mb-2">Toegang Geblokkeerd</h2>
              <p className="text-gray-500 mb-1">Uw e-mailadres is geblokkeerd voor het maken van afspraken.</p>
              <p className="text-gray-600 text-sm">Neem contact op met de barbershop voor meer informatie.</p>
            </div>
          )}

          {step === 'confirmation' && booking && cancelStatus === 'checking' && (
            <div className="p-8 flex justify-center">
              <div className="w-8 h-8 border-4 border-[#2176d4] border-t-transparent rounded-full animate-spin"/>
            </div>
          )}

          {step === 'confirmation' && booking && (cancelStatus === 'cancelled' || cancelStatus === 'not_found') && (
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400 text-2xl">✗</div>
              <h2 className="text-xl font-bold text-white mb-2">Afspraak niet gevonden</h2>
              <p className="text-gray-500 text-sm">
                {cancelStatus === 'cancelled' ? 'Deze afspraak is al geannuleerd.' : 'Deze afspraak bestaat niet.'}
              </p>
              <button onClick={() => { setStep(1); setBooking(null); setCancelStatus('idle') }}
                className="mt-6 px-6 py-2.5 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] transition-colors">
                Nieuwe afspraak maken
              </button>
            </div>
          )}

          {step === 'confirmation' && booking && (cancelStatus === 'idle' || cancelStatus === 'active') && (
            <div className="p-6 sm:p-8">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-[#2176d4]/15 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold text-[#2176d4]">✓</div>
                <h2 className="text-xl font-bold text-white">Afspraak Bevestigd</h2>
                <p className="text-gray-500 text-sm mt-1">U ontvangt een bevestiging per e-mail</p>
              </div>
              <div className="bg-[#2176d4]/10 border border-[#2176d4]/20 rounded-xl p-5 mb-5 text-center">
                <p className="text-xs font-bold text-[#2176d4]/70 uppercase tracking-widest mb-1">Boekingscode</p>
                <p className="text-3xl font-black text-[#2176d4] tracking-widest">{booking.code}</p>
              </div>
              <div className="mb-6 rounded-xl overflow-hidden border border-[#2a2a2a] divide-y divide-[#1e1e1e]">
                {[['Dienst', booking.service], ['Datum', formatDateNL(booking.date)], ['Tijd', booking.time], ['Prijs', `€${booking.price}`]].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-gray-500 font-medium">{k}</span>
                    <span className="font-bold text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <button onClick={() => downloadICS(booking)}
                  className="w-full py-3 px-4 rounded-xl border border-[#2a2a2a] text-gray-300 font-medium hover:border-[#2176d4]/50 hover:text-white transition-all">
                  Agenda toevoegen (.ics)
                </button>
                <a href={googleCalLink(booking)} target="_blank" rel="noopener noreferrer"
                  className="block w-full py-3 px-4 rounded-xl border border-[#2a2a2a] text-gray-300 font-medium hover:border-[#2176d4]/50 hover:text-white transition-all text-center">
                  Google Agenda
                </a>
                {!cancelConfirm ? (
                  <div className="space-y-1">
                    <button onClick={() => { setStep(1); setService(null); setDate(''); setTime(''); setBooking(null); setCancelConfirm(false); setCancelStatus('idle') }}
                      className="w-full py-2.5 text-[#2176d4] font-bold text-sm hover:text-white transition-colors">
                      Nieuwe afspraak maken →
                    </button>
                    <button onClick={() => setCancelConfirm(true)}
                      className="w-full py-2 text-red-400 font-semibold text-sm hover:text-red-300 transition-colors">
                      Afspraak annuleren
                    </button>
                  </div>
                ) : (
                  <div className="bg-red-900/15 border border-red-700/30 rounded-xl p-4">
                    <p className="text-gray-300 font-semibold mb-3 text-sm text-center">Weet u zeker dat u wilt annuleren?</p>
                    {!contact.email && !lookupResult && (
                      <input type="email" placeholder="Uw e-mailadres ter bevestiging" value={cancelEmail}
                        onChange={e => setCancelEmail(e.target.value)}
                        className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:border-red-500 transition-colors"/>
                    )}
                    {error && <p className="text-red-400 text-xs font-semibold mb-2">{error}</p>}
                    <div className="flex gap-3">
                      <button onClick={() => { setCancelConfirm(false); setError('') }}
                        className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] font-bold text-gray-400 text-sm hover:border-[#333] hover:text-white transition-all">Nee</button>
                      <button onClick={handleCancel} disabled={loading || (!contact.email && !lookupResult && !cancelEmail)}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-500 disabled:opacity-50 transition-colors">
                        {loading ? '...' : 'Ja, annuleren'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {typeof step === 'number' && (
            <div className="p-6 sm:p-8">
              <Progress step={step} />

              {error && (
                <div className="bg-red-900/30 border border-red-700/40 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm font-semibold">
                  {error}
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="text-xl font-black text-white mb-1">Kies een dienst</h2>
                  <p className="text-gray-500 text-sm mb-5">Selecteer de gewenste behandeling</p>
                  <div className="space-y-3">
                    {services.map(s => (
                      <button key={s.id} onClick={() => { setService(s); setStep(2); const now = new Date(); fetchMonthAvailability(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, s.duration) }}
                        className={['w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left',
                          service?.id === s.id
                            ? 'border-[#2176d4] bg-[#2176d4]/10'
                            : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#2176d4]/50 hover:bg-[#2176d4]/5'].join(' ')}>
                        <div>
                          <p className="font-bold text-white">{s.name}</p>
                          <p className="text-sm text-gray-500">{s.desc}</p>
                        </div>
                        <p className="text-2xl font-black text-[#2176d4] ml-4">€{s.price}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="text-xl font-black text-white mb-1">Kies een datum</h2>
                  <p className="text-gray-500 text-sm mb-5">Selecteer een beschikbare dag</p>
                  <Calendar
                    value={date}
                    availability={availability}
                    blockedDates={blockedDates}
                    slotAvailability={slotAvailability}
                    onMonthChange={m => fetchMonthAvailability(m, service!.duration)}
                    onChange={d => {
                      setDate(d); setTime('')
                      setShowWaitlist(false); setWaitlistDone(false); setWaitlistStep('form')
                      setWaitlistCodeDigits(['','','','','','']); setWaitlistError('')
                      fetchSlots(d, service!.duration); setStep(3)
                    }}
                  />
                  <div className="mt-6">
                    <button onClick={() => setStep(1)}
                      className="w-full py-3 rounded-xl border border-[#2a2a2a] font-bold text-gray-400 hover:border-[#333] hover:text-white transition-all">‹ Terug</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="text-xl font-black text-white mb-1">Kies een tijd</h2>
                  <p className="text-gray-500 text-sm mb-5 capitalize">{date ? formatDateNL(date) : ''}</p>
                  {slotsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-[#2176d4] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (() => {
                    const hasAvailable = slots.some(s => s.available)
                    const waitlistUI = (
                      <div className="mt-4">
                        {!waitlistDone ? (
                          waitlistStep === 'verify' ? (
                            <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] p-5 space-y-4">
                              <div>
                                <h3 className="font-bold text-white text-sm">Verificatie</h3>
                                <p className="text-xs text-gray-500 mt-1">Code verstuurd naar <span className="text-white">{waitlistForm.email}</span></p>
                              </div>
                              {waitlistError && <p className="text-red-400 text-sm font-semibold">{waitlistError}</p>}
                              <div className="flex justify-center gap-2" onPaste={handleWaitlistCodePaste}>
                                {waitlistCodeDigits.map((digit, i) => (
                                  <input key={i} ref={el => { waitlistCodeRefs.current[i] = el }}
                                    type="text" inputMode="numeric" maxLength={1} value={digit}
                                    onChange={e => handleWaitlistCodeInput(i, e.target.value)}
                                    onKeyDown={e => handleWaitlistCodeKey(i, e)}
                                    className="w-10 h-12 text-center text-xl font-black bg-[#0e0e0e] border-2 border-[#2a2a2a] text-white rounded-xl focus:outline-none focus:border-[#2176d4] transition-colors caret-transparent"/>
                                ))}
                              </div>
                              <button onClick={() => handleWaitlistVerify()} disabled={waitlistCodeDigits.join('').length < 6 || waitlistLoading}
                                className="w-full py-2.5 rounded-xl bg-[#2176d4] text-white text-sm font-bold hover:bg-[#3080e0] disabled:opacity-40 transition-all">
                                {waitlistLoading ? 'Bevestigen...' : 'Bevestigen'}
                              </button>
                              <button onClick={async () => { if(waitlistResendCooldown>0)return; setWaitlistCodeDigits(['','','','','','']); const r=await fetch('/api/verify/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:waitlistForm.email})}); if(r.ok){setWaitlistResendCooldown(60);const iv=setInterval(()=>setWaitlistResendCooldown(s=>{if(s<=1){clearInterval(iv);return 0}return s-1}),1000)} }} disabled={waitlistResendCooldown>0}
                                className="w-full py-1.5 text-xs font-semibold text-[#2176d4] disabled:text-gray-700 disabled:cursor-not-allowed transition-colors">
                                {waitlistResendCooldown > 0 ? `Opnieuw sturen (${waitlistResendCooldown}s)` : 'Code opnieuw sturen'}
                              </button>
                            </div>
                          ) : (
                            <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] p-5 space-y-4">
                              <h3 className="font-bold text-white text-sm">Wachtlijst voor {date ? new Date(date+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'long'}) : 'deze dag'}</h3>
                              {isReturning && waitlistForm.email.toLowerCase() === savedEmailRef.current.toLowerCase() && (
                                <div className="flex items-center gap-2 bg-[#2176d4]/10 border border-[#2176d4]/20 rounded-xl px-3 py-2">
                                  <svg className="w-4 h-4 text-[#2176d4] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                                  <p className="text-xs text-[#2176d4]">Welkom terug, <strong>{waitlistForm.name}</strong> — geen verificatie nodig</p>
                                </div>
                              )}
                              {waitlistError && <p className="text-red-400 text-sm font-semibold">{waitlistError}</p>}
                              <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Naam *</label>
                                <input value={waitlistForm.name} onChange={e=>setWaitlistForm(f=>({...f,name:e.target.value}))} placeholder="Uw naam"
                                  className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Telefoon *</label>
                                <input value={waitlistForm.phone} onChange={e=>setWaitlistForm(f=>({...f,phone:e.target.value}))} placeholder="06 12345678" type="tel"
                                  className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">E-mail <span className="text-gray-600 normal-case font-normal text-[10px]">(aanbevolen — voor bevestiging)</span></label>
                                <input type="email" value={waitlistForm.email} onChange={e=>setWaitlistForm(f=>({...f,email:e.target.value}))} placeholder="uw@email.com"
                                  className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Opmerking <span className="text-gray-700 normal-case font-normal">(optioneel)</span></label>
                                <input value={waitlistForm.note} onChange={e=>setWaitlistForm(f=>({...f,note:e.target.value}))} placeholder="bijv. voorkeurstijd"
                                  className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
                              </div>
                              <div className="flex gap-3 pt-1">
                                <button onClick={() => setShowWaitlist(false)}
                                  className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] text-gray-400 text-sm font-medium hover:border-[#333] transition-all">
                                  Annuleren
                                </button>
                                <button disabled={!waitlistForm.name || !waitlistForm.phone || waitlistLoading}
                                  onClick={handleWaitlistSubmit}
                                  className="flex-1 py-2.5 rounded-xl bg-[#2176d4] text-white text-sm font-bold hover:bg-[#3080e0] disabled:opacity-40 transition-all">
                                  {waitlistLoading ? 'Bezig...' : waitlistForm.email && !(isReturning && waitlistForm.email.toLowerCase() === savedEmailRef.current.toLowerCase()) ? 'Verificeren →' : 'Aanmelden'}
                                </button>
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="bg-[#2176d4]/10 border border-[#2176d4]/20 rounded-2xl px-5 py-4 text-center">
                            <p className="font-bold text-[#2176d4] text-sm">✓ Je staat op de wachtlijst!</p>
                            <p className="text-xs text-gray-500 mt-1">We nemen contact op als er een plek vrijkomt.</p>
                          </div>
                        )}
                      </div>
                    )
                    if (slots.length === 0) return (
                      <div className="py-2">
                        <p className="text-center text-gray-500 py-4 font-medium">Geen beschikbare tijden op deze dag</p>
                      </div>
                    )
                    return (
                      <div>
                        {!hasAvailable && (
                          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
                            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                            <div>
                              <p className="text-sm font-bold text-amber-400">Dag vol</p>
                              <p className="text-xs text-amber-500/70">Meld je aan voor de wachtlijst hieronder</p>
                            </div>
                          </div>
                        )}
                        {!hasAvailable && waitlistUI}
                        <div className={`grid grid-cols-4 gap-2 ${!hasAvailable ? 'mt-3 opacity-40 pointer-events-none' : ''}`}>
                          {slots.map(slot => (
                            <button key={slot.time} disabled={!slot.available}
                              onClick={() => { setTime(slot.time); setStep(4) }}
                              className={['py-3 rounded-xl text-sm font-bold transition-all',
                                slot.available
                                  ? time === slot.time
                                    ? 'bg-[#2176d4] text-white shadow-[0_0_15px_rgba(33,118,212,0.3)]'
                                    : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#2176d4] hover:bg-[#2176d4] hover:text-white hover:border-[#2176d4]'
                                  : 'bg-[#161616] border border-[#1e1e1e] text-gray-700 cursor-not-allowed',
                              ].join(' ')}>
                              {slot.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setStep(2)}
                      className="flex-1 py-3 rounded-xl border border-[#2a2a2a] font-bold text-gray-400 hover:border-[#333] hover:text-white transition-all">‹ Terug</button>
                    <button disabled={!time} onClick={() => setStep(4)}
                      className="flex-1 py-3 rounded-xl bg-[#2176d4] text-white font-bold hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                      Volgende ›
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <form onSubmit={handleContactSubmit} noValidate>
                  <h2 className="text-xl font-black text-white mb-1">Uw gegevens</h2>
                  {isReturning && contact.email.toLowerCase() === savedEmailRef.current.toLowerCase() ? (
                    <div className="flex items-center gap-2 bg-[#2176d4]/10 border border-[#2176d4]/20 rounded-xl px-4 py-2.5 mb-5">
                      <svg className="w-4 h-4 text-[#2176d4] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                      <p className="text-sm text-[#2176d4]">Welkom terug, <strong>{contact.name}</strong> — geen verificatie nodig</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm mb-5">Vul uw contactinformatie in</p>
                  )}
                  <div className="space-y-4">
                    {[
                      { label: 'Naam', key: 'name', type: 'text', placeholder: 'Uw volledige naam', autoComplete: 'name' },
                      { label: 'Telefoonnummer', key: 'phone', type: 'tel', placeholder: '+31 6 12345678', autoComplete: 'tel' },
                      { label: 'E-mailadres', key: 'email', type: 'email', placeholder: 'uw@email.com', autoComplete: 'email' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">{f.label}</label>
                        <input type={f.type} placeholder={f.placeholder} autoComplete={f.autoComplete}
                          value={contact[f.key as keyof typeof contact]}
                          onChange={e => { setContact(c => ({ ...c, [f.key]: e.target.value })); setFieldErrors(fe => ({ ...fe, [f.key]: '' })) }}
                          className={`w-full bg-[#0e0e0e] border text-white placeholder-gray-700 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none transition-colors ${fieldErrors[f.key] ? 'border-red-500/70 focus:border-red-500' : 'border-[#2a2a2a] focus:border-[#2176d4]'}`} />
                        {fieldErrors[f.key] && (
                          <p className="mt-1.5 text-xs text-red-400 font-semibold">{fieldErrors[f.key]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button type="button" onClick={() => setStep(3)}
                      className="flex-1 py-3 rounded-xl border border-[#2a2a2a] font-bold text-gray-400 hover:border-[#333] hover:text-white transition-all">‹ Terug</button>
                    <button type="submit" disabled={loading}
                      className="flex-1 py-3 rounded-xl bg-[#2176d4] text-white font-bold hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-50 transition-all">
                      {loading ? 'Bezig...' : 'Volgende ›'}
                    </button>
                  </div>
                </form>
              )}

              {step === 5 && (
                <div>
                  <h2 className="text-xl font-black text-white mb-1">Verificatie</h2>
                  {emailSent ? (
                    <>
                      <p className="text-gray-500 text-sm mb-1">We hebben een 6-cijferige code gestuurd naar</p>
                      <p className="font-bold text-white mb-3">{contact.email}</p>
                      <div className="bg-[#2176d4]/8 border border-[#2176d4]/20 rounded-xl px-4 py-2.5 mb-5 text-xs text-[#2176d4]/80">
                        Het kan 1 à 2 minuten duren voordat u de code ontvangt. Check ook uw spam.
                      </div>
                    </>
                  ) : (
                    <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 mb-6 text-sm">
                      <p className="font-bold text-amber-400">E-mail kon niet worden verzonden</p>
                      <p className="text-amber-500/80 mt-0.5">De code is alvast ingevuld.</p>
                    </div>
                  )}
                  <div className="flex justify-center gap-2 mb-6" onPaste={handleCodePaste}>
                    {codeDigits.map((digit, i) => (
                      <input key={i}
                        ref={el => { codeRefs.current[i] = el }}
                        type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={e => handleCodeInput(i, e.target.value)}
                        onKeyDown={e => handleCodeKey(i, e)}
                        className="w-11 h-14 text-center text-2xl font-black bg-[#0e0e0e] border-2 border-[#2a2a2a] text-white rounded-xl focus:outline-none focus:border-[#2176d4] transition-colors caret-transparent" />
                    ))}
                  </div>
                  <button onClick={() => handleVerify()} disabled={codeDigits.join('').length < 6 || loading}
                    className="w-full py-3 rounded-xl bg-[#2176d4] text-white font-bold hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-3">
                    {loading ? 'Bevestigen...' : 'Bevestigen'}
                  </button>
                  <button onClick={handleResendCode} disabled={resendCooldown > 0}
                    className="w-full py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:text-gray-700 text-[#2176d4] hover:text-[#3080e0]">
                    {resendCooldown > 0 ? `Code opnieuw sturen (${resendCooldown}s)` : 'Code opnieuw sturen'}
                  </button>
                  <button onClick={() => setStep(4)} className="w-full py-2 text-gray-600 text-sm hover:text-gray-400 transition-colors mt-1">‹ Terug</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Afspraak opzoeken */}
      <div className="max-w-lg mx-auto w-full px-4 mb-6">
        {!lookup ? (
          <button onClick={()=>setLookup(true)}
            className="w-full py-3 rounded-xl border border-[#2a2a2a] bg-[#141414] text-gray-500 text-sm hover:border-[#333] hover:text-gray-300 transition-all">
            Afspraak opzoeken of annuleren
          </button>
        ) : (
          <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-sm">Afspraak opzoeken</h3>
              <button onClick={()=>{setLookup(false);setLookupResult(null);setLookupError('');setLookupCode('')}}
                className="w-7 h-7 rounded-lg bg-[#1e1e1e] text-gray-500 hover:text-white flex items-center justify-center text-lg leading-none transition-colors">×</button>
            </div>
            <form onSubmit={handleLookup} className="space-y-2 mb-4">
              <input value={lookupCode} onChange={e=>setLookupCode(e.target.value.toUpperCase())}
                placeholder="Boekingscode (bijv. MSCAB123)" maxLength={8}
                className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-4 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-[#2176d4] transition-colors uppercase"/>
              <div className="flex gap-2">
                <input type="email" value={lookupEmail} onChange={e=>setLookupEmail(e.target.value)}
                  placeholder="Uw e-mailadres"
                  className="flex-1 bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
                <button type="submit" disabled={lookupCode.length<5||!lookupEmail||lookupLoading}
                  className="px-4 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] disabled:opacity-40 transition-colors">
                  {lookupLoading ? '...' : 'Zoek'}
                </button>
              </div>
            </form>
            {lookupError && (
              <div className="bg-red-900/30 border border-red-700/40 text-red-400 rounded-xl px-4 py-2.5 text-sm font-semibold mb-2">{lookupError}</div>
            )}
            {lookupResult && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 divide-y divide-[#1e1e1e]">
                {[['Code', lookupResult.code], ['Naam', lookupResult.name], ['Dienst', lookupResult.service], ['Datum', formatDateNL(lookupResult.date)], ['Tijd', lookupResult.time], ['Prijs', `€${lookupResult.price}`]].map(([k,v]) => (
                  <div key={k} className="flex justify-between py-2 text-sm">
                    <span className="text-gray-500 font-medium">{k}</span>
                    <span className={`font-bold ${k==='Code' ? 'text-[#2176d4] font-black' : 'text-white'}`}>{v}</span>
                  </div>
                ))}
                <button onClick={()=>{
                  setBooking({...lookupResult, duration:0})
                  setCancelEmail(lookupEmail)
                  setStep('confirmation'); setCancelConfirm(true); setCancelStatus('active'); setLookup(false)
                }} className="w-full mt-2 pt-3 py-2 text-red-400 text-sm font-bold hover:text-red-300 transition-colors">
                  Afspraak annuleren
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="text-center text-gray-700 text-xs py-4 pb-8">
        © {new Date().getFullYear()} MoSaidCuts Barbershop
      </footer>

      {cookieConsent === null && step === 1 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-fade-up">
          <div className="max-w-lg mx-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold mb-0.5">Cookies</p>
              <p className="text-gray-500 text-xs">We slaan uw naam en e-mail op zodat u volgende keer sneller kunt boeken.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={declineCookies}
                className="px-4 py-2 rounded-xl border border-[#2a2a2a] text-gray-400 text-sm font-semibold hover:border-[#333] hover:text-white transition-all">
                Weigeren
              </button>
              <button onClick={acceptCookies}
                className="px-4 py-2 rounded-xl bg-[#2176d4] text-white text-sm font-bold hover:bg-[#3080e0] transition-all">
                Accepteren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
