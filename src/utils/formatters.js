export const formatCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`

export const formatDistance = (km) => `${Number(km || 0).toFixed(1)} km`

export const formatDuration = (min) => {
  const m = Math.round(Number(min) || 0)
  if (m <= 0) return '0 min'
  const hours = Math.floor(m / 60)
  const remainingMins = m % 60
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}${remainingMins > 0 ? ` ${remainingMins} min${remainingMins > 1 ? 's' : ''}` : ''}`
  }
  return `${m} mins`
}

/**
 * Converts any time string (e.g. "14:30:00", "14:30", "2026-10-01 14:30:00") to 12-hour AM/PM format (e.g. "02:30 PM")
 */
export const formatTime12Hr = (timeStr, fallback = '—') => {
  if (!timeStr) return fallback
  const s = String(timeStr).trim()
  if (!s || s === 'null' || s === 'undefined' || s === '00:00:00') return fallback

  // Already 12-hour format e.g. "02:30 PM"
  if (/am|pm/i.test(s)) {
    return s
  }

  // If full datetime string like "2026-10-01 14:30:00" or ISO "2026-10-01T14:30:00"
  if (s.includes(' ') || s.includes('T')) {
    const parts = s.split(/[ T]/)
    if (parts[1]) {
      return formatTime12Hr(parts[1], fallback)
    }
  }

  // Extract HH:mm
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return s
  let hour = parseInt(m[1], 10)
  const minute = m[2]
  const ampm = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12
  if (hour === 0) hour = 12
  const formattedHour = String(hour).padStart(2, '0')
  return `${formattedHour}:${minute} ${ampm}`
}

/**
 * Formats a date string (e.g. "2026-10-01") to localized display (e.g. "1 Oct 2026")
 */
export const formatDateDisplay = (dateStr, fallback = '—') => {
  if (!dateStr) return fallback
  const s = String(dateStr).trim()
  if (!s || s === 'null' || s === 'undefined' || s.startsWith('0000-00-00')) return fallback
  const datePart = s.split(/[ T]/)[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [y, mo, d] = datePart.split('-').map(Number)
    const dt = new Date(y, mo - 1, d)
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  }
  return datePart
}

/**
 * Formats combined date and time with 12-hour AM/PM (e.g. "1 Oct 2026 · 02:30 PM")
 */
export const formatDateTime12Hr = (dateTimeStr, fallback = '—') => {
  if (!dateTimeStr) return fallback
  const s = String(dateTimeStr).trim()
  if (!s || s === 'null' || s === 'undefined' || s.startsWith('0000-00-00')) return fallback
  
  const parts = s.split(/[ T]/)
  const datePart = parts[0]
  const timePart = parts[1]
  
  const dateText = formatDateDisplay(datePart, datePart)
  if (timePart) {
    const timeText = formatTime12Hr(timePart)
    return timeText !== '—' ? `${dateText} · ${timeText}` : dateText
  }
  return dateText
}
