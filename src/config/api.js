import Constants from 'expo-constants'

/**
 * Mobile App (Customer & Driver) — Centralized API & Environment Configuration
 * Supports Local Expo Development & Live Production Deployment
 */

export const PROD_BACKEND_URL = 'https://taxi-backend.toptechsoftwaresolutions.in'
export const PROD_API_URL     = `${PROD_BACKEND_URL}/api`

const getDevHostIp = () => {
  const hostUri = Constants.expoConfig?.hostUri
    || Constants.manifest?.debuggerHost
    || Constants.manifest2?.extra?.expoGo?.debuggerHost
  if (hostUri) {
    const rawHost = hostUri.split(':')[0]
    // Only return if it's a valid local LAN IP address
    if (/^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(rawHost)) {
      return rawHost
    }
  }
  return null
}

const devHostIp = getDevHostIp()
export const DEV_BACKEND_URL = devHostIp 
  ? `http://${devHostIp}/cab&taxi_Management_System/backend` 
  : PROD_BACKEND_URL
export const DEV_API_URL     = `${DEV_BACKEND_URL}/api`

// Determine runtime build mode
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || (
  process.env.EXPO_PUBLIC_USE_LOCAL
    ? (devHostIp ? DEV_BACKEND_URL : 'http://localhost/cab&taxi_Management_System/backend')
    : (isDev && devHostIp && !process.env.EXPO_PUBLIC_USE_PROD ? DEV_BACKEND_URL : (Constants.expoConfig?.extra?.backendUrl || PROD_BACKEND_URL))
)

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || (
  process.env.EXPO_PUBLIC_USE_LOCAL
    ? `${BACKEND_URL}/api`
    : (isDev && devHostIp && !process.env.EXPO_PUBLIC_USE_PROD ? DEV_API_URL : (Constants.expoConfig?.extra?.apiBaseUrl || PROD_API_URL))
)

export const resolveAssetUrl = (path) => {
  if (!path) return null
  if (typeof path !== 'string') return null
  if (
    path.startsWith('file://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    if (path.includes('/uploads/')) {
      const parts = path.split('/uploads/')
      const cleanSub = parts[parts.length - 1].replace(/^\//, '')
      return `${BACKEND_URL}/uploads/${cleanSub}`
    }
    return path
  }
  const clean = path.replace(/^(\.\.\/|\/)/, '')
  if (clean.startsWith('uploads/')) {
    return `${BACKEND_URL}/${clean}`
  }
  return `${BACKEND_URL}/uploads/${clean}`
}

export default {
  API_BASE_URL,
  BACKEND_URL,
  resolveAssetUrl,
}
