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
