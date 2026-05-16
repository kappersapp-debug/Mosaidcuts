'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'

/* ─── Types ──────────────────────────────────────────────── */
interface Booking {
  id: string; code: string; name: string; phone: string; email: string
  service: string; price: number; duration: number; date: string; time: string; created_at: string
}
interface BannedEmail { id: string; email: string; reason: string; banned_at: string }

/* ─── Helpers ────────────────────────────────────────────── */
const NL_MONTHS_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
const NL_MONTHS_LONG = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
const NL_DAYS_SHORT = ['Ma','Di','Wo','Do','Vr','Za','Zo']
const NL_DAYS_LONG = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag']
const NL_DAY_LABELS: Record<string,string> = {'0':'Zondag','1':'Maandag','2':'Dinsdag','3':'Woensdag','4':'Donderdag','5':'Vrijdag','6':'Zaterdag'}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function formatShortDate(ds: string) {
  const d = new Date(ds+'T12:00:00')
  return `${NL_DAYS_SHORT[(d.getDay()+6)%7]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
function formatLongDate(ds: string) {
  const d = new Date(ds+'T12:00:00')
  return `${NL_DAYS_LONG[d.getDay()]} ${d.getDate()} ${NL_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}
function formatMedDate(ds: string) {
  const d = new Date(ds+'T12:00:00')
  return `${NL_DAYS_SHORT[(d.getDay()+6)%7]} ${d.getDate()} ${NL_MONTHS_SHORT[d.getMonth()]}`
}
function getStatus(date: string): 'today'|'upcoming'|'past' {
  const today = new Date().toISOString().split('T')[0]
  if (date === today) return 'today'
  return date > today ? 'upcoming' : 'past'
}
function serviceInitial(service: string) {
  if (service.toLowerCase().includes('baard') && service.toLowerCase().includes('knip')) return 'KB'
  if (service.toLowerCase().includes('baard')) return 'B'
  return 'K'
}

type View = 'dashboard'|'calendar'|'appointments'|'customers'|'services'|'management'|'settings'

const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>,
  calendar: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>,
  appointments: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
  services: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/></svg>,
  customers: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
  management: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>,
  settings: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
}

const NAV: {id:View; label:string}[] = [
  {id:'dashboard', label:'Dashboard'},
  {id:'calendar', label:'Agenda'},
  {id:'appointments', label:'Afspraken'},
  {id:'customers', label:'Klanten'},
  {id:'services', label:'Diensten'},
  {id:'management', label:'Beheer'},
  {id:'settings', label:'Instellingen'},
]

function AnimatedNumber({ value }: { value: number | string }) {
  const [display, setDisplay] = useState<number|string>(typeof value === 'number' ? 0 : value)
  useEffect(() => {
    if (typeof value !== 'number') { setDisplay(value); return }
    let current = 0
    const step = Math.max(1, Math.ceil(value / 25))
    const timer = setInterval(() => {
      current = Math.min(current + step, value)
      setDisplay(current)
      if (current >= value) clearInterval(timer)
    }, 40)
    return () => clearInterval(timer)
  }, [value])
  return <>{display}</>
}

function generateWorkSlots(start='09:00', end='17:00') {
  const [sh,sm] = start.split(':').map(Number)
  const [eh,em] = end.split(':').map(Number)
  const slots: string[] = []
  for (let m = sh*60+sm; m < eh*60+em; m += 30)
    slots.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`)
  return slots
}

/* ─── Login ──────────────────────────────────────────────── */
function LoginScreen({onLogin}: {onLogin:()=>void}) {
  const [pw, setPw] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [show, setShow] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const r = await fetch('/api/portaal/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})})
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Ongeldig wachtwoord'); return }
      onLogin()
    } catch { setError('Netwerkfout') } finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#141414] rounded-xl shadow-xl border border-[#2a2a2a] overflow-hidden">
        <div className="bg-[#111] px-8 py-8 text-center border-b border-[#1e1e1e]">
          <div className="flex justify-center mb-3">
            <Image src="/logo.jpg" alt="MoSaidCuts" width={80} height={80} className="rounded-full object-cover ring-2 ring-[#2176d4]/40 shadow-lg shadow-[#2176d4]/10"/>
          </div>
          <h1 className="text-white font-[family-name:var(--font-bebas)] tracking-widest text-xl">MoSaidCuts</h1>
          <p className="text-gray-500 text-xs mt-0.5">Kapper Portaal</p>
        </div>
        <form onSubmit={submit} className="p-8">
          <h2 className="text-lg font-black text-white mb-6 text-center">Inloggen</h2>
          {error && <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-xl px-4 py-3 mb-4 text-sm font-semibold">{error}</div>}
          <div className="mb-5">
            <label className="block text-sm font-bold text-gray-400 mb-1">Wachtwoord</label>
            <div className="relative">
              <input type={show?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)} required
                className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-4 py-3 pr-12 font-medium focus:outline-none focus:border-[#2176d4] transition-colors"/>
              <button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-medium hover:text-gray-300">{show?'Verberg':'Toon'}</button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-[#2176d4] text-white font-bold hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-50 transition-all duration-200">
            {loading ? 'Bezig...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ─── Shell ──────────────────────────────────────────────── */
function PortalShell({onLogout}: {onLogout:()=>void}) {
  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<Booking[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [toast, setToast] = useState<string|null>(null)
  const lastCheckedRef = useRef('')
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({ top: 56, right: 16 })

  // Poll for new bookings — runs immediately on mount, then every 30 seconds
  useEffect(() => {
    // Start 1 hour ago so bookings from the last hour show up on first load
    lastCheckedRef.current = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const poll = async () => {
      try {
        const r = await fetch(`/api/portaal/bookings?since=${encodeURIComponent(lastCheckedRef.current)}`)
        lastCheckedRef.current = new Date().toISOString()
        if (!r.ok) return
        const d = await r.json()
        const now2 = new Date()
        const todayStr2 = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`
        const nowMins2 = now2.getHours() * 60 + now2.getMinutes()

        const newOnes: Booking[] = (d.bookings ?? []).filter((b: Booking) => {
          if (b.date > todayStr2) return true
          if (b.date === todayStr2) { const [h,m] = b.time.split(':').map(Number); return h*60+m > nowMins2 }
          return false
        })
        const cancelled: {id:string;code:string;name:string;service:string;date:string;time:string;cancelled_by:string}[] = d.cancellations ?? []

        if (newOnes.length > 0) {
          setNotifications(prev => [...newOnes.map(b => ({...b, _type: 'new' as const})), ...prev])
          setUnreadCount(prev => prev + newOnes.length)
          setToast(newOnes.length === 1
            ? `Nieuwe afspraak: ${newOnes[0].name} – ${newOnes[0].service}`
            : `${newOnes.length} nieuwe afspraken`)
        }
        if (cancelled.length > 0) {
          setNotifications(prev => [...cancelled.map(b => ({...b, _type: 'cancelled' as const, phone:'', email:'', price:0, duration:0, created_at:''})), ...prev])
          setUnreadCount(prev => prev + cancelled.length)
          setToast(cancelled.length === 1
            ? `Geannuleerd: ${cancelled[0].name} – ${cancelled[0].service}`
            : `${cancelled.length} afspraken geannuleerd`)
        }
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [])

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return
    const handler = (e: MouseEvent) => {
      const panel = document.getElementById('notif-panel')
      if (panel && !panel.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  function openNotifDesktop() {
    if (notifBtnRef.current) {
      const rect = notifBtnRef.current.getBoundingClientRect()
      setPanelStyle({ bottom: window.innerHeight - rect.top + 4, left: rect.right + 8 })
    }
    setNotifOpen(o => !o)
    setUnreadCount(0)
  }

  function openNotifMobile() {
    setPanelStyle({ top: 56, right: 16 })
    setNotifOpen(o => !o)
    setUnreadCount(0)
  }

  return (
    <div className="min-h-screen flex bg-[#0c0c0c] font-[family-name:var(--font-barlow)]">

      {/* Notification panel */}
      {notifOpen && (
        <div id="notif-panel" style={panelStyle} className="fixed z-50 w-72 bg-[#141414] rounded-xl shadow-2xl border border-[#2a2a2a] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1e1e1e] flex items-center justify-between">
            <span className="font-semibold text-white text-sm">Meldingen</span>
            {notifications.length > 0 && (
              <button onClick={() => { setNotifications([]); setNotifOpen(false) }} className="text-xs text-[#2176d4] hover:underline">Wis alles</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">Geen nieuwe meldingen</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-[#1e1e1e]">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 hover:bg-white/5 border-l-2 ${(n as Booking & {_type?:string})._type==='cancelled' ? 'border-red-500' : 'border-[#2176d4]'}`}>
                  <p className="font-semibold text-sm text-white">{n.name}</p>
                  <p className="text-xs text-gray-500">{n.service} · {n.date} · {n.time}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast popup — top of screen */}
      {toast && (
        <div className="fixed top-16 right-4 lg:top-4 lg:right-6 z-50 bg-[#2176d4] text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-xs">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Nieuwe melding</p>
            <p className="text-xs text-white/70 truncate">{toast}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-white/50 hover:text-white shrink-0 leading-none text-lg">×</button>
        </div>
      )}

      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0e0e0e] min-h-screen fixed left-0 top-0 z-30 border-r border-[#1e1e1e]">
        <div className="px-6 py-5 border-b border-[#1e1e1e] flex items-center gap-3">
          <Image src="/logo.jpg" alt="MoSaidCuts" width={44} height={44} className="rounded-full object-cover shrink-0 ring-2 ring-[#2176d4]/30"/>
          <div>
            <div className="text-white font-[family-name:var(--font-bebas)] tracking-widest text-lg leading-none">MoSaidCuts</div>
            <p className="text-gray-600 text-[10px] mt-0.5 tracking-wider uppercase">Kapper Portaal</p>
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-3">
          {NAV.map(n => (
            <button key={n.id} onClick={()=>setView(n.id)}
              className={['flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all duration-200',
                view===n.id
                  ? 'bg-[#2176d4]/12 text-[#2176d4] font-semibold shadow-[inset_0_0_0_1px_rgba(33,118,212,0.2)]'
                  : 'text-gray-500 hover:bg-white/4 hover:text-gray-200'].join(' ')}>
              <span className={view===n.id ? 'text-[#2176d4]' : 'text-gray-600'}>{NAV_ICONS[n.id]}</span>
              {n.label}
            </button>
          ))}
          <button ref={notifBtnRef} onClick={openNotifDesktop}
            className={['flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all duration-200',
              notifOpen
                ? 'bg-[#2176d4]/12 text-[#2176d4] font-semibold shadow-[inset_0_0_0_1px_rgba(33,118,212,0.2)]'
                : 'text-gray-500 hover:bg-white/4 hover:text-gray-200'].join(' ')}>
            <span className={`relative ${notifOpen ? 'text-[#2176d4]' : 'text-gray-600'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>
              {unreadCount > 0 && <span className="animate-pulse-ring absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 opacity-70"/>}
            </span>
            <span className="flex-1 text-left">Meldingen</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </nav>
        <div className="px-3 pb-4">
          <button onClick={onLogout} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border border-[#1e1e1e] text-gray-500 text-sm hover:bg-white/4 hover:text-gray-300 hover:border-[#2a2a2a] transition-all duration-200">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>
            Uitloggen
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-[#111] px-4 py-2.5 flex items-center justify-between border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.jpg" alt="MoSaidCuts" width={34} height={34} className="rounded-full object-cover ring-1 ring-[#2176d4]/30"/>
          <div className="text-white font-[family-name:var(--font-bebas)] tracking-widest text-base">MoSaidCuts</div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={openNotifMobile} className="relative text-gray-400 hover:text-white transition-colors text-xs">
            Meldingen
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button onClick={()=>setMenuOpen(o=>!o)} className="text-gray-300 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/80 animate-fade-in" onClick={()=>setMenuOpen(false)}>
          <div className="w-60 bg-[#0e0e0e] h-full border-r border-[#1e1e1e]" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#1e1e1e] flex items-center gap-3">
              <Image src="/logo.jpg" alt="MoSaidCuts" width={40} height={40} className="rounded-full object-cover shrink-0 ring-2 ring-[#2176d4]/30"/>
              <div className="text-white font-[family-name:var(--font-bebas)] tracking-widest text-lg leading-none">MoSaidCuts</div>
            </div>
            <nav className="py-3 space-y-0.5 px-3">
              {NAV.map(n => (
                <button key={n.id} onClick={()=>{setView(n.id);setMenuOpen(false)}}
                  className={['flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-all',
                    view===n.id?'bg-[#2176d4]/12 text-[#2176d4] font-semibold':'text-gray-500 hover:bg-white/4 hover:text-gray-200'].join(' ')}>
                  <span className={view===n.id ? 'text-[#2176d4]' : 'text-gray-600'}>{NAV_ICONS[n.id]}</span>
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="px-3 mt-2">
              <button onClick={onLogout} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border border-[#1e1e1e] text-gray-500 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>
                Uitloggen
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
          {view==='dashboard' && <DashboardView />}
          {view==='calendar' && <CalendarView />}
          {view==='appointments' && <AppointmentsView />}
          {view==='customers' && <CustomersView />}
          {view==='services' && <ServicesView />}
          {view==='management' && <ManagementView />}
          {view==='settings' && <SettingsView/>}
        </div>
      </main>
    </div>
  )
}

/* ─── Dashboard ──────────────────────────────────────────── */
function isBreak(slot: string, enabled: boolean, bStart: string, bEnd: string) {
  if (!enabled) return false
  const [sh, sm] = slot.split(':').map(Number)
  const [bsh, bsm] = bStart.split(':').map(Number)
  const [beh, bem] = bEnd.split(':').map(Number)
  const sMin = sh * 60 + sm
  return sMin >= bsh * 60 + bsm && sMin < beh * 60 + bem
}

function DashboardView() {
  const [stats, setStats] = useState<{today:number;week:number;weekRevenue:number;totalCustomers:number;todayBookings:Booking[]}|null>(null)
  const [upcoming, setUpcoming] = useState<Booking[]>([])
  const [workSlots, setWorkSlots] = useState<string[]>(generateWorkSlots())
  const [breakEnabled, setBreakEnabled] = useState(false)
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')

  const loadDashboard = useCallback(()=>{
    fetch('/api/portaal/stats').then(r=>r.json()).then(d=>setStats(d))
    fetch('/api/portaal/bookings?filter=upcoming').then(r=>r.json()).then(d=>{
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const filtered = (d.bookings??[]).filter((b: Booking) => {
        if (b.date > todayStr) return true
        if (b.date === todayStr) { const [h,m] = b.time.split(':').map(Number); return h*60+m > nowMins }
        return false
      })
      setUpcoming(filtered.slice(0, 5))
    })
  },[])

  useEffect(()=>{
    loadDashboard()
    fetch('/api/portaal/settings').then(r=>r.json()).then(d=>{
      const s = d.settings??{}
      const dow = String(new Date().getDay())
      if (s.day_schedule) {
        const sched: Record<string,{open:boolean;start:string;end:string}> = JSON.parse(s.day_schedule)
        const cfg = sched[dow]
        setWorkSlots(cfg?.open ? generateWorkSlots(cfg.start, cfg.end) : [])
      } else {
        setWorkSlots(generateWorkSlots(s.work_start??'09:00', s.work_end??'17:00'))
      }
      if (s.break_enabled) setBreakEnabled(s.break_enabled==='true')
      if (s.break_start) setBreakStart(s.break_start)
      if (s.break_end) setBreakEnd(s.break_end)
    })
    const id = setInterval(loadDashboard, 60_000)
    return () => clearInterval(id)
  },[loadDashboard])

  const today = new Date().toISOString().split('T')[0]

  const nextAppointment = (() => {
    const now = new Date()
    const nowMins = now.getHours() * 60 + now.getMinutes()
    return (stats?.todayBookings ?? [])
      .filter((b: Booking) => { const [h,m] = b.time.split(':').map(Number); return h*60+m > nowMins })
      .sort((a: Booking, b: Booking) => a.time.localeCompare(b.time))[0] ?? null
  })()

  const minsUntilNext = nextAppointment ? (() => {
    const [h,m] = nextAppointment.time.split(':').map(Number)
    const now = new Date()
    return h*60+m - (now.getHours()*60+now.getMinutes())
  })() : null

  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5 capitalize">{formatLongDate(today)}</p>
      </div>

      {/* Volgende afspraak banner */}
      {stats && (
        <div className={`mb-6 rounded-2xl border p-4 flex items-center gap-4 ${nextAppointment ? 'bg-[#2176d4]/8 border-[#2176d4]/20' : 'bg-[#141414] border-[#222]'}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${nextAppointment ? 'bg-[#2176d4]/15' : 'bg-[#1e1e1e]'}`}>
            <svg className={`w-5 h-5 ${nextAppointment ? 'text-[#2176d4]' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          {nextAppointment ? (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#2176d4]/70 uppercase tracking-wider">Volgende afspraak</p>
              <p className="text-white font-bold truncate">{nextAppointment.name} <span className="text-gray-400 font-normal">– {nextAppointment.service}</span></p>
            </div>
          ) : (
            <div className="flex-1">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Volgende afspraak</p>
              <p className="text-gray-500 font-medium text-sm">Geen afspraken meer vandaag</p>
            </div>
          )}
          {nextAppointment && minsUntilNext !== null && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-black text-[#2176d4]">{nextAppointment.time}</p>
              <p className="text-xs text-gray-500">over {minsUntilNext < 60 ? `${minsUntilNext} min` : `${Math.floor(minsUntilNext/60)}u ${minsUntilNext%60}m`}</p>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          {label:'Vandaag', value:stats?.today??'—', sub:'afspraken', gold:true, icon:<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>},
          {label:'Deze week', value:stats?.week??'—', sub:'afspraken', gold:false, icon:<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>},
          {label:'Klanten', value:stats?.totalCustomers??'—', sub:'uniek totaal', gold:false, icon:<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>},
        ].map((c,i)=>(
          <div key={c.label} style={{animationDelay:`${i*60}ms`}}
            className={`animate-fade-up rounded-2xl p-5 border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${c.gold?'bg-gradient-to-br from-[#2176d4]/15 to-[#2176d4]/5 border-[#2176d4]/25 hover:shadow-[#2176d4]/10':'bg-[#141414] border-[#222] hover:border-[#2a2a2a] hover:shadow-black/40'}`}>
            <div className="flex items-start justify-between mb-3">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${c.gold?'text-[#2176d4]/60':'text-gray-600'}`}>{c.label}</p>
              <span className={c.gold ? 'text-[#2176d4]/40' : 'text-gray-700'}>{c.icon}</span>
            </div>
            <p className={`text-4xl font-black leading-none ${c.gold?'text-[#2176d4]':'text-white'}`}>
              <AnimatedNumber value={c.value as number|string}/>
            </p>
            <p className={`text-xs mt-2 ${c.gold?'text-[#2176d4]/50':'text-gray-600'}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Aankomende afspraken */}
        <div className="bg-[#141414] rounded-2xl border border-[#222] overflow-hidden transition-all duration-300 hover:border-[#2a2a2a] hover:shadow-lg hover:shadow-black/30">
          <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-sm">Aankomende afspraken</h2>
              <p className="text-xs text-gray-600 mt-0.5">{upcoming.length} gepland</p>
            </div>
            <span className="w-8 h-8 rounded-xl bg-[#2176d4]/10 flex items-center justify-center text-[#2176d4]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/></svg>
            </span>
          </div>
          {upcoming.length===0 ? (
            <div className="py-10 text-center">
              <p className="text-gray-600 text-sm">Geen aankomende afspraken</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1a1a1a]">
              {upcoming.map(b=>(
                <div key={b.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-[#2176d4]/10 flex flex-col items-center justify-center">
                    <p className="text-[9px] font-bold text-[#2176d4]/70 uppercase leading-none">{formatShortDate(b.date).split(' ')[0]}</p>
                    <p className="text-sm font-black text-[#2176d4] leading-none mt-0.5">{b.time}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm truncate">{b.name}</p>
                    <p className="text-xs text-gray-500 truncate">{b.service}</p>
                  </div>
                  <p className="text-xs text-gray-600 shrink-0">{formatShortDate(b.date)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vandaag schema */}
        <div className="bg-[#141414] rounded-2xl border border-[#222] overflow-hidden transition-all duration-300 hover:border-[#2a2a2a] hover:shadow-lg hover:shadow-black/30">
          <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white text-sm">Schema vandaag</h2>
              <p className="text-xs text-gray-600 mt-0.5 capitalize">{formatLongDate(today)}</p>
            </div>
            <span className="w-8 h-8 rounded-xl bg-[#1e1e1e] flex items-center justify-center text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </span>
          </div>
          <div className="overflow-y-auto max-h-72">
            {workSlots.length === 0 && <p className="text-center text-gray-600 text-sm py-10">Geen werkrooster vandaag</p>}
            {workSlots.map(slot=>{
              const b = stats?.todayBookings?.find(b=>b.time===slot)
              const isPause = isBreak(slot, breakEnabled, breakStart, breakEnd)
              return (
                <div key={slot} className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#1a1a1a] transition-colors ${b?'bg-[#2176d4]/4 hover:bg-[#2176d4]/6':isPause?'bg-amber-900/8':'hover:bg-white/2'}`}>
                  <span className={`font-black text-[11px] w-12 text-center shrink-0 px-1.5 py-1 rounded-lg ${b?'bg-[#2176d4] text-white':isPause?'bg-amber-900/30 text-amber-500':'bg-[#1e1e1e] text-gray-500'}`}>{slot}</span>
                  {isPause ? (
                    <span className="text-amber-500/70 text-xs">Pauze</span>
                  ) : b ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{b.name}</p>
                        <p className="text-xs text-gray-500 truncate">{b.service}</p>
                      </div>
                      <span className="ml-auto bg-[#2176d4] text-white font-black text-xs px-2.5 py-1 rounded-lg shrink-0">€{b.price}</span>
                    </>
                  ) : <span className="text-gray-700 text-xs">Vrij</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Calendar ───────────────────────────────────────────── */
function CalendarView() {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(toDateStr(today))
  const [monthBookings, setMonthBookings] = useState<Booking[]>([])
  const dayBookings = useMemo(() => monthBookings.filter(b => b.date === selectedDay), [selectedDay, monthBookings])
  const [schedule, setSchedule] = useState<Record<string,{open:boolean;start:string;end:string}>>(DEFAULT_SCHEDULE)
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [breakEnabled, setBreakEnabled] = useState(false)
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')

  const monthStr = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth()+1).padStart(2,'0')}`

  useEffect(()=>{
    fetch('/api/portaal/settings').then(r=>r.json()).then(d=>{
      const s = d.settings??{}
      if(s.day_schedule) setSchedule(JSON.parse(s.day_schedule))
      else if(s.work_start || s.work_end) {
        const start = s.work_start ?? '09:00'; const end = s.work_end ?? '17:00'
        setSchedule(prev => { const u={...prev}; for(const k of Object.keys(u)) u[k]={...u[k],start,end}; return u })
      }
      if(s.blocked_dates) setBlockedDates(JSON.parse(s.blocked_dates))
      if(s.break_enabled) setBreakEnabled(s.break_enabled==='true')
      if(s.break_start) setBreakStart(s.break_start)
      if(s.break_end) setBreakEnd(s.break_end)
    })
  },[])

  useEffect(()=>{
    const load = () => fetch(`/api/portaal/bookings?month=${monthStr}`).then(r=>r.json()).then(d=>setMonthBookings(d.bookings??[]))
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  },[monthStr])

  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 0)
  const startOffset = (firstDay.getDay()+6)%7
  const cells: (Date|null)[] = Array(startOffset).fill(null)
  for (let i=1;i<=lastDay.getDate();i++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i))

  const byDate: Record<string,number> = {}
  for (const b of monthBookings) byDate[b.date]=(byDate[b.date]??0)+1

  const selectedDow = String(new Date(selectedDay + 'T12:00:00').getDay())
  const dayCfg = schedule[selectedDow]
  const slots = dayCfg?.open ? generateWorkSlots(dayCfg.start, dayCfg.end) : []

  return (
    <div>
      <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white mb-1">Agenda</h1>
      <p className="text-gray-500 text-sm mb-6">Klik op een dag om het rooster te zien</p>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Month */}
        <div className="bg-[#141414] rounded-2xl border border-[#222] p-5 transition-all duration-300 hover:border-[#2a2a2a] hover:shadow-lg hover:shadow-black/30">
          <div className="flex items-center justify-between mb-4">
            <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1,1))}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#2176d4]/10 text-[#2176d4] font-bold text-xl transition-colors">‹</button>
            <span className="font-black text-white capitalize">
              {viewMonth.toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}
            </span>
            <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1,1))}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#2176d4]/10 text-[#2176d4] font-bold text-xl transition-colors">›</button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {NL_DAYS_SHORT.map(d=><div key={d} className="text-center text-xs font-bold text-gray-500 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day,i)=>{
              if(!day) return <div key={i}/>
              const ds = toDateStr(day)
              const count = byDate[ds]??0
              const isSelected = ds===selectedDay
              const isToday = ds===toDateStr(today)
              const isBlocked = blockedDates.includes(ds)
              const isClosed = schedule[String(day.getDay())]?.open === false
              return (
                <button key={i} onClick={()=>setSelectedDay(ds)}
                  className={[
                    'flex flex-col items-center py-1.5 rounded-xl m-0.5 transition-colors font-bold text-sm relative',
                    isSelected ? 'bg-[#2176d4] text-white shadow-md' :
                    isBlocked ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' :
                    isClosed ? 'bg-[#1a1a1a] text-gray-600 hover:bg-[#222]' :
                    isToday ? 'ring-2 ring-[#2176d4] text-[#2176d4]' :
                    'hover:bg-[#2176d4]/10 text-gray-300',
                  ].join(' ')}>
                  <span>{day.getDate()}</span>
                  {!isBlocked && count>0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {Array.from({length:Math.min(count,3)}).map((_,j)=>(
                        <div key={j} className={`w-1.5 h-1.5 rounded-full ${isSelected?'bg-black':'bg-[#2176d4]'}`}/>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-[#1e1e1e] text-xs font-semibold text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#2176d4] inline-block"/>Geselecteerd</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-900/40 inline-block"/>Geblokkeerd</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1a1a1a] inline-block"/>Gesloten</span>
          </div>
        </div>

        {/* Day schedule */}
        <div className="bg-[#141414] rounded-2xl border border-[#222] overflow-hidden transition-all duration-300 hover:border-[#2a2a2a] hover:shadow-lg hover:shadow-black/30">
          <div className={`px-5 py-4 border-b border-[#1e1e1e] ${blockedDates.includes(selectedDay) ? 'bg-red-900/10' : ''}`}>
            <h2 className="font-semibold text-white capitalize text-sm">{formatLongDate(selectedDay)}</h2>
            {blockedDates.includes(selectedDay) ? (
              <p className="text-xs text-red-400 font-medium mt-0.5">Geblokkeerd — geen boekingen mogelijk</p>
            ) : !dayCfg?.open ? (
              <p className="text-xs text-gray-500 font-bold">Gesloten</p>
            ) : (
              <p className="text-xs text-gray-500">{dayBookings.length} afspraken · {dayCfg.start}–{dayCfg.end}</p>
            )}
          </div>
          <div className="overflow-y-auto max-h-96">
            {slots.length === 0 ? (
              <p className="text-center text-gray-600 text-sm font-medium py-10">Geen rooster beschikbaar</p>
            ) : null}
            {slots.map(slot=>{
              const b = dayBookings.find(b=>b.time===slot)
              const isPause = isBreak(slot, breakEnabled, breakStart, breakEnd)
              return (
                <div key={slot} className={`flex items-center gap-3 px-3 py-2.5 border-b border-[#1e1e1e] ${b?'bg-[#2176d4]/5':isPause?'bg-amber-900/10':'bg-[#161616]'}`}>
                  <span className={`font-black text-xs w-14 text-center shrink-0 px-2 py-1 rounded-lg ${b?'bg-[#2176d4] text-white':isPause?'bg-amber-900/30 text-amber-400':'bg-[#1e1e1e] text-[#2176d4] border border-[#2176d4]/20'}`}>{slot}</span>
                  {isPause ? (
                    <span className="text-amber-400 text-xs font-medium">Pauze</span>
                  ) : b ? (
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white text-sm truncate">{b.name}</p>
                      <p className="text-xs text-gray-400">{b.service} · €{b.price}</p>
                    </div>
                  ) : <span className="text-gray-600 text-xs font-medium">Vrij</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Booking Form (add/edit) ────────────────────────────── */
interface BookingForm { id?:string; name:string; phone:string; email:string; service:string; price:number; duration:number; date:string; time:string }
const EMPTY_FORM: BookingForm = { name:'', phone:'', email:'', service:'', price:0, duration:30, date:'', time:'' }

function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const base = value ? new Date(value + 'T12:00:00') : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (value) setViewDate(new Date(new Date(value + 'T12:00:00').getFullYear(), new Date(value + 'T12:00:00').getMonth(), 1))
  }, [value])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const todayStr = new Date().toISOString().split('T')[0]
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  function selectDay(day: number) {
    const str = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(str)
    setOpen(false)
  }

  const displayValue = value ? formatLongDate(value) : ''

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full bg-[#0e0e0e] border rounded-xl px-3 py-2.5 text-sm text-left flex items-center justify-between transition-colors ${open ? 'border-[#2176d4]' : 'border-[#2a2a2a] hover:border-[#333]'}`}>
        <span className={displayValue ? 'text-white' : 'text-gray-700'}>{displayValue || 'Kies een datum'}</span>
        <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 w-full bg-[#141414] border border-[#2a2a2a] rounded-2xl shadow-2xl p-4 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="w-8 h-8 rounded-lg bg-[#1e1e1e] hover:bg-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-white font-bold text-sm capitalize">
              {NL_MONTHS_LONG[month]} {year}
            </span>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="w-8 h-8 rounded-lg bg-[#1e1e1e] hover:bg-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-600 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isSelected = dayStr === value
              const isToday = dayStr === todayStr
              return (
                <button key={i} type="button" onClick={() => selectDay(day)}
                  className={`aspect-square rounded-lg text-sm font-medium transition-all flex items-center justify-center
                    ${isSelected ? 'bg-[#2176d4] text-white shadow-[0_0_12px_rgba(33,118,212,0.35)]' : ''}
                    ${isToday && !isSelected ? 'bg-[#2176d4]/15 text-[#2176d4] font-bold ring-1 ring-[#2176d4]/30' : ''}
                    ${!isSelected && !isToday ? 'text-gray-400 hover:bg-[#1e1e1e] hover:text-white' : ''}
                  `}>
                  {day}
                </button>
              )
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-[#1e1e1e] flex justify-end">
            <button type="button" onClick={() => { onChange(todayStr); setOpen(false) }}
              className="text-xs font-bold text-[#2176d4] hover:text-[#3080e0] transition-colors">
              Vandaag
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BookingFormModal({ initial, onClose, onSaved }: { initial: BookingForm; onClose: ()=>void; onSaved: ()=>void }) {
  const [form, setForm] = useState<BookingForm>(initial)
  const [services, setServices] = useState<{id:string;name:string;price:number;duration:number}[]>([])
  const [slots, setSlots] = useState<{time:string;available:boolean}[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!initial.id

  useEffect(()=>{
    fetch('/api/portaal/settings').then(r=>r.json()).then(d=>{
      const s = d.settings??{}
      if (s.services) setServices(JSON.parse(s.services))
    })
  },[])

  useEffect(()=>{
    if (!form.date) { setSlots([]); return }
    setLoadingSlots(true)
    fetch(`/api/slots?date=${form.date}&duration=${form.duration||30}`)
      .then(r=>r.json())
      .then(d=>{
        const fetchedSlots: {time:string;available:boolean}[] = d.slots ?? []
        // In edit mode: make current time slot available so it stays selectable
        if (isEdit && initial.time && !fetchedSlots.find(s=>s.time===initial.time)) {
          fetchedSlots.unshift({ time: initial.time, available: true })
        }
        setSlots(fetchedSlots)
        // Clear time if no longer available (not in edit mode)
        if (!isEdit && form.time && !fetchedSlots.find(s=>s.time===form.time && s.available)) {
          setForm(f=>({...f, time:''}))
        }
      })
      .finally(()=>setLoadingSlots(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[form.date, form.duration])

  function pickService(name: string) {
    const s = services.find(s=>s.name===name)
    setForm(f=>({...f, service:name, price:s?.price??f.price, duration:s?.duration??f.duration}))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const method = isEdit ? 'PATCH' : 'POST'
      const body = isEdit ? { id: initial.id, ...form } : form
      const r = await fetch('/api/portaal/bookings', { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Fout'); return }
      onSaved()
    } catch { setError('Netwerkfout') } finally { setSaving(false) }
  }

  const availableSlots = slots.filter(s=>s.available)

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-[#141414] rounded-2xl border border-[#2a2a2a] w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[#1e1e1e] flex items-center justify-between sticky top-0 bg-[#141414] z-10">
          <h2 className="font-bold text-white text-lg">{isEdit ? 'Afspraak bewerken' : 'Afspraak toevoegen'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1e1e1e] text-gray-400 hover:text-white hover:bg-[#2a2a2a] transition-all flex items-center justify-center text-lg leading-none">×</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          {error && <div className="bg-red-900/30 border border-red-700/40 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>}

          {/* Naam + Telefoon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Naam *</label>
              <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ahmed El Mansouri"
                className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Telefoon</label>
              <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="06 12345678"
                className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              E-mail <span className="text-gray-700 normal-case font-normal">(optioneel — klant ontvangt bevestiging)</span>
            </label>
            <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="klant@email.com"
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white placeholder-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
          </div>

          {/* Dienst */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Dienst *</label>
            {services.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {services.map(s=>(
                  <button key={s.id} type="button" onClick={()=>pickService(s.name)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all ${form.service===s.name ? 'border-[#2176d4] bg-[#2176d4]/10 text-white' : 'border-[#2a2a2a] bg-[#0e0e0e] text-gray-400 hover:border-[#333] hover:text-white'}`}>
                    <span>{s.name}</span>
                    <span className={`font-black ${form.service===s.name ? 'text-[#2176d4]' : 'text-gray-600'}`}>€{s.price} · {s.duration}min</span>
                  </button>
                ))}
              </div>
            ) : (
              <input required value={form.service} onChange={e=>setForm(f=>({...f,service:e.target.value}))}
                className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            )}
          </div>

          {/* Datum */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Datum *</label>
            <DatePicker value={form.date} onChange={d => setForm(f => ({ ...f, date: d, time: '' }))} />
          </div>

          {/* Tijdsloten */}
          {form.date && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Tijd *</label>
              {loadingSlots ? (
                <div className="flex items-center gap-2 py-3 text-gray-500 text-sm">
                  <div className="w-4 h-4 border-2 border-[#2176d4] border-t-transparent rounded-full animate-spin"/>
                  Tijdsloten laden...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl px-4 py-3 text-gray-500 text-sm">
                  Geen beschikbare tijdsloten op deze dag
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map(s=>(
                    <button key={s.time} type="button" onClick={()=>setForm(f=>({...f,time:s.time}))}
                      className={`py-2.5 rounded-xl text-sm font-bold transition-all ${form.time===s.time ? 'bg-[#2176d4] text-white shadow-[0_0_15px_rgba(33,118,212,0.3)]' : 'bg-[#0e0e0e] border border-[#2a2a2a] text-gray-400 hover:border-[#2176d4]/50 hover:text-white'}`}>
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#2a2a2a] text-gray-400 text-sm font-medium hover:border-[#333] hover:text-white transition-all">Annuleren</button>
            <button type="submit" disabled={saving || !form.date || !form.time}
              className="flex-1 py-2.5 rounded-xl bg-[#2176d4] text-white text-sm font-bold hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-40 transition-all duration-200">
              {saving ? 'Opslaan...' : isEdit ? 'Bijwerken' : 'Toevoegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Appointments ───────────────────────────────────────── */
function AppointmentsView() {
  const [filter, setFilter] = useState<'upcoming'|'today'|'all'|'past'>('upcoming')
  const [search, setSearch] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string|null>(null)
  const [formBooking, setFormBooking] = useState<BookingForm|null>(null)

  const load = useCallback(async()=>{
    setLoading(true)
    try {
      const r = await fetch(`/api/portaal/bookings?filter=${filter}&search=${encodeURIComponent(search)}`)
      const d = await r.json()
      setBookings(d.bookings??[])
    } finally { setLoading(false) }
  },[filter,search])

  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(); const id = setInterval(load, 60_000); return () => clearInterval(id)
  },[load])

  const [confirmDel, setConfirmDel] = useState<string|null>(null)

  async function del(id: string) {
    setDeleting(id)
    await fetch('/api/portaal/bookings',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    setDeleting(null); setConfirmDel(null); load()
  }

  const statusBadge = {
    today: <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400">VANDAAG</span>,
    upcoming: <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[#2176d4]/10 text-[#2176d4]">AANKOMEND</span>,
    past: <span className="text-xs font-black px-2 py-0.5 rounded-full bg-[#1e1e1e] text-gray-500">VERLEDEN</span>,
  }

  const filters = [{id:'upcoming',label:'Aankomend'},{id:'today',label:'Vandaag'},{id:'all',label:'Alle'},{id:'past',label:'Verleden'}] as const

  return (
    <div>
      {formBooking && (
        <BookingFormModal
          initial={formBooking}
          onClose={()=>setFormBooking(null)}
          onSaved={()=>{ setFormBooking(null); load() }}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white">Afspraken</h1>
        <button onClick={()=>setFormBooking({...EMPTY_FORM})}
          className="px-4 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] transition-all duration-200">
          + Toevoegen
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input type="text" placeholder="Zoeken op naam, e-mail of code..." value={search} onChange={e=>setSearch(e.target.value)}
          className="flex-1 bg-[#1a1a1a] border-2 border-[#333] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-[#2176d4] transition-colors"/>
        <div className="flex gap-1 bg-[#1a1a1a] rounded-xl p-1 border border-[#2a2a2a]">
          {filters.map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)}
              className={['px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                filter===f.id?'bg-[#2176d4] text-white shadow-sm':'text-gray-500 hover:text-gray-300'].join(' ')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-[#2176d4] border-t-transparent rounded-full animate-spin"/></div>
      ) : bookings.length===0 ? (
        <div className="text-center py-12 text-gray-500 font-medium">Geen afspraken gevonden</div>
      ) : (
        <div className="space-y-3">
          {bookings.map(b=>{
            const status = getStatus(b.date)
            return (
              <div key={b.id} className="bg-[#141414] rounded-2xl border border-[#222] p-4 flex items-center gap-4 transition-all duration-200 hover:border-[#2a2a2a] hover:-translate-y-px hover:shadow-md hover:shadow-black/30">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2176d4]/20 to-[#2176d4]/5 flex items-center justify-center text-xs font-black text-[#2176d4] shrink-0 border border-[#2176d4]/10">
                  {serviceInitial(b.service)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-black text-white truncate">{b.name}</p>
                      <p className="text-sm text-gray-400 truncate">{b.service} · {formatMedDate(b.date)} · {b.time}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <a href={`tel:${b.phone}`} className="text-xs text-[#2176d4] hover:underline">{b.phone}</a>
                        <a href={`mailto:${b.email}`} className="text-xs text-[#2176d4] hover:underline truncate">{b.email}</a>
                      </div>
                      <div className="mt-1">{statusBadge[status]}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-white">€{b.price}</p>
                      <p className="text-xs text-gray-500 font-mono">{b.code}</p>
                      {confirmDel===b.id ? (
                        <div className="flex gap-1 mt-1">
                          <button onClick={()=>del(b.id)} disabled={deleting===b.id} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg font-bold disabled:opacity-50">{deleting===b.id?'...':'Ja'}</button>
                          <button onClick={()=>setConfirmDel(null)} className="text-xs border border-[#333] text-gray-400 px-2 py-0.5 rounded-lg font-bold">Nee</button>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-1 justify-end">
                          <button onClick={()=>setFormBooking({id:b.id,name:b.name,phone:b.phone,email:b.email,service:b.service,price:b.price,duration:b.duration,date:b.date,time:b.time})} className="text-xs text-[#2176d4] hover:underline">Bewerken</button>
                          <button onClick={()=>setConfirmDel(b.id)} className="text-xs text-red-400 hover:text-red-500">Verwijder</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Customers ─────────────────────────────────────────── */
interface Customer { email:string; name:string; visits:number; totalSpent:number; lastDate:string; lastService:string; bookings:{code:string;service:string;price:number;date:string;time:string}[] }

function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string|null>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ fetch('/api/portaal/customers').then(r=>r.json()).then(d=>{ setCustomers(d.customers??[]); setLoading(false) }) },[])

  const filtered = customers.filter(c =>
    c.email.includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white">Klanten</h1>
          <p className="text-gray-500 text-sm mt-0.5">{customers.length} unieke klanten</p>
        </div>
      </div>
      <div className="mb-5">
        <input type="text" placeholder="Zoeken op naam of e-mail..." value={search} onChange={e=>setSearch(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-[#333] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-[#2176d4] border-t-transparent rounded-full animate-spin"/></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-500 py-12">Geen klanten gevonden</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c=>(
            <div key={c.email} className="bg-[#141414] rounded-2xl border border-[#222] overflow-hidden transition-all duration-200 hover:border-[#2a2a2a]">
              <button onClick={()=>setExpanded(expanded===c.email ? null : c.email)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2176d4]/20 to-[#2176d4]/5 flex items-center justify-center text-sm font-black text-[#2176d4] shrink-0 border border-[#2176d4]/10">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 truncate">{c.email}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div className="hidden sm:block">
                    <p className="text-xs text-gray-600">bezoeken</p>
                    <p className="font-black text-white">{c.visits}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">laatste bezoek</p>
                    <p className="font-bold text-white text-sm">{formatShortDate(c.lastDate)}</p>
                  </div>
                  <svg className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${expanded===c.email?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </div>
              </button>
              {expanded===c.email && (
                <div className="border-t border-[#1e1e1e] divide-y divide-[#1a1a1a]">
                  <div className="px-5 py-3 flex gap-6 sm:hidden">
                    <div><p className="text-xs text-gray-600">bezoeken</p><p className="font-black text-white">{c.visits}</p></div>
                  </div>
                  {c.bookings.map((b,i)=>(
                    <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-white/2 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-[#1e1e1e] flex items-center justify-center text-[10px] font-black text-gray-500 shrink-0">
                        {serviceInitial(b.service)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{b.service}</p>
                        <p className="text-xs text-gray-500">{formatMedDate(b.date)} · {b.time}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-600 font-mono">{b.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Services ───────────────────────────────────────────── */
interface ServiceItem { id: string; name: string; price: number; duration: number; desc: string }
const DEFAULT_SERVICES: ServiceItem[] = [
  {id:'knipbeurt', name:'Normale Knipbeurt', price:15, duration:30, desc:'30 minuten'},
  {id:'baard', name:'Baard Trimmen', price:10, duration:20, desc:'20 minuten'},
  {id:'knipbeurt-baard', name:'Knipbeurt + Baard', price:20, duration:30, desc:'30 minuten'},
]

function ServicesView() {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [form, setForm] = useState<ServiceItem|null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(()=>{
    fetch('/api/portaal/settings').then(r=>r.json()).then(d=>{
      const s = d.settings??{}
      setServices(s.services ? JSON.parse(s.services) : DEFAULT_SERVICES)
    })
  },[])

  async function persist(updated: ServiceItem[]) {
    setSaving(true)
    await fetch('/api/portaal/settings',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:'services',value:JSON.stringify(updated)})})
    setSaving(false); setMsg('Opgeslagen'); setTimeout(()=>setMsg(''),3000)
  }

  function openNew() {
    setForm({id: Date.now().toString(), name:'', price:0, duration:30, desc:''})
  }

  function saveForm() {
    if(!form || !form.name) return
    const updated = services.find(s=>s.id===form.id)
      ? services.map(s=>s.id===form.id ? form : s)
      : [...services, form]
    setServices(updated); persist(updated); setForm(null)
  }

  const [confirmRemove, setConfirmRemove] = useState<string|null>(null)

  function remove(id: string) {
    const updated = services.filter(s=>s.id!==id)
    setServices(updated); persist(updated); setConfirmRemove(null)
  }

  const durations = [15,20,30,45,60,75,90]

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white">Diensten</h1>
        <button onClick={openNew} className="px-4 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.35)] transition-all duration-200">
          + Toevoegen
        </button>
      </div>
      {msg && <div className="mb-4 bg-[#2176d4]/10 border border-[#2176d4]/20 text-[#2176d4] text-sm font-bold px-4 py-3 rounded-xl">{msg}</div>}

      {form && (
        <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5 mb-6">
          <h2 className="font-semibold text-white mb-4">{services.find(s=>s.id===form.id) ? 'Dienst bewerken' : 'Nieuwe dienst'}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Naam</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="bijv. Normale Knipbeurt"
                className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Prijs (€)</label>
                <input type="number" min="0" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}
                  className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Duur</label>
                <select value={form.duration} onChange={e=>setForm({...form,duration:Number(e.target.value)})}
                  className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-[#2176d4] transition-colors">
                  {durations.map(d=><option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Omschrijving</label>
              <input value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="bijv. 30 minuten"
                className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={()=>setForm(null)} className="px-4 py-2 border-2 border-[#333] rounded-xl font-bold text-gray-400 text-sm hover:border-[#444] transition-colors">Annuleren</button>
            <button onClick={saveForm} disabled={!form.name || saving}
              className="px-6 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-50 transition-all duration-200">
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {services.map(s=>(
          <div key={s.id} className="bg-[#141414] rounded-2xl border border-[#222] p-4 flex items-center gap-4 transition-all duration-200 hover:border-[#2a2a2a] hover:-translate-y-px hover:shadow-md hover:shadow-black/30">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2176d4]/20 to-[#2176d4]/5 flex items-center justify-center text-xs font-black text-[#2176d4] shrink-0 border border-[#2176d4]/10">
              {serviceInitial(s.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white">{s.name}</p>
              <p className="text-sm text-gray-400">{s.desc} · {s.duration} min</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-black text-[#2176d4] text-lg">€{s.price}</p>
              <div className="flex gap-3 mt-1 justify-end">
                <button onClick={()=>setForm({...s})} className="text-xs text-[#2176d4] hover:underline">Bewerken</button>
                {confirmRemove===s.id ? (
                  <span className="flex gap-1">
                    <button onClick={()=>remove(s.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg font-bold">Ja</button>
                    <button onClick={()=>setConfirmRemove(null)} className="text-xs border border-[#333] text-gray-400 px-2 py-0.5 rounded-lg font-bold">Nee</button>
                  </span>
                ) : (
                  <button onClick={()=>setConfirmRemove(s.id)} className="text-xs text-red-400 hover:text-red-500">Verwijder</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {services.length===0 && <p className="text-center text-gray-500 py-8 font-medium">Geen diensten</p>}
      </div>
    </div>
  )
}

/* ─── Management ─────────────────────────────────────────── */
function ManagementView() {
  const [banned, setBanned] = useState<BannedEmail[]>([])
  const [newEmail, setNewEmail] = useState(''); const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false); const [actionLoading, setActionLoading] = useState<string|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [banMsg, setBanMsg] = useState('')

  async function load() {
    const r = await fetch('/api/portaal/ban'); const d = await r.json(); setBanned(d.banned??[])
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{load()},[])

  async function ban(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setBanMsg('')
    const r = await fetch('/api/portaal/ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:newEmail,reason})})
    const d = await r.json()
    setNewEmail(''); setReason(''); setShowForm(false); setLoading(false)
    if (d.cancelledBookings > 0) setBanMsg(`Geband — ${d.cancelledBookings} afspraak${d.cancelledBookings>1?'en':''} automatisch geannuleerd`)
    else setBanMsg('Geband')
    setTimeout(()=>setBanMsg(''), 5000)
    load()
  }

  const [confirmUnban, setConfirmUnban] = useState<string|null>(null)

  async function unban(email: string) {
    setActionLoading(email)
    await fetch('/api/portaal/ban',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})})
    setActionLoading(null); setConfirmUnban(null); load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white">Beheer</h1>
        <button onClick={()=>setShowForm(f=>!f)} className="px-4 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.35)] transition-all duration-200">
          Email bannen
        </button>
      </div>
      {banMsg && <div className="mb-4 bg-[#2176d4]/10 border border-[#2176d4]/20 text-[#2176d4] text-sm font-bold px-4 py-3 rounded-xl">{banMsg}</div>}
      {showForm && (
        <form onSubmit={ban} className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5 mb-6">
          <h2 className="font-semibold text-white mb-4">Nieuw ban</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">E-mailadres</label>
              <input type="email" required value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="email@example.com"
                className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Reden (optioneel)</label>
              <input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reden voor ban"
                className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={()=>setShowForm(false)} className="px-4 py-2 border-2 border-[#333] rounded-xl font-bold text-gray-400 text-sm hover:border-[#444] transition-colors">Annuleren</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50">
              {loading?'Bezig...':'Bannen'}
            </button>
          </div>
        </form>
      )}
      <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <h2 className="font-semibold text-white text-sm">Gebande e-mails ({banned.length})</h2>
        </div>
        {banned.length===0 ? (
          <p className="text-center text-gray-500 font-medium py-10">Geen gebande e-mails</p>
        ) : (
          <div className="divide-y divide-[#1e1e1e]">
            {banned.map(b=>(
              <div key={b.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{b.email}</p>
                  {b.reason && <p className="text-xs text-gray-500 mt-0.5">{b.reason}</p>}
                </div>
                {confirmUnban===b.email ? (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={()=>unban(b.email)} disabled={actionLoading===b.email} className="text-xs bg-[#2176d4] text-white px-2 py-1 rounded-lg font-bold disabled:opacity-50">{actionLoading===b.email?'...':'Ja'}</button>
                    <button onClick={()=>setConfirmUnban(null)} className="text-xs border border-[#333] text-gray-400 px-2 py-1 rounded-lg font-bold">Nee</button>
                  </div>
                ) : (
                  <button onClick={()=>setConfirmUnban(b.email)}
                    className="shrink-0 px-3 py-1.5 border border-[#2a2a2a] text-gray-400 rounded-lg text-xs font-medium hover:bg-white/5 transition-colors">
                    Ontbannen
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Blocked Date Calendar ──────────────────────────────── */
function BlockedCalendar({blocked, onChange}: {blocked: string[]; onChange: (dates: string[]) => void}) {
  const today = new Date(); today.setHours(0,0,0,0)
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 0)
  const startOffset = (firstDay.getDay()+6)%7
  const cells: (Date|null)[] = Array(startOffset).fill(null)
  for (let i=1; i<=lastDay.getDate(); i++)
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i))

  function toggle(ds: string) {
    onChange(blocked.includes(ds) ? blocked.filter(d=>d!==ds) : [...blocked, ds].sort())
  }

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1,1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-gray-400 font-bold text-lg transition-colors">‹</button>
        <span className="font-bold text-white capitalize text-sm">
          {viewMonth.toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}
        </span>
        <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1,1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-gray-400 font-bold text-lg transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {NL_DAYS_SHORT.map(d=><div key={d} className="text-center text-xs font-bold text-gray-500 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day,i)=>{
          if(!day) return <div key={i}/>
          const ds = toDateStr(day)
          const isPast = day < today
          const isBlocked = blocked.includes(ds)
          const isToday = day.getTime()===today.getTime()
          return (
            <button key={i} disabled={isPast} onClick={()=>toggle(ds)}
              className={[
                'aspect-square flex items-center justify-center rounded-xl text-xs font-bold transition-all',
                isPast ? 'text-gray-700 cursor-not-allowed' :
                isBlocked ? 'bg-red-600 text-white shadow hover:bg-red-700 scale-105' :
                isToday ? 'ring-2 ring-[#2176d4] text-[#2176d4] hover:bg-red-900/20 hover:text-red-400 hover:ring-red-500' :
                'text-gray-300 hover:bg-red-900/20 hover:text-red-400',
              ].join(' ')}>
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Toggle Component ───────────────────────────────────── */
function Toggle({value, onChange}: {value:boolean; onChange:(v:boolean)=>void}) {
  return (
    <button onClick={()=>onChange(!value)}
      className={`relative inline-flex w-12 h-6 rounded-full transition-colors ${value?'bg-[#2176d4]':'bg-[#333]'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value?'translate-x-6':'translate-x-0.5'}`}/>
    </button>
  )
}

/* ─── Settings ───────────────────────────────────────────── */
type DayConfig = { open: boolean; start: string; end: string }
const DEFAULT_SCHEDULE: Record<string, DayConfig> = {
  '0': {open:false, start:'09:00', end:'17:00'},
  '1': {open:true,  start:'09:00', end:'17:00'},
  '2': {open:true,  start:'09:00', end:'17:00'},
  '3': {open:true,  start:'09:00', end:'17:00'},
  '4': {open:true,  start:'09:00', end:'17:00'},
  '5': {open:true,  start:'09:00', end:'17:00'},
  '6': {open:false, start:'09:00', end:'17:00'},
}

function SettingsView() {
  const [daySchedule, setDaySchedule] = useState<Record<string, DayConfig>>(DEFAULT_SCHEDULE)
  const [breakEnabled, setBreakEnabled] = useState(false)
  const [breakStart, setBreakStart] = useState('12:00')
  const [breakEnd, setBreakEnd] = useState('13:00')
  const [blockedDates, setBlockedDates] = useState<string[]>([])

  const [currentPw, setCurrentPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confirmPw, setConfirmPw] = useState('')
  const [msgs, setMsgs] = useState<Record<string,string>>({})
  const [errs, setErrs] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState<Record<string,boolean>>({})

  useEffect(()=>{
    fetch('/api/portaal/settings').then(r=>r.json()).then(d=>{
      const s = d.settings??{}
      if (s.day_schedule) {
        setDaySchedule(JSON.parse(s.day_schedule))
      } else {
        // backward compat: merge old availability + work_start/end into per-day schedule
        const avail = s.availability ? JSON.parse(s.availability) : {}
        const start = s.work_start ?? '09:00'
        const end = s.work_end ?? '17:00'
        setDaySchedule(prev => {
          const updated = {...prev}
          for (const day of Object.keys(updated))
            updated[day] = { open: avail[day] !== false, start, end }
          return updated
        })
      }
      if(s.blocked_dates) setBlockedDates(JSON.parse(s.blocked_dates))
      if(s.break_enabled) setBreakEnabled(s.break_enabled==='true')
      if(s.break_start) setBreakStart(s.break_start)
      if(s.break_end) setBreakEnd(s.break_end)

    })
  },[])

  async function save(key: string, value: string, section: string) {
    setSaving(s=>({...s,[section]:true}))
    setMsgs(m=>({...m,[section]:''})); setErrs(e=>({...e,[section]:''}))
    await fetch('/api/portaal/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,value})})
    setSaving(s=>({...s,[section]:false})); setMsgs(m=>({...m,[section]:'Opgeslagen'}))
    setTimeout(()=>setMsgs(m=>({...m,[section]:''})),3000)
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setErrs(x=>({...x,pw:''})); setMsgs(m=>({...m,pw:''}))
    if(newPw!==confirmPw){setErrs(x=>({...x,pw:'Wachtwoorden komen niet overeen'}));return}
    if(newPw.length<4){setErrs(x=>({...x,pw:'Minstens 4 tekens'}));return}
    setSaving(s=>({...s,pw:true}))
    const lr = await fetch('/api/portaal/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:currentPw})})
    if(!lr.ok){setErrs(x=>({...x,pw:'Huidig wachtwoord onjuist'}));setSaving(s=>({...s,pw:false}));return}
    await fetch('/api/portaal/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'portal_password',value:newPw})})
    setSaving(s=>({...s,pw:false})); setMsgs(m=>({...m,pw:'Wachtwoord gewijzigd'}))
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    setTimeout(()=>setMsgs(m=>({...m,pw:''})),3000)
  }

  function updateDay(day: string, patch: Partial<DayConfig>) {
    setDaySchedule(s => ({...s, [day]: {...s[day], ...patch}}))
  }

  const timeOptions: string[] = []
  for(let h=6;h<=22;h++) for(let m=0;m<60;m+=30)
    timeOptions.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)

  const dayOrder = ['1','2','3','4','5','6','0']

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-[family-name:var(--font-bebas)] tracking-widest text-white">Instellingen</h1>

      {/* Beschikbaarheid + Werktijden per dag */}
      <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5">
        <h2 className="font-semibold text-white mb-1">Beschikbaarheid & Werktijden</h2>
        <p className="text-xs text-gray-500 mb-4">Zet dagen aan/uit en stel per dag uw begin- en eindtijd in</p>
        <div className="space-y-2 mb-4">
          {dayOrder.map(day => {
            const cfg = daySchedule[day]
            return (
              <div key={day} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${cfg.open ? 'border-[#2176d4]/20 bg-[#2176d4]/5' : 'border-[#1e1e1e] bg-[#111]'}`}>
                <Toggle value={cfg.open} onChange={v => updateDay(day, {open: v})} />
                <span className={`font-bold text-sm w-20 shrink-0 ${cfg.open ? 'text-white' : 'text-gray-600'}`}>{NL_DAY_LABELS[day]}</span>
                {cfg.open ? (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <select value={cfg.start} onChange={e => updateDay(day, {start: e.target.value})}
                      className="bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-[#2176d4] transition-colors">
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-gray-500 font-bold text-sm">→</span>
                    <select value={cfg.end} onChange={e => updateDay(day, {end: e.target.value})}
                      className="bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-[#2176d4] transition-colors">
                      {timeOptions.filter(t => t > cfg.start).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="text-gray-600 text-sm font-medium italic flex-1">Gesloten</span>
                )}
              </div>
            )
          })}
        </div>
        {/* Pauze */}
        <div className="mt-4 pt-4 border-t border-[#1e1e1e]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-white text-sm">Pauze</p>
              <p className="text-xs text-gray-500">Geen boekingen tijdens pauze</p>
            </div>
            <Toggle value={breakEnabled} onChange={setBreakEnabled}/>
          </div>
          {breakEnabled && (
            <div className="flex items-center gap-2 mt-2">
              <select value={breakStart} onChange={e=>setBreakStart(e.target.value)}
                className="bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-[#2176d4] transition-colors">
                {timeOptions.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span className="text-gray-500 font-bold text-sm">→</span>
              <select value={breakEnd} onChange={e=>setBreakEnd(e.target.value)}
                className="bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-[#2176d4] transition-colors">
                {timeOptions.filter(t=>t>breakStart).map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={async()=>{
            await Promise.all([
              save('day_schedule', JSON.stringify(daySchedule), 'schedule'),
              save('break_enabled', String(breakEnabled), 'schedule'),
              ...(breakEnabled ? [
                save('break_start', breakStart, 'schedule'),
                save('break_end', breakEnd, 'schedule'),
              ] : []),
            ])
          }} disabled={saving.schedule}
            className="px-5 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-50 transition-all duration-200">
            {saving.schedule ? 'Opslaan...' : 'Opslaan'}
          </button>
          {msgs.schedule && <span className="text-[#2176d4] text-sm">{msgs.schedule}</span>}
        </div>
      </div>

      {/* Geblokkeerde datums */}
      <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5">
        <h2 className="font-semibold text-white mb-1">Vrije dagen / Vakantie</h2>
        <p className="text-xs text-gray-500 mb-4">Klik op meerdere datums om ze te blokkeren — klik opnieuw om te deblokkeren</p>
        <BlockedCalendar blocked={blockedDates} onChange={setBlockedDates}/>
        {blockedDates.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {blockedDates.map(d=>(
              <span key={d} className="inline-flex items-center gap-1 bg-red-900/20 border border-red-800/40 text-red-400 text-xs px-3 py-1.5 rounded-lg">
                {formatShortDate(d)}
                <button onClick={()=>setBlockedDates(prev=>prev.filter(x=>x!==d))}
                  className="ml-1 text-red-500 hover:text-red-300 font-black leading-none">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={()=>save('blocked_dates', JSON.stringify(blockedDates), 'blocked')} disabled={saving.blocked}
            className="px-5 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-50 transition-all duration-200">
            {saving.blocked ? 'Opslaan...' : 'Opslaan'}
          </button>
          {msgs.blocked && <span className="text-[#2176d4] text-sm">{msgs.blocked}</span>}
        </div>
      </div>

      {/* Exporteren */}
      <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5">
        <h2 className="font-semibold text-white mb-1">Exporteren</h2>
        <p className="text-xs text-gray-500 mb-4">Download uw agenda als kalenderbestand</p>
        <div className="flex items-center justify-between py-3 border border-[#2a2a2a] rounded-xl px-4">
          <div>
            <p className="font-bold text-white text-sm">Exporteer alle afspraken</p>
            <p className="text-xs text-[#2176d4] font-medium">Download als .ics kalenderbestand</p>
          </div>
          <a href="/api/portaal/export" download className="bg-[#2176d4] text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-[#3080e0] transition-colors">Downloaden</a>
        </div>
      </div>

      {/* Wachtwoord */}
      <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5">
        <h2 className="font-semibold text-white mb-4">Wachtwoord wijzigen</h2>
        <form onSubmit={changePw} className="space-y-4">
          {errs.pw && <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-xl px-4 py-3 text-sm font-semibold">{errs.pw}</div>}
          {msgs.pw && <div className="bg-[#2176d4]/10 border border-[#2176d4]/20 text-[#2176d4] rounded-xl px-4 py-3 text-sm font-semibold">{msgs.pw}</div>}
          {[{label:'Huidig wachtwoord',val:currentPw,set:setCurrentPw},{label:'Nieuw wachtwoord',val:newPw,set:setNewPw},{label:'Bevestig nieuw',val:confirmPw,set:setConfirmPw}].map(f=>(
            <div key={f.label}>
              <label className="block text-sm font-bold text-gray-400 mb-1">{f.label}</label>
              <input type="password" required value={f.val} onChange={e=>f.set(e.target.value)}
                className="w-full bg-[#1a1a1a] border-2 border-[#333] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2176d4] transition-colors"/>
            </div>
          ))}
          <button type="submit" disabled={saving.pw}
            className="px-5 py-2 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] hover:shadow-[0_0_20px_rgba(33,118,212,0.3)] disabled:opacity-50 transition-all duration-200">
            {saving.pw?'Opslaan...':'Wachtwoord wijzigen'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ─── Root ───────────────────────────────────────────────── */
export default function PortaalPage() {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  const [authError, setAuthError] = useState(false)

  useEffect(()=>{
    const timer = setTimeout(()=>{ setChecking(false); setAuthError(true) }, 8000)
    fetch('/api/portaal/auth').then(r=>r.json()).then(d=>{
      clearTimeout(timer); setAuthenticated(d.authenticated); setChecking(false)
    }).catch(()=>{ clearTimeout(timer); setChecking(false) })
    return ()=>clearTimeout(timer)
  },[])

  async function logout() {
    await fetch('/api/portaal/logout',{method:'POST'}); setAuthenticated(false)
  }

  if(checking) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0c0c0c]">
      <div className="w-10 h-10 border-4 border-[#2176d4] border-t-transparent rounded-full animate-spin"/>
      <p className="text-gray-500 text-sm font-medium">Even geduld...</p>
    </div>
  )

  if(authError) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0c0c] px-4">
      <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-8 max-w-sm w-full text-center">
        <p className="font-bold text-white mb-2">Verbinding mislukt</p>
        <p className="text-gray-500 text-sm mb-4">De server reageert niet. Controleer uw internetverbinding.</p>
        <button onClick={()=>window.location.reload()} className="w-full py-2.5 bg-[#2176d4] text-white rounded-xl font-bold text-sm hover:bg-[#3080e0] transition-colors">Opnieuw proberen</button>
      </div>
    </div>
  )

  if(!authenticated) return <LoginScreen onLogin={()=>setAuthenticated(true)}/>
  return <PortalShell onLogout={logout}/>
}
