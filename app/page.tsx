'use client'

import { useState, useEffect, useRef } from 'react'

/* ─── Types ──────────────────────────────────────────────── */
interface Service { id: string; name: string; price: number; duration: number; desc: string }
interface SlotInfo { time: string; available: boolean }
interface BookingResult { code: string; service: string; price: number; duration: number; date: string; time: string; name: string }

/* ─── Constants ──────────────────────────────────────────── */
const FALLBACK_SERVICES: Service[] = [
  { id: 'knipbeurt', name: 'Normale Knipbeurt', price: 15, duration: 30, desc: '30 minuten' },
  { id: 'baard', name: 'Baard Trimmen', price: 10, duration: 20, desc: '20 minuten' },
  { id: 'knipbeurt-baard', name: 'Knipbeurt + Baard', price: 20, duration: 45, desc: '45 minuten' },
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
function Calendar({ value, onChange, availability, blockedDates }: {
  value: string
  onChange: (date: string) => void
  availability: Record<string, boolean>
  blockedDates: string[]
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

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
  const canPrev = viewMonth > new Date(today.getFullYear(), today.getMonth(), 1)

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          disabled={!canPrev}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-brand font-bold text-lg"
        >‹</button>
        <span className="font-bold text-gray-800 capitalize">
          {viewMonth.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={nextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-light transition-colors text-brand font-bold text-lg"
        >›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {NL_DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
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
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onChange(ds)}
              className={[
                'aspect-square flex items-center justify-center rounded-full text-sm font-semibold transition-colors m-0.5',
                selected ? 'bg-brand text-white shadow' : '',
                isToday && !selected ? 'ring-2 ring-brand text-brand' : '',
                disabled ? 'text-gray-300 cursor-not-allowed' : !selected ? 'hover:bg-brand-light text-gray-700' : '',
              ].join(' ')}
            >
              {day.getDate()}
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
              <div className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${done ? 'bg-brand' : 'bg-gray-200'}`} />
            )}
            <div className={[
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black mb-1 relative z-10 transition-all',
              done ? 'bg-brand text-white' : active ? 'bg-brand text-white ring-4 ring-brand/20' : 'bg-gray-200 text-gray-400',
            ].join(' ')}>
              {done ? '✓' : n}
            </div>
            <span className={`text-xs hidden sm:block font-semibold ${active || done ? 'text-brand' : 'text-gray-400'}`}>{label}</span>
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
  const [services, setServices] = useState<Service[]>(FALLBACK_SERVICES)
  const [availability, setAvailability] = useState<Record<string, boolean>>({
    '0': false, '1': true, '2': true, '3': true, '4': true, '5': true, '6': false,
  })
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [emailSent, setEmailSent] = useState(true)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [cancelEmail, setCancelEmail] = useState('')
  const [lookup, setLookup] = useState(false)
  const [lookupCode, setLookupCode] = useState('')
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookupResult, setLookupResult] = useState<{code:string;name:string;service:string;price:number;date:string;time:string}|null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

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
      setBooking({ code: cancelCode.toUpperCase(), service: '', price: 0, duration: 0, date: '', time: '', name: '' })
      setStep('confirmation')
      setCancelConfirm(true)
    }
  }, [])

  async function fetchSlots(d: string, dur: number) {
    setSlotsLoading(true)
    setSlots([])
    try {
      const r = await fetch(`/api/slots?date=${d}&duration=${dur}`)
      const data = await r.json()
      setSlots(data.slots ?? [])
    } finally {
      setSlotsLoading(false)
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
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

  async function handleVerify() {
    setError('')
    setLoading(true)
    const code = codeDigits.join('')
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
    if (digit && i < 5) codeRefs.current[i + 1]?.focus()
  }

  function handleCodeKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !codeDigits[i] && i > 0) codeRefs.current[i - 1]?.focus()
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) { setCodeDigits(text.split('')); codeRefs.current[5]?.focus(); e.preventDefault() }
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-light via-white to-gray-50 flex flex-col">
      <header className="bg-brand shadow-md">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="text-2xl text-white">✂</div>
          <div>
            <h1 className="text-white font-black text-xl leading-tight">MoSaidCuts</h1>
            <p className="text-green-200 text-xs font-semibold">Barbershop</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">

          {step === 'banned' && (
            <div className="p-8 text-center">
              <div className="text-6xl mb-4">🚫</div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">Toegang Geblokkeerd</h2>
              <p className="text-gray-500 mb-1">Uw e-mailadres is geblokkeerd voor het maken van afspraken.</p>
              <p className="text-gray-400 text-sm">Neem contact op met de barbershop voor meer informatie.</p>
            </div>
          )}

          {step === 'confirmation' && booking && (
            <div className="p-6 sm:p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-brand rounded-full flex items-center justify-center mx-auto mb-3 text-3xl text-white shadow-lg">✓</div>
                <h2 className="text-2xl font-black text-gray-900">Afspraak Bevestigd!</h2>
                <p className="text-gray-400 text-sm mt-1">U ontvangt een bevestiging per e-mail</p>
              </div>
              <div className="bg-brand-light rounded-xl p-5 mb-5 text-center">
                <p className="text-xs font-bold text-brand uppercase tracking-widest mb-1">Boekingscode</p>
                <p className="text-3xl font-black text-brand tracking-widest">{booking.code}</p>
              </div>
              <div className="space-y-0 mb-6 border border-gray-100 rounded-xl overflow-hidden">
                {[['Dienst', booking.service], ['Datum', formatDateNL(booking.date)], ['Tijd', booking.time], ['Prijs', `€${booking.price}`]].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-3 border-b border-gray-100 last:border-0 text-sm">
                    <span className="text-gray-500 font-medium">{k}</span>
                    <span className="font-bold text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <button onClick={() => downloadICS(booking)} className="w-full py-3 px-4 rounded-xl border-2 border-brand text-brand font-bold hover:bg-brand-light transition-colors flex items-center justify-center gap-2">
                  📅 Agenda download (.ics)
                </button>
                <a href={googleCalLink(booking)} target="_blank" rel="noopener noreferrer" className="block w-full py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors text-center">
                  🗓 Google Agenda
                </a>
                {!cancelConfirm ? (
                  <button onClick={() => setCancelConfirm(true)} className="w-full py-2 text-red-400 font-semibold text-sm hover:text-red-600 transition-colors">
                    Afspraak annuleren
                  </button>
                ) : (
                  <div className="bg-red-50 rounded-xl p-4">
                    <p className="text-gray-700 font-semibold mb-3 text-sm text-center">Weet u zeker dat u wilt annuleren?</p>
                    {!contact.email && !lookupResult && (
                      <input type="email" placeholder="Uw e-mailadres ter bevestiging" value={cancelEmail}
                        onChange={e => setCancelEmail(e.target.value)}
                        className="w-full border-2 border-red-200 rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:border-red-400 bg-white"/>
                    )}
                    {error && <p className="text-red-600 text-xs font-semibold mb-2">{error}</p>}
                    <div className="flex gap-3">
                      <button onClick={() => { setCancelConfirm(false); setError('') }} className="flex-1 py-2 rounded-lg border-2 border-gray-200 font-bold text-gray-600 text-sm hover:bg-gray-50">Nee</button>
                      <button onClick={handleCancel} disabled={loading || (!contact.email && !lookupResult && !cancelEmail)}
                        className="flex-1 py-2 rounded-lg bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50">
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
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm font-semibold">
                  {error}
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Kies een dienst</h2>
                  <p className="text-gray-400 text-sm mb-5">Selecteer de gewenste behandeling</p>
                  <div className="space-y-3">
                    {services.map(s => (
                      <button key={s.id} onClick={() => { setService(s); setStep(2) }}
                        className={['w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left',
                          service?.id === s.id ? 'border-brand bg-brand-light' : 'border-gray-200 hover:border-brand hover:bg-brand-light/50'].join(' ')}>
                        <div>
                          <p className="font-bold text-gray-900">{s.name}</p>
                          <p className="text-sm text-gray-400">{s.desc}</p>
                        </div>
                        <p className="text-2xl font-black text-brand ml-4">€{s.price}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Kies een datum</h2>
                  <p className="text-gray-400 text-sm mb-5">Selecteer een beschikbare dag</p>
                  <Calendar value={date} availability={availability} blockedDates={blockedDates} onChange={d => setDate(d)} />
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50">‹ Terug</button>
                    <button disabled={!date} onClick={() => { fetchSlots(date, service!.duration); setStep(3) }}
                      className="flex-1 py-3 rounded-xl bg-brand text-white font-bold hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Volgende ›
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Kies een tijd</h2>
                  <p className="text-gray-400 text-sm mb-5 capitalize">{date ? formatDateNL(date) : ''}</p>
                  {slotsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 font-medium">Geen beschikbare tijden op deze dag</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map(slot => (
                        <button key={slot.time} disabled={!slot.available}
                          onClick={() => { setTime(slot.time); setStep(4) }}
                          className={['py-3 rounded-xl text-sm font-bold transition-all',
                            slot.available
                              ? time === slot.time ? 'bg-brand text-white shadow-md scale-105' : 'bg-brand-light text-brand hover:bg-brand hover:text-white'
                              : 'bg-gray-100 text-gray-300 cursor-not-allowed',
                          ].join(' ')}>
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50">‹ Terug</button>
                    <button disabled={!time} onClick={() => setStep(4)}
                      className="flex-1 py-3 rounded-xl bg-brand text-white font-bold hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Volgende ›
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <form onSubmit={handleContactSubmit}>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Uw gegevens</h2>
                  <p className="text-gray-400 text-sm mb-5">Vul uw contactinformatie in</p>
                  <div className="space-y-4">
                    {[
                      { label: 'Naam', key: 'name', type: 'text', placeholder: 'Uw volledige naam', autoComplete: 'name' },
                      { label: 'Telefoonnummer', key: 'phone', type: 'tel', placeholder: '+31 6 12345678', autoComplete: 'tel' },
                      { label: 'E-mailadres', key: 'email', type: 'email', placeholder: 'uw@email.com', autoComplete: 'email' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="block text-sm font-bold text-gray-700 mb-1">{f.label}</label>
                        <input type={f.type} placeholder={f.placeholder} autoComplete={f.autoComplete} required
                          value={contact[f.key as keyof typeof contact]}
                          onChange={e => setContact(c => ({ ...c, [f.key]: e.target.value }))}
                          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 font-medium focus:outline-none focus:border-brand transition-colors" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button type="button" onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50">‹ Terug</button>
                    <button type="submit" disabled={loading}
                      className="flex-1 py-3 rounded-xl bg-brand text-white font-bold hover:bg-brand-hover disabled:opacity-50 transition-colors">
                      {loading ? 'Bezig...' : 'Volgende ›'}
                    </button>
                  </div>
                </form>
              )}

              {step === 5 && (
                <div>
                  <h2 className="text-xl font-black text-gray-900 mb-1">Verificatie</h2>
                  {emailSent ? (
                    <>
                      <p className="text-gray-500 text-sm mb-1">We hebben een 6-cijferige code gestuurd naar</p>
                      <p className="font-bold text-gray-800 mb-3">{contact.email}</p>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-5 text-xs text-blue-600 font-medium">
                        ⏱ Het kan 1 à 2 minuten duren voordat u de code ontvangt. Check ook uw spam/ongewenste mail.
                      </div>
                    </>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm">
                      <p className="font-bold text-amber-800">E-mail kon niet worden verzonden</p>
                      <p className="text-amber-700 mt-0.5">De code is alvast ingevuld.</p>
                    </div>
                  )}
                  <div className="flex justify-center gap-2 mb-6" onPaste={handleCodePaste}>
                    {codeDigits.map((digit, i) => (
                      <input key={i}
                        ref={el => { codeRefs.current[i] = el }}
                        type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={e => handleCodeInput(i, e.target.value)}
                        onKeyDown={e => handleCodeKey(i, e)}
                        className="w-11 h-14 text-center text-2xl font-black border-2 border-gray-200 rounded-xl focus:outline-none focus:border-brand transition-colors text-gray-800 caret-transparent" />
                    ))}
                  </div>
                  <button onClick={handleVerify} disabled={codeDigits.join('').length < 6 || loading}
                    className="w-full py-3 rounded-xl bg-brand text-white font-bold hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-3">
                    {loading ? 'Bevestigen...' : 'Bevestigen'}
                  </button>
                  <button onClick={handleResendCode} disabled={resendCooldown > 0}
                    className="w-full py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:text-gray-300 text-brand hover:underline">
                    {resendCooldown > 0 ? `Code opnieuw sturen (${resendCooldown}s)` : 'Code opnieuw sturen'}
                  </button>
                  <button onClick={() => setStep(4)} className="w-full py-2 text-gray-400 text-sm hover:underline mt-1">‹ Terug</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Afspraak opzoeken */}
      <div className="max-w-md mx-auto px-4 mb-6">
        {!lookup ? (
          <button onClick={()=>setLookup(true)} className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:border-brand hover:text-brand transition-colors">
            🔍 Afspraak opzoeken
          </button>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-900">🔍 Afspraak opzoeken</h3>
              <button onClick={()=>{setLookup(false);setLookupResult(null);setLookupError('');setLookupCode('')}} className="text-gray-400 hover:text-gray-600 text-lg font-bold">×</button>
            </div>
            <form onSubmit={handleLookup} className="space-y-2 mb-4">
              <input value={lookupCode} onChange={e=>setLookupCode(e.target.value.toUpperCase())}
                placeholder="Boekingscode (bijv. MSCAB123)" maxLength={8}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-brand transition-colors uppercase"/>
              <div className="flex gap-2">
                <input type="email" value={lookupEmail} onChange={e=>setLookupEmail(e.target.value)}
                  placeholder="Uw e-mailadres"
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
                <button type="submit" disabled={lookupCode.length<5||!lookupEmail||lookupLoading}
                  className="px-4 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover disabled:opacity-40 transition-colors">
                  {lookupLoading ? '...' : 'Zoek'}
                </button>
              </div>
            </form>
            {lookupError && <p className="text-red-500 text-sm font-semibold">{lookupError}</p>}
            {lookupResult && (
              <div className="bg-brand-light rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Code</span><span className="font-black text-brand">{lookupResult.code}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Naam</span><span className="font-bold text-gray-800">{lookupResult.name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Dienst</span><span className="font-bold text-gray-800">{lookupResult.service}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Datum</span><span className="font-bold text-gray-800">{formatDateNL(lookupResult.date)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Tijd</span><span className="font-bold text-gray-800">{lookupResult.time}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500 font-medium">Prijs</span><span className="font-bold text-gray-800">€{lookupResult.price}</span></div>
                <button onClick={()=>{
                  setBooking({...lookupResult, duration:0})
                  setCancelEmail(lookupEmail)
                  setStep('confirmation'); setCancelConfirm(true); setLookup(false)
                }} className="w-full mt-2 py-2 text-red-500 border border-red-200 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors">
                  Afspraak annuleren
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="text-center text-gray-400 text-xs py-4 pb-8">
        © {new Date().getFullYear()} MoSaidCuts Barbershop
      </footer>
    </div>
  )
}
