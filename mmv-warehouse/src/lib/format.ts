// Tiện ích định dạng ngày, số, tiền cho toàn app

export function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

/** yyyy-mm-dd (local) */
export function toISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** dd/mm/yyyy */
export function fmtDate(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return String(input)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** dd/mm/yy */
export function fmtDateShort(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return String(input)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`
}

/** HH:mm */
export function fmtTime(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Số gọn: bỏ .0 thừa */
export function fmtQty(n: number | null | undefined): string {
  if (n == null) return '0'
  return (Math.round(n * 100) / 100).toString()
}

/** Tiền VND */
export function fmtMoney(n: number | null | undefined): string {
  if (!n) return '0'
  return new Intl.NumberFormat('vi-VN').format(Math.round(n))
}

export function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Đầu và cuối tháng hiện tại (ISO) */
export function monthRange(base: Date = new Date()): { start: string; end: string } {
  const start = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0)
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** N ngày gần nhất (mặc định 7) - trả về mốc yyyy-mm-dd */
export function lastNDays(n = 7): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (n - 1))
  return { start: toISODate(start), end: toISODate(end) }
}

/** Số tháng còn lại tới HSD (âm nếu đã hết hạn) */
export function monthsUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth())
}
