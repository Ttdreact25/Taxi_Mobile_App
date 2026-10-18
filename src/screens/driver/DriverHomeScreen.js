import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Linking,
  Image,
  RefreshControl,
  Vibration,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { driverAPI, adsAPI, longTripAPI, notifAPI, uploadAPI, settingsAPI, reviewsAPI, createUploadFormData, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'

// Module-level persistent cache of dismissed cancelled trip IDs (guarantees alert shows exactly ONCE across screens/tabs)
const acknowledgedCancelledTripIds = new Set()
const { width: SCREEN_WIDTH } = Dimensions.get('window')
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import SwipeToActionButton from '../../components/common/SwipeToActionButton'
import { formatTime12Hr, formatDateDisplay, formatDateTime12Hr } from '../../utils/formatters'
import { playDriverAlertSound, playDriverBookingReceived } from '../../services/SoundService'

const REJECT_REASONS = [
  'Pickup location too far away',
  'Heavy traffic / Long delay',
  'Taking a break / Offline soon',
  'Vehicle maintenance needed',
  'Schedule conflict with other booking',
  'Customer safety concern',
]

const haversineKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const getScheduleCountdown = (pickupDate, pickupTime, nowTime = Date.now()) => {
  if (!pickupDate) return { text: 'Scheduled', isBufferTime: false, badgeColor: '#D97706', badgeBg: '#FEF3C7' }

  const dateParts = pickupDate.split('-').map(Number)
  const pYear = dateParts[0]
  const pMonth = dateParts[1]
  const pDay = dateParts[2]

  const timeStr = pickupTime || '08:30:00'
  const timeParts = timeStr.split(':').map(Number)
  const pHour = timeParts[0] || 0
  const pMin = timeParts[1] || 0

  const now = new Date(nowTime)
  const targetDate = new Date(pYear, pMonth - 1, pDay, pHour, pMin, 0)
  const diffMs = targetDate.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / (1000 * 60))

  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const pickupDateOnly = new Date(pYear, pMonth - 1, pDay)
  const calendarDayDiff = Math.round((pickupDateOnly.getTime() - nowDateOnly.getTime()) / (1000 * 60 * 60 * 24))

  if (calendarDayDiff >= 2) {
    return { text: `Starts in ${calendarDayDiff} Days`, badgeColor: '#B45309', badgeBg: '#FEF3C7', isBufferTime: false }
  }
  if (calendarDayDiff === 1) {
    return { text: 'Starts Tomorrow', badgeColor: '#D97706', badgeBg: '#FEF3C7', isBufferTime: false }
  }
  if (calendarDayDiff === 0) {
    if (diffMinutes > 60) {
      const hours = Math.round(diffMinutes / 60)
      return { text: hours === 1 ? 'Starts in 1 Hour' : `Starts in ${hours} Hours`, badgeColor: '#6D28D9', badgeBg: '#F5F3FF', isBufferTime: false }
    }
    if (diffMinutes > 15) {
      return { text: `Starts in ${diffMinutes} Mins`, badgeColor: '#B45309', badgeBg: '#FEF3C7', isBufferTime: false }
    }
    if (diffMinutes > 0) {
      return { text: `Starts in ${diffMinutes} Mins (Ready)`, badgeColor: '#15803D', badgeBg: '#DCFCE7', isBufferTime: true }
    }
    return { text: 'Pickup Time Arrived', badgeColor: '#15803D', badgeBg: '#DCFCE7', isBufferTime: true }
  }
  return { text: 'Schedule Elapsed', badgeColor: '#B91C1C', badgeBg: '#FEE2E2', isBufferTime: false }
}

const TN_DISTRICTS = [
  'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode',
  'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Puducherry', 'Pondicherry',
  'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi',
  'Tiruchirappalli', 'Trichy', 'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
  'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar'
]

const parseAddressDetails = (addr, type = 'pickup') => {
  if (!addr) return { full: '—', main: type === 'pickup' ? 'Pickup Location' : 'Drop Location', district: 'Tamil Nadu' }
  const cleanAddr = String(addr).trim()
  const parts = cleanAddr.split(',').map(s => s.trim()).filter(Boolean)

  let matchedDistrict = null
  for (const d of TN_DISTRICTS) {
    const reg = new RegExp('\\b' + d + '\\b', 'i')
    if (reg.test(cleanAddr)) {
      matchedDistrict = d === 'Pondicherry' ? 'Puducherry' : (d === 'Trichy' ? 'Tiruchirappalli' : d)
      break
    }
  }

  let effectiveParts = [...parts]
  if (effectiveParts.length > 2 && /india/i.test(effectiveParts[effectiveParts.length - 1])) {
    effectiveParts.pop()
  }
  let districtCandidate = effectiveParts[effectiveParts.length - 1].replace(/\b\d{6}\b/g, '').trim()
  if (!districtCandidate && effectiveParts.length > 1) {
    districtCandidate = effectiveParts[effectiveParts.length - 2]
  }

  const mainCandidate = effectiveParts.length >= 2 
    ? effectiveParts[effectiveParts.length - 2] 
    : effectiveParts[0]

  return {
    full: cleanAddr,
    main: mainCandidate || parts[0] || (type === 'pickup' ? 'Pickup Location' : 'Drop Location'),
    district: matchedDistrict || districtCandidate || 'Tamil Nadu',
  }
}

const formatTripScheduleDate = (dateStr, timeStr) => {
  if (!dateStr || dateStr === '0000-00-00') return 'Not Applicable'
  try {
    const rawDate = String(dateStr).split(/[ T]/)[0]
    const parts = rawDate.split('-').map(Number)
    if (parts.length < 3 || isNaN(parts[0])) return dateStr
    const [y, mo, d] = parts
    const dt = new Date(y, mo - 1, d)
    if (isNaN(dt.getTime())) return dateStr
    const month = dt.toLocaleString('en-US', { month: 'short' })
    const nth = (d % 10 === 1 && d !== 11) ? 'st'
      : (d % 10 === 2 && d !== 12) ? 'nd'
      : (d % 10 === 3 && d !== 13) ? 'rd' : 'th'
    const formattedDate = `${month} ${d}${nth} ${y}`
    const timeFormatted = timeStr ? formatTime12Hr(timeStr) : ''
    return timeFormatted && timeFormatted !== '—' ? `${formattedDate}, ${timeFormatted.toLowerCase()}` : formattedDate
  } catch (e) {
    return dateStr
  }
}

// Clean, deduplicated notes extractor for professional driver trip display
const getDeduplicatedNotes = (rawNotes, isLocked = false) => {
  if (!rawNotes || typeof rawNotes !== 'string') return []
  let text = String(rawNotes).trim()
  if (isLocked) {
    text = text.replace(/\b\d{10}\b/g, '•••••••••• (Revealed on Start)')
  }
  const chunks = text.split('|').map(s => s.trim()).filter(Boolean)
  if (chunks.length === 0) return []

  const categoryMap = new Map()
  for (const chunk of chunks) {
    const lower = chunk.toLowerCase()
    let key = chunk
    if (lower.includes('passenger') && !lower.includes('passengers:')) {
      key = 'passenger_name'
    } else if (lower.includes('passengers:') || lower.includes('passenger:')) {
      key = 'passenger_count'
    } else if (lower.includes('luggage')) {
      key = 'luggage'
    } else if (lower.includes('pet')) {
      key = 'pets'
    } else if (lower.includes('waiting')) {
      key = 'waiting_time'
    } else if (lower.includes('carrier') || lower.includes('rooftop')) {
      key = 'carrier'
    } else if (lower.includes('via') || lower.includes('stop:')) {
      key = 'via_stop'
    } else if (lower.includes('driver note') || lower.includes('note:')) {
      key = 'driver_note'
    } else if (lower.includes('emergency')) {
      key = 'emergency'
    }
    // Set overwrites any duplicate with latest/updated specific entry
    categoryMap.set(key, chunk)
  }

  return Array.from(categoryMap.values())
}

const DriverWaitingTimerCard = ({ arrivedAt, freeWaitingMins = 5, waitingRate = 2, categoryName = 'Taxi' }) => {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const parseMs = (dt) => {
    if (!dt) return Date.now()
    if (typeof dt === 'number') return dt
    const s = String(dt).trim().replace(' ', 'T')
    const t = new Date(s).getTime()
    return isNaN(t) ? Date.now() : t
  }

  const arrivedMs = parseMs(arrivedAt)
  const elapsedSec = Math.max(0, Math.floor((now - arrivedMs) / 1000))
  const freeWaitSec = (Number(freeWaitingMins) || 5) * 60
  const isFree = elapsedSec < freeWaitSec

  const formatMMSS = (sec) => {
    if (!sec || sec < 0) return '00:00'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (isFree) {
    const remainingSec = freeWaitSec - elapsedSec
    return (
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F0FDF4',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: '#86EFAC',
        marginBottom: 8,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <Ionicons name="time" size={15} color="#059669" style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46' }}>
            Free Waiting
          </Text>
          <Text style={{ fontSize: 11, color: '#047857', marginLeft: 4, fontWeight: '500' }}>
            ({freeWaitingMins}m free • ₹{waitingRate}/m)
          </Text>
        </View>
        <View style={{
          backgroundColor: '#059669',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF', fontVariant: ['tabular-nums'], letterSpacing: 0.5 }}>
            {formatMMSS(remainingSec)}
          </Text>
        </View>
      </View>
    )
  }

  const extraSec = elapsedSec - freeWaitSec
  const extraMins = Math.max(1, Math.ceil(extraSec / 60))
  const accruedCharge = Math.round(extraMins * (Number(waitingRate) || 2))

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#FFFBEB',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: '#FCD34D',
      marginBottom: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
        <Ionicons name="alert-circle" size={16} color="#D97706" style={{ marginRight: 6 }} />
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>
          Extra Waiting
        </Text>
        <Text style={{ fontSize: 12, color: '#B45309', marginLeft: 6, fontWeight: '700' }}>
          +{extraMins} mins
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{
          backgroundColor: '#FEF3C7',
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: 6,
          borderWidth: 0.5,
          borderColor: '#FDE68A',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E', fontVariant: ['tabular-nums'] }}>
            {formatMMSS(extraSec)}
          </Text>
        </View>
        <View style={{
          backgroundColor: '#D97706',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>
            +₹{accruedCharge}
          </Text>
        </View>
      </View>
    </View>
  )
}

const DriverHomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets()
  const isFocused = useIsFocused()
  const { user } = useAuth()
  const [driver, setDriver] = useState(user || null)

  useEffect(() => {
    if (user) {
      setDriver(prev => ({ ...(prev || {}), ...user }))
    }
  }, [user])
  const [isOnline, setIsOnline] = useState(false)
  const [driverLocation, setDriverLocation] = useState(null)
  const [activeRide, setActiveRide] = useState(null)
  const [manifest, setManifest] = useState([])
  const [pendingRides, setPendingRides] = useState([])
  const [adminAssignedTrips, setAdminAssignedTrips] = useState([])
  const [upcomingTrips, setUpcomingTrips] = useState([])
  const [stats, setStats] = useState(null)
  const [driverAds, setDriverAds] = useState([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [nowTime, setNowTime] = useState(Date.now())
  const [collapsedNotes, setCollapsedNotes] = useState({})
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  // New Telemetry, Performance & Dashboard States
  const [currentCity, setCurrentCity] = useState('')
  const [currentArea, setCurrentArea] = useState('')
  const [gpsStatus, setGpsStatus] = useState('GPS Active 🟢')
  const [lastUpdatedTime, setLastUpdatedTime] = useState('Just now')
  const [recentTrips, setRecentTrips] = useState([])
  const [driverReviews, setDriverReviews] = useState([])
  const [weeklyEarnings, setWeeklyEarnings] = useState({ total: 0, trips_detail: [] })
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false)
  const [showLiveMapDetails, setShowLiveMapDetails] = useState(true)

  // Action Loading States
  const [acceptingTripId, setAcceptingTripId] = useState(null)
  const [respondingPendingId, setRespondingPendingId] = useState(null)

  // Incoming Instant Request Modal
  const [countdown, setCountdown] = useState(30)
  const [rejectModalTrip, setRejectModalTrip] = useState(null)
  const [rejectIsLongTrip, setRejectIsLongTrip] = useState(false)
  const [selectedReason, setSelectedReason] = useState(REJECT_REASONS[0])
  const [assignedAlertTrip, setAssignedAlertTrip] = useState(null)

  // Normal Trip Start OTP Modal
  const [otpModalVisible, setOtpModalVisible] = useState(false)
  const [enteredOtp, setEnteredOtp] = useState('')
  const [verifyingOtp, setVerifyingOtp] = useState(false)

  // Passenger Boarding OTP Modal (Shared Trips)
  const [passOtpModal, setPassOtpModal] = useState(null)
  const [passEnteredOtp, setPassEnteredOtp] = useState('')
  const [verifyingPassOtp, setVerifyingPassOtp] = useState(false)

  // Full Trip Details Modal Sheet
  const [detailModalTrip, setDetailModalTrip] = useState(null)
  const [cancelledNotice, setCancelledNotice] = useState(null)

  // Customer Profile Modal
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [custAvatarError, setCustAvatarError] = useState(false)

  // Complete Trip Modal & Final Invoice
  const [completeTripModalVisible, setCompleteTripModalVisible] = useState(false)
  const [enteredActualDistance, setEnteredActualDistance] = useState('')
  const [enteredTollCharge, setEnteredTollCharge] = useState('')
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false)
  const [tripGpsTrackedDistanceKm, setTripGpsTrackedDistanceKm] = useState(0)
  const lastTripGpsCoordRef = useRef(null)
  const tripGpsAccumulatedKmRef = useRef(0)
  const activeRideRef = useRef(null)

  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const incomingIdRef = useRef(null)
  const alertedAssignedTripIdRef = useRef(null)
  const alertedPendingTripIdRef = useRef(null)
  const prevUnreadNotifCountRef = useRef(null)
  const prevActiveRideRef = useRef(null)
  const completedTripIdsRef = useRef(new Set())
  const locallyAcceptedTripIdsRef = useRef(new Set())
  const declinedTripIdsRef = useRef(new Set())
  const acknowledgedCancelledTripIdRef = useRef(null)
  const lastGeoRef = useRef({ lat: 0, lng: 0, area: '', city: '', address: '', timestamp: 0 })
  const [startedHeadingRides, setStartedHeadingRides] = useState(new Set())

  // Synchronize activeRide reference and restore accumulated GPS distance from SecureStore if re-opened
  useEffect(() => {
    activeRideRef.current = activeRide
    if (!activeRide) {
      lastTripGpsCoordRef.current = null
      tripGpsAccumulatedKmRef.current = 0
      setTripGpsTrackedDistanceKm(0)
    } else {
      SecureStore.getItemAsync(`heading_started_${activeRide.id}`).then(val => {
        if (val === '1') {
          setStartedHeadingRides(prev => new Set(prev).add(activeRide.id))
        }
      }).catch(() => {})
      const isTripMoving = ['trip_started', 'in_progress', 'return_started', 'return_in_progress'].includes(activeRide.status)
      if (isTripMoving) {
        const rideKey = `gps_odometer_${activeRide.id}`
        SecureStore.getItemAsync(rideKey)
          .then(stored => {
            if (stored) {
              const storedVal = parseFloat(stored)
              if (!isNaN(storedVal) && storedVal > 0) {
                tripGpsAccumulatedKmRef.current = storedVal
                setTripGpsTrackedDistanceKm(storedVal)
              }
            }
          })
          .catch(() => {})
      }
    }
  }, [activeRide])

  // Live GPS Odometer accumulator during active trip (Auto-detects actual route & extra km without driver manual input)
  const trackTripGpsStep = useCallback(async (lat, lng) => {
    const curRide = activeRideRef.current
    if (!curRide) return
    const isTripMoving = ['trip_started', 'in_progress', 'return_started', 'return_in_progress'].includes(curRide.status)
    if (!isTripMoving) {
      lastTripGpsCoordRef.current = null
      return
    }

    const rideKey = `gps_odometer_${curRide.id}`

    // Load accumulated km from SecureStore if starting fresh
    if (tripGpsAccumulatedKmRef.current === 0) {
      try {
        const stored = await SecureStore.getItemAsync(rideKey)
        if (stored) {
          const storedVal = parseFloat(stored)
          if (!isNaN(storedVal) && storedVal > 0) {
            tripGpsAccumulatedKmRef.current = storedVal
            setTripGpsTrackedDistanceKm(storedVal)
          }
        }
      } catch {}
    }

    if (lastTripGpsCoordRef.current) {
      const deltaKm = haversineKm(
        lastTripGpsCoordRef.current.lat,
        lastTripGpsCoordRef.current.lng,
        lat,
        lng
      )
      // Filter out GPS jitter (< 15 meters) or impossible jumps (> 2.0 km in 3.5 sec)
      if (deltaKm >= 0.015 && deltaKm < 2.0) {
        tripGpsAccumulatedKmRef.current += deltaKm
        const rounded = parseFloat(tripGpsAccumulatedKmRef.current.toFixed(2))
        setTripGpsTrackedDistanceKm(rounded)
        try {
          await SecureStore.setItemAsync(rideKey, String(rounded))
        } catch {}
      }
    }
    lastTripGpsCoordRef.current = { lat, lng }
  }, [])

  // Reverse Geocoding with memory caching to extract readable Area & City (e.g. KK Nagar, Chennai)
  const resolveAreaFromCoords = useCallback(async (latitude, longitude) => {
    try {
      const now = Date.now()
      const cached = lastGeoRef.current
      if (cached.area && (now - cached.timestamp < 45000)) {
        const dLat = Math.abs(latitude - cached.lat)
        const dLng = Math.abs(longitude - cached.lng)
        if (dLat < 0.0025 && dLng < 0.0025) {
          return { area: cached.area, city: cached.city, address: cached.address }
        }
      }
      const rev = await Location.reverseGeocodeAsync({ latitude, longitude })
      if (rev && rev[0]) {
        const r = rev[0]
        const sub = r.district || r.subregion || r.street || r.name || ''
        const city = r.city || r.subregion || ''
        let area = ''
        if (sub && city && sub.toLowerCase() !== city.toLowerCase()) {
          area = `${sub}, ${city}`
        } else {
          area = sub || city || ''
        }
        const address = [r.name, r.street, r.district, r.city, r.region].filter(Boolean).join(', ')
        lastGeoRef.current = { lat: latitude, lng: longitude, area, city, address, timestamp: now }
        if (city) setCurrentCity(city)
        if (sub || area) setCurrentArea(sub || area)
        setGpsStatus('GPS Active 🟢')
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        setLastUpdatedTime(timeStr)
        return { area, city, address }
      }
    } catch (e) {}
    return { area: '', city: '', address: '' }
  }, [])

  // Clock timer to smoothly refresh countdowns
  useEffect(() => {
    const clockTimer = setInterval(() => setNowTime(Date.now()), 10000)
    return () => clearInterval(clockTimer)
  }, [])

  // Fast Unified Dashboard Loader
  const loadDashboardData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true)
    try {
      const locParams = {
        target_audience: 'driver',
        city: lastGeoRef.current.city || undefined,
        latitude: lastGeoRef.current.lat || undefined,
        longitude: lastGeoRef.current.lng || undefined,
      }
      const [dashRes, schedRes, activeRes, pendingRes, adRes, notifRes, tripsRes, earnRes, sysSettingsRes, revRes] = await Promise.allSettled([
        driverAPI.dashboard(),
        longTripAPI.assignedScheduledTrips(),
        driverAPI.activeBooking(),
        driverAPI.pendingRides(),
        adsAPI.list(locParams),
        notifAPI.list(true),
        driverAPI.myTrips({ per_page: 10 }),
        driverAPI.earnings('week'),
        settingsAPI.list(),
        user?.id ? reviewsAPI.listForUser(user.id, 'driver') : Promise.resolve({ data: { reviews: [] } }),
      ])

      // 1. Dashboard payload & Admin System Settings Target
      let adminTarget = null
      let adminTargetTrips = null
      let adminBonus = null

      if (sysSettingsRes.status === 'fulfilled' && sysSettingsRes.value.data?.settings) {
        const s = sysSettingsRes.value.data.settings
        if (s.driver_daily_target) adminTarget = Number(s.driver_daily_target)
        if (s.driver_daily_target_trips) adminTargetTrips = Number(s.driver_daily_target_trips)
        if (s.driver_target_bonus) adminBonus = Number(s.driver_target_bonus)
      }

      if (dashRes.status === 'fulfilled' && dashRes.value.data?.status === 'success') {
        const dData = dashRes.value.data
        if (dData.driver) {
          const mergedDriver = { ...(user || {}), ...dData.driver }
          setDriver(mergedDriver)
          const isKycApproved = (mergedDriver.approval_status || '').toLowerCase() === 'approved' ||
                                (mergedDriver.verification_status || '').toLowerCase() === 'approved' ||
                                (mergedDriver.verification_status || '').toLowerCase() === 'verified' ||
                                (mergedDriver.kyc_status || '').toLowerCase() === 'approved'
          setIsOnline(isKycApproved ? Boolean(mergedDriver.is_online) : false)
        }

        const resolvedTarget = adminTarget
          ?? (dData.today?.daily_target ? Number(dData.today.daily_target) : null)
          ?? (dData.daily_target ? Number(dData.daily_target) : null)
          ?? (dData.driver?.daily_target ? Number(dData.driver.daily_target) : null)
          ?? 2000

        const resolvedTrips = adminTargetTrips
          ?? (dData.today?.daily_target_trips ? Number(dData.today.daily_target_trips) : null)
          ?? (dData.daily_target_trips ? Number(dData.daily_target_trips) : null)
          ?? (dData.driver?.daily_target_trips ? Number(dData.driver.daily_target_trips) : null)
          ?? 10

        const resolvedBonus = adminBonus
          ?? (dData.target_bonus ? Number(dData.target_bonus) : null)
          ?? (dData.today?.target_bonus ? Number(dData.today.target_bonus) : null)
          ?? 200

        setStats({
          ...(dData.today || {}),
          daily_target: resolvedTarget,
          daily_target_trips: resolvedTrips,
          target_bonus: resolvedBonus,
        })
      } else if (adminTarget) {
        setStats(prev => ({
          ...(prev || {}),
          daily_target: adminTarget,
          daily_target_trips: adminTargetTrips || 10,
          target_bonus: adminBonus || 200,
        }))
      }

      // 2. Scheduled & Admin Assigned Trips
      if (schedRes.status === 'fulfilled' && schedRes.value.data?.status === 'success') {
        const sData = schedRes.value.data
        const rawNewAssignments = sData.new_assignments || []
        const newAssignments = rawNewAssignments.filter(t => {
          const tid = Number(t.id)
          const ltid = Number(t.long_trip_id)
          const bid = Number(t.booking_id)
          return !declinedTripIdsRef.current.has(tid) &&
                 !declinedTripIdsRef.current.has(ltid) &&
                 !declinedTripIdsRef.current.has(bid)
        })
        setAdminAssignedTrips(newAssignments)
        setUpcomingTrips((sData.upcoming_trips || []).filter(t => {
          const tid = Number(t.id)
          const ltid = Number(t.long_trip_id)
          const bid = Number(t.booking_id)
          return !declinedTripIdsRef.current.has(tid) &&
                 !declinedTripIdsRef.current.has(ltid) &&
                 !declinedTripIdsRef.current.has(bid)
        }))

        if (newAssignments.length > 0) {
          const firstNew = newAssignments[0]
          const newId = firstNew.long_trip_id || firstNew.id
          if (newId && alertedAssignedTripIdRef.current !== `sched_${newId}`) {
            alertedAssignedTripIdRef.current = `sched_${newId}`
            playDriverBookingReceived(firstNew.booking_ref).catch(() => {})
          }
          if (!assignedAlertTrip) {
            setAssignedAlertTrip({
              ...firstNew,
              id: firstNew.booking_id || firstNew.id,
              is_long_trip: true,
              long_trip_id: firstNew.long_trip_id || firstNew.id,
              customer_name: firstNew.customer_name || 'Passenger',
              pickup_address: firstNew.pickup_address,
              dest_address: firstNew.dest_address,
              final_fare: firstNew.final_fare || firstNew.total_fare || firstNew.fare || firstNew.fare_estimate || 0,
            })
          }
        }
      }

      // 3. Pending Dispatch Requests
      let incomingRides = []
      if (pendingRes.status === 'fulfilled' && pendingRes.value.data?.status === 'success' && Array.isArray(pendingRes.value.data.rides)) {
        incomingRides = pendingRes.value.data.rides
      } else if (dashRes.status === 'fulfilled' && Array.isArray(dashRes.value.data?.pending_rides)) {
        incomingRides = dashRes.value.data.pending_rides
      }
      incomingRides = incomingRides.filter(r => !declinedTripIdsRef.current.has(Number(r.id)))

      // 4. Active Ride & Shared Manifest
      let act = (activeRes.status === 'fulfilled' && activeRes.value.data?.status === 'success' && activeRes.value.data.booking)
        ? activeRes.value.data.booking
        : (dashRes.status === 'fulfilled' && dashRes.value.data?.active_booking ? dashRes.value.data.active_booking : null)

      if (act && (
        declinedTripIdsRef.current.has(Number(act.id)) ||
        (act.long_trip_id && declinedTripIdsRef.current.has(Number(act.long_trip_id))) ||
        (act.booking_id && declinedTripIdsRef.current.has(Number(act.booking_id)))
      )) {
        act = null
      }

      const serverCancelledTrip = (activeRes.status === 'fulfilled' && activeRes.value.data?.cancelled_trip)
        ? activeRes.value.data.cancelled_trip
        : (dashRes.status === 'fulfilled' && dashRes.value.data?.cancelled_trip ? dashRes.value.data.cancelled_trip : null)

      // Helper: check if a trip status represents a genuinely accepted trip by this driver
      const isAcceptedTripStatus = (status) => [
        'driver_accepted', 'accepted', 'waiting_pickup', 'on_the_way', 
        'driver_arrived', 'in_progress', 'trip_started', 'return_pickup', 
        'return_started', 'return_in_progress'
      ].includes(status)

      // Automatic Trip Cancellation Detection for Driver (Strictly ONCE per genuinely cancelled trip from server)
      const serverCancId = serverCancelledTrip?.id ? Number(serverCancelledTrip.id) : null
      const previousActiveTrip = prevActiveRideRef.current
      const prevWasAccepted = Boolean(
        previousActiveTrip && (
          isAcceptedTripStatus(previousActiveTrip.status) || 
          Boolean(previousActiveTrip.accepted_at) ||
          locallyAcceptedTripIdsRef.current.has(previousActiveTrip.id)
        )
      )

      // If this trip was declined by this driver, or was never accepted, ensure it is silenced and acknowledged
      if (serverCancId && (declinedTripIdsRef.current.has(serverCancId) || (!serverCancelledTrip?.accepted_at && !prevWasAccepted))) {
        acknowledgedCancelledTripIds.add(serverCancId)
      }

      // ONLY show cancellation notice if the trip was genuinely accepted by this driver AND not declined
      if (
        serverCancId && 
        !acknowledgedCancelledTripIds.has(serverCancId) && 
        !completedTripIdsRef.current.has(serverCancId) &&
        !declinedTripIdsRef.current.has(serverCancId) &&
        (Boolean(serverCancelledTrip.accepted_at) || prevWasAccepted)
      ) {
        acknowledgedCancelledTripIds.add(serverCancId)
        try {
          SecureStore.setItemAsync('@ack_cancelled_trip_ids', JSON.stringify(Array.from(acknowledgedCancelledTripIds))).catch(() => {})
        } catch {}
        prevActiveRideRef.current = null
        setActiveRide(null)
        setOtpModalVisible(false)
        setPassOtpModal(null)
        setDetailModalTrip(null)
        try {
          Vibration.vibrate([0, 400, 200, 400])
        } catch {}
        setCancelledNotice({
          id: serverCancId,
          customerName: serverCancelledTrip.customer_name || previousActiveTrip?.customer_name || 'Passenger',
          bookingRef: serverCancelledTrip.booking_ref || `CTB#${serverCancId}`,
          pickup: serverCancelledTrip.pickup_address,
          dest: serverCancelledTrip.dest_address,
          reason: serverCancelledTrip.cancellation_reason || 'Customer cancelled this booking.',
        })
      } else if (
        !act?.id && 
        serverCancelledTrip?.id &&
        previousActiveTrip?.id && 
        prevWasAccepted &&
        !declinedTripIdsRef.current.has(Number(previousActiveTrip.id)) &&
        !completedTripIdsRef.current.has(Number(previousActiveTrip.id)) && 
        !acknowledgedCancelledTripIds.has(Number(previousActiveTrip.id))
      ) {
        // Confirmed server cancellation: Genuinely accepted active ride was cancelled by customer on server
        const prevId = Number(previousActiveTrip.id)
        acknowledgedCancelledTripIds.add(prevId)
        try {
          SecureStore.setItemAsync('@ack_cancelled_trip_ids', JSON.stringify(Array.from(acknowledgedCancelledTripIds))).catch(() => {})
        } catch {}
        prevActiveRideRef.current = null
        setActiveRide(null)
        setOtpModalVisible(false)
        setPassOtpModal(null)
        setDetailModalTrip(null)
        try {
          Vibration.vibrate([0, 400, 200, 400])
        } catch {}
        setCancelledNotice({
          id: prevId,
          customerName: serverCancelledTrip.customer_name || previousActiveTrip.customer_name || 'Passenger',
          bookingRef: serverCancelledTrip.booking_ref || previousActiveTrip.booking_ref || `CTB#${prevId}`,
          pickup: serverCancelledTrip.pickup_address || previousActiveTrip.pickup_address,
          dest: serverCancelledTrip.dest_address || previousActiveTrip.dest_address,
          reason: serverCancelledTrip.cancellation_reason || 'Customer cancelled this booking.',
        })
      }

      if (act?.id) {
        if (locallyAcceptedTripIdsRef.current.has(act.id) && act.status === 'driver_assigned') {
          act.status = 'driver_accepted'
        }
        prevActiveRideRef.current = act
      } else {
        prevActiveRideRef.current = null
      }

      setActiveRide(act)
      if (act?.id) {
        setPendingRides([])

        // Immediate Audio/Haptic Alert and Popup Modal when driver is assigned to a ride!
        if (act.status === 'driver_assigned') {
          if (alertedAssignedTripIdRef.current !== act.id) {
            alertedAssignedTripIdRef.current = act.id
            playDriverBookingReceived(act.booking_ref).catch(() => {})
          }
          if (!assignedAlertTrip || assignedAlertTrip.id !== act.id) {
            setAssignedAlertTrip(act)
          }
        } else if (act.status !== 'driver_assigned') {
          setAssignedAlertTrip(null)
          alertedAssignedTripIdRef.current = null
        }

        if (act.trip_type === 'shared' || act.is_shared == 1 || act.is_shared === '1') {
          longTripAPI.getManifest(act.id).then(mRes => {
            setManifest(mRes.data?.passengers || mRes.data?.manifest || [])
          }).catch(() => setManifest([]))
        } else {
          setManifest([])
        }
      } else {
        setPendingRides(incomingRides)
        setManifest([])

        if (incomingRides.length > 0) {
          const firstIncoming = incomingRides[0]
          const inId = firstIncoming.id
          if (inId && alertedPendingTripIdRef.current !== inId) {
            alertedPendingTripIdRef.current = inId
            playDriverBookingReceived(firstIncoming.booking_ref).catch(() => {})
          }
        }
      }

      // 5. Promotional Banners
      if (adRes.status === 'fulfilled' && adRes.value.data?.status === 'success') {
        setDriverAds(adRes.value.data.ads || [])
      }

      // 6. Unread Notifications (Filtered strictly to Bookings, Completions, and Reviews)
      if (notifRes.status === 'fulfilled') {
        const allNotifs = notifRes.value.data?.notifications || []
        const relevantUnread = allNotifs.filter(n => {
          if (Number(n.is_read) === 1) return false
          const t = `${n.title || ''} ${n.body || ''} ${n.type || ''}`.toLowerCase()
          return t.includes('booking') || t.includes('assign') || t.includes('ride') || t.includes('complete') || t.includes('review') || t.includes('rated')
        }).length
        if (prevUnreadNotifCountRef.current !== null && relevantUnread > prevUnreadNotifCountRef.current) {
          playDriverAlertSound().catch(() => {})
        }
        prevUnreadNotifCountRef.current = relevantUnread
        setUnreadNotifCount(relevantUnread)
      }

      // 7. Recent Rides for Dashboard Compact Cards
      if (tripsRes.status === 'fulfilled') {
        const tList = tripsRes.value.data?.bookings || tripsRes.value.data?.trips || []
        setRecentTrips(Array.isArray(tList) ? tList.slice(0, 10) : [])
      }

      // 8. Customer Reviews for Driver Dashboard
      if (revRes && revRes.status === 'fulfilled') {
        const revs = revRes.value.data?.reviews || []
        setDriverReviews(Array.isArray(revs) ? revs : [])
      }

      // 8. Weekly Earnings for Performance Chart
      if (earnRes.status === 'fulfilled' && earnRes.value.data?.status === 'success') {
        const earnData = earnRes.value.data
        setWeeklyEarnings({
          total: Number(earnData.total_earnings || 0),
          trips_detail: Array.isArray(earnData.trips_detail) ? earnData.trips_detail : [],
        })
        if (earnData.daily_target && !adminTarget) {
          setStats(prev => prev ? ({ ...prev, daily_target: prev.daily_target || Number(earnData.daily_target) }) : null)
        }
      }
    } catch (err) {
      console.warn('Dashboard sync error:', err)
    } finally {
      if (isPull) setRefreshing(false)
    }
  }, [])

  // Restore acknowledged cancelled trip IDs on mount
  useEffect(() => {
    SecureStore.getItemAsync('@ack_cancelled_trip_ids').then(saved => {
      if (saved) {
        try {
          const arr = JSON.parse(saved)
          if (Array.isArray(arr)) {
            arr.forEach(id => acknowledgedCancelledTripIds.add(Number(id)))
          }
        } catch {}
      }
    }).catch(() => {})
  }, [])

  // High Frequency Polling for Real-Time Dispatch & Location updates
  useEffect(() => {
    loadDashboardData()
    // Fetch initial GPS position immediately
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(async loc => {
        setDriverLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          heading: loc.coords.heading || 0,
        })
        trackTripGpsStep(loc.coords.latitude, loc.coords.longitude)
        const geo = await resolveAreaFromCoords(loc.coords.latitude, loc.coords.longitude)
        driverAPI.updateLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          heading: loc.coords.heading || 0,
          speed: loc.coords.speed || 0,
          area: geo.area || undefined,
          address: geo.address || undefined,
        }).catch(() => {})
      })
      .catch(() => {})

    const intervalMs = isOnline ? 3500 : 15000
    pollRef.current = setInterval(() => {
      loadDashboardData()
      if (isOnline) {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then(async loc => {
            setDriverLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              heading: loc.coords.heading || 0,
            })
            trackTripGpsStep(loc.coords.latitude, loc.coords.longitude)
            const geo = await resolveAreaFromCoords(loc.coords.latitude, loc.coords.longitude)
            driverAPI.updateLocation({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              heading: loc.coords.heading || 0,
              speed: loc.coords.speed || 0,
              area: geo.area || undefined,
              address: geo.address || undefined,
            }).catch(() => {})
          })
          .catch(() => {})
      }
    }, intervalMs)
    return () => clearInterval(pollRef.current)
  }, [loadDashboardData, isOnline, resolveAreaFromCoords, trackTripGpsStep])

  useFocusEffect(
    useCallback(() => {
      loadDashboardData()
    }, [loadDashboardData])
  )

  // Countdown timer for incoming instant request (Strict 30s Countdown)
  useEffect(() => {
    const currentIncoming = pendingRides[0] || null
    const currentId = currentIncoming?.id || null

    if (currentId) {
      if (incomingIdRef.current !== currentId) {
        incomingIdRef.current = currentId
        try {
          Vibration.vibrate([0, 500, 200, 500])
        } catch {}
        playDriverAlertSound().catch(() => {})
        setCountdown(30)
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timerRef.current)
              handleDeclineInstantRide(currentId, 'Timeout')
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }
    } else {
      incomingIdRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {}
  }, [pendingRides])

  // Toggle Online with Mandatory Live Selfie Verification
  const handleToggleOnline = async (val) => {
    const targetOnline = typeof val === 'boolean' ? val : !isOnline

    if (targetOnline) {
      const isAccountApproved = (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'approved' ||
                                (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'verified' ||
                                (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved' ||
                                (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'verified'
      const verifStatus = (driver?.verification_status || user?.verification_status || 'unsubmitted').toLowerCase()
      const isKycApproved = isAccountApproved || verifStatus === 'approved' || verifStatus === 'verified'

      if (!isKycApproved) {
        setIsOnline(false)

        if (!isAccountApproved) {
          Alert.alert(
            'Account Approval Pending ⏳',
            'Your driver account registration is awaiting Admin acceptance. Please wait for Admin approval before going online.',
            [{ text: 'OK', style: 'cancel' }]
          )
        } else if (verifStatus === 'pending') {
          Alert.alert(
            'KYC Verify Aagala ⏳',
            'Unga KYC documents submit panniyaachu. Admin verification innum complete aagala. Admin verify panni approve panna mattum dhaan online vara mudiyum!',
            [
              { text: 'OK', style: 'cancel' },
              {
                text: 'View Documents',
                onPress: () => navigation.navigate('DriverDocuments')
              }
            ]
          )
        } else if (verifStatus === 'rejected') {
          Alert.alert(
            'KYC Documents Rejected ❌',
            `Admin unga documents-ah reject pannirukaanga.\n\nKaaranam: ${driver?.rejection_reason || 'Incomplete / Invalid documents'}.\n\nThirumba correct-aana documents upload pannunga.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Re-upload KYC',
                onPress: () => navigation.navigate('DriverDocuments')
              }
            ]
          )
        } else {
          Alert.alert(
            'KYC Documents Upload Pannanum ⚠️',
            'Neenga Online vara unga KYC documents (Driving License, Aadhaar, RC Book, Insurance & Selfie) upload panni, Admin verify complete panna mattum dhaan mudiyum.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Upload KYC Now',
                onPress: () => navigation.navigate('DriverDocuments')
              }
            ]
          )
        }
        return
      }
    }

    if (!targetOnline) {
      // Switching Offline
      setToggling(true)
      try {
        let locData = { lat: 12.9716, lng: 77.5946 }
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          if (loc?.coords) {
            locData = { lat: loc.coords.latitude, lng: loc.coords.longitude }
          }
        } catch {}

        const res = await driverAPI.toggleOnline({ is_online: 0, status: 'offline', ...locData })
        if (res.data?.status === 'success') {
          setIsOnline(false)
          Alert.alert('You are Offline 🔴', 'You will not receive new dispatch requests.')
          loadDashboardData(true)
        } else {
          Alert.alert('Status Error', res.data?.message || 'Could not update status.')
        }
      } catch (err) {
        Alert.alert('Error', err.response?.data?.message || err.message || 'Unable to toggle offline status.')
      } finally {
        setToggling(false)
      }
      return
    }

    // Switching Online: MANDATORY SELFIE REQUIRED EVERY TIME
    try {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync()
      if (!camPerm.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required to take a live selfie before going Online for safety and identity verification.'
        )
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true
      })

      if (result.canceled || !result.assets || !result.assets[0]) {
        Alert.alert('Selfie Required', 'You must take a live selfie photo to go Online. Status remains Offline.')
        return
      }

      setToggling(true)
      const selfieAsset = result.assets[0]
      let selfieData = ''

      // 1. Attempt direct multipart upload to backend /uploads/kyc/
      const localUri = selfieAsset.uri
      if (localUri) {
        try {
          const formData = createUploadFormData(localUri, {
            prefix: 'online_selfie',
            type: 'kyc',
            asset: selfieAsset,
          })

          const uploadRes = await uploadAPI.upload(formData, 'kyc')
          const uData = uploadRes.data || {}
          if (uData.status === 'success' || uData.url || uData.path) {
            selfieData = uData.path || uData.filename || uData.file_name || uData.relative_path || uData.url
          }
        } catch (upErr) {
          console.log('Selfie multipart upload error, falling back to base64:', upErr)
        }
      }

      // 2. Base64 fallback if multipart didn't complete
      if (!selfieData && selfieAsset.base64) {
        selfieData = `data:image/jpeg;base64,${selfieAsset.base64}`
      } else if (!selfieData && localUri) {
        selfieData = localUri
      }

      let locData = { lat: 12.9716, lng: 77.5946, area: '', address: '' }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          locData.lat = loc.coords.latitude
          locData.lng = loc.coords.longitude
          const geo = await resolveAreaFromCoords(loc.coords.latitude, loc.coords.longitude)
          if (geo.area) locData.area = geo.area
          if (geo.address) locData.address = geo.address
        }
      } catch {}

      const res = await driverAPI.toggleOnline({
        is_online: 1,
        selfie_image: selfieData,
        city_id: user?.city_id || undefined,
        ...locData
      })

      if (res.data?.status === 'success') {
        setIsOnline(true)
        loadDashboardData()
        Alert.alert(
          'You are Online 🟢',
          'Selfie verified successfully! Broadcasting live GPS coordinates. Ready to accept ride requests.'
        )
      } else {
        setIsOnline(false)
        Alert.alert('Verification Required', res.data?.message || 'Could not update online status.')
      }
    } catch {
      setIsOnline(false)
      Alert.alert('Error', 'Unable to capture selfie and toggle online status.')
    } finally {
      setToggling(false)
    }
  }

  // Accept Admin Assigned Scheduled Trip
  const handleAcceptAdminAssignedTrip = async (trip) => {
    const longTripId = trip.long_trip_id || trip.id
    setAcceptingTripId(longTripId)
    try {
      const res = await longTripAPI.respondScheduledTrip(longTripId, 'accept')
      if (res.data?.status === 'success') {
        Alert.alert('Trip Accepted! 🎉', `Scheduled Trip #${trip.booking_ref} is now confirmed. Moved to Upcoming Trips.`)
        setAdminAssignedTrips(prev => prev.filter(t => (t.long_trip_id || t.id) !== longTripId))
        loadDashboardData()
      } else {
        Alert.alert('Accept Failed', res.data?.message || 'Could not accept trip assignment.')
      }
    } catch {
      Alert.alert('Error', 'Failed to accept assigned trip.')
    } finally {
      setAcceptingTripId(null)
    }
  }

  // Reject Admin Assigned Trip
  const handleRejectAdminAssignedTrip = async (trip, reason) => {
    const longTripId = trip.long_trip_id || trip.id
    const bookingId = trip.booking_id || trip.id
    try {
      if (trip.id) {
        declinedTripIdsRef.current.add(Number(trip.id))
        acknowledgedCancelledTripIds.add(Number(trip.id))
      }
      if (trip.long_trip_id) {
        declinedTripIdsRef.current.add(Number(trip.long_trip_id))
        acknowledgedCancelledTripIds.add(Number(trip.long_trip_id))
      }
      if (trip.booking_id) {
        declinedTripIdsRef.current.add(Number(trip.booking_id))
        acknowledgedCancelledTripIds.add(Number(trip.booking_id))
      }
      if (bookingId) {
        declinedTripIdsRef.current.add(Number(bookingId))
        acknowledgedCancelledTripIds.add(Number(bookingId))
      }
      if (longTripId) {
        declinedTripIdsRef.current.add(Number(longTripId))
        acknowledgedCancelledTripIds.add(Number(longTripId))
      }

      setAssignedAlertTrip(null)
      setRejectModalTrip(null)
      setAdminAssignedTrips(prev => prev.filter(t => 
        (t.long_trip_id || t.id) !== longTripId && t.booking_id !== bookingId && t.id !== trip.id
      ))
      if (activeRide && (activeRide.id === trip.id || activeRide.id === bookingId)) {
        setActiveRide(null)
        prevActiveRideRef.current = null
      }

      // Call primary endpoint first, then fallback to prevent conflicting database race condition
      let responded = false
      if (trip.long_trip_id || trip.is_long_trip) {
        try {
          const res = await longTripAPI.respondScheduledTrip(longTripId, 'reject', reason)
          if (res.data?.status === 'success') responded = true
        } catch {}
      }
      if (!responded) {
        await driverAPI.respondBooking(bookingId, { action: 'reject', reason: reason || selectedReason }).catch(() => {})
      }

      Alert.alert('Assignment Declined', `Trip #${trip.booking_ref || trip.id} rejected. It has been routed to the next nearby driver.`)
      loadDashboardData()
    } catch {
      Alert.alert('Error', 'Failed to decline trip assignment.')
      loadDashboardData()
    }
  }

  // Accept Instant Local Ride
  const handleAcceptInstantRide = async (rideId) => {
    setRespondingPendingId(rideId)
    const targetRide = pendingRides.find(r => r.id === rideId)
    setPendingRides(prev => prev.filter(r => r.id !== rideId))
    if (targetRide) {
      setActiveRide({
        ...targetRide,
        status: 'driver_assigned',
      })
    }
    try {
      const res = await driverAPI.respondBooking(rideId, { action: 'accept' })
      if (res.data?.status === 'success') {
        if (res.data?.booking) {
          setActiveRide(res.data.booking)
        }
        Alert.alert('Trip Accepted! 🚀', 'Please follow GPS navigation to customer pickup.')
        loadDashboardData()
      } else {
        Alert.alert('Accept Failed', res.data?.message || 'Ride was assigned to another driver.')
        loadDashboardData()
      }
    } catch {
      Alert.alert('Error', 'Failed to accept ride request.')
      loadDashboardData()
    } finally {
      setRespondingPendingId(null)
    }
  }

  // Decline Instant Local Ride
  const handleDeclineInstantRide = async (rideId, reason = '') => {
    try {
      if (rideId) {
        declinedTripIdsRef.current.add(Number(rideId))
        acknowledgedCancelledTripIds.add(Number(rideId))
      }
      setAssignedAlertTrip(null)
      setPendingRides(prev => prev.filter(r => r.id !== rideId))
      setAdminAssignedTrips(prev => prev.filter(t => t.id !== rideId && t.booking_id !== rideId && t.long_trip_id !== rideId))
      setRejectModalTrip(null)
      if (activeRide && activeRide.id === rideId) {
        if (activeRide.long_trip_id) declinedTripIdsRef.current.add(Number(activeRide.long_trip_id))
        setActiveRide(null)
        prevActiveRideRef.current = null
        locallyAcceptedTripIdsRef.current.delete(rideId)
        setStartedHeadingRides(prev => {
          const next = new Set(prev)
          next.delete(rideId)
          return next
        })
        SecureStore.deleteItemAsync(`heading_started_${rideId}`).catch(() => {})
      }

      // Call primary endpoint first, then fallback to prevent conflicting database race condition
      let responded = false
      try {
        const res = await driverAPI.respondBooking(rideId, { action: 'reject', reason: reason || selectedReason })
        if (res.data?.status === 'success') responded = true
      } catch {}
      if (!responded) {
        await longTripAPI.respondScheduledTrip(rideId, 'reject', reason || selectedReason).catch(() => {})
      }

      Alert.alert('Assignment Declined', 'Ride assignment rejected. It has been routed to the next nearby driver.')
      loadDashboardData()
    } catch (err) {
      console.warn('Decline error:', err)
      setActiveRide(null)
      prevActiveRideRef.current = null
      loadDashboardData()
    }
  }

  // Start Heading to Customer Pickup (Reveals Customer Details and Direct Call)
  const handleStartHeading = async () => {
    if (!activeRide) return
    setIsUpdatingStatus(true)
    try {
      const rideId = activeRide.id
      setStartedHeadingRides(prev => new Set(prev).add(rideId))
      SecureStore.setItemAsync(`heading_started_${rideId}`, '1').catch(() => {})
      await handleUpdateRideStatus('on_the_way', { heading_started: true })
      Alert.alert('Heading to Pickup 🚀', 'Heading started! Passenger contact is now available. Follow GPS to pickup location.')
    } catch {
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Open Complete Trip Modal (Automated GPS Odometer Distance & Invoice Preview)
  const handleOpenCompleteTripModal = () => {
    if (!activeRide) return
    const origKm = Number(activeRide.original_distance_km || activeRide.distance_km || 0)
    const trackedKm = Number(tripGpsAccumulatedKmRef.current > 0 ? tripGpsAccumulatedKmRef.current.toFixed(2) : tripGpsTrackedDistanceKm || 0)
    // If driver took a detour or drove extra distance, GPS distance is auto-applied; otherwise normal booked distance applies.
    const autoKm = Math.max(origKm, trackedKm)
    setEnteredActualDistance(String(autoKm > 0 ? autoKm : origKm))
    setEnteredTollCharge(String(Number(activeRide?.toll_amount || activeRide?.toll_charge || 0) || ''))
    setCompleteTripModalVisible(true)
  }

  // Update Ride Status (Normal Trip)
  const handleUpdateRideStatus = async (newStatus, extraParams = {}) => {
    if (!activeRide) return false
    setIsUpdatingStatus(true)
    try {
      let isSuccess = false
      let successMsg = `Ride status: ${newStatus.replace(/_/g, ' ')}`

      if (newStatus === 'driver_accepted') {
        // 1. Try updateStatus with driver_accepted
        try {
          const res = await driverAPI.updateStatus(activeRide.id, { status: 'driver_accepted', ...extraParams })
          if (res?.data?.status === 'success') {
            isSuccess = true
          }
        } catch {}

        // 2. Fallback to respondBooking with accept
        if (!isSuccess) {
          try {
            const resp = await driverAPI.respondBooking(activeRide.id, { action: 'accept' })
            if (resp?.data?.status === 'success') {
              isSuccess = true
            }
          } catch {}
        }

        // Always unlock locally for the driver so customer details & navigation reveal immediately
        locallyAcceptedTripIdsRef.current.add(activeRide.id)
        setActiveRide(prev => prev ? ({ ...prev, status: 'driver_accepted' }) : null)
        isSuccess = true
        successMsg = 'Trip Accepted & Started! 🚀 Follow GPS to customer pickup.'
      } else {
        const res = await driverAPI.updateStatus(activeRide.id, { status: newStatus, ...extraParams })
        if (res?.data?.status === 'success') {
          isSuccess = true
          setActiveRide(prev => prev ? ({ ...prev, status: newStatus, ...extraParams }) : null)
          if (prevActiveRideRef.current) {
            prevActiveRideRef.current = { ...prevActiveRideRef.current, status: newStatus, ...extraParams }
          }
        } else {
          Alert.alert('Error', res?.data?.message || 'Failed to update status.')
          return false
        }
      }

      if (isSuccess) {
        if (newStatus === 'completed') {
          const completedId = Number(activeRide.id)
          if (completedId) {
            acknowledgedCancelledTripIds.add(completedId)
            completedTripIdsRef.current.add(completedId)
          }
          prevActiveRideRef.current = null
          setCancelledNotice(null)
          navigation.navigate('DriverPayment', { bookingId: activeRide.id })
        } else {
          Alert.alert('Status Updated', successMsg)
        }
        loadDashboardData()
        return true
      }
      return false
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to update ride status.'
      Alert.alert('Error', errMsg)
      return false
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Confirm Complete Trip & Submit Distance (100% Automated GPS)
  const handleConfirmCompleteTrip = async () => {
    if (!activeRide) return
    setIsSubmittingComplete(true)
    const origKm = Number(activeRide.original_distance_km || activeRide.distance_km || 0)
    const trackedKm = Number(tripGpsAccumulatedKmRef.current > 0 ? tripGpsAccumulatedKmRef.current.toFixed(2) : tripGpsTrackedDistanceKm || 0)
    const autoKm = Math.max(origKm, trackedKm)
    const distNum = parseFloat(enteredActualDistance) || (autoKm > 0 ? autoKm : origKm)
    const tollNum = parseFloat(enteredTollCharge) || 0
    try {
      const ok = await handleUpdateRideStatus('completed', { actual_distance_km: distNum, toll_amount: tollNum })
      if (ok) {
        setCompleteTripModalVisible(false)
        try {
          await SecureStore.deleteItemAsync(`gps_odometer_${activeRide.id}`)
        } catch {}
        tripGpsAccumulatedKmRef.current = 0
        lastTripGpsCoordRef.current = null
        setTripGpsTrackedDistanceKm(0)
      }
    } finally {
      setIsSubmittingComplete(false)
    }
  }

  // Verify Start OTP (Normal Trip)
  const handleVerifyStartOtp = async () => {
    if (!enteredOtp.trim() || enteredOtp.trim().length < 4) {
      Alert.alert('Invalid OTP', 'Please enter the 4 to 6-digit ride start OTP provided by the customer.')
      return
    }
    setVerifyingOtp(true)
    try {
      const res = await driverAPI.verifyOTP(activeRide.id, enteredOtp.trim())
      if (res.data?.status === 'success') {
        Alert.alert('OTP Verified ✅', 'Passenger Boarded! Follow GPS navigation to destination.')
        setOtpModalVisible(false)
        setEnteredOtp('')
        loadDashboardData()
      } else {
        Alert.alert('Invalid OTP', res.data?.message || 'Incorrect OTP. Please ask customer to check their app.')
      }
    } catch {
      Alert.alert('Error', 'OTP verification failed.')
    } finally {
      setVerifyingOtp(false)
    }
  }

  // Verify Passenger OTP (Shared Trip Multi-Passenger)
  const handleVerifyPassengerOtp = async () => {
    if (!passEnteredOtp.trim() || passEnteredOtp.trim().length < 4) {
      Alert.alert('Invalid OTP', 'Please enter the 4 to 6-digit boarding OTP provided by the passenger.')
      return
    }
    setVerifyingPassOtp(true)
    try {
      const passengerId = passOtpModal?.passenger_id || passOtpModal?.id || 0
      const res = await longTripAPI.verifyPassengerOTP({
        booking_id: activeRide.id,
        passenger_id: passengerId,
        otp: passEnteredOtp.trim(),
      })
      if (res.data?.status === 'success') {
        Alert.alert('Boarding Verified ✅', `Passenger ${passOtpModal?.customer_name || 'Passenger'} has successfully boarded!`)
        setPassOtpModal(null)
        setPassEnteredOtp('')
        loadDashboardData()
      } else {
        Alert.alert('Invalid OTP', res.data?.message || 'Incorrect boarding OTP for this passenger.')
      }
    } catch {
      Alert.alert('Error', 'Passenger OTP verification failed.')
    } finally {
      setVerifyingPassOtp(false)
    }
  }

  // Start Shared Highway Journey
  const handleStartSharedJourney = async () => {
    if (!activeRide) return
    try {
      const res = await driverAPI.updateStatus(activeRide.id, { status: 'in_progress' })
      if (res.data?.status === 'success') {
        Alert.alert('Journey Started! 🚀', 'All passengers boarded. Follow highway navigation to drop points.')
        loadDashboardData()
      } else {
        Alert.alert('Error', res.data?.message || 'Could not start journey.')
      }
    } catch {
      Alert.alert('Error', 'Failed to start shared journey.')
    }
  }

  // Confirm Passenger Drop (Shared Trip Drop Phase)
  const handleConfirmPassengerDrop = async (passenger) => {
    if (!activeRide || !passenger) return
    Alert.alert(
      'Confirm Passenger Drop',
      `Has passenger ${passenger.customer_name || 'Passenger'} arrived at their destination?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Drop ✓',
          onPress: async () => {
            try {
              const pId = passenger.passenger_id || passenger.id || 0
              const mId = passenger.id || 0
              const res = await longTripAPI.completeDrop({
                booking_id: activeRide.id,
                passenger_id: pId,
                manifest_id: mId,
                id: mId,
                payment_method: 'cash',
              })
              if (res.data?.status === 'success') {
                // Optimistically mark passenger dropped locally so UI updates instantly
                setManifest(prev =>
                  prev.map(p => {
                    const match = (mId && p.id === mId) || (pId && (p.passenger_id === pId || p.id === pId))
                    return match ? { ...p, is_dropped: true } : p
                  })
                )

                // Sync fresh dashboard data from server
                loadDashboardData()

                // Check if this was the last passenger or all passengers are dropped
                const remaining = manifest.filter(p => {
                  const isCurrent = (mId && p.id === mId) || (pId && (p.passenger_id === pId || p.id === pId))
                  return !isCurrent && !p.is_dropped
                })

                if (res.data?.all_dropped || remaining.length === 0) {
                  Alert.alert(
                    'All Drops Completed! 🎉',
                    `Passenger ${passenger.customer_name || 'Passenger'} has arrived! All passenger drops are now complete. Do you want to complete the shared journey and settle payments?`,
                    [
                      { text: 'Later', style: 'cancel' },
                      {
                        text: 'Complete Journey & Settle ✅',
                        onPress: handleOpenCompleteTripModal
                      }
                    ]
                  )
                } else {
                  Alert.alert('Drop Completed 🎉', `Passenger ${passenger.customer_name || 'Passenger'} has arrived and is marked as dropped!`)
                }
              } else {
                Alert.alert('Error', res.data?.message || 'Could not complete passenger drop.')
              }
            } catch {
              Alert.alert('Error', 'Failed to complete passenger drop.')
            }
          }
        }
      ]
    )
  }

  // Emergency SOS
  const handleSOS = () => {
    Alert.alert(
      'Emergency SOS Dispatched 🆘',
      'Alerting Security Command Center and local emergency services with your live GPS location.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call Helpline 112', style: 'destructive', onPress: () => Linking.openURL('tel:112') }
      ]
    )
  }

  // Dismiss Cancelled Trip Notice strictly once & prepare for next incoming trips
  const handleDismissCancelledNotice = useCallback(() => {
    if (cancelledNotice?.id) {
      const id = Number(cancelledNotice.id)
      acknowledgedCancelledTripIds.add(id)
      try {
        SecureStore.setItemAsync('@ack_cancelled_trip_ids', JSON.stringify(Array.from(acknowledgedCancelledTripIds))).catch(() => {})
      } catch {}
      // Notify backend so it clears from active query and frees the driver for new trips
      driverAPI.dismissCancelledTrip?.(id)?.catch(() => {})
    }
    setCancelledNotice(null)
    setActiveRide(null)
    prevActiveRideRef.current = null
    setOtpModalVisible(false)
    setPassOtpModal(null)
    setDetailModalTrip(null)
    // Instantly refresh dashboard so driver is clean and ready for new rides!
    loadDashboardData()
  }, [cancelledNotice, loadDashboardData])

  // Performance & Telemetry Calculations
  const completedCount = stats?.trips ?? stats?.completed_today ?? 0
  const grossEarnings = Math.round(stats?.earnings ?? stats?.today_earnings ?? 0)
  const targetGoal = Number(stats?.daily_target || 2000)
  const progressPercent = Math.min(Math.round((grossEarnings / targetGoal) * 100), 100)
  const cancelledCount = stats?.cancelled_today ?? stats?.cancelled ?? recentTrips.filter(t => (t.status || '').toLowerCase().includes('cancel')).length
  const acceptanceRate = stats?.acceptance_rate ? `${stats.acceptance_rate}%` : '98%'
  const cancellationRate = stats?.cancellation_rate ? `${stats.cancellation_rate}%` : '2%'

  // 7-Day Weekly Earnings for Performance Chart
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekChartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dayStr = d.toISOString().split('T')[0]
    const dayLabel = dayNames[d.getDay()]
    const isToday = i === 6
    return { date: dayStr, label: dayLabel, isToday, amount: 0 }
  })

  if (Array.isArray(weeklyEarnings.trips_detail) && weeklyEarnings.trips_detail.length > 0) {
    weeklyEarnings.trips_detail.forEach(t => {
      const tDate = (t.created_at || '').split(' ')[0]
      const found = weekChartData.find(d => d.date === tDate)
      if (found) {
        found.amount += Number(t.amount || t.final_fare || 0)
      }
    })
  }
  if (weekChartData[6].amount === 0 && grossEarnings > 0) {
    weekChartData[6].amount = grossEarnings
  }
  const maxWeeklyAmount = Math.max(...weekChartData.map(d => d.amount), 500)
  const totalWeeklyCalculated = weekChartData.reduce((acc, d) => acc + d.amount, 0)
  const finalWeeklyEarnings = weeklyEarnings.total > 0 ? weeklyEarnings.total : totalWeeklyCalculated

  // City-filtered ads: show only banners uploaded for this city or all cities
  const cityFilteredAds = (driverAds || []).filter(ad => {
    if (!ad) return false
    const adCity = (ad.city || '').toLowerCase().trim()
    if (!adCity || adCity === 'all') return true
    if (!currentCity) return true
    return adCity === currentCity.toLowerCase().trim()
  })


  const activeIncoming = pendingRides[0] || null

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFC700" translucent={false} />
      {/* Top Notch Status Bar Area in Signature Customer Taxi Yellow (#FFC700) */}
      <View style={{ height: insets.top, backgroundColor: '#FFC700' }} />
      {/* ── 1. SIGNATURE CITYONETAXI YELLOW BRAND HERO HEADER ── */}
      <View style={styles.heroContainer}>
        {/* Subtle Map Grid Lines */}
        <View style={styles.headerMapLines} pointerEvents="none">
          <View style={styles.mapGridLine1} />
          <View style={styles.mapGridLine2} />
          <View style={styles.mapGridLine3} />
          <View style={styles.mapGridBox1} />
        </View>

        {/* Top Brand Bar */}
        <View style={styles.heroTopBar}>
          <View style={styles.heroBrandRow}>
            <View style={styles.taxiBadgePill}>
              <Ionicons name="car-sport" size={13} color="#FFC700" />
              <Text style={styles.taxiBadgeText}>CityOneTaxi</Text>
            </View>
            <TouchableOpacity
              style={styles.driverTagPill}
              onPress={() => handleToggleOnline(!isOnline)}
              activeOpacity={0.7}
            >
              <View style={[styles.liveDot, { backgroundColor: isOnline ? '#10B981' : '#94A3B8' }]} />
              <Text style={styles.driverTagText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroRightActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('DriverNotifications')}
              style={styles.heroActionBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={19} color="#0F172A" />
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadgeDot}>
                  <Text style={styles.notifBadgeDotText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => loadDashboardData(true)}
              style={styles.heroActionBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={18} color="#0F172A" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              style={styles.heroAvatarBtn}
              activeOpacity={0.8}
            >
              {resolveAssetUrl(driver?.avatar_url || driver?.avatar) ? (
                <Image
                  source={{ uri: resolveAssetUrl(driver?.avatar_url || driver?.avatar) }}
                  style={styles.heroAvatarImg}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.heroAvatarInitial}>
                  {(driver?.name?.[0] || user?.name?.[0] || 'D').toUpperCase()}
                </Text>
              )}
              <View style={[styles.heroOnlineDot, { backgroundColor: isOnline ? '#10B981' : '#94A3B8' }]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Driver Greeting & Vehicle Row */}
        <View style={styles.heroTextRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroGreeting}>Hi, {driver?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Partner'}</Text>
            <Text style={styles.heroHeadline}>Professional Taxi Platform</Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroRatingPill}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={styles.heroRatingText}>{driver?.rating || '5.0'}</Text>
              </View>
              <Text style={styles.heroVehicleText} numberOfLines={1}>
                {driver?.vehicle_type || 'Commercial Cab'} · {driver?.plate_no || 'Verified Partner'}
              </Text>
            </View>
          </View>

          {/* Stylized Taxi Watermark Badge */}
          <View style={styles.heroCarGraphicWrap} pointerEvents="none">
            <View style={styles.miniCarBadge}>
              <Ionicons name="speedometer" size={26} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDashboardData(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* 1.5 Driver KYC Verification Alert Banner */}
        {(() => {
          const isApproved =
            (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'approved' ||
            (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'verified' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'approved' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'verified' ||
            (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved' ||
            (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'verified'

          if (isApproved) return null

          const isRej = (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'rejected' ||
                        (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'rejected'
          const hasSubmitted = Boolean(driver?.has_kyc_submitted || driver?.license_front_image || driver?.profile_selfie)
          
          const bannerBg = isRej ? '#FEF2F2' : hasSubmitted ? '#FFFBEB' : '#FFF8E7'
          const borderColor = isRej ? '#FECACA' : hasSubmitted ? '#FDE68A' : '#FDE68A'
          const iconName = isRej ? 'alert-circle' : hasSubmitted ? 'time' : 'shield-half'
          const iconColor = isRej ? '#DC2626' : hasSubmitted ? '#D97706' : '#D97706'
          const titleColor = isRej ? '#991B1B' : hasSubmitted ? '#92400E' : '#0F172A'
          const subColor = isRej ? '#B91C1C' : hasSubmitted ? '#B45309' : '#B45309'
          
          const title = isRej
            ? 'KYC Verification Rejected'
            : hasSubmitted
            ? 'KYC Under Admin Review'
            : 'KYC Pending — Submission Required'
            
          const subtitle = isRej
            ? (driver?.rejection_reason || 'Tap to review reason and re-submit clear documents')
            : hasSubmitted
            ? 'Your KYC documents & selfie are under review by Admin CRM. Taxi rides will unlock once approved.'
            : 'Upload your License, Aadhaar, RC Book, Insurance & Selfie to get approved for taxi rides.'

          const actionLabel = isRej ? 'Re-upload' : hasSubmitted ? 'View Status' : 'Upload Now'

          return (
            <TouchableOpacity
              style={{
                backgroundColor: bannerBg,
                borderColor: borderColor,
                borderWidth: 1.5,
                borderRadius: 14,
                padding: 13,
                marginHorizontal: 16,
                marginTop: 12,
                marginBottom: 6,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                ...SHADOW.xs,
              }}
              onPress={() => navigation.navigate('DriverDocuments')}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Ionicons name={iconName} size={24} color={iconColor} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: titleColor }}>
                    {title}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: subColor, marginTop: 2, lineHeight: 15 }}>
                    {subtitle}
                  </Text>
                </View>
              </View>
              <View style={{
                backgroundColor: isRej ? '#FEE2E2' : hasSubmitted ? '#FEF3C7' : '#FEF3C7',
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                marginLeft: 8,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: titleColor }}>{actionLabel}</Text>
                <Ionicons name="chevron-forward" size={12} color={titleColor} />
              </View>
            </TouchableOpacity>
          )
        })()}

        {/* 2. STANDALONE BIG PROFESSIONAL DUTY TOGGLE BUTTON */}
        {(() => {
          const isKycApproved =
            (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'approved' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'approved' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'verified' ||
            (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved'

          return (
            <TouchableOpacity
              style={[
                isOnline ? {
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  borderWidth: 2,
                  borderColor: '#10B981',
                  paddingVertical: 18,
                  paddingHorizontal: 20,
                  marginHorizontal: 16,
                  marginTop: 12,
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  elevation: 5,
                  shadowColor: '#10B981',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                } : {
                  backgroundColor: '#16A34A',
                  borderRadius: 20,
                  paddingVertical: 18,
                  paddingHorizontal: 20,
                  marginHorizontal: 16,
                  marginTop: 12,
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  elevation: 6,
                  shadowColor: '#16A34A',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                },
                (!isKycApproved || toggling) && { opacity: 0.7 }
              ]}
              onPress={() => handleToggleOnline(!isOnline)}
              disabled={!isKycApproved || toggling}
              activeOpacity={0.85}
            >
              {toggling ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flex: 1, paddingVertical: 4 }}>
                  <ActivityIndicator color={isOnline ? '#10B981' : '#FFFFFF'} size="small" />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: isOnline ? '#0F172A' : '#FFFFFF' }}>
                    Updating Duty Status...
                  </Text>
                </View>
              ) : isOnline ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: '#DCFCE7',
                      borderWidth: 2,
                      borderColor: '#86EFAC',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name="radio" size={22} color="#16A34A" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', letterSpacing: 0.4 }}>
                        YOU ARE ONLINE
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A', marginTop: 2 }}>
                        ● Ready for incoming bookings
                      </Text>
                    </View>
                  </View>
                  <View style={{
                    backgroundColor: '#FEE2E2',
                    borderWidth: 1.5,
                    borderColor: '#FCA5A5',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 14,
                  }}>
                    <Ionicons name="power" size={15} color="#DC2626" />
                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#DC2626' }}>Go Offline</Text>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: 'rgba(255, 255, 255, 0.22)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name="power" size={24} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.6 }}>
                        {isKycApproved ? 'GO ONLINE' : 'KYC REQUIRED'}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#D1FAE5', marginTop: 2 }}>
                        {isKycApproved ? 'Tap to start duty & receive bookings' : 'Account awaiting verification'}
                      </Text>
                    </View>
                  </View>
                  {isKycApproved ? (
                    <View style={{
                      backgroundColor: '#FFFFFF',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 14,
                      elevation: 2,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#15803D', letterSpacing: 0.3 }}>START</Text>
                      <Ionicons name="chevron-forward" size={15} color="#15803D" />
                    </View>
                  ) : (
                    <Ionicons name="lock-closed" size={20} color="#FFFFFF" />
                  )}
                </View>
              )}
            </TouchableOpacity>
          )
        })()}

        
{/* 5. Admin Assigned Trips */}
        {adminAssignedTrips.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-checkmark" size={16} color="#7C3AED" />
                <Text style={styles.sectionTitle}>Admin Assigned Trips ({adminAssignedTrips.length})</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>ACTION REQUIRED</Text>
              </View>
            </View>

            {adminAssignedTrips.map(trip => {
              const tripId = trip.long_trip_id || trip.id
              const isAccepting = acceptingTripId === tripId
              const fare = Math.round(trip.final_fare || trip.fare_estimate || trip.original_fare || 0)
              const cd = getScheduleCountdown(trip.pickup_date, trip.pickup_time, nowTime)
              const pickupDetails = parseAddressDetails(trip.pickup_address, 'pickup')
              const dropDetails = parseAddressDetails(trip.dest_address, 'drop')
              const distanceKm = trip.distance_km ? parseFloat(trip.distance_km).toFixed(2) : '151.82'
              const perKmRate = trip.per_km_rate ? Math.round(trip.per_km_rate) : 21
              const bata = trip.driver_bata || 500
              const commFee = parseFloat(trip.commission_amount || (fare * 0.134) || 639).toFixed(2)
              const rechargeNeeded = Number(trip.recharge_needed || 0)
              const vehicleName = trip.vehicle_type_name || trip.vehicle_category_name || 'Innova'
              const formattedTripStart = formatTripScheduleDate(trip.pickup_date, trip.pickup_time)
              const formattedTripEnd = trip.return_date ? formatTripScheduleDate(trip.return_date, trip.return_time) : 'Not Applicable'
              const notesText = trip.notes || trip.driver_instructions || 'Km 20/400/750/ toll CC GST'
              const isNotesOpen = !collapsedNotes[tripId]

              return (
                <View key={tripId} style={styles.gogoTripCard}>
                  {/* Top Reference & Countdown Pill */}
                  <View style={styles.gogoHeaderRow}>
                    <View style={styles.gogoRefBadge}>
                      <Ionicons name="shield-checkmark" size={15} color="#7C3AED" />
                      <Text style={styles.gogoRefText}>#{trip.booking_ref}</Text>
                    </View>
                    <View style={[styles.countdownPill, { backgroundColor: cd.badgeBg }]}>
                      <Text style={[styles.countdownPillText, { color: cd.badgeColor }]}>{cd.text}</Text>
                    </View>
                  </View>

                  {/* Connected Timeline Route (Pickup & Drop) */}
                  <View style={styles.gogoRouteContainer}>
                    {/* Pickup Row */}
                    <View style={styles.gogoTimelineRow}>
                      <View style={styles.gogoDotCol}>
                        <View style={styles.gogoDotGreen} />
                        <View style={styles.gogoVerticalLine} />
                      </View>
                      <View style={styles.gogoLocationContent}>
                        <Text style={styles.gogoFullAddressText} numberOfLines={2}>
                          {pickupDetails.full}
                        </Text>
                        <View style={styles.gogoMainLocalityRow}>
                          <Text style={styles.gogoMainLocalityText}>{pickupDetails.main}</Text>
                          <Text style={styles.gogoBadgePickup}> (Pickup)</Text>
                        </View>
                        <Text style={styles.gogoDistrictText}>District: {pickupDetails.district}</Text>
                      </View>
                    </View>

                    {/* Drop Row */}
                    <View style={styles.gogoTimelineRow}>
                      <View style={styles.gogoDotCol}>
                        <View style={styles.gogoDotRed} />
                      </View>
                      <View style={styles.gogoLocationContent}>
                        <Text style={styles.gogoFullAddressText} numberOfLines={2}>
                          {dropDetails.full}
                        </Text>
                        <View style={styles.gogoMainLocalityRow}>
                          <Text style={styles.gogoMainLocalityText}>{dropDetails.main}</Text>
                          <Text style={styles.gogoBadgeDrop}> (Drop)</Text>
                        </View>
                        <Text style={styles.gogoDistrictText}>District: {dropDetails.district}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 3-Column Metrics Summary Box */}
                  <View style={styles.gogoThreeColRow}>
                    {/* Col 1: Fare */}
                    <View style={styles.gogoColItem}>
                      <Text style={styles.gogoColSymbol}>₹</Text>
                      <Text style={styles.gogoColPrimaryText}>Rs. {fare}</Text>
                    </View>

                    <View style={styles.gogoColDivider} />

                    {/* Col 2: Vehicle & Fuel */}
                    <View style={[styles.gogoColItem, { flex: 1.2 }]}>
                      <Ionicons name="car" size={18} color={COLORS.primary} />
                      <Text style={styles.gogoColPrimaryText}>{vehicleName} (AC)</Text>
                      <View style={styles.gogoFuelBadge}>
                        <Text style={styles.gogoFuelBadgeText}>⛽ Petrol/Diesel only</Text>
                      </View>
                    </View>

                    <View style={styles.gogoColDivider} />

                    {/* Col 3: Distance */}
                    <View style={styles.gogoColItem}>
                      <Ionicons name="navigate-outline" size={17} color="#10B981" />
                      <Text style={styles.gogoColPrimaryText}>{distanceKm} Km</Text>
                    </View>
                  </View>

                  {/* 2-Column Rates & Commission Breakdown */}
                  <View style={styles.gogoTwoColRow}>
                    {/* Left: Speedometer + per km / Bata */}
                    <View style={styles.gogoRateCol}>
                      <Ionicons name="speedometer-outline" size={18} color={COLORS.primary} />
                      <Text style={styles.gogoRateText}>Rs.{perKmRate} per km / Bata - {bata}</Text>
                    </View>

                    <View style={styles.gogoColDivider} />

                    {/* Right: Car + Commission Fee */}
                    <View style={styles.gogoCommCol}>
                      <View style={styles.gogoCommAmountRow}>
                        <Ionicons name="car-outline" size={16} color="#D97706" />
                        <Text style={styles.gogoCommAmountText}>Rs.{commFee}</Text>
                      </View>
                      <Text style={styles.gogoCommSubtext}>(Commission fee)</Text>
                    </View>
                  </View>

                  {/* Permit Charges Included */}
                  <View style={styles.gogoInclusionsRow}>
                    <Ionicons name="document-text" size={16} color="#0891B2" />
                    <Text style={styles.gogoInclusionsText}>Permit Charges Included</Text>
                  </View>

                  {/* Trip Start & End Timestamps */}
                  <View style={styles.gogoScheduleBox}>
                    <View style={styles.gogoScheduleItem}>
                      <View style={styles.gogoScheduleLeft}>
                        <Ionicons name="calendar" size={16} color={COLORS.primary} />
                        <Text style={styles.gogoScheduleLabel}>Trip Start</Text>
                      </View>
                      <Text style={styles.gogoScheduleValue}>{formattedTripStart}</Text>
                    </View>
                    <View style={styles.gogoScheduleItem}>
                      <View style={styles.gogoScheduleLeft}>
                        <Ionicons name="calendar" size={16} color={COLORS.primary} />
                        <Text style={styles.gogoScheduleLabel}>Trip End</Text>
                      </View>
                      <Text style={styles.gogoScheduleValue}>{formattedTripEnd}</Text>
                    </View>
                  </View>

                  {/* Recharge Alert Banner (Conditional) */}
                  {rechargeNeeded > 0 && (
                    <View style={styles.gogoRechargeBanner}>
                      <View style={styles.gogoRechargeLeft}>
                        <Ionicons name="wallet" size={20} color="#D97706" />
                        <Text style={styles.gogoRechargeText}>
                          Recharge ₹{rechargeNeeded} to take this ride
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.gogoAddMoneyBtn}
                        onPress={() => navigation.navigate('Earnings')}
                      >
                        <Ionicons name="add-circle" size={15} color="#FFFFFF" />
                        <Text style={styles.gogoAddMoneyBtnText}>Add ₹{rechargeNeeded}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Route Preview on Google Maps */}
                  <TouchableOpacity
                    style={[styles.gogoNavBtn, { backgroundColor: '#2563EB', marginBottom: 10 }]}
                    onPress={() => {
                      const pLat = trip.pickup_lat || 13.0827
                      const pLng = trip.pickup_lng || 80.2707
                      const dLat = trip.dest_lat || 13.0067
                      const dLng = trip.dest_lng || 80.2025
                      Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`)
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="map-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.gogoNavBtnText}>📍 Preview Route on Google Maps</Text>
                  </TouchableOpacity>

                  {/* Swipe to Accept CTA Slider */}
                  <SwipeToActionButton
                    title="SWIPE TO ACCEPT RIDE"
                    icon="arrow-forward"
                    isLoading={isAccepting}
                    onSwipeComplete={() => handleAcceptAdminAssignedTrip(trip)}
                  />

                  {/* Secondary Links: Details, Decline (Phone hidden until accepted & started) */}
                  <View style={styles.gogoDeclineRow}>
                    <TouchableOpacity
                      style={styles.gogoDetailsLink}
                      onPress={() => setDetailModalTrip(trip)}
                    >
                      <Text style={styles.gogoDetailsLinkText}>View Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.gogoDeclineLink}
                      onPress={() => {
                        setRejectModalTrip(trip)
                        setRejectIsLongTrip(true)
                      }}
                    >
                      <Text style={styles.gogoDeclineText}>Decline Ride</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Collapsible Notes Accordion */}
                  <View style={styles.gogoNotesWrapper}>
                    <TouchableOpacity
                      style={styles.gogoNotesHeader}
                      activeOpacity={0.8}
                      onPress={() => setCollapsedNotes(prev => ({ ...prev, [tripId]: !prev[tripId] }))}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="document-text-outline" size={16} color="#1E40AF" />
                        <Text style={styles.gogoNotesHeaderText}>Trip Notes & Requirements</Text>
                      </View>
                      <Ionicons
                        name={isNotesOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#1E40AF"
                      />
                    </TouchableOpacity>
                    {isNotesOpen && (
                      <View style={styles.gogoNotesBody}>
                        {(() => {
                          const adminNotesList = getDeduplicatedNotes(notesText, true)
                          return adminNotesList.length > 0 ? (
                            <View style={styles.proNotesGrid}>
                              {adminNotesList.map((item, idx) => (
                                <View key={idx} style={styles.proNoteBadge}>
                                  <Text style={styles.proNoteBadgeText}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.proNotesEmptyText}>No special instructions</Text>
                          )
                        })()}
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}

        
{/* 6. Active Trip Execution Lifecycle Card (Normal & Shared) */}
        {activeRide && (() => {
          let rawStops = []
          try {
            rawStops = activeRide.stops ? (typeof activeRide.stops === 'string' ? JSON.parse(activeRide.stops) : activeRide.stops) : []
            if (!Array.isArray(rawStops)) rawStops = []
          } catch (e) {
            rawStops = []
          }
          const currIdx = activeRide.current_stop_index || 0
          const totalStops = rawStops.length
          const isRoundTrip = Boolean(
            Number(activeRide.is_round_trip) === 1 ||
            activeRide.is_round_trip === true ||
            activeRide.is_round_trip === '1' ||
            (activeRide.trip_type && activeRide.trip_type.toLowerCase().includes('round_trip')) ||
            (activeRide.booking_type && activeRide.booking_type.toLowerCase().includes('round_trip')) ||
            Boolean(activeRide.return_date)
          )
          const isReturnPickup = activeRide.status === 'return_pickup'
          const isReturnStarted = ['return_started', 'return_in_progress'].includes(activeRide.status)
          const isOnwardTripStarted = ['trip_started', 'in_progress'].includes(activeRide.status)
          const isTripStarted = isOnwardTripStarted || isReturnStarted || isReturnPickup
          const isArrived = ['driver_arrived', 'driver_reached', 'pickup_reached', 'arrived'].includes(activeRide.status)
          const isHeadingStarted = Boolean(
            startedHeadingRides.has(activeRide.id) ||
            isArrived ||
            isTripStarted ||
            ['on_the_way', 'driver_arrived', 'trip_started', 'in_progress', 'completed'].includes(activeRide.status)
          )
          const isShared = Boolean(
            activeRide.trip_type === 'shared' ||
            activeRide.is_shared == 1 ||
            activeRide.is_shared === '1' ||
            activeRide.is_shared === true ||
            (manifest && manifest.length > 0)
          )
          const isHourly = Boolean(
            activeRide.trip_sub_type === 'hourly' ||
            Number(activeRide.package_hours) > 0
          )
          const isOutstationRide = Boolean(
            Number(activeRide.is_long_trip) === 1 ||
            Number(activeRide.is_outstation) === 1 ||
            (activeRide.trip_type && activeRide.trip_type.toLowerCase().includes('outstation')) ||
            (activeRide.booking_type && activeRide.booking_type.toLowerCase().includes('outstation')) ||
            activeRide.trip_mode === 'outstation' ||
            isRoundTrip ||
            isShared
          )

          // Multi-Passenger Boarding & Dropping Calculations for Shared Trips
          const boardedPassengers = manifest.filter(p => p.is_boarded || p.is_picked_up)
          const droppedPassengers = manifest.filter(p => p.is_dropped)
          const totalPassengers = manifest.length
          const allPassengersBoarded = totalPassengers > 0 && boardedPassengers.length === totalPassengers
          const allPassengersDropped = totalPassengers > 0 && droppedPassengers.length === totalPassengers
          const nextUnboardedPassenger = manifest.find(p => !p.is_boarded && !p.is_picked_up)
          const nextUndroppedPassenger = manifest.find(p => !p.is_dropped)

          let activeTargetName = activeRide.pickup_address
          let activeTargetLat = activeRide.pickup_lat || 12.9716
          let activeTargetLng = activeRide.pickup_lng || 77.5946

          if (isShared && !isOnwardTripStarted && nextUnboardedPassenger) {
            activeTargetName = `Pickup ${nextUnboardedPassenger.customer_name}: ${nextUnboardedPassenger.pickup_address}`
            activeTargetLat = nextUnboardedPassenger.pickup_lat || activeRide.pickup_lat || 12.9716
            activeTargetLng = nextUnboardedPassenger.pickup_lng || activeRide.pickup_lng || 77.5946
          } else if (isShared && isOnwardTripStarted && nextUndroppedPassenger) {
            activeTargetName = `Drop ${nextUndroppedPassenger.customer_name}: ${nextUndroppedPassenger.dest_address}`
            activeTargetLat = nextUndroppedPassenger.dest_lat || activeRide.dest_lat || 12.9716
            activeTargetLng = nextUndroppedPassenger.dest_lng || activeRide.dest_lng || 77.5946
          } else if (isRoundTrip && isReturnPickup) {
            // Round Trip Return Leg: Driver navigating to 1st drop location for pickup
            activeTargetName = `Return Pickup (1st Drop): ${activeRide.dest_address}`
            activeTargetLat = activeRide.dest_lat || 12.9716
            activeTargetLng = activeRide.dest_lng || 77.5946
          } else if (isRoundTrip && isReturnStarted) {
            // Round Trip Return Leg: Driver navigating back to original starting pickup location
            activeTargetName = `Return Drop (Origin): ${activeRide.pickup_address}`
            activeTargetLat = activeRide.pickup_lat || 12.9716
            activeTargetLng = activeRide.pickup_lng || 77.5946
          } else if (isOnwardTripStarted) {
            if (currIdx < totalStops && rawStops[currIdx]) {
              activeTargetName = `Stop ${currIdx + 1}: ${rawStops[currIdx].address}`
              activeTargetLat = rawStops[currIdx].lat || activeRide.dest_lat || 12.9716
              activeTargetLng = rawStops[currIdx].lng || activeRide.dest_lng || 77.5946
            } else {
              activeTargetName = `Drop: ${activeRide.dest_address}`
              activeTargetLat = activeRide.dest_lat || 12.9716
              activeTargetLng = activeRide.dest_lng || 77.5946
            }
          }

          const safeCoordLat = (val, fallback = 13.0827) => {
            const n = parseFloat(val)
            return (!isNaN(n) && n !== 0 && n > 5 && n < 40) ? n : fallback
          }
          const safeCoordLng = (val, fallback = 80.2707) => {
            const n = parseFloat(val)
            return (!isNaN(n) && n !== 0 && n > 65 && n < 100) ? n : fallback
          }

          const mapOrigin = isReturnStarted
            ? {
                latitude: safeCoordLat(activeRide.dest_lat, 13.0425),
                longitude: safeCoordLng(activeRide.dest_lng, 80.2400),
                address: activeRide.dest_address,
              }
            : {
                latitude: safeCoordLat(activeRide.pickup_lat, 13.0827),
                longitude: safeCoordLng(activeRide.pickup_lng, 80.2707),
                address: activeRide.pickup_address,
              }

          const mapDestination = isReturnStarted
            ? {
                latitude: safeCoordLat(activeRide.pickup_lat, 13.0827),
                longitude: safeCoordLng(activeRide.pickup_lng, 80.2707),
                address: activeRide.pickup_address,
              }
            : {
                latitude: safeCoordLat(activeRide.dest_lat, 13.0067),
                longitude: safeCoordLng(activeRide.dest_lng, 80.2025),
                address: activeRide.dest_address,
              }

          return (
            <View style={styles.activeCard}>
              <View style={styles.activeHeader}>
                <View>
                  <Text style={styles.bookingRef}>{activeRide.booking_ref}</Text>
                  <Text style={styles.tripTypeBadge}>
                    {isShared
                      ? '🤝 SHARED MULTI-PASSENGER TRIP'
                      : (isHourly
                        ? `⏱️ HOURLY RENTAL (${activeRide.package_hours || 1} HRS)`
                        : (isRoundTrip
                          ? '🔁 ROUND TRIP'
                          : (activeRide.trip_type ? activeRide.trip_type.replace(/_/g, ' ').toUpperCase() : 'ACTIVE RIDE')))}
                  </Text>
                </View>
                <View style={[styles.statusBadge, {
                  backgroundColor: isReturnStarted
                    ? '#DCFCE7'
                    : (isReturnPickup
                      ? '#FEF3C7'
                      : (isOnwardTripStarted ? '#EDE9FE' : (isArrived ? '#FEF3C7' : '#DCFCE7')))
                }]}>
                  <Text style={[styles.statusBadgeText, {
                    color: isReturnStarted
                      ? '#15803D'
                      : (isReturnPickup
                        ? '#B45309'
                        : (isOnwardTripStarted ? '#7C3AED' : (isArrived ? '#B45309' : '#15803D')))
                  }]}>
                    {isReturnStarted
                      ? 'RETURN IN PROGRESS 🔁'
                      : (isReturnPickup
                        ? 'RETURN PICKUP 📍'
                        : (activeRide.status === 'driver_arrived'
                          ? 'DRIVER ARRIVED'
                          : (isOnwardTripStarted ? (isRoundTrip ? 'ONWARD TRIP ➡️' : 'IN PROGRESS') : activeRide.status?.replace(/_/g, ' ').toUpperCase())))}
                  </Text>
                </View>
              </View>

              {/* ── GOGO Cabs Style Active Trip Details Card ── */}
              {(() => {
                const pDet = parseAddressDetails(activeRide.pickup_address, 'pickup')
                const dDet = parseAddressDetails(activeRide.dest_address, 'drop')
                const dKm = activeRide.distance_km ? parseFloat(activeRide.distance_km).toFixed(2) : (activeRide.route_distance_km ? parseFloat(activeRide.route_distance_km).toFixed(2) : '—')
                const pRate = activeRide.per_km_rate ? Math.round(activeRide.per_km_rate) : 21
                const bataAmt = activeRide.driver_bata || 500
                const rawFare = Number(activeRide.final_fare || activeRide.fare || activeRide.fare_estimate || activeRide.original_fare || activeRide.estimated_fare || activeRide.total_fare || 0)
                const origKmNum = Number(activeRide.original_distance_km || activeRide.distance_km || activeRide.route_distance_km || 0)
                const minFare = Number(activeRide.minimum_fare || activeRide.min_fare || 50)
                const bFare = Number(activeRide.base_fare || 30)
                const calcBaseFare = Math.max(minFare, Math.round(bFare + (origKmNum * pRate)))
                const routeFare = rawFare > 0 ? rawFare : calcBaseFare
                const waitCharge = Number(activeRide.waiting_charge || 0)
                const tollCharge = Number(activeRide.toll_amount || activeRide.toll_fee || 0)
                const fareVal = Math.round(routeFare + waitCharge + tollCharge)
                const cFee = parseFloat(activeRide.commission_amount || (fareVal * 0.134) || 12).toFixed(2)
                const vName = activeRide.vehicle_type_name || activeRide.vehicle_category_name || activeRide.vehicle_type || 'Cab'
                const tStart = formatTripScheduleDate(activeRide.pickup_date || activeRide.scheduled_date || activeRide.created_at, activeRide.pickup_time || activeRide.scheduled_time)
                const tEnd = activeRide.return_date ? formatTripScheduleDate(activeRide.return_date, activeRide.return_time) : 'Not Applicable'
                let rawNotes = activeRide.notes || activeRide.driver_instructions || 'Km 20/400/750/ toll CC GST'
                const isLocked = activeRide.status === 'driver_assigned'
                const proNotesList = getDeduplicatedNotes(rawNotes, isLocked)
                const isNotesOpen = !collapsedNotes[activeRide.id || 'active']

                return (
                  <View style={{ marginTop: 4 }}>
                    {/* Connected Timeline Route */}
                    <View style={styles.gogoRouteContainer}>
                      <View style={styles.gogoTimelineRow}>
                        <View style={styles.gogoDotCol}>
                          <View style={styles.gogoDotGreen} />
                          <View style={styles.gogoVerticalLine} />
                        </View>
                        <View style={styles.gogoLocationContent}>
                          <Text style={styles.gogoFullAddressText} numberOfLines={3}>{pDet.full}</Text>
                          <View style={styles.gogoMainLocalityRow}>
                            <Text style={styles.gogoMainLocalityText}>{pDet.main}</Text>
                            <Text style={styles.gogoBadgePickup}> (Pickup)</Text>
                          </View>
                          <Text style={styles.gogoDistrictText}>District: {pDet.district}</Text>
                        </View>
                      </View>

                      <View style={styles.gogoTimelineRow}>
                        <View style={styles.gogoDotCol}>
                          <View style={styles.gogoDotRed} />
                        </View>
                        <View style={styles.gogoLocationContent}>
                          <Text style={styles.gogoFullAddressText} numberOfLines={3}>{dDet.full}</Text>
                          <View style={styles.gogoMainLocalityRow}>
                            <Text style={styles.gogoMainLocalityText}>{dDet.main}</Text>
                            <Text style={styles.gogoBadgeDrop}> (Drop)</Text>
                          </View>
                          <Text style={styles.gogoDistrictText}>District: {dDet.district}</Text>
                        </View>
                      </View>
                    </View>

                    {/* 3-Column Metrics Summary */}
                    <View style={styles.gogoThreeColRow}>
                      <View style={styles.gogoColItem}>
                        <Text style={styles.gogoColSymbol}>₹</Text>
                        <Text style={styles.gogoColPrimaryText}>Rs. {fareVal}</Text>
                      </View>
                      <View style={styles.gogoColDivider} />
                      <View style={[styles.gogoColItem, { flex: 1.35 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="car" size={16} color={COLORS.primary} />
                          <Text style={styles.gogoColPrimaryText} numberOfLines={1}>{vName} (AC)</Text>
                        </View>
                        <View style={styles.gogoFuelBadge}>
                          <Text style={styles.gogoFuelBadgeText}>⛽ Petrol/Diesel only</Text>
                        </View>
                      </View>
                      <View style={styles.gogoColDivider} />
                      <View style={styles.gogoColItem}>
                        <Ionicons name="navigate-outline" size={17} color="#10B981" />
                        <Text style={styles.gogoColPrimaryText}>{dKm} Km</Text>
                      </View>
                    </View>

                    {/* 2-Column Rates & Commission Breakdown */}
                    <View style={styles.gogoTwoColRow}>
                      <View style={styles.gogoRateCol}>
                        <Ionicons name="speedometer-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.gogoRateText}>Rs.{pRate} per km / Bata - {bataAmt}</Text>
                      </View>
                      <View style={styles.gogoColDivider} />
                      <View style={styles.gogoCommCol}>
                        <View style={styles.gogoCommAmountRow}>
                          <Ionicons name="car-outline" size={16} color="#D97706" />
                          <Text style={styles.gogoCommAmountText}>Rs.{cFee}</Text>
                        </View>
                        <Text style={styles.gogoCommSubtext}>(Commission fee)</Text>
                      </View>
                    </View>

                    {/* Permit Charges Included */}
                    <View style={styles.gogoInclusionsRow}>
                      <Ionicons name="document-text" size={16} color="#0891B2" />
                      <Text style={styles.gogoInclusionsText}>Permit Charges Included</Text>
                    </View>

                    {/* Trip Start & End */}
                    <View style={styles.gogoScheduleBox}>
                      <View style={styles.gogoScheduleItem}>
                        <View style={styles.gogoScheduleLeft}>
                          <Ionicons name="calendar" size={16} color={COLORS.primary} />
                          <Text style={styles.gogoScheduleLabel}>Trip Start</Text>
                        </View>
                        <Text style={styles.gogoScheduleValue}>{tStart}</Text>
                      </View>
                      <View style={styles.gogoScheduleItem}>
                        <View style={styles.gogoScheduleLeft}>
                          <Ionicons name="calendar" size={16} color={COLORS.primary} />
                          <Text style={styles.gogoScheduleLabel}>Trip End</Text>
                        </View>
                        <Text style={styles.gogoScheduleValue}>{tEnd}</Text>
                      </View>
                    </View>

                    {/* Customer Contact & Swipe-to-Start or Live Navigation */}
                    {!isHeadingStarted ? (
                      <View style={{ marginTop: 12 }}>
                        {/* Direct Turn-by-Turn GPS Navigation Action to Pickup */}
                        <TouchableOpacity
                          style={styles.gogoNavBtn}
                          onPress={() => {
                            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${activeTargetLat},${activeTargetLng}&travelmode=driving`)
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="navigate" size={18} color="#FFFFFF" />
                          <Text style={styles.gogoNavBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                            📍 Open Google Maps Navigation (Pickup)
                          </Text>
                        </TouchableOpacity>

                        <View style={[styles.gogoCustomerBarLocked, { marginTop: 10 }]}>
                          <View style={styles.gogoCustAvatarLocked}>
                            <Ionicons name="lock-closed" size={18} color="#D97706" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.gogoCustName} numberOfLines={1}>{activeRide.customer_name || 'Passenger'}</Text>
                            <Text style={styles.gogoCustSubLocked}>🔒 Number Protected · Swipe START below to view customer & call</Text>
                          </View>
                        </View>

                        <SwipeToActionButton
                          title="SWIPE TO START HEADING TO PICKUP"
                          icon="arrow-forward"
                          trackBg="#16A34A"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#15803D"
                          isLoading={isUpdatingStatus}
                          onSwipeComplete={handleStartHeading}
                        />

                        {/* Direct Decline / Reject Assignment Button */}
                        <TouchableOpacity
                          style={{
                            marginTop: 10,
                            paddingVertical: 12,
                            borderRadius: 12,
                            backgroundColor: '#FEF2F2',
                            borderWidth: 1.5,
                            borderColor: '#FCA5A5',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 8,
                          }}
                          onPress={() => {
                            Alert.alert(
                              'Decline Assignment',
                              'Are you sure you want to reject this ride assignment? It will be immediately passed to the next nearby driver.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Yes, Reject',
                                  style: 'destructive',
                                  onPress: () => handleDeclineInstantRide(activeRide.id, 'Driver declined assignment')
                                }
                              ]
                            )
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                            Decline / Reject Assignment
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ marginTop: 12 }}>
                        {/* Direct Turn-by-Turn GPS Navigation Action */}
                        <TouchableOpacity
                          style={styles.gogoNavBtn}
                          onPress={() => {
                            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${activeTargetLat},${activeTargetLng}&travelmode=driving`)
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="navigate" size={18} color="#FFFFFF" />
                          <Text style={styles.gogoNavBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                            {!isTripStarted ? '📍 Open Google Maps Navigation (Pickup)' : '📍 Open Google Maps Navigation (Drop)'}
                          </Text>
                        </TouchableOpacity>

                        {/* Customer Contact Row (Full Details Revealed on Heading Started) */}
                        {activeRide.customer_phone ? (
                          <TouchableOpacity
                            style={styles.gogoCustomerBar}
                            onPress={() => setShowCustomerModal(true)}
                            activeOpacity={0.88}
                          >
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <View style={styles.gogoCustAvatar}>
                                <Text style={styles.gogoCustAvatarText}>
                                  {((activeRide.customer_name || 'R')?.[0] || 'R').toUpperCase()}
                                </Text>
                                {(!custAvatarError && resolveAssetUrl(activeRide.customer_avatar_url || activeRide.customer_avatar)) ? (
                                  <Image
                                    source={{ uri: resolveAssetUrl(activeRide.customer_avatar_url || activeRide.customer_avatar) }}
                                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', borderRadius: 24 }}
                                    resizeMode="cover"
                                    onError={() => setCustAvatarError(true)}
                                  />
                                ) : null}
                              </View>
                              <View style={{ flex: 1, justifyContent: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={styles.gogoCustName} numberOfLines={1}>
                                    {activeRide.customer_name || 'Passenger'}
                                  </Text>
                                </View>
                                <View style={styles.gogoCustMetaRow}>
                                  <View style={[styles.gogoProtectedPill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                                    <Ionicons name="shield-checkmark" size={11} color="#059669" />
                                    <Text style={[styles.gogoProtectedText, { color: '#047857', fontWeight: '800' }]}>
                                      Verified Rider
                                    </Text>
                                  </View>
                                  <View style={styles.gogoPaymentPill}>
                                    <Text style={styles.gogoPaymentText}>
                                      {activeRide.payment_method?.toUpperCase() || 'CASH'}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </View>

                            {/* Direct Circular Call Button (Message is inside Customer Modal) */}
                            <TouchableOpacity
                              style={styles.gogoCustBigCallBtn}
                              onPress={() => Linking.openURL(`tel:${activeRide.customer_phone}`)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="call" size={24} color="#FFFFFF" />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}

                    {/* Notes Accordion removed per request */}
                  </View>
                )
              })()}

              {/* Ride Start PIN Status Banner */}
              {!isShared && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isReturnStarted ? '#DCFCE7' : (isReturnPickup ? '#FEF3C7' : (isOnwardTripStarted ? '#D1FAE5' : (isArrived ? '#FEF3C7' : '#EDE9FE'))),
                  padding: 8,
                  borderRadius: RADIUS.md,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: isReturnStarted ? '#A7F3D0' : (isReturnPickup ? '#FDE68A' : (isOnwardTripStarted ? '#A7F3D0' : (isArrived ? '#FDE68A' : '#DDD6FE')))
                }}>
                  <Ionicons
                    name={isReturnStarted ? 'repeat' : (isReturnPickup ? 'location' : (isOnwardTripStarted ? 'checkmark-circle' : (isArrived ? 'key' : 'shield-checkmark')))}
                    size={15}
                    color={isReturnStarted ? '#059669' : (isReturnPickup ? '#B45309' : (isOnwardTripStarted ? '#059669' : (isArrived ? '#B45309' : '#7C3AED')))}
                  />
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: isReturnStarted ? '#065F46' : (isReturnPickup ? '#92400E' : (isOnwardTripStarted ? '#065F46' : (isArrived ? '#92400E' : '#5B21B6'))),
                    flex: 1
                  }}>
                    {isReturnStarted
                      ? '🔁 Return Journey Active • Returning to Starting Point'
                      : (isReturnPickup
                        ? '📍 Return Pickup • Heading to 1st Drop Location to Pick Up Customer'
                        : (isOnwardTripStarted
                          ? (isRoundTrip ? '🔁 Round Trip (Leg 1) • Navigating to Destination' : 'OTP Verified ✓ • Navigating to Destination')
                          : (isArrived
                            ? 'Driver Arrived • Ask Customer for 4-Digit Start PIN'
                            : 'En Route to Pickup • Start PIN Required upon Arrival')))}
                  </Text>
                </View>
              )}

              {/* Multi-Stop Leg Progress Indicator for Local/Long Trips with Stops */}
              {!isShared && totalStops > 0 && isTripStarted && (
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginVertical: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569', marginBottom: 6 }}>
                    📍 MULTI-STOP ROUTE PROGRESS ({currIdx}/{totalStops} Stops Completed)
                  </Text>
                  {rawStops.map((st, sIdx) => {
                    const isDone = sIdx < currIdx
                    const isCur = sIdx === currIdx
                    return (
                      <View key={sIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
                        <Ionicons
                          name={isDone ? 'checkmark-circle' : (isCur ? 'radio-button-on' : 'radio-button-off')}
                          size={14}
                          color={isDone ? '#10B981' : (isCur ? '#F59E0B' : '#94A3B8')}
                        />
                        <Text style={{ fontSize: 11, color: isCur ? '#1E293B' : '#64748B', fontWeight: isCur ? '700' : '500', flex: 1 }} numberOfLines={1}>
                          Stop {sIdx + 1}: {st.address}
                        </Text>
                        {isDone && <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '800' }}>Done ✓</Text>}
                        {isCur && <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '800' }}>Current Target</Text>}
                      </View>
                    )
                  })}
                </View>
              )}

              {/* Shared Trip Multi-Passenger Boarding & Drop Manifest */}
              {isShared && manifest.length > 0 && (
                <View style={styles.sharedManifestContainer}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={styles.manifestTitle}>
                      {!isTripStarted ? 'CO-PASSENGER BOARDING MANIFEST' : 'CO-PASSENGER DROP MANIFEST'}
                    </Text>
                    <View style={[styles.boardingCountBadge, { backgroundColor: (!isTripStarted ? allPassengersBoarded : allPassengersDropped) ? '#D1FAE5' : '#FEF3C7' }]}>
                      <Text style={[styles.boardingCountText, { color: (!isTripStarted ? allPassengersBoarded : allPassengersDropped) ? '#059669' : '#B45309' }]}>
                        {!isTripStarted ? `${boardedPassengers.length}/${totalPassengers} Boarded` : `${droppedPassengers.length}/${totalPassengers} Dropped`}
                      </Text>
                    </View>
                  </View>

                  {manifest.map((p, idx) => {
                    const isB = Boolean(p.is_boarded || p.is_picked_up)
                    const isD = Boolean(p.is_dropped)
                    return (
                      <View key={p.id || idx} style={[styles.sharedPassCard, (isD || (isB && !isTripStarted)) && styles.sharedPassCardBoarded]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <View style={[styles.seatPill, { backgroundColor: isD ? '#059669' : (isB ? '#10B981' : '#D97706') }]}>
                              <Text style={styles.seatPillText}>{p.seat_no || `Seat ${idx + 1}`}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.manifestPassName}>{p.customer_name || 'Passenger'}</Text>
                              <Text style={styles.manifestSubAddr} numberOfLines={1}>
                                {!isTripStarted ? `🟢 ${p.pickup_address}` : `🔴 ${p.dest_address}`}
                              </Text>
                            </View>
                          </View>

                          {/* Action / Status Pill */}
                          {!isTripStarted ? (
                            isB ? (
                              <View style={styles.boardedBadge}>
                                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                                <Text style={styles.boardedText}>Boarded ✓</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.verifyOtpBtn}
                                onPress={() => {
                                  setPassOtpModal(p)
                                  setPassEnteredOtp('')
                                }}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="key" size={13} color={COLORS.white} />
                                <Text style={styles.verifyOtpBtnText}>Verify OTP</Text>
                              </TouchableOpacity>
                            )
                          ) : (
                            isD ? (
                              <View style={styles.boardedBadge}>
                                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                                <Text style={styles.boardedText}>Dropped ✓</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={[styles.verifyOtpBtn, { backgroundColor: '#FFC700' }]}
                                onPress={() => handleConfirmPassengerDrop(p)}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="location" size={13} color="#000000" />
                                <Text style={[styles.verifyOtpBtnText, { color: '#000000' }]}>Confirm Drop</Text>
                              </TouchableOpacity>
                            )
                          )}
                        </View>

                        {/* Direct passenger contact shortcut */}
                        {p.customer_phone && (
                          isTripStarted ? (
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                              <TouchableOpacity
                                style={styles.passContactBtn}
                                onPress={() => Linking.openURL(`sms:${p.customer_phone}`)}
                              >
                                <Ionicons name="chatbubble-outline" size={12} color={COLORS.primary} />
                                <Text style={styles.passContactText}>Chat</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.passContactBtn}
                                onPress={() => Linking.openURL(`tel:${p.customer_phone}`)}
                              >
                                <Ionicons name="call-outline" size={12} color="#10B981" />
                                <Text style={[styles.passContactText, { color: '#059669' }]}>Call</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 6 }}>
                              <Ionicons name="lock-closed" size={11} color="#94A3B8" />
                              <Text style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>Number revealed on trip start</Text>
                            </View>
                          )
                        )}
                      </View>
                    )
                  })}
                </View>
              )}


              {/* Dynamic Action Buttons for Normal vs Shared Trips */}
              <View style={{ marginTop: 12 }}>
                {/* 1. Normal Single / Multi-Stop Ride Actions */}
                {!isShared && (
                  <>
                    {/* Extra Arrival Pickup Cash Notice & Confirm Button */}
                    {activeRide.status === 'driver_assigned' && (Number(activeRide.extra_pickup_distance_km) > 0 || Number(activeRide.pickup_distance_km) > 2.0) && (
                      <View style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1.5, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Ionicons name="warning" size={18} color="#D97706" style={{ marginRight: 6 }} />
                          <Text style={{ fontWeight: 'bold', color: '#92400E', fontSize: 14 }}>
                            Pickup Arrival Distance Alert
                          </Text>
                        </View>
                        <Text style={{ color: '#78350F', fontSize: 13 }}>
                          Pickup Distance: <Text style={{ fontWeight: 'bold' }}>{Number(activeRide.pickup_distance_km || (2.0 + Number(activeRide.extra_pickup_distance_km || 0))).toFixed(1)} KM</Text>
                        </Text>
                        <Text style={{ color: '#78350F', fontSize: 13, marginTop: 2 }}>
                          • 2.0 KM Free | <Text style={{ fontWeight: 'bold', color: '#B45309' }}>{Number(activeRide.extra_pickup_distance_km || Math.max(0, Number(activeRide.pickup_distance_km || 0) - 2.0)).toFixed(1)} KM Extra Arrival</Text>
                        </Text>
                        <View style={{ backgroundColor: '#FDE68A', borderRadius: 6, padding: 8, marginTop: 8 }}>
                          <Text style={{ color: '#92400E', fontSize: 13, fontWeight: 'bold' }}>
                            💰 Customer Pay Panna Vendiya Extra Cash: ₹{Math.round(activeRide.pickup_charge || (Math.max(0, Number(activeRide.pickup_distance_km || 0) - 2.0) * 10))}
                          </Text>
                          <Text style={{ color: '#78350F', fontSize: 11, marginTop: 2 }}>
                            Confirm panni vittu pickup location-kku pogavum.
                          </Text>
                        </View>
                        <SwipeToActionButton
                          title="SWIPE TO CONFIRM & HEAD TO PICKUP"
                          icon="checkmark-circle"
                          trackBg="#10B981"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#059669"
                          isLoading={isUpdatingStatus}
                          onSwipeComplete={() => handleUpdateRideStatus('driver_accepted')}
                        />
                      </View>
                    )}

                    {/* Confirmed Extra Cash Notice when on the way */}
                    {isHeadingStarted && ['driver_accepted', 'accepted', 'waiting_pickup', 'on_the_way'].includes(activeRide.status) && (Number(activeRide.extra_pickup_distance_km) > 0 || Number(activeRide.pickup_distance_km) > 2.0) && (
                      <View style={{ backgroundColor: '#ECFDF5', borderColor: '#10B981', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                        <Text style={{ color: '#065F46', fontSize: 13, fontWeight: 'bold' }}>
                          ✓ Confirmed: Customer-idam ₹{Math.round(activeRide.pickup_charge || (Math.max(0, Number(activeRide.pickup_distance_km || 0) - 2.0) * 10))} Extra Cash Collect Pannavum!
                        </Text>
                        <Text style={{ color: '#047857', fontSize: 11, marginTop: 2 }}>
                          ({Number(activeRide.extra_pickup_distance_km || Math.max(0, Number(activeRide.pickup_distance_km || 0) - 2.0)).toFixed(1)} KM extra arrival distance @ ₹10/KM)
                        </Text>
                      </View>
                    )}

                    {isHeadingStarted && ['driver_accepted', 'accepted', 'waiting_pickup', 'on_the_way'].includes(activeRide.status) ? (
                      <SwipeToActionButton
                        title="SWIPE TO MARK ARRIVED"
                        icon="location"
                        trackBg="#D97706"
                        thumbBg="#FFFFFF"
                        thumbIconColor="#B45309"
                        isLoading={isUpdatingStatus}
                        onSwipeComplete={() => handleUpdateRideStatus('driver_arrived')}
                      />
                    ) : null}

                    {['driver_arrived', 'driver_reached', 'pickup_reached', 'arrived'].includes(activeRide.status) && (
                      <View>
                        {!isOutstationRide && (
                          <DriverWaitingTimerCard
                            arrivedAt={activeRide.arrived_at}
                            freeWaitingMins={activeRide.free_waiting_mins || 5}
                            waitingRate={activeRide.waiting_charge_per_min || activeRide.waiting_charge || 2}
                            categoryName={activeRide.vehicle_category_name || activeRide.vehicle_type_name || 'Taxi'}
                          />
                        )}

                        <SwipeToActionButton
                          title="SWIPE TO ENTER START OTP"
                          icon="key"
                          trackBg="#7C3AED"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#6D28D9"
                          isLoading={isUpdatingStatus}
                          resetKey={otpModalVisible}
                          onSwipeComplete={() => {
                            setEnteredOtp('')
                            setOtpModalVisible(true)
                          }}
                        />

                        {/* Re-Open Keypad Shortcut if dialog was closed */}
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            marginTop: 4,
                            paddingVertical: 4,
                          }}
                          onPress={() => {
                            setEnteredOtp('')
                            setOtpModalVisible(true)
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="keypad" size={13} color="#7C3AED" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>
                            Accidentally closed? Tap here to enter OTP
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* 1. Onward Leg Actions */}
                    {isOnwardTripStarted && !isReturnPickup && !isReturnStarted && (() => {
                      if (currIdx < totalStops && rawStops[currIdx]) {
                        return (
                          <SwipeToActionButton
                            title={`SWIPE TO COMPLETE STOP ${currIdx + 1}`}
                            icon="checkmark-circle"
                            trackBg="#D97706"
                            thumbBg="#FFFFFF"
                            thumbIconColor="#B45309"
                            isLoading={isUpdatingStatus}
                            onSwipeComplete={async () => {
                              try {
                                const res = await driverAPI.completeStop(activeRide.id)
                                if (res.data?.status === 'success') {
                                  Alert.alert('Stop Completed ✓', `Stop ${currIdx + 1} completed! Navigating to next target.`)
                                  loadDashboardData()
                                }
                              } catch {}
                            }}
                          />
                        )
                      }

                      // FOR ROUND TRIPS: Do NOT complete trip at destination! Start return pickup instead
                      if (isRoundTrip) {
                        return (
                          <View style={{ gap: 8 }}>
                            <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                              <Ionicons name="repeat" size={16} color="#B45309" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', flex: 1 }}>
                                Round Trip: 1st drop destination reached. When picking up passenger for return journey, swipe below.
                              </Text>
                            </View>
                            <SwipeToActionButton
                              title="SWIPE TO START RETURN PICKUP"
                              icon="repeat"
                              trackBg="#2563EB"
                              thumbBg="#FFFFFF"
                              thumbIconColor="#1D4ED8"
                              isLoading={isUpdatingStatus}
                              onSwipeComplete={() => {
                                Alert.alert(
                                  'Start Return Pickup? 🔄',
                                  `Are you ready for the return journey? This will navigate you to pick up the passenger at ${activeRide.dest_address}.`,
                                  [
                                    { text: 'Wait', style: 'cancel' },
                                    {
                                      text: 'Yes, Start Return Pickup',
                                      onPress: () => handleUpdateRideStatus('return_pickup')
                                    }
                                  ]
                                )
                              }}
                            />
                          </View>
                        )
                      }

                      // One-Way Normal Trip / Hourly Trip: Complete Trip & Settle
                      return (
                        <SwipeToActionButton
                          title={isHourly ? "SWIPE TO COMPLETE HOURLY TRIP" : "SWIPE TO COMPLETE TRIP"}
                          icon="checkmark-done"
                          trackBg="#10B981"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#059669"
                          isLoading={isSubmittingComplete || isUpdatingStatus}
                          resetKey={completeTripModalVisible}
                          onSwipeComplete={handleOpenCompleteTripModal}
                        />
                      )
                    })()}

                    {/* 2. Round Trip Return Pickup Stage */}
                    {isRoundTrip && isReturnPickup && (
                      <View style={{ gap: 8 }}>
                        <View style={{ backgroundColor: '#EFF6FF', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#BFDBFE' }}>
                          <Ionicons name="navigate-circle" size={18} color="#1D4ED8" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF', flex: 1 }}>
                            Heading to 1st drop point ({activeRide.dest_address}) to pick up passenger. When passenger has boarded, swipe below to start return journey.
                          </Text>
                        </View>
                        <SwipeToActionButton
                          title="SWIPE: PASSENGER BOARDED (RETURN)"
                          icon="play-circle"
                          trackBg="#7C3AED"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#6D28D9"
                          isLoading={isUpdatingStatus}
                          onSwipeComplete={() => {
                            Alert.alert(
                              'Start Return Trip? 🚀',
                              `Has the passenger boarded for the return journey back to ${activeRide.pickup_address}?`,
                              [
                                { text: 'Not Yet', style: 'cancel' },
                                {
                                  text: 'Yes, Start Return Trip',
                                  onPress: () => handleUpdateRideStatus('return_started')
                                }
                              ]
                            )
                          }}
                        />
                      </View>
                    )}

                    {/* 3. Round Trip Return Journey in Progress */}
                    {isRoundTrip && isReturnStarted && (
                      <View style={{ gap: 8 }}>
                        <View style={{ backgroundColor: '#ECFDF5', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#A7F3D0' }}>
                          <Ionicons name="repeat" size={18} color="#059669" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46', flex: 1 }}>
                            Return Journey In Progress: Navigating back to starting point ({activeRide.pickup_address}). Complete trip only after dropping customer at origin!
                          </Text>
                        </View>
                        <SwipeToActionButton
                          title="SWIPE TO COMPLETE ROUND TRIP"
                          icon="checkmark-done"
                          trackBg="#10B981"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#059669"
                          isLoading={isSubmittingComplete || isUpdatingStatus}
                          onSwipeComplete={() => {
                            Alert.alert(
                              'Complete Round Trip? 🏁',
                              `Have you reached back to the starting location (${activeRide.pickup_address}) and safely dropped the customer?`,
                              [
                                { text: 'Not Yet', style: 'cancel' },
                                {
                                  text: 'Yes, Complete Trip',
                                  onPress: handleOpenCompleteTripModal
                                }
                              ]
                            )
                          }}
                        />
                      </View>
                    )}
                  </>
                )}

                {/* 2. Shared Multi-Passenger Journey Actions */}
                {isShared && (
                  <>
                    {!isTripStarted && (
                      <View>
                        {!allPassengersBoarded ? (
                          <View style={styles.journeyLockBanner}>
                            <Ionicons name="lock-closed" size={16} color="#B45309" />
                            <Text style={styles.journeyLockText}>
                              Waiting for all {totalPassengers} passengers to board ({boardedPassengers.length}/{totalPassengers} Boarded)
                            </Text>
                          </View>
                        ) : null}

                        {allPassengersBoarded ? (
                          <SwipeToActionButton
                            title="SWIPE TO START JOURNEY 🚀"
                            icon="rocket"
                            trackBg="#10B981"
                            thumbBg="#FFFFFF"
                            thumbIconColor="#059669"
                            isLoading={isUpdatingStatus}
                            onSwipeComplete={handleStartSharedJourney}
                          />
                        ) : (
                          <View style={[styles.primaryActionBtn, { backgroundColor: '#94A3B8', opacity: 0.7 }]}>
                            <Ionicons name="lock-closed" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                            <Text style={styles.primaryActionText}>
                              Start Journey (Locked - {boardedPassengers.length}/{totalPassengers} Boarded)
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {isTripStarted && (
                      allPassengersDropped ? (
                        <SwipeToActionButton
                          title="SWIPE TO COMPLETE SHARED TRIP ✅"
                          icon="checkmark-done"
                          trackBg="#10B981"
                          thumbBg="#FFFFFF"
                          thumbIconColor="#059669"
                          isLoading={isSubmittingComplete || isUpdatingStatus}
                          onSwipeComplete={handleOpenCompleteTripModal}
                        />
                      ) : (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: COLORS.primary }]}
                          onPress={() => {
                            Alert.alert(
                              'Pending Drops',
                              `Please confirm drop for all passengers first (${droppedPassengers.length}/${totalPassengers} dropped).`,
                              [{ text: 'OK' }]
                            )
                          }}
                        >
                          <Ionicons name="time-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.primaryActionText}>
                            Drops In Progress ({droppedPassengers.length}/${totalPassengers} Dropped)
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </>
                )}
              </View>
        </View>
      )
    })()}

        
        {/* Standby Card when no active ride is underway */}
        {!activeRide && (
          <View style={styles.idleStandbyCard}>
            <View style={styles.idleStandbyHeader}>
              <View style={[styles.idleStatusDot, { backgroundColor: isOnline ? '#10B981' : '#F59E0B' }]} />
              <Text style={[styles.idleStatusBadgeText, { color: isOnline ? '#059669' : '#D97706' }]}>
                {isOnline ? 'ONLINE • READY FOR TRIPS' : 'OFFLINE • DUTY PAUSED'}
              </Text>
            </View>
            <Text style={styles.idleStandbyTitle}>
              {isOnline ? 'Listening for Incoming Bookings' : 'You are currently Offline'}
            </Text>
            <Text style={styles.idleStandbySub}>
              {isOnline
                ? 'Stay online in active service areas. Incoming booking requests will pop up immediately with audio alert.'
                : 'Turn your status toggle ON at the top to receive new ride bookings.'}
            </Text>
          </View>
        )}

        {/* 7. Upcoming Accepted Trips */}
        {upcomingTrips.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="calendar" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Upcoming Trips ({upcomingTrips.length})</Text>
              </View>
            </View>

            {upcomingTrips.map(ut => {
              const cd = getScheduleCountdown(ut.pickup_date, ut.pickup_time, nowTime)
              const fare = Math.round(ut.final_fare || ut.fare_estimate || 0)

              return (
                <View key={ut.long_trip_id || ut.id} style={styles.upcomingCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.bookingRef}>{ut.booking_ref}</Text>
                    <View style={[styles.countdownPill, { backgroundColor: cd.badgeBg }]}>
                      <Text style={[styles.countdownPillText, { color: cd.badgeColor }]}>{cd.text}</Text>
                    </View>
                  </View>
                  <Text style={styles.upcomingDateText}>🗓 {formatDateDisplay(ut.pickup_date)} at {formatTime12Hr(ut.pickup_time || '08:30')}</Text>
                  <Text style={styles.schedAddr} numberOfLines={1}>🟢 {ut.pickup_address}</Text>
                  <Text style={styles.schedAddr} numberOfLines={1}>🔴 {ut.dest_address}</Text>

                  <View style={styles.upcomingBottom}>
                    <Text style={styles.upcomingFare}>₹{fare}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={styles.detailsBtn}
                        onPress={() => setDetailModalTrip(ut)}
                      >
                        <Text style={styles.detailsBtnText}>Details</Text>
                      </TouchableOpacity>
                      {cd.isBufferTime && (
                        <TouchableOpacity
                          style={styles.schedStartBtn}
                          onPress={async () => {
                            try {
                              const res = await driverAPI.updateStatus(ut.booking_id || ut.id, { status: 'driver_assigned' })
                              if (res.data?.status === 'success') {
                                Alert.alert('Trip Activated!', 'Scheduled trip is now active on your dashboard.')
                                loadDashboardData()
                              }
                            } catch {}
                          }}
                        >
                          <Text style={styles.schedStartBtnText}>Start Trip →</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        
        {/* 10. RECENT RIDES (Latest 3 with View All) */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="receipt-outline" size={16} color="#0F172A" />
            <Text style={styles.sectionTitle}>Recent Rides</Text>
          </View>
          {recentTrips && recentTrips.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Trips')} activeOpacity={0.8}>
              <Text style={styles.viewAllText}>View All ({recentTrips.length}) →</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentTrips && recentTrips.length > 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            {recentTrips.slice(0, 3).map((ride, idx) => {
              const isCancelled = (ride.status || '').toLowerCase().includes('cancel')
              const fareAmt = Math.round(ride.final_fare || ride.fare || ride.original_fare || 0)
              return (
                <View key={ride.id || idx} style={styles.recentRideCard}>
                  <View style={styles.recentRideTop}>
                    <Text style={styles.recentRef}>{ride.booking_ref || `CTB#${ride.id}`}</Text>
                    <View style={[styles.recentStatusBadge, { backgroundColor: isCancelled ? '#FEE2E2' : '#DCFCE7' }]}>
                      <Text style={[styles.recentStatusText, { color: isCancelled ? '#DC2626' : '#15803D' }]}>
                        {isCancelled ? 'CANCELLED' : 'COMPLETED'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recentRoute}>
                    <View style={styles.recentRouteLine}>
                      <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.recentRouteText} numberOfLines={1}>{ride.pickup_address}</Text>
                    </View>
                    <View style={styles.recentRouteLine}>
                      <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.recentRouteText} numberOfLines={1}>{ride.dest_address}</Text>
                    </View>
                  </View>
                  <View style={styles.recentBottom}>
                    <Text style={styles.recentDate}>
                      🗓 {formatDateDisplay(ride.created_at || ride.pickup_date)} · {formatTime12Hr(ride.pickup_time || ride.created_at)}
                    </Text>
                    <Text style={styles.recentFare}>₹{fareAmt}</Text>
                  </View>
                </View>
              )
            })}

            {recentTrips.length > 3 && (
              <TouchableOpacity
                style={styles.moreReviewsBtn}
                onPress={() => navigation.navigate('Trips')}
                activeOpacity={0.85}
              >
                <Text style={styles.moreReviewsBtnText}>View All {recentTrips.length} Rides →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyRecentCard}>
            <Ionicons name="car-outline" size={28} color="#94A3B8" />
            <Text style={styles.emptyRecentTitle}>No rides yet today</Text>
            <Text style={styles.emptyRecentSub}>Go Online to receive incoming ride requests in your city</Text>
          </View>
        )}

        {/* 11. CUSTOMER REVIEWS FOR THIS DRIVER (Latest 3 with View All) */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="star" size={16} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Customer Reviews</Text>
            <View style={styles.dashRatingPill}>
              <Ionicons name="star" size={11} color="#F59E0B" />
              <Text style={styles.dashRatingPillText}>{driver?.rating || '5.0'}</Text>
            </View>
          </View>
          {driverReviews && driverReviews.length > 0 && (
            <TouchableOpacity
              onPress={() => navigation.navigate('DriverReviews', { reviews: driverReviews })}
              activeOpacity={0.8}
            >
              <Text style={styles.viewAllText}>View All ({driverReviews.length}) →</Text>
            </TouchableOpacity>
          )}
        </View>

        {driverReviews && driverReviews.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            {driverReviews.slice(0, 3).map((rev, idx) => {
              const stars = Math.min(5, Math.max(1, Math.round(Number(rev.rating) || 5)))
              return (
                <View key={rev.id || idx} style={styles.dashReviewCard}>
                  <View style={styles.dashReviewHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View style={styles.dashReviewAvatarWrap}>
                        {resolveAssetUrl(rev.reviewer_avatar) ? (
                          <Image source={{ uri: resolveAssetUrl(rev.reviewer_avatar) }} style={styles.dashReviewAvatarImg} />
                        ) : (
                          <Text style={styles.dashReviewAvatarText}>
                            {((rev.reviewer_name || 'C')?.[0] || 'C').toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dashReviewName} numberOfLines={1}>{rev.reviewer_name || 'Passenger'}</Text>
                        <Text style={styles.dashReviewRef}>{rev.booking_ref || `Trip #${rev.booking_id}`}</Text>
                      </View>
                    </View>
                    <View style={styles.dashStarPill}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.dashStarPillText}>{Number(rev.rating || 5).toFixed(1)}</Text>
                    </View>
                  </View>

                  {rev.comment ? (
                    <View style={styles.dashReviewCommentBox}>
                      <Text style={styles.dashReviewCommentText}>"{rev.comment}"</Text>
                    </View>
                  ) : (
                    <View style={styles.dashReviewCommentBox}>
                      <Text style={[styles.dashReviewCommentText, { fontStyle: 'italic', color: '#94A3B8' }]}>
                        Rated {rev.rating} stars for a smooth and safe journey
                      </Text>
                    </View>
                  )}

                  <View style={styles.dashReviewFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Ionicons
                          key={s}
                          name={s <= stars ? "star" : "star-outline"}
                          size={13}
                          color={s <= stars ? "#F59E0B" : "#CBD5E1"}
                        />
                      ))}
                    </View>
                    <Text style={styles.dashReviewDate}>
                      {rev.created_at ? formatDateDisplay(rev.created_at) : 'Recently'}
                    </Text>
                  </View>
                </View>
              )
            })}

            {driverReviews.length > 3 && (
              <TouchableOpacity
                style={styles.moreReviewsBtn}
                onPress={() => navigation.navigate('DriverReviews', { reviews: driverReviews })}
                activeOpacity={0.85}
              >
                <Text style={styles.moreReviewsBtnText}>View All {driverReviews.length} Reviews →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyReviewCard}>
            <Ionicons name="star-outline" size={26} color="#CBD5E1" />
            <Text style={styles.emptyReviewTitle}>No Customer Reviews Yet</Text>
            <Text style={styles.emptyReviewSub}>Completed rides with happy passengers will show ratings & feedback here</Text>
          </View>
        )}
      </ScrollView>

      {/* Customer & Trip Details Sheet Modal */}
      <Modal
        visible={Boolean(detailModalTrip)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalTrip(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Trip & Customer Details</Text>
              <TouchableOpacity onPress={() => setDetailModalTrip(null)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            {detailModalTrip && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetRefRow}>
                  <Text style={styles.sheetRefText}>{detailModalTrip.booking_ref}</Text>
                  <Text style={styles.sheetFareText}>₹{Math.round(detailModalTrip.final_fare || detailModalTrip.fare || detailModalTrip.fare_estimate || detailModalTrip.original_fare || 0)}</Text>
                </View>

                {/* Customer Info */}
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>CUSTOMER INFORMATION</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={styles.custAvatarWrap}>
                      {resolveAssetUrl(detailModalTrip.customer_avatar_url || detailModalTrip.customer_avatar) ? (
                        <Image source={{ uri: resolveAssetUrl(detailModalTrip.customer_avatar_url || detailModalTrip.customer_avatar) }} style={styles.custAvatarImg} />
                      ) : (
                        <Ionicons name="person" size={18} color={COLORS.primary} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.custName}>{detailModalTrip.customer_name || 'Passenger'}</Text>
                        <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                      </View>
                      {['trip_started', 'in_progress', 'completed'].includes(detailModalTrip.status) ? (
                        <Text style={styles.custPhone}>{detailModalTrip.customer_phone ? '🔒 Number Protected (Direct Call Enabled)' : '—'}</Text>
                      ) : (
                        <Text style={[styles.custPhone, { color: '#64748B', fontStyle: 'italic', fontSize: 11 }]}>🔒 Available once trip starts</Text>
                      )}
                    </View>
                  </View>
                  {['trip_started', 'in_progress', 'completed'].includes(detailModalTrip.status) && detailModalTrip.customer_phone ? (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <TouchableOpacity
                        style={[styles.sheetActionBtn, { backgroundColor: '#16A34A', borderColor: '#16A34A' }]}
                        onPress={() => Linking.openURL(`tel:${detailModalTrip.customer_phone}`)}
                      >
                        <Ionicons name="call" size={18} color="#FFFFFF" />
                        <Text style={[styles.sheetActionBtnText, { color: '#FFFFFF', fontWeight: '800' }]}>Call Passenger</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.sheetActionBtn}
                        onPress={() => Linking.openURL(`sms:${detailModalTrip.customer_phone}`)}
                      >
                        <Ionicons name="chatbubble" size={16} color={COLORS.primary} />
                        <Text style={styles.sheetActionBtnText}>Message</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 4 }}>
                      <Ionicons name="lock-closed" size={13} color="#64748B" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                        Contact details protected until trip starts
                      </Text>
                    </View>
                  )}
                </View>

                {/* GOGO Cabs Rich Trip Details Breakdown */}
                {(() => {
                  const pDet = parseAddressDetails(detailModalTrip.pickup_address, 'pickup')
                  const dDet = parseAddressDetails(detailModalTrip.dest_address, 'drop')
                  const dKm = detailModalTrip.distance_km ? parseFloat(detailModalTrip.distance_km).toFixed(2) : '151.82'
                  const pRate = detailModalTrip.per_km_rate ? Math.round(detailModalTrip.per_km_rate) : 21
                  const bataAmt = detailModalTrip.driver_bata || 500
                  const fareVal = Math.round(detailModalTrip.final_fare || detailModalTrip.fare || detailModalTrip.fare_estimate || detailModalTrip.original_fare || 0)
                  const cFee = parseFloat(detailModalTrip.commission_amount || (fareVal * 0.134) || 639).toFixed(2)
                  const vName = detailModalTrip.vehicle_type_name || detailModalTrip.vehicle_category_name || 'Innova'
                  const tStart = formatTripScheduleDate(detailModalTrip.pickup_date, detailModalTrip.pickup_time)
                  const tEnd = detailModalTrip.return_date ? formatTripScheduleDate(detailModalTrip.return_date, detailModalTrip.return_time) : 'Not Applicable'
                  const nText = detailModalTrip.notes || detailModalTrip.driver_instructions || 'Km 20/400/750/ toll CC GST'

                  return (
                    <View style={[styles.gogoTripCard, { marginHorizontal: 0, marginTop: 12 }]}>
                      {/* Connected Timeline Route */}
                      <View style={styles.gogoRouteContainer}>
                        <View style={styles.gogoTimelineRow}>
                          <View style={styles.gogoDotCol}>
                            <View style={styles.gogoDotGreen} />
                            <View style={styles.gogoVerticalLine} />
                          </View>
                          <View style={styles.gogoLocationContent}>
                            <Text style={styles.gogoFullAddressText} numberOfLines={3}>{pDet.full}</Text>
                            <View style={styles.gogoMainLocalityRow}>
                              <Text style={styles.gogoMainLocalityText}>{pDet.main}</Text>
                              <Text style={styles.gogoBadgePickup}> (Pickup)</Text>
                            </View>
                            <Text style={styles.gogoDistrictText}>District: {pDet.district}</Text>
                          </View>
                        </View>

                        <View style={styles.gogoTimelineRow}>
                          <View style={styles.gogoDotCol}>
                            <View style={styles.gogoDotRed} />
                          </View>
                          <View style={styles.gogoLocationContent}>
                            <Text style={styles.gogoFullAddressText} numberOfLines={3}>{dDet.full}</Text>
                            <View style={styles.gogoMainLocalityRow}>
                              <Text style={styles.gogoMainLocalityText}>{dDet.main}</Text>
                              <Text style={styles.gogoBadgeDrop}> (Drop)</Text>
                            </View>
                            <Text style={styles.gogoDistrictText}>District: {dDet.district}</Text>
                          </View>
                        </View>
                      </View>

                      {/* 3-Column Metrics Summary */}
                      <View style={styles.gogoThreeColRow}>
                        <View style={styles.gogoColItem}>
                          <Text style={styles.gogoColSymbol}>₹</Text>
                          <Text style={styles.gogoColPrimaryText}>Rs. {fareVal}</Text>
                        </View>
                        <View style={styles.gogoColDivider} />
                        <View style={[styles.gogoColItem, { flex: 1.2 }]}>
                          <Ionicons name="car" size={18} color={COLORS.primary} />
                          <Text style={styles.gogoColPrimaryText}>{vName} (AC)</Text>
                          <View style={styles.gogoFuelBadge}>
                            <Text style={styles.gogoFuelBadgeText}>⛽ Petrol/Diesel only</Text>
                          </View>
                        </View>
                        <View style={styles.gogoColDivider} />
                        <View style={styles.gogoColItem}>
                          <Ionicons name="navigate-outline" size={17} color="#10B981" />
                          <Text style={styles.gogoColPrimaryText}>{dKm} Km</Text>
                        </View>
                      </View>

                      {/* 2-Column Rates & Commission Breakdown */}
                      <View style={styles.gogoTwoColRow}>
                        <View style={styles.gogoRateCol}>
                          <Ionicons name="speedometer-outline" size={18} color={COLORS.primary} />
                          <Text style={styles.gogoRateText}>Rs.{pRate} per km / Bata - {bataAmt}</Text>
                        </View>
                        <View style={styles.gogoColDivider} />
                        <View style={styles.gogoCommCol}>
                          <View style={styles.gogoCommAmountRow}>
                            <Ionicons name="car-outline" size={16} color="#D97706" />
                            <Text style={styles.gogoCommAmountText}>Rs.{cFee}</Text>
                          </View>
                          <Text style={styles.gogoCommSubtext}>(Commission fee)</Text>
                        </View>
                      </View>

                      {/* Permit Charges Included */}
                      <View style={styles.gogoInclusionsRow}>
                        <Ionicons name="document-text" size={16} color="#0891B2" />
                        <Text style={styles.gogoInclusionsText}>Permit Charges Included</Text>
                      </View>

                      {/* Trip Start & End */}
                      <View style={styles.gogoScheduleBox}>
                        <View style={styles.gogoScheduleItem}>
                          <View style={styles.gogoScheduleLeft}>
                            <Ionicons name="calendar" size={16} color={COLORS.primary} />
                            <Text style={styles.gogoScheduleLabel}>Trip Start</Text>
                          </View>
                          <Text style={styles.gogoScheduleValue}>{tStart}</Text>
                        </View>
                        <View style={styles.gogoScheduleItem}>
                          <View style={styles.gogoScheduleLeft}>
                            <Ionicons name="calendar" size={16} color={COLORS.primary} />
                            <Text style={styles.gogoScheduleLabel}>Trip End</Text>
                          </View>
                          <Text style={styles.gogoScheduleValue}>{tEnd}</Text>
                        </View>
                      </View>

                      {/* Notes Accordion */}
                      <View style={styles.gogoNotesWrapper}>
                        <View style={styles.gogoNotesHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="document-text-outline" size={16} color="#1E40AF" />
                            <Text style={styles.gogoNotesHeaderText}>Trip Notes & Requirements</Text>
                          </View>
                          <Ionicons name="chevron-up" size={18} color="#1E40AF" />
                        </View>
                        <View style={styles.gogoNotesBody}>
                          {(() => {
                            const modalNotesList = getDeduplicatedNotes(nText, detailModalTrip?.status === 'driver_assigned')
                            return modalNotesList.length > 0 ? (
                              <View style={styles.proNotesGrid}>
                                {modalNotesList.map((item, idx) => (
                                  <View key={idx} style={styles.proNoteBadge}>
                                    <Text style={styles.proNoteBadgeText}>{item}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.proNotesEmptyText}>No special instructions</Text>
                            )
                          })()}
                        </View>
                      </View>
                    </View>
                  )
                })()}

                {/* Billing & Status */}
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>BILLING & STATUS</Text>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Estimated Distance</Text>
                    <Text style={styles.sheetValue}>{detailModalTrip.distance_km ? `${detailModalTrip.distance_km} KM` : '—'}</Text>
                  </View>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Payment Status</Text>
                    <Text style={[styles.sheetValue, { color: detailModalTrip.payment_status === 'paid' ? '#10B981' : '#F59E0B', fontWeight: '800' }]}>
                      {detailModalTrip.payment_status?.toUpperCase() || 'PENDING'}
                    </Text>
                  </View>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Payment Method</Text>
                    <Text style={[styles.sheetValue, { textTransform: 'uppercase' }]}>{detailModalTrip.payment_method || 'CASH'}</Text>
                  </View>
                </View>

                {/* Navigation Action */}
                <TouchableOpacity
                  style={styles.gpsNavBtn}
                  onPress={() => {
                    const lat = detailModalTrip.pickup_lat || 12.9716
                    const lng = detailModalTrip.pickup_lng || 77.5946
                    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
                  }}
                >
                  <Ionicons name="navigate" size={18} color={COLORS.white} />
                  <Text style={styles.gpsNavBtnText}>Open Google Maps Navigation</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Incoming Request Alert Modal - Premium Floating Booking Card */}
      <Modal
        visible={Boolean(activeIncoming)}
        animationType="slide"
        transparent={true}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'flex-end' }}>
          <View style={styles.incomingSheet}>
            <View style={styles.countdownBarContainer}>
              <View style={[styles.countdownFill, { width: `${(countdown / 30) * 100}%` }]} />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={styles.incomingBadge}>
                <Text style={styles.incomingBadgeText}>⚡ NEW RIDE REQUEST</Text>
              </View>
              <View style={styles.countdownBadge}>
                <Ionicons name="timer-outline" size={13} color="#DC2626" />
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
            </View>

            {/* Customer Info */}
            <View style={styles.incomingCustRow}>
              <View style={styles.incomingAvatarWrap}>
                {resolveAssetUrl(activeIncoming?.customer_avatar_url || activeIncoming?.customer_avatar) ? (
                  <Image source={{ uri: resolveAssetUrl(activeIncoming.customer_avatar_url || activeIncoming.customer_avatar) }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 16 }}>{((activeIncoming?.customer_name || 'C')?.[0] || 'C').toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.incomingCustName}>{activeIncoming?.customer_name || 'Customer'}</Text>
                  <View style={styles.custRatingPill}>
                    <Ionicons name="star" size={10} color="#F59E0B" />
                    <Text style={styles.custRatingText}>4.9</Text>
                  </View>
                </View>
                <Text style={styles.incomingPaymentText}>Payment: {activeIncoming?.payment_method?.toUpperCase() || 'CASH'}</Text>
              </View>
              <View style={styles.incomingTypePill}>
                <Text style={styles.incomingTypeText}>
                  {activeIncoming?.trip_type ? activeIncoming.trip_type.replace(/_/g, ' ').toUpperCase() : 'LOCAL TAXI'}
                </Text>
              </View>
            </View>

            {/* Fare & Metrics */}
            <View style={styles.incomingFareRow}>
              <View>
                <Text style={styles.incomingFareLabel}>ESTIMATED FARE</Text>
                <Text style={styles.incomingFare}>
                  ₹{Math.round(activeIncoming?.final_fare || activeIncoming?.fare || activeIncoming?.fare_estimate || activeIncoming?.original_fare || 0)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.incomingDistanceBadge}>
                  📍 {activeIncoming?.distance_km ? `${parseFloat(activeIncoming.distance_km).toFixed(1)} KM` : 'Local Distance'}
                </Text>
                <Text style={styles.incomingCategoryText}>
                  {activeIncoming?.vehicle_type?.toUpperCase() || 'SEDAN / HATCHBACK'}
                </Text>
              </View>
            </View>

            {/* Route */}
            <View style={styles.incomingRoute}>
              <View style={styles.routeItem}>
                <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.incomingRouteText} numberOfLines={2}>Pickup: {activeIncoming?.pickup_address}</Text>
              </View>
              <View style={styles.routeItem}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.incomingRouteText} numberOfLines={2}>Drop: {activeIncoming?.dest_address}</Text>
              </View>
            </View>

            {/* Strict Swipe to Accept & Decline Actions */}
            <View style={{ marginTop: 14, width: '100%' }}>
              <SwipeToActionButton
                title={`SWIPE TO ACCEPT (${countdown}s)`}
                icon="arrow-forward"
                trackBg="#16A34A"
                thumbBg="#FFFFFF"
                thumbIconColor="#15803D"
                isLoading={respondingPendingId === activeIncoming?.id}
                onSwipeComplete={() => handleAcceptInstantRide(activeIncoming.id)}
              />

              <TouchableOpacity
                style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                onPress={() => {
                  setRejectModalTrip(activeIncoming)
                  setRejectIsLongTrip(false)
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>Decline Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PROFESSIONAL ASSIGNED RIDE ALERT MODAL ── */}
      <Modal
        visible={Boolean(assignedAlertTrip)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {}}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'flex-end' }}>
          <View style={[styles.incomingSheet, { paddingBottom: Platform.OS === 'ios' ? 36 : 24 }]}>
            {/* Top Indicator */}
            <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 }} />

            {/* Header Badge & Title */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#FEF3C7',
                  borderWidth: 2,
                  borderColor: '#F59E0B',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Ionicons name="flash" size={20} color="#D97706" />
                </View>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', letterSpacing: 0.3 }}>
                    NEW RIDE ASSIGNED!
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
                    ⚡ Instant Dispatch · Action Required
                  </Text>
                </View>
              </View>

              <View style={{
                backgroundColor: '#DCFCE7',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#86EFAC',
              }}>
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#15803D' }}>
                  ADMIN DISPATCH
                </Text>
              </View>
            </View>

            {/* Passenger & Fare Spotlight Card */}
            <View style={{
              backgroundColor: '#0F172A',
              borderRadius: 20,
              padding: 16,
              marginBottom: 14,
              ...SHADOW.md,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                  }}>
                    <Ionicons name="person" size={22} color="#FDE047" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>
                      {assignedAlertTrip?.customer_name || 'Passenger'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="lock-closed" size={12} color="#FBBF24" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FCD34D' }}>
                        Number Protected
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Big Fare Display */}
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' }}>
                    Est. Fare
                  </Text>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: '#4ADE80' }}>
                    ₹{Math.round(assignedAlertTrip?.final_fare || assignedAlertTrip?.fare || assignedAlertTrip?.fare_estimate || 0)}
                  </Text>
                </View>
              </View>

              {/* Badges Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.1)' }}>
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#F1F5F9' }}>
                    💳 {assignedAlertTrip?.payment_method?.toUpperCase() || 'CASH'}
                  </Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#F1F5F9' }}>
                    📍 {assignedAlertTrip?.distance_km ? `${parseFloat(assignedAlertTrip.distance_km).toFixed(1)} km` : 'Local Ride'}
                  </Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#F1F5F9' }}>
                    🚗 {assignedAlertTrip?.vehicle_type_name || assignedAlertTrip?.vehicle_type || 'Taxi'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Extra Arrival Pickup Cash Notice (if applicable) */}
            {(() => {
              const extraKm = Number(assignedAlertTrip?.extra_pickup_distance_km || 0)
              const pickupDist = Number(assignedAlertTrip?.pickup_distance_km || 0)
              const pickupCash = Math.round(Number(assignedAlertTrip?.pickup_charge || 0))
              if (extraKm > 0 || pickupDist > 2.0) {
                const actualExtra = extraKm > 0 ? extraKm : Math.max(0, pickupDist - 2.0)
                const actualCash = pickupCash > 0 ? pickupCash : Math.round(actualExtra * 10)
                return (
                  <View style={{
                    backgroundColor: '#FEF3C7',
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 12,
                    borderWidth: 1.5,
                    borderColor: '#F59E0B',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                    <Ionicons name="cash" size={24} color="#D97706" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>
                        💰 Collect Extra Cash: ₹{actualCash}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: '#B45309', marginTop: 1 }}>
                        Pickup is {(pickupDist > 0 ? pickupDist : (2.0 + actualExtra)).toFixed(1)} km away ({actualExtra.toFixed(1)} km extra arrival distance)
                      </Text>
                    </View>
                  </View>
                )
              }
              return null
            })()}

            {/* Route Timeline Card */}
            <View style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 16,
              padding: 14,
              borderWidth: 1.5,
              borderColor: '#E2E8F0',
              marginBottom: 16,
            }}>
              {/* Pickup */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ alignItems: 'center', marginTop: 3 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2.5, borderColor: '#FFFFFF', elevation: 2 }} />
                  <View style={{ width: 2, height: 32, backgroundColor: '#CBD5E1', marginVertical: 3 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    PICKUP LOCATION
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 }} numberOfLines={2}>
                    {assignedAlertTrip?.pickup_address}
                  </Text>
                </View>
              </View>

              {/* Drop */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 }}>
                <View style={{ alignItems: 'center', marginTop: 3 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#EF4444', borderWidth: 2.5, borderColor: '#FFFFFF', elevation: 2 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    DESTINATION / DROP
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 }} numberOfLines={2}>
                    {assignedAlertTrip?.dest_address}
                  </Text>
                </View>
              </View>
            </View>

            {/* Rejection Notice Banner */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#F1F5F9',
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              marginBottom: 14,
            }}>
              <Ionicons name="information-circle-outline" size={15} color="#64748B" />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', flex: 1 }}>
                If declined, this ride will be immediately transferred to the next nearby driver.
              </Text>
            </View>

            {/* Professional Two-Action Buttons: Decline & Accept */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* Decline / Reject Button */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1.5,
                  borderColor: '#FCA5A5',
                  paddingVertical: 14,
                  borderRadius: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  ...SHADOW.small,
                }}
                onPress={() => {
                  const tripObj = assignedAlertTrip
                  const tripId = tripObj?.id
                  const isLt = Boolean(tripObj?.is_long_trip || tripObj?.long_trip_id)
                  setAssignedAlertTrip(null)
                  if (isLt) {
                    handleRejectAdminAssignedTrip(tripObj, 'Driver declined from assigned modal')
                  } else {
                    handleDeclineInstantRide(tripId, 'Driver declined from assigned modal')
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle" size={20} color="#DC2626" />
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#DC2626', letterSpacing: 0.3 }}>
                  DECLINE
                </Text>
              </TouchableOpacity>

              {/* Accept Ride Button */}
              <TouchableOpacity
                style={{
                  flex: 1.4,
                  backgroundColor: '#16A34A',
                  paddingVertical: 14,
                  borderRadius: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  elevation: 4,
                  shadowColor: '#16A34A',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 6,
                }}
                onPress={() => {
                  const tripToAccept = assignedAlertTrip
                  setAssignedAlertTrip(null)
                  if (tripToAccept) {
                    setActiveRide(tripToAccept)
                    locallyAcceptedTripIdsRef.current.add(tripToAccept.id)
                  }
                  if (tripToAccept?.is_long_trip || tripToAccept?.long_trip_id) {
                    handleAcceptAdminAssignedTrip(tripToAccept)
                  } else if (tripToAccept?.id) {
                    handleAcceptInstantRide(tripToAccept.id)
                  } else {
                    handleUpdateRideStatus('driver_accepted')
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>
                  ACCEPT RIDE
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject Reason Dialog Modal */}
      <Modal
        visible={Boolean(rejectModalTrip)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setRejectModalTrip(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Decline Trip Assignment</Text>
            <Text style={styles.dialogSub}>Please select a reason for declining:</Text>
            {REJECT_REASONS.map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.reasonOption, selectedReason === r && styles.reasonSelected]}
                onPress={() => setSelectedReason(r)}
              >
                <Ionicons
                  name={selectedReason === r ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={selectedReason === r ? COLORS.primary : COLORS.gray400}
                />
                <Text style={styles.reasonText}>{r}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setRejectModalTrip(null)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogConfirmBtn}
                onPress={() => {
                  if (rejectIsLongTrip) {
                    handleRejectAdminAssignedTrip(rejectModalTrip, selectedReason)
                  } else {
                    handleDeclineInstantRide(rejectModalTrip.id, selectedReason)
                  }
                }}
              >
                <Text style={styles.dialogConfirmText}>Confirm Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Normal Trip Start OTP Modal */}
      <Modal
        visible={otpModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setOtpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogCard}>
            <View style={styles.otpIconCircle}>
              <Ionicons name="key" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.dialogTitle}>Enter Ride Start OTP</Text>
            <Text style={styles.dialogSub}>Ask the customer for the start OTP (4 or 6 digits) from their ticket / app:</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="••••••"
              placeholderTextColor="#CBD5E1"
              value={enteredOtp}
              onChangeText={setEnteredOtp}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              autoFocus={true}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setOtpModalVisible(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, verifyingOtp && { opacity: 0.7 }]}
                onPress={handleVerifyStartOtp}
                disabled={verifyingOtp}
              >
                {verifyingOtp ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.dialogConfirmText}>Start Trip 🚀</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Passenger Boarding OTP Modal (Shared Trips) */}
      <Modal
        visible={Boolean(passOtpModal)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPassOtpModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogCard}>
            <View style={[styles.otpIconCircle, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="shield-checkmark" size={28} color="#7C3AED" />
            </View>
            <Text style={styles.dialogTitle}>Verify Passenger Boarding</Text>
            <Text style={styles.dialogSub}>
              Enter boarding OTP (4 or 6 digits) for <Text style={{ fontWeight: '800', color: COLORS.textPrimary }}>{passOtpModal?.customer_name}</Text> ({passOtpModal?.seat_no}):
            </Text>
            <TextInput
              style={[styles.otpInput, { borderColor: '#7C3AED', color: '#7C3AED' }]}
              placeholder="••••••"
              placeholderTextColor="#CBD5E1"
              value={passEnteredOtp}
              onChangeText={setPassEnteredOtp}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              autoFocus={true}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setPassOtpModal(null)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, { backgroundColor: '#7C3AED' }, verifyingPassOtp && { opacity: 0.7 }]}
                onPress={handleVerifyPassengerOtp}
                disabled={verifyingPassOtp}
              >
                {verifyingPassOtp ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.dialogConfirmText}>Confirm Boarded ✓</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Professional Ride Cancelled by Customer Alert Modal ── */}
      <Modal
        visible={Boolean(cancelledNotice) && isFocused}
        animationType="fade"
        transparent={true}
        onRequestClose={handleDismissCancelledNotice}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 22,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 18,
            borderWidth: 1.5,
            borderColor: '#FCA5A5',
          }}>
            <View style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: '#FEE2E2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              borderWidth: 3,
              borderColor: '#FECACA',
            }}>
              <Ionicons name="close-circle" size={44} color="#DC2626" />
            </View>

            <View style={{
              backgroundColor: '#FEF2F2',
              borderColor: '#FCA5A5',
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 20,
              marginBottom: 8,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#B91C1C', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                RIDE CANCELLED BY CUSTOMER
              </Text>
            </View>

            <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 4 }}>
              Ride Has Been Cancelled
            </Text>

            <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '800', textAlign: 'center', marginBottom: 6 }}>
              {cancelledNotice?.customerName ? `Customer "${cancelledNotice.customerName}" cancelled this ride.` : 'Customer has cancelled this booking.'}
            </Text>

            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 14 }}>
              Booking Ref: <Text style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0F172A' }}>{cancelledNotice?.bookingRef || 'CTB'}</Text>
            </Text>

            {/* Route Box */}
            <View style={{
              width: '100%',
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              marginBottom: 12,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="navigate-circle" size={16} color="#10B981" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                  {cancelledNotice?.pickup || 'Pickup location'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="location" size={16} color="#EF4444" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                  {cancelledNotice?.dest || 'Destination'}
                </Text>
              </View>
            </View>

            {/* Reason Box */}
            {cancelledNotice?.reason ? (
              <View style={{
                width: '100%',
                backgroundColor: '#FFFBEB',
                borderRadius: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: '#FDE68A',
                marginBottom: 12,
              }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#92400E', marginBottom: 2 }}>
                  Cancellation Reason:
                </Text>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#78350F' }}>
                  "{cancelledNotice.reason}"
                </Text>
              </View>
            ) : null}

            {/* Driver Reassurance Banner */}
            <View style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#F0FDF4',
              borderRadius: 12,
              padding: 10,
              borderWidth: 1,
              borderColor: '#BBF7D0',
              marginBottom: 18,
            }}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534', flex: 1 }}>
                You are Online & Available. New ride requests will appear automatically.
              </Text>
            </View>

            {/* Got It Button */}
            <TouchableOpacity
              style={{
                width: '100%',
                backgroundColor: COLORS.primary || '#FBBF24',
                paddingVertical: 14,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                ...SHADOW.small,
              }}
              onPress={handleDismissCancelledNotice}
              activeOpacity={0.88}
            >
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#000000' }}>
                Got It · Ready for New Rides 🚕
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Customer Profile Modal Sheet ── */}
      <Modal
        visible={showCustomerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomerModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.72)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 16,
            borderWidth: 1.5,
            borderColor: '#E2E8F0',
          }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="person-circle" size={24} color="#2563EB" />
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F172A' }}>Customer Profile</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCustomerModal(false)}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Profile Avatar & Name */}
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: '#FEF3C7',
                borderWidth: 3,
                borderColor: '#F59E0B',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                marginBottom: 10,
              }}>
                <Text style={{ fontSize: 30, fontWeight: '900', color: '#B45309' }}>
                  {((activeRide?.customer_name || 'R')?.[0] || 'R').toUpperCase()}
                </Text>
                {(!custAvatarError && resolveAssetUrl(activeRide?.customer_avatar_url || activeRide?.customer_avatar)) ? (
                  <Image
                    source={{ uri: resolveAssetUrl(activeRide?.customer_avatar_url || activeRide?.customer_avatar) }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
                    resizeMode="cover"
                    onError={() => setCustAvatarError(true)}
                  />
                ) : null}
              </View>
              <Text style={{ fontSize: 19, fontWeight: '900', color: '#0F172A' }}>
                {activeRide?.customer_name || 'Passenger'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D' }}>✓ Verified Customer</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#B45309' }}>5.0</Text>
                </View>
              </View>
            </View>

            {/* Contact & Booking Details */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Phone Number</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#2563EB' }}>{activeRide?.customer_phone || 'Not available'}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Payment Mode</Text>
                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>{activeRide?.payment_method?.toUpperCase() || 'CASH'}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Booked Fare</Text>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#059669' }}>₹{Math.round(activeRide?.final_fare || activeRide?.fare || activeRide?.original_fare || activeRide?.fare_estimate || 219)}</Text>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 3 }}>Pickup Location</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B', lineHeight: 16 }} numberOfLines={2}>
                  {activeRide?.pickup_address || 'Pickup Address'}
                </Text>
              </View>
            </View>

            {/* Quick Actions Row */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                onPress={() => {
                  Linking.openURL(`tel:${activeRide?.customer_phone}`)
                  setShowCustomerModal(false)
                }}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Call Rider</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                onPress={() => {
                  Linking.openURL(`sms:${activeRide?.customer_phone}`)
                  setShowCustomerModal(false)
                }}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Complete Trip & Final Distance Modal ── */}
      <Modal
        visible={completeTripModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !isSubmittingComplete && setCompleteTripModalVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.72)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 24,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 420,
            maxHeight: '92%',
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            paddingTop: 18,
            paddingHorizontal: 18,
            paddingBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.3,
            shadowRadius: 24,
            elevation: 20,
            borderWidth: 1.5,
            borderColor: '#E2E8F0',
          }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
              {/* Header with Title and Close Button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#A7F3D0' }}>
                    <Ionicons name="checkmark-done" size={24} color="#10B981" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: '#0F172A' }}>Complete Trip & Final Bill</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309', backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>🚖 CityOne Taxi</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>#{activeRide?.booking_ref || ''}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => !isSubmittingComplete && setCompleteTripModalVisible(false)}
                  disabled={isSubmittingComplete}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Trip Subtype Badge */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 12 }}>
                <View style={{ backgroundColor: activeRide?.trip_sub_type === 'hourly' ? '#EFF6FF' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: activeRide?.trip_sub_type === 'hourly' ? '#BFDBFE' : '#FDE68A' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: activeRide?.trip_sub_type === 'hourly' ? '#1D4ED8' : '#B45309' }}>
                    {activeRide?.trip_sub_type === 'hourly' ? `⏱️ Hourly Rental (${activeRide.package_hours || 1} hrs)` : `🚗 ${activeRide?.trip_type === 'round_trip' ? 'Round Trip' : 'Drop Taxi / Point-to-Point'}`}
                  </Text>
                </View>
              </View>

              {/* Automated GPS Live Odometer Card (No Manual Input Required) */}
              {(() => {
                const origKm = Number(activeRide?.original_distance_km || activeRide?.distance_km || 0)
                const trackedKm = Number(tripGpsAccumulatedKmRef.current > 0 ? tripGpsAccumulatedKmRef.current.toFixed(2) : tripGpsTrackedDistanceKm || 0)
                const finalKm = parseFloat(enteredActualDistance) || Math.max(origKm, trackedKm)
                const extraKm = Math.max(0, finalKm - origKm)
                const hasExtra = extraKm > 0.05

                return (
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="navigate-circle" size={18} color="#2563EB" />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', letterSpacing: 0.3 }}>
                            AUTOMATED GPS ODOMETER
                          </Text>
                        </View>
                        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' }} />
                          <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#15803D' }}>GPS LIVE SYNC</Text>
                        </View>
                      </View>

                      {/* 2-Column Route vs Traveled Distance */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#CBD5E1' }}>
                          <Text style={{ fontSize: 9.5, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Booked Route</Text>
                          <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', marginTop: 2 }}>
                            {origKm.toFixed(1)} <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>KM</Text>
                          </Text>
                          <Text style={{ fontSize: 9.5, color: '#16A34A', fontWeight: '600', marginTop: 2 }}>Agreed Base Fare</Text>
                        </View>

                        <View style={{ flex: 1, backgroundColor: hasExtra ? '#FEF2F2' : '#F0FDF4', borderRadius: 10, padding: 10, borderWidth: 1.5, borderColor: hasExtra ? '#F87171' : '#86EFAC' }}>
                          <Text style={{ fontSize: 9.5, color: hasExtra ? '#991B1B' : '#166534', fontWeight: '700', textTransform: 'uppercase' }}>GPS Traveled</Text>
                          <Text style={{ fontSize: 17, fontWeight: '900', color: hasExtra ? '#DC2626' : '#15803D', marginTop: 2 }}>
                            {finalKm.toFixed(1)} <Text style={{ fontSize: 11, fontWeight: '700', color: hasExtra ? '#DC2626' : '#15803D' }}>KM</Text>
                          </Text>
                          <Text style={{ fontSize: 9.5, color: hasExtra ? '#B91C1C' : '#15803D', fontWeight: '700', marginTop: 2 }}>
                            {hasExtra ? `+${extraKm.toFixed(1)} KM Extra Detour` : `✓ On Booked Route`}
                          </Text>
                        </View>
                      </View>

                      {/* Note for transparency */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
                        <Ionicons name="information-circle" size={14} color="#64748B" style={{ marginTop: 1 }} />
                        <Text style={{ fontSize: 10.5, color: '#64748B', flex: 1, lineHeight: 14 }}>
                          {hasExtra
                            ? `GPS detected extra ${extraKm.toFixed(1)} KM traveled beyond booked route. Extra KM fare is added below.`
                            : `Ride completed on normal route. Customer is billed standard booking fare.`}
                        </Text>
                      </View>
                    </View>
                  </View>
                )
              })()}

              {/* Toll / Parking / Extra Plaza Charges Input Card */}
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="card-outline" size={15} color="#2563EB" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B' }}>Toll / Parking Charges (Optional)</Text>
                  </View>
                  <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#1E40AF' }}>FASTAG / CASH</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, height: 40 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#334155', marginRight: 6 }}>₹</Text>
                  <TextInput
                    value={enteredTollCharge}
                    onChangeText={setEnteredTollCharge}
                    placeholder="0 (Enter toll/parking amount if any)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#0F172A', paddingVertical: 0 }}
                  />
                  {Boolean(enteredTollCharge) && (
                    <TouchableOpacity onPress={() => setEnteredTollCharge('')}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
                  Added to customer bill and printed on the CityOne Taxi official invoice.
                </Text>
              </View>

              {/* Live Fare Calculation Breakdown */}
              {(() => {
                const origKm = Number(activeRide?.original_distance_km || activeRide?.distance_km || 0)
                const enteredKm = parseFloat(enteredActualDistance) || origKm
                const isHourly = activeRide?.trip_sub_type === 'hourly' || Number(activeRide?.package_hours) > 0
                const pkgHours = Number(activeRide?.package_hours) || 1
                const includedKm = isHourly ? (pkgHours * (Number(activeRide?.hourly_package_km) || 10)) : origKm
                const extraKm = Math.max(0, enteredKm - includedKm)
                const perKmRate = Number(activeRide?.extra_km_rate || activeRide?.per_km_rate || 15)
                const extraKmFare = Math.round(extraKm * perKmRate)

                // Overtime for hourly
                let extraMins = Number(activeRide?.extra_mins || 0)
                let extraMinFare = Number(activeRide?.extra_min_fare || 0)
                if (isHourly && activeRide?.started_at) {
                  const startSec = Math.floor(new Date(activeRide.started_at).getTime() / 1000)
                  const nowSec = Math.floor(Date.now() / 1000)
                  const elapsedMins = Math.max(0, Math.floor((nowSec - startSec) / 60))
                  const pkgMins = pkgHours * 60
                  extraMins = Math.max(0, elapsedMins - pkgMins)
                  const minRate = Number(activeRide?.extra_min_rate || 2)
                  extraMinFare = Math.round(extraMins * minRate)
                }

                // Robust Base Fare fallback checking final_fare, fare, original_fare, fare_estimate, estimated_fare
                let rawBaseFare = Number(
                  activeRide?.base_package_fare ||
                  (isHourly
                    ? (pkgHours * Number(activeRide?.hourly_rate || 250))
                    : (activeRide?.final_fare || activeRide?.fare || activeRide?.original_fare || activeRide?.fare_estimate || activeRide?.estimated_fare || activeRide?.total_fare || 0))
                )
                if (rawBaseFare <= 0) {
                  const minFare = Number(activeRide?.minimum_fare || activeRide?.min_fare || 50)
                  const bFare = Number(activeRide?.base_fare || 30)
                  rawBaseFare = Math.max(minFare, Math.round(bFare + (origKm * perKmRate)))
                }
                const baseFare = rawBaseFare

                const tollCharge = parseFloat(enteredTollCharge) || 0
                const waitCharge = Number(activeRide?.waiting_charge || 0)
                const waitMins = Number(activeRide?.waiting_mins || 0)
                const pickupCharge = (activeRide?.pickup_charge_accepted && activeRide?.pickup_charge) ? Number(activeRide.pickup_charge) : 0
                const onlinePaid = Number(activeRide?.online_paid || 0)
                const discount = Number(activeRide?.discount_amount || 0)
                const totalFinal = Math.max(0, Math.round(baseFare + extraKmFare + extraMinFare + waitCharge + pickupCharge + tollCharge - discount))
                const cashToCollect = Math.max(0, Math.round(totalFinal - onlinePaid))

                return (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 14 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534', marginBottom: 8, letterSpacing: 0.5 }}>
                      FINAL INVOICE PREVIEW
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#374151' }}>
                        {isHourly ? `Base Package (${pkgHours} hrs / ${includedKm} km)` : `Booked Route (${origKm.toFixed(1)} km)`}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>₹{Math.round(baseFare)}</Text>
                    </View>

                    {isHourly && extraMins > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#D97706' }}>
                          Overtime ({extraMins} mins @ ₹{activeRide?.extra_min_rate || 2}/m)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>+ ₹{extraMinFare}</Text>
                      </View>
                    )}

                    {extraKm > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#D97706' }}>
                          Extra Distance ({extraKm.toFixed(1)} km @ ₹{perKmRate}/km)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>+ ₹{extraKmFare}</Text>
                      </View>
                    )}

                    {waitCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '600' }}>
                          Waiting Charges ({waitMins} mins)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>+ ₹{Math.round(waitCharge)}</Text>
                      </View>
                    )}

                    {tollCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>
                          Toll / Parking Charges
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>+ ₹{Math.round(tollCharge)}</Text>
                      </View>
                    )}

                    {pickupCharge > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#7C3AED' }}>
                          Pickup Charge ({activeRide?.extra_pickup_distance_km || 0} km extra)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>+ ₹{Math.round(pickupCharge)}</Text>
                      </View>
                    )}

                    {discount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#059669' }}>Coupon Discount</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>- ₹{Math.round(discount)}</Text>
                      </View>
                    )}

                    <View style={{ height: 1, backgroundColor: '#A7F3D0', marginVertical: 6 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>Total Trip Bill</Text>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#111827' }}>₹{totalFinal}</Text>
                    </View>

                    {onlinePaid > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#2563EB' }}>Already Paid Online</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>- ₹{Math.round(onlinePaid)}</Text>
                      </View>
                    )}

                    <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>Collect Cash from Customer:</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#B45309' }}>₹{cashToCollect}</Text>
                    </View>
                  </View>
                )
              })()}

              {/* Swipe to Complete & Settle Action */}
              <View style={{ marginTop: 8, width: '100%' }}>
                <SwipeToActionButton
                  title="SWIPE TO COMPLETE & SETTLE"
                  icon="checkmark-done"
                  trackBg="#10B981"
                  thumbBg="#FFFFFF"
                  thumbIconColor="#059669"
                  isLoading={isSubmittingComplete}
                  onSwipeComplete={handleConfirmCompleteTrip}
                />
                <TouchableOpacity
                  style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                  onPress={() => setCompleteTripModalVisible(false)}
                  disabled={isSubmittingComplete}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray600 }}>Cancel / Go Back</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Vehicle Details Modal Sheet (Quick Action) ── */}
      <Modal
        visible={vehicleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVehicleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailSheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="car-sport" size={20} color={COLORS.primary} />
                <Text style={styles.sheetTitle}>Vehicle & Registration</Text>
              </View>
              <TouchableOpacity onPress={() => setVehicleModalVisible(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Vehicle Badge Hero */}
              <View style={styles.vehicleModalHero}>
                <View style={styles.vehicleIconCircle}>
                  <Ionicons name="car" size={32} color="#4F46E5" />
                </View>
                <Text style={styles.vehicleHeroTitle}>
                  {driver?.make || 'Toyota'} {driver?.model || 'Etios'}
                </Text>
                <View style={styles.vehiclePlatePill}>
                  <Text style={styles.vehiclePlateText}>{driver?.plate_no || 'TN-01-AB-1234'}</Text>
                </View>
              </View>

              {/* Specs & Status Table */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>VEHICLE SPECIFICATIONS</Text>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Vehicle Type</Text>
                  <Text style={styles.sheetValue}>{driver?.vehicle_type || 'Cab'}</Text>
                </View>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Color</Text>
                  <Text style={styles.sheetValue}>{driver?.color || 'White'}</Text>
                </View>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Commercial Registration</Text>
                  <Text style={[styles.sheetValue, { color: '#10B981', fontWeight: '800' }]}>Approved & Verified ✓</Text>
                </View>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetLabel}>Operating Territory</Text>
                  <Text style={styles.sheetValue}>{currentCity || 'Tamil Nadu'}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: COLORS.primary, marginTop: 12 }]}
                onPress={() => setVehicleModalVisible(false)}
              >
                <Text style={[styles.primaryActionText, { color: '#0F172A', fontWeight: '900' }]}>Close Details</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...SHADOW.small,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
  },
  avatarStatusPip: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  vehicleText: {
    fontSize: 11,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  headerOnlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  headerOnlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerOnlineText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  notifBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Telemetry Card */
  telemetryCard: {
    backgroundColor: '#0F172A',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    ...SHADOW.medium,
  },
  telemetryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBeacon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBeaconInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  telemetryCardTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  telemetryCardSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    lineHeight: 15,
  },
  bigDutyBtnOffline: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginTop: 14,
    elevation: 4,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  bigDutyBtnOnline: {
    backgroundColor: '#064E3B',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 14,
    elevation: 3,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  bigDutyBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dutyOfflineIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dutyOnlinePulseCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#34D399',
  },
  bigDutyBtnTextOffline: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  bigDutyBtnSubOffline: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },
  bigDutyBtnTextOnline: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#34D399',
    letterSpacing: 0.4,
  },
  bigDutyBtnSubOnline: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 1,
  },
  bigDutyBtnTextMain: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dutyGoOnlineBadge: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  dutyGoOnlineBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#15803D',
  },
  dutyGoOfflineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  dutyGoOfflineBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F87171',
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  telemetryPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  telemetryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  telemetryPillText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  telemetryServicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  telemetryServicesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serviceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  serviceTagText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  serviceConfigurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  /* Today's Summary Card */
  todaySummaryCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  todaySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  todayIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todaySummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  todayGrossText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  targetProgressContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gray600,
  },
  percentBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  percentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: '#E2E8F0',
    borderRadius: 3.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3.5,
  },
  targetSubText: {
    fontSize: 10,
    color: COLORS.gray500,
    fontWeight: '600',
    marginTop: 6,
  },
  todayMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  todayMetricBox: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  todayMetricVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  todayMetricLbl: {
    fontSize: 9.5,
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: 1,
  },
  /* Live Ride Summary Card */
  liveRideSummaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  liveRideCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveRideAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  liveRideAvatarText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#D97706',
  },
  liveRideCustomerName: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  livePaymentPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  livePaymentText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
  },
  liveDistanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  liveRoutePreview: {
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: RADIUS.md,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  resumeTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  resumeTripBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  pendingBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#7C3AED',
  },
  assignedTripCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: RADIUS.xxl,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    ...SHADOW.small,
  },
  assignedCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bookingRef: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  assignedMetaText: {
    fontSize: 11,
    color: COLORS.gray600,
    fontWeight: '600',
    marginTop: 2,
  },
  assignedFareText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  countdownPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  countdownPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  assignedCustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
  },
  custAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  custAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  custName: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  vehiclePillText: {
    fontSize: 11,
    color: COLORS.gray500,
  },
  chatSmallBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callSmallBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: RADIUS.lg,
    gap: 6,
    marginBottom: 12,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 4,
  },
  routeText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.gray700,
    fontWeight: '600',
    lineHeight: 16,
  },
  assignedActionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: '#FEF3C7',
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  rejectAssignedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: '#FEE2E2',
  },
  rejectAssignedText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.error,
  },
  acceptAssignedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: '#10B981',
    ...SHADOW.small,
  },
  acceptAssignedText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.white,
  },
  activeCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.medium,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripTypeBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.gray500,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: RADIUS.lg,
    marginBottom: 12,
  },
  custPhone: {
    fontSize: 11,
    color: COLORS.gray500,
  },
  sharedManifestContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.xl,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  manifestTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
  boardingCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  boardingCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sharedPassCard: {
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: RADIUS.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  sharedPassCardBoarded: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  seatPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  seatPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
  },
  manifestPassName: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  manifestSubAddr: {
    fontSize: 11,
    color: COLORS.gray500,
    marginTop: 1,
  },
  boardedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  boardedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  verifyOtpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    ...SHADOW.small,
  },
  verifyOtpBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
  },
  passContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  passContactText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  gpsNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.xl,
    gap: 8,
    marginBottom: 8,
  },
  gpsNavBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: RADIUS.xl,
    ...SHADOW.small,
  },
  primaryActionText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  journeyLockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: RADIUS.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  journeyLockText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  upcomingCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  upcomingDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  schedAddr: {
    fontSize: 11,
    color: COLORS.gray600,
    lineHeight: 16,
    marginBottom: 2,
  },
  upcomingBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  upcomingFare: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  schedStartBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  schedStartBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.white,
  },
  /* Quick Actions Grid */
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  quickTile: {
    width: '23%',
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  /* 7-Day Performance Weekly Bar Chart */
  performanceCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  chartTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  chartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
  },
  chartPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  chartBarsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 90,
    paddingBottom: 4,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBarVal: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.gray500,
    marginBottom: 4,
  },
  chartBarTrack: {
    width: 22,
    height: 60,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 6,
  },
  chartBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.gray500,
    marginTop: 6,
  },
  chartBarLabelActive: {
    color: '#F59E0B',
    fontWeight: '900',
  },
  perfStatsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  perfStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  perfStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  perfStatDividerV: {
    width: 1,
    height: 28,
    backgroundColor: '#F1F5F9',
  },
  perfStatVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  perfStatLbl: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: 2,
  },
  /* Recent Rides */
  recentRideCard: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    ...SHADOW.small,
  },
  recentRideTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentRef: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  recentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recentStatusText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  recentRoute: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: RADIUS.md,
    gap: 4,
    marginBottom: 8,
  },
  recentRouteLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentRouteText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  recentBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentDate: {
    fontSize: 10.5,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  recentFare: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  emptyRecentCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    padding: 24,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.small,
  },
  emptyRecentTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  emptyRecentSub: {
    fontSize: 11,
    color: COLORS.gray500,
    marginTop: 2,
    textAlign: 'center',
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  /* Vehicle Details Modal Sheet */
  vehicleModalHero: {
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.xl,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  vehicleIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  vehicleHeroTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  vehiclePlatePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  vehiclePlateText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetRefText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  sheetFareText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  sheetSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 12,
    marginBottom: 10,
  },
  sheetSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.gray500,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sheetActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  sheetActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  sheetLabel: {
    fontSize: 12,
    color: COLORS.gray600,
  },
  sheetValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  incomingSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  countdownBarContainer: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  countdownFill: {
    height: '100%',
    backgroundColor: '#EF4444',
  },
  incomingBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  incomingBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#DC2626',
  },
  incomingFare: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  incomingCategory: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray500,
    marginBottom: 14,
  },
  incomingRoute: {
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: RADIUS.lg,
    gap: 8,
    marginBottom: 20,
  },
  incomingRouteText: {
    fontSize: 13,
    color: COLORS.gray700,
    fontWeight: '600',
  },
  incomingBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: RADIUS.xl,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.gray700,
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: RADIUS.xl,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.medium,
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.white,
  },
  dialogCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: RADIUS.xxl,
    padding: 24,
    ...SHADOW.large,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  dialogSub: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: 16,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  reasonSelected: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dialogCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  dialogConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
  otpIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  otpInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 8,
  },

  /* Trip Status Timeline */
  tripTimelineCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tripTimelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineStep: {
    alignItems: 'center',
    gap: 4,
  },
  timelineNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineNodeDone: {
    backgroundColor: '#10B981',
  },
  timelineNodePending: {
    backgroundColor: '#E2E8F0',
  },
  timelineNodeInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  timelineNodeLabelActive: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  timelineNodeLabelPending: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  timelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    marginBottom: 14,
  },
  timelineLineDone: {
    backgroundColor: '#10B981',
  },

  /* Incoming Sheet Additional Elements */
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  incomingCustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  incomingAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC700',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  incomingCustName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  custRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  custRatingText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#92400E',
  },
  incomingPaymentText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  incomingTypePill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  incomingTypeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.3,
  },
  incomingFareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  incomingFareLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  incomingDistanceBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  incomingCategoryText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  /* ── CITYONETAXI HERO BRAND HEADER ── */
  heroContainer: {
    backgroundColor: '#FFC700',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 22,
    position: 'relative',
    overflow: 'visible',
  },
  headerMapLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.16,
  },
  mapGridLine1: {
    position: 'absolute',
    top: 20,
    left: -40,
    width: SCREEN_WIDTH + 80,
    height: 18,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-12deg' }],
  },
  mapGridLine2: {
    position: 'absolute',
    top: 70,
    left: -20,
    width: SCREEN_WIDTH + 40,
    height: 14,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '18deg' }],
  },
  mapGridLine3: {
    position: 'absolute',
    bottom: 6,
    left: -50,
    width: SCREEN_WIDTH + 100,
    height: 20,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-6deg' }],
  },
  mapGridBox1: {
    position: 'absolute',
    top: 30,
    right: 50,
    width: 50,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 3,
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taxiBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 199, 0, 0.4)',
  },
  taxiBadgeText: {
    color: '#FFC700',
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  driverTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  driverTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  heroRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...SHADOW.small,
  },
  notifBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#DC2626',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  notifBadgeDotText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  heroAvatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    position: 'relative',
    ...SHADOW.small,
  },
  heroAvatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  heroAvatarInitial: {
    color: '#FFC700',
    fontSize: 15,
    fontWeight: '900',
  },
  heroOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  heroTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  heroGreeting: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  heroHeadline: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '700',
    marginTop: 1,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0F172A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroRatingText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFC700',
  },
  heroVehicleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  heroCarGraphicWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniCarBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── GOGO Cabs Driver Assigned Ride Card Styles ──
  gogoTripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginVertical: 10,
    ...SHADOW.medium,
  },
  gogoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  gogoRefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gogoRefText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  gogoRouteContainer: {
    position: 'relative',
    marginVertical: 4,
  },
  gogoTimelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gogoDotCol: {
    width: 22,
    alignItems: 'center',
    paddingTop: 4,
  },
  gogoDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16A34A',
  },
  gogoDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  gogoVerticalLine: {
    width: 2,
    height: 46,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  gogoLocationContent: {
    flex: 1,
    paddingLeft: 6,
    paddingBottom: 12,
  },
  gogoFullAddressText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  gogoMainLocalityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  gogoMainLocalityText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  gogoBadgePickup: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
    marginLeft: 4,
  },
  gogoBadgeDrop: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
    marginLeft: 4,
  },
  gogoDistrictText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  gogoThreeColRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 6,
  },
  gogoColItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gogoColDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E2E8F0',
  },
  gogoColSymbol: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primary,
  },
  gogoColPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  gogoFuelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 0.8,
    borderColor: '#DBEAFE',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    marginTop: 3,
  },
  gogoFuelBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  gogoTwoColRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  gogoRateCol: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  gogoRateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flexShrink: 1,
  },
  gogoCommCol: {
    flex: 0.85,
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  gogoCommAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gogoCommAmountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  gogoCommSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  gogoInclusionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  gogoInclusionsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  gogoScheduleBox: {
    gap: 8,
    paddingVertical: 2,
  },
  gogoScheduleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gogoScheduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gogoScheduleLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  gogoScheduleValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  gogoRechargeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  gogoRechargeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  gogoRechargeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#78350F',
    flexShrink: 1,
  },
  gogoAddMoneyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    ...SHADOW.small,
  },
  gogoAddMoneyBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  gogoAcceptBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    ...SHADOW.small,
  },
  gogoAcceptBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  gogoDeclineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
  },
  gogoDeclineLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gogoDeclineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  gogoDetailsLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gogoDetailsLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  gogoNotesWrapper: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  gogoNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gogoNotesHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  gogoNotesBody: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#DBEAFE',
  },
  gogoNotesContentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 18,
  },
  proNotesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  proNoteBadge: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  proNoteBadgeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 18,
  },
  proNotesEmptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    fontStyle: 'italic',
  },
  gogoNavBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    ...SHADOW.small,
  },
  gogoNavBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  gogoCustomerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  gogoCustAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gogoCustAvatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B45309',
  },
  gogoCustName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  gogoCustMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  gogoProtectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  gogoProtectedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  gogoPaymentPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  gogoPaymentText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  gogoCustBigCallBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  gogoCustomerBarLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    gap: 12,
  },
  gogoCustAvatarLocked: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  gogoCustSubLocked: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 2,
  },
  idleStandbyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  idleStandbyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  idleStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  idleStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  idleStandbyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  idleStandbySub: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  dashRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dashRatingPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  dashReviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dashReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dashReviewAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dashReviewAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  dashReviewAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309',
  },
  dashReviewName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  dashReviewRef: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  dashStarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dashStarPillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },
  dashReviewCommentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  dashReviewCommentText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 18,
  },
  dashReviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dashReviewDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  emptyReviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyReviewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyReviewSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
  moreReviewsBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    ...SHADOW.small,
  },
  moreReviewsBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
})

export default DriverHomeScreen
