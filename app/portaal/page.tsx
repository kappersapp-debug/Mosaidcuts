'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

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
function serviceIcon(service: string) {
  if (service.toLowerCase().includes('baard') && service.toLowerCase().includes('knip')) return '✂️🪒'
  if (service.toLowerCase().includes('baard')) return '🪒'
  return '✂️'
}

type View = 'dashboard'|'calendar'|'appointments'|'services'|'management'|'settings'
const NAV: {id:View; label:string; icon:string}[] = [
  {id:'dashboard', label:'Dashboard', icon:'📊'},
  {id:'calendar', label:'Agenda', icon:'📅'},
  {id:'appointments', label:'Afspraken', icon:'📋'},
  {id:'services', label:'Diensten', icon:'✂️'},
  {id:'management', label:'Beheer', icon:'🛡️'},
  {id:'settings', label:'Instellingen', icon:'⚙️'},
]

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
    <div className="min-h-screen bg-gradient-to-br from-brand-light via-white to-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-brand px-8 py-7 text-center">
          <div className="text-4xl mb-2">✂️</div>
          <h1 className="text-white font-black text-xl">MoSaidCuts</h1>
          <p className="text-blue-200 text-xs font-semibold mt-0.5">Kapper Portaal</p>
        </div>
        <form onSubmit={submit} className="p-8">
          <h2 className="text-lg font-black text-gray-900 mb-6 text-center">Inloggen</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm font-semibold">{error}</div>}
          <div className="mb-5">
            <label className="block text-sm font-bold text-gray-700 mb-1">Wachtwoord</label>
            <div className="relative">
              <input type={show?'text':'password'} value={pw} onChange={e=>setPw(e.target.value)} required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 pr-12 font-medium focus:outline-none focus:border-brand transition-colors"/>
              <button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-lg">{show?'🙈':'👁️'}</button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-brand text-white font-bold hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {loading ? 'Bezig...' : 'Inloggen 🔓'}
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
        const newOnes: Booking[] = d.bookings ?? []
        if (newOnes.length > 0) {
          setNotifications(prev => [...newOnes, ...prev])
          setUnreadCount(prev => prev + newOnes.length)
          setToast(newOnes.length === 1
            ? `${newOnes[0].name} – ${newOnes[0].service}`
            : `${newOnes.length} nieuwe afspraken`)
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
    <div className="min-h-screen flex bg-gray-50">

      {/* Notification panel */}
      {notifOpen && (
        <div id="notif-panel" style={panelStyle} className="fixed z-50 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="font-bold text-gray-800 text-sm">🔔 Meldingen</span>
            {notifications.length > 0 && (
              <button onClick={() => { setNotifications([]); setNotifOpen(false) }} className="text-xs text-brand hover:underline">Wis alles</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Geen nieuwe meldingen</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
              {notifications.map(n => (
                <div key={n.id} className="px-4 py-3 hover:bg-gray-50">
                  <p className="font-semibold text-sm text-gray-800">{n.name}</p>
                  <p className="text-xs text-gray-500">{n.service} · {n.date} · {n.time}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast popup — top of screen */}
      {toast && (
        <div className="fixed top-16 right-4 lg:top-4 lg:right-6 z-50 bg-brand text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-xs">
          <span className="text-lg shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Nieuwe afspraak!</p>
            <p className="text-xs text-blue-100 truncate">{toast}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-blue-200 hover:text-white shrink-0 text-lg leading-none">✕</button>
        </div>
      )}

      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-brand min-h-screen fixed left-0 top-0 z-30">
        <div className="px-6 py-5 border-b border-blue-800">
          <div className="text-white font-black text-lg flex items-center gap-2">✂️ MoSaidCuts</div>
          <p className="text-blue-200 text-xs font-semibold mt-0.5">Kapper Portaal</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(n => (
            <button key={n.id} onClick={()=>setView(n.id)}
              className={['flex items-center gap-3 w-full px-6 py-3 text-sm font-bold transition-colors rounded-lg mx-2 my-0.5 w-[calc(100%-16px)]',
                view===n.id ? 'bg-white/15 text-white' : 'text-blue-200 hover:bg-white/8 hover:text-white'].join(' ')}>
              <span className="text-base">{n.icon}</span>{n.label}
            </button>
          ))}
          <button ref={notifBtnRef} onClick={openNotifDesktop}
            className={['flex items-center gap-3 w-full px-6 py-3 text-sm font-bold transition-colors rounded-lg mx-2 my-0.5 w-[calc(100%-16px)]',
              notifOpen ? 'bg-white/15 text-white' : 'text-blue-200 hover:bg-white/8 hover:text-white'].join(' ')}>
            <span className="text-base">🔔</span>
            <span className="flex-1 text-left">Meldingen</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </nav>
        <button onClick={onLogout} className="m-4 py-2 rounded-xl border border-blue-600 text-blue-200 text-sm font-bold hover:bg-white/10 transition-colors">
          🚪 Uitloggen
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-brand px-4 py-3 flex items-center justify-between shadow-md">
        <div className="text-white font-black flex items-center gap-2">✂️ MoSaidCuts</div>
        <div className="flex items-center gap-3">
          <button onClick={openNotifMobile} className="relative text-white hover:text-blue-200 transition-colors">
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button onClick={()=>setMenuOpen(o=>!o)} className="text-white text-2xl">☰</button>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={()=>setMenuOpen(false)}>
          <div className="w-60 bg-brand h-full" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-blue-800">
              <div className="text-white font-black text-lg">✂️ MoSaidCuts</div>
            </div>
            <nav className="py-3">
              {NAV.map(n => (
                <button key={n.id} onClick={()=>{setView(n.id);setMenuOpen(false)}}
                  className={['flex items-center gap-3 w-full px-6 py-3 text-sm font-bold',
                    view===n.id?'bg-white/15 text-white':'text-blue-200 hover:bg-white/8 hover:text-white'].join(' ')}>
                  <span>{n.icon}</span>{n.label}
                </button>
              ))}
            </nav>
            <button onClick={onLogout} className="m-4 py-2 w-[calc(100%-32px)] rounded-xl border border-blue-600 text-blue-200 text-sm font-bold">🚪 Uitloggen</button>
          </div>
        </div>
      )}

      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
          {view==='dashboard' && <DashboardView />}
          {view==='calendar' && <CalendarView />}
          {view==='appointments' && <AppointmentsView />}
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

  return (
    <div>
      <h1 className="text-2xl font-black text-gray-900 mb-6">📊 Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          {label:'Vandaag', value:stats?.today??'—', sub:'afspraken', green:true},
          {label:'Deze week', value:stats?.week??'—', sub:'afspraken', green:false},
          {label:'Klanten', value:stats?.totalCustomers??'—', sub:'uniek totaal', green:false},
        ].map(c=>(
          <div key={c.label} className={`rounded-2xl p-5 shadow-md border ${c.green?'bg-brand border-brand-dark':'bg-white border-gray-200'}`}>
            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${c.green?'text-blue-100':'text-gray-600'}`}>{c.label}</p>
            <p className={`text-3xl font-black ${c.green?'text-white':'text-gray-900'}`}>{c.value}</p>
            <p className={`text-xs font-semibold mt-0.5 ${c.green?'text-blue-100':'text-gray-600'}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Aankomende afspraken */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-300 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-brand">
            <span className="text-xl">🕐</span>
            <div>
              <h2 className="font-black text-white text-base">Aankomende afspraken</h2>
              <p className="text-xs text-blue-100">Volgende {upcoming.length} afspraken</p>
            </div>
          </div>
          {upcoming.length===0 ? (
            <p className="text-center text-gray-600 py-8 text-sm font-medium">Geen aankomende afspraken</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcoming.map(b=>(
                <div key={b.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="text-center shrink-0 w-14">
                    <p className="text-xs font-black text-brand">{formatShortDate(b.date)}</p>
                    <p className="text-lg font-black text-gray-900 leading-tight">{b.time}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 truncate">{b.name}</p>
                    <p className="text-xs text-gray-600 font-medium">{b.service}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vandaag schema */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-300 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-brand">
            <span className="text-xl">📅</span>
            <div>
              <h2 className="font-black text-white text-base">Schema vandaag</h2>
              <p className="text-xs text-blue-100 capitalize">{formatLongDate(today)}</p>
            </div>
          </div>
          <div className="overflow-y-auto max-h-72">
            {workSlots.map(slot=>{
              const b = stats?.todayBookings?.find(b=>b.time===slot)
              const isPause = isBreak(slot, breakEnabled, breakStart, breakEnd)
              return (
                <div key={slot} className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 ${b?'bg-brand-light':isPause?'bg-amber-50':'bg-gray-50/60'}`}>
                  <span className={`font-black text-xs w-14 text-center shrink-0 px-2 py-1 rounded-lg ${b?'bg-brand text-white':isPause?'bg-amber-100 text-amber-700':'bg-white text-brand border border-brand/20'}`}>{slot}</span>
                  {isPause ? (
                    <span className="text-amber-700 text-xs font-bold">☕ Pauze</span>
                  ) : b ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 text-sm truncate">{b.name}</p>
                        <p className="text-xs text-gray-600 truncate">{b.service}</p>
                      </div>
                      <span className="ml-auto bg-brand text-white font-bold text-xs px-2 py-1 rounded-lg shrink-0">€{b.price}</span>
                    </>
                  ) : <span className="text-gray-500 text-xs font-medium">Vrij</span>}
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
      <h1 className="text-2xl font-black text-gray-900 mb-2">📅 Agenda</h1>
      <p className="text-gray-600 text-sm mb-6">Klik op een dag om het rooster te zien</p>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Month */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1,1))}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-light text-brand font-bold text-xl">‹</button>
            <span className="font-black text-gray-800 capitalize">
              {viewMonth.toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}
            </span>
            <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1,1))}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-light text-brand font-bold text-xl">›</button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {NL_DAYS_SHORT.map(d=><div key={d} className="text-center text-xs font-bold text-gray-600 py-1">{d}</div>)}
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
                    isSelected ? 'bg-brand text-white shadow-md' :
                    isBlocked ? 'bg-red-100 text-red-500 hover:bg-red-200' :
                    isClosed ? 'bg-gray-100 text-gray-300 hover:bg-gray-200' :
                    isToday ? 'ring-2 ring-brand text-brand' :
                    'hover:bg-brand-light text-gray-700',
                  ].join(' ')}>
                  <span>{day.getDate()}</span>
                  {isBlocked && !isSelected && <span className="text-xs leading-none">🔒</span>}
                  {!isBlocked && count>0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {Array.from({length:Math.min(count,3)}).map((_,j)=>(
                        <div key={j} className={`w-1.5 h-1.5 rounded-full ${isSelected?'bg-white':'bg-brand'}`}/>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100 text-xs font-semibold text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand inline-block"/>{' '}Geselecteerd</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block"/>Geblokkeerd</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 inline-block"/>Gesloten</span>
          </div>
        </div>

        {/* Day schedule */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-300 overflow-hidden">
          <div className={`px-5 py-4 border-b border-gray-100 ${blockedDates.includes(selectedDay) ? 'bg-red-50' : ''}`}>
            <h2 className="font-black text-gray-900 capitalize">{formatLongDate(selectedDay)}</h2>
            {blockedDates.includes(selectedDay) ? (
              <p className="text-xs text-red-500 font-bold">🔒 Geblokkeerd — geen boekingen mogelijk</p>
            ) : !dayCfg?.open ? (
              <p className="text-xs text-gray-600 font-bold">Gesloten</p>
            ) : (
              <p className="text-xs text-gray-600">{dayBookings.length} afspraken · {dayCfg.start}–{dayCfg.end}</p>
            )}
          </div>
          <div className="overflow-y-auto max-h-96">
            {slots.length === 0 ? (
              <p className="text-center text-gray-400 text-sm font-medium py-10">Geen rooster beschikbaar</p>
            ) : null}
            {slots.map(slot=>{
              const b = dayBookings.find(b=>b.time===slot)
              const isPause = isBreak(slot, breakEnabled, breakStart, breakEnd)
              return (
                <div key={slot} className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 ${b?'bg-brand-light':isPause?'bg-amber-50':'bg-gray-50/60'}`}>
                  <span className={`font-black text-xs w-14 text-center shrink-0 px-2 py-1 rounded-lg ${b?'bg-brand text-white':isPause?'bg-amber-100 text-amber-700':'bg-white text-brand border border-brand/20'}`}>{slot}</span>
                  {isPause ? (
                    <span className="text-amber-700 text-xs font-bold">☕ Pauze</span>
                  ) : b ? (
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 text-sm truncate">{b.name}</p>
                      <p className="text-xs text-gray-600">{b.service} · €{b.price}</p>
                    </div>
                  ) : <span className="text-gray-500 text-xs font-medium">Vrij</span>}
                </div>
              )
            })}
          </div>
        </div>
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
    today: <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">VANDAAG</span>,
    upcoming: <span className="text-xs font-black px-2 py-0.5 rounded-full bg-brand-light text-brand">AANKOMEND</span>,
    past: <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">VERLEDEN</span>,
  }

  const filters = [{id:'upcoming',label:'Aankomend'},{id:'today',label:'Vandaag'},{id:'all',label:'Alle'},{id:'past',label:'Verleden'}] as const

  return (
    <div>
      <h1 className="text-2xl font-black text-gray-900 mb-6">📋 Afspraken</h1>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input type="text" placeholder="🔍 Zoeken op naam, e-mail of code..." value={search} onChange={e=>setSearch(e.target.value)}
          className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-brand transition-colors"/>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {filters.map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)}
              className={['px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                filter===f.id?'bg-white text-brand shadow-sm':'text-gray-600 hover:text-gray-700'].join(' ')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"/></div>
      ) : bookings.length===0 ? (
        <div className="text-center py-12 text-gray-600 font-medium">Geen afspraken gevonden</div>
      ) : (
        <div className="space-y-3">
          {bookings.map(b=>{
            const status = getStatus(b.date)
            return (
              <div key={b.id} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center text-2xl shrink-0">
                  {serviceIcon(b.service)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 truncate">{b.name}</p>
                      <p className="text-sm text-gray-600 truncate">{b.service} · {formatMedDate(b.date)} · {b.time}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <a href={`tel:${b.phone}`} className="text-xs text-brand font-semibold hover:underline">📞 {b.phone}</a>
                        <a href={`mailto:${b.email}`} className="text-xs text-brand font-semibold hover:underline truncate">✉️ {b.email}</a>
                      </div>
                      <div className="mt-1">{statusBadge[status]}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-gray-900">€{b.price}</p>
                      <p className="text-xs text-gray-600 font-mono">{b.code}</p>
                      {confirmDel===b.id ? (
                        <div className="flex gap-1 mt-1">
                          <button onClick={()=>del(b.id)} disabled={deleting===b.id} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg font-bold disabled:opacity-50">{deleting===b.id?'...':'Ja'}</button>
                          <button onClick={()=>setConfirmDel(null)} className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-lg font-bold">Nee</button>
                        </div>
                      ) : (
                        <button onClick={()=>setConfirmDel(b.id)} className="text-xs text-red-400 hover:text-red-600 font-semibold mt-1">🗑 Verwijder</button>
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
    setSaving(false); setMsg('✅ Opgeslagen'); setTimeout(()=>setMsg(''),3000)
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
        <h1 className="text-2xl font-black text-gray-900">✂️ Diensten</h1>
        <button onClick={openNew} className="px-4 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover transition-colors">
          + Toevoegen
        </button>
      </div>
      {msg && <div className="mb-4 bg-brand-light border border-brand-muted text-brand text-sm font-bold px-4 py-3 rounded-xl">{msg}</div>}

      {form && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5 mb-6">
          <h2 className="font-black text-gray-900 mb-4">{services.find(s=>s.id===form.id) ? 'Dienst bewerken' : 'Nieuwe dienst'}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Naam</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="bijv. Normale Knipbeurt"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Prijs (€)</label>
                <input type="number" min="0" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Duur</label>
                <select value={form.duration} onChange={e=>setForm({...form,duration:Number(e.target.value)})}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand transition-colors">
                  {durations.map(d=><option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Omschrijving</label>
              <input value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="bijv. 30 minuten"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={()=>setForm(null)} className="px-4 py-2 border-2 border-gray-200 rounded-xl font-bold text-gray-600 text-sm">Annuleren</button>
            <button onClick={saveForm} disabled={!form.name || saving}
              className="px-6 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover disabled:opacity-50">
              {saving ? 'Opslaan...' : '💾 Opslaan'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {services.map(s=>(
          <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center text-2xl shrink-0">
              {serviceIcon(s.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-gray-900">{s.name}</p>
              <p className="text-sm text-gray-600">{s.desc} · {s.duration} min</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-black text-gray-900 text-lg">€{s.price}</p>
              <div className="flex gap-3 mt-1 justify-end">
                <button onClick={()=>setForm({...s})} className="text-xs text-brand hover:underline font-semibold">✏️ Bewerken</button>
                {confirmRemove===s.id ? (
                  <span className="flex gap-1">
                    <button onClick={()=>remove(s.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg font-bold">Ja</button>
                    <button onClick={()=>setConfirmRemove(null)} className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-lg font-bold">Nee</button>
                  </span>
                ) : (
                  <button onClick={()=>setConfirmRemove(s.id)} className="text-xs text-red-400 hover:text-red-600 font-semibold">🗑 Verwijder</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {services.length===0 && <p className="text-center text-gray-600 py-8 font-medium">Geen diensten</p>}
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
    if (d.cancelledBookings > 0) setBanMsg(`✅ Geband — ${d.cancelledBookings} afspraak${d.cancelledBookings>1?'en':''} automatisch geannuleerd`)
    else setBanMsg('✅ Geband')
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
        <h1 className="text-2xl font-black text-gray-900">🛡️ Beheer</h1>
        <button onClick={()=>setShowForm(f=>!f)} className="px-4 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover transition-colors">
          🚫 Email bannen
        </button>
      </div>
      {banMsg && <div className="mb-4 bg-brand-light border border-brand-muted text-brand text-sm font-bold px-4 py-3 rounded-xl">{banMsg}</div>}
      {showForm && (
        <form onSubmit={ban} className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5 mb-6">
          <h2 className="font-black text-gray-900 mb-4">Nieuw ban</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">E-mailadres</label>
              <input type="email" required value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="email@example.com"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Reden (optioneel)</label>
              <input type="text" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reden voor ban"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={()=>setShowForm(false)} className="px-4 py-2 border-2 border-gray-200 rounded-xl font-bold text-gray-600 text-sm">Annuleren</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 disabled:opacity-50">
              {loading?'Bezig...':'🚫 Bannen'}
            </button>
          </div>
        </form>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-300 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Gebande e-mails ({banned.length})</h2>
        </div>
        {banned.length===0 ? (
          <p className="text-center text-gray-600 font-medium py-10">Geen gebande e-mails</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {banned.map(b=>(
              <div key={b.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">🚫 {b.email}</p>
                  {b.reason && <p className="text-xs text-gray-600 mt-0.5">{b.reason}</p>}
                </div>
                {confirmUnban===b.email ? (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={()=>unban(b.email)} disabled={actionLoading===b.email} className="text-xs bg-brand text-white px-2 py-1 rounded-lg font-bold disabled:opacity-50">{actionLoading===b.email?'...':'Ja'}</button>
                    <button onClick={()=>setConfirmUnban(null)} className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded-lg font-bold">Nee</button>
                  </div>
                ) : (
                  <button onClick={()=>setConfirmUnban(b.email)}
                    className="shrink-0 px-3 py-1.5 border-2 border-brand text-brand rounded-xl text-xs font-bold hover:bg-brand-light transition-colors">
                    ✅ Ontbannen
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
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg transition-colors">‹</button>
        <span className="font-bold text-gray-800 capitalize text-sm">
          {viewMonth.toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}
        </span>
        <button onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1,1))}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 font-bold text-lg transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {NL_DAYS_SHORT.map(d=><div key={d} className="text-center text-xs font-bold text-gray-600 py-1">{d}</div>)}
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
                isPast ? 'text-gray-200 cursor-not-allowed' :
                isBlocked ? 'bg-red-500 text-white shadow hover:bg-red-600 scale-105' :
                isToday ? 'ring-2 ring-brand text-brand hover:bg-red-50 hover:text-red-500 hover:ring-red-300' :
                'text-gray-700 hover:bg-red-50 hover:text-red-500',
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
      className={`relative inline-flex w-12 h-6 rounded-full transition-colors ${value?'bg-brand':'bg-gray-300'}`}>
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
    setSaving(s=>({...s,[section]:false})); setMsgs(m=>({...m,[section]:'✅ Opgeslagen'}))
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
    setSaving(s=>({...s,pw:false})); setMsgs(m=>({...m,pw:'✅ Wachtwoord gewijzigd'}))
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
      <h1 className="text-2xl font-black text-gray-900">⚙️ Instellingen</h1>

      {/* Beschikbaarheid + Werktijden per dag */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5">
        <h2 className="font-black text-gray-900 mb-1">📆 Beschikbaarheid & Werktijden</h2>
        <p className="text-xs text-gray-600 mb-4">Zet dagen aan/uit en stel per dag uw begin- en eindtijd in</p>
        <div className="space-y-2 mb-4">
          {dayOrder.map(day => {
            const cfg = daySchedule[day]
            return (
              <div key={day} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${cfg.open ? 'border-brand-muted bg-brand-light/40' : 'border-gray-100 bg-gray-50'}`}>
                <Toggle value={cfg.open} onChange={v => updateDay(day, {open: v})} />
                <span className={`font-bold text-sm w-20 shrink-0 ${cfg.open ? 'text-gray-900' : 'text-gray-600'}`}>{NL_DAY_LABELS[day]}</span>
                {cfg.open ? (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <select value={cfg.start} onChange={e => updateDay(day, {start: e.target.value})}
                      className="border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-brand transition-colors bg-white">
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-gray-600 font-bold text-sm">→</span>
                    <select value={cfg.end} onChange={e => updateDay(day, {end: e.target.value})}
                      className="border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-brand transition-colors bg-white">
                      {timeOptions.filter(t => t > cfg.start).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm font-medium italic flex-1">Gesloten</span>
                )}
              </div>
            )
          })}
        </div>
        {/* Pauze */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-gray-900 text-sm">☕ Pauze</p>
              <p className="text-xs text-gray-600">Geen boekingen tijdens pauze</p>
            </div>
            <Toggle value={breakEnabled} onChange={setBreakEnabled}/>
          </div>
          {breakEnabled && (
            <div className="flex items-center gap-2 mt-2">
              <select value={breakStart} onChange={e=>setBreakStart(e.target.value)}
                className="border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-brand transition-colors bg-white">
                {timeOptions.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span className="text-gray-600 font-bold text-sm">→</span>
              <select value={breakEnd} onChange={e=>setBreakEnd(e.target.value)}
                className="border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-brand transition-colors bg-white">
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
            className="px-5 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {saving.schedule ? 'Opslaan...' : '💾 Opslaan'}
          </button>
          {msgs.schedule && <span className="text-brand text-sm font-semibold">{msgs.schedule}</span>}
        </div>
      </div>

      {/* Geblokkeerde datums */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5">
        <h2 className="font-black text-gray-900 mb-1">🏖️ Vrije dagen / Vakantie</h2>
        <p className="text-xs text-gray-600 mb-4">Klik op meerdere datums om ze te blokkeren — klik opnieuw om te deblokkeren</p>
        <BlockedCalendar blocked={blockedDates} onChange={setBlockedDates}/>
        {blockedDates.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {blockedDates.map(d=>(
              <span key={d} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-xl">
                🔒 {formatShortDate(d)}
                <button onClick={()=>setBlockedDates(prev=>prev.filter(x=>x!==d))}
                  className="ml-1 text-red-400 hover:text-red-700 font-black leading-none">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={()=>save('blocked_dates', JSON.stringify(blockedDates), 'blocked')} disabled={saving.blocked}
            className="px-5 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {saving.blocked ? 'Opslaan...' : '💾 Opslaan'}
          </button>
          {msgs.blocked && <span className="text-brand text-sm font-semibold">{msgs.blocked}</span>}
        </div>
      </div>

      {/* Exporteren */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5">
        <h2 className="font-black text-gray-900 mb-1">📤 Exporteren</h2>
        <p className="text-xs text-gray-600 mb-4">Download uw agenda als kalenderbestand</p>
        <div className="flex items-center justify-between py-3 border border-gray-300 rounded-xl px-4">
          <div>
            <p className="font-bold text-gray-900 text-sm">Exporteer alle afspraken</p>
            <p className="text-xs text-brand font-medium">Download als .ics kalenderbestand</p>
          </div>
          <a href="/api/portaal/export" download className="flex items-center gap-2 bg-brand text-white px-3 py-2 rounded-xl font-bold text-sm hover:bg-brand-hover transition-colors">📥 Downloaden</a>
        </div>
      </div>

      {/* Wachtwoord */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-300 p-5">
        <h2 className="font-black text-gray-900 mb-4">🔑 Wachtwoord wijzigen</h2>
        <form onSubmit={changePw} className="space-y-4">
          {errs.pw && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">{errs.pw}</div>}
          {msgs.pw && <div className="bg-brand-light border border-brand-muted text-brand rounded-xl px-4 py-3 text-sm font-semibold">{msgs.pw}</div>}
          {[{label:'Huidig wachtwoord',val:currentPw,set:setCurrentPw},{label:'Nieuw wachtwoord',val:newPw,set:setNewPw},{label:'Bevestig nieuw',val:confirmPw,set:setConfirmPw}].map(f=>(
            <div key={f.label}>
              <label className="block text-sm font-bold text-gray-700 mb-1">{f.label}</label>
              <input type="password" required value={f.val} onChange={e=>f.set(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand transition-colors"/>
            </div>
          ))}
          <button type="submit" disabled={saving.pw}
            className="px-5 py-2 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {saving.pw?'Opslaan...':'💾 Wachtwoord wijzigen'}
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-brand-light">
      <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin"/>
      <p className="text-gray-600 text-sm font-medium">Even geduld...</p>
    </div>
  )

  if(authError) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <p className="text-2xl mb-3">⚠️</p>
        <p className="font-black text-gray-900 mb-2">Verbinding mislukt</p>
        <p className="text-gray-600 text-sm mb-4">De server reageert niet. Controleer uw internetverbinding.</p>
        <button onClick={()=>window.location.reload()} className="w-full py-2.5 bg-brand text-white rounded-xl font-bold text-sm">Opnieuw proberen</button>
      </div>
    </div>
  )

  if(!authenticated) return <LoginScreen onLogin={()=>setAuthenticated(true)}/>
  return <PortalShell onLogout={logout}/>
}
