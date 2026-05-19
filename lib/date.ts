export function todayNL(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split(' ')[0]
}

export function dateOffsetNL(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split(' ')[0]
}
