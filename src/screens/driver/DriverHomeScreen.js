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
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { driverAPI, adsAPI, longTripAPI, notifAPI, uploadAPI, settingsAPI, createUploadFormData, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'

// Module-level persistent cache of dismissed cancelled trip IDs (guarantees alert shows exactly ONCE across screens/tabs)
const acknowledgedCancelledTripIds = new Set()
const { width: SCREEN_WIDTH } = Dimensions.get('window')
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import AdCarousel from '../../components/ui/AdCarousel'
import LiveTripMap from '../../components/common/LiveTripMap'
import { formatTime12Hr, formatDateDisplay, formatDateTime12Hr } from '../../utils/formatters'
import { playDriverAlertSound } from '../../services/SoundService'

const REJECT_REASONS = [
  'Pickup location too far away',
  'Heavy traffic / Long delay',
  'Taking a break / Offline soon',
  'Vehicle maintenance needed',
  'Schedule conflict with other booking',
  'Customer safety concern',
]

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

  // New Telemetry, Performance & Dashboard States
  const [currentCity, setCurrentCity] = useState('')
  const [currentArea, setCurrentArea] = useState('')
  const [gpsStatus, setGpsStatus] = useState('GPS Active 🟢')
  const [lastUpdatedTime, setLastUpdatedTime] = useState('Just now')
  const [recentTrips, setRecentTrips] = useState([])
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

  // Complete Trip Modal & Final Invoice
  const [completeTripModalVisible, setCompleteTripModalVisible] = useState(false)
  const [enteredActualDistance, setEnteredActualDistance] = useState('')
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false)

  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const incomingIdRef = useRef(null)
  const alertedAssignedTripIdRef = useRef(null)
  const alertedPendingTripIdRef = useRef(null)
  const prevUnreadNotifCountRef = useRef(null)
  const prevActiveRideRef = useRef(null)
  const completedTripIdsRef = useRef(new Set())
  const acknowledgedCancelledTripIdRef = useRef(null)
  const lastGeoRef = useRef({ lat: 0, lng: 0, area: '', city: '', address: '', timestamp: 0 })

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
      const [dashRes, schedRes, activeRes, pendingRes, adRes, notifRes, tripsRes, earnRes, sysSettingsRes] = await Promise.allSettled([
        driverAPI.dashboard(),
        longTripAPI.assignedScheduledTrips(),
        driverAPI.activeBooking(),
        driverAPI.pendingRides(),
        adsAPI.list(locParams),
        notifAPI.list(true),
        driverAPI.myTrips({ per_page: 5 }),
        driverAPI.earnings('week'),
        settingsAPI.list(),
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
        const newAssignments = sData.new_assignments || []
        setAdminAssignedTrips(newAssignments)
        setUpcomingTrips(sData.upcoming_trips || [])

        if (newAssignments.length > 0) {
          const firstNew = newAssignments[0]
          const newId = firstNew.long_trip_id || firstNew.id
          if (newId && alertedAssignedTripIdRef.current !== `sched_${newId}`) {
            alertedAssignedTripIdRef.current = `sched_${newId}`
            playDriverAlertSound().catch(() => {})
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

      // 4. Active Ride & Shared Manifest
      const act = (activeRes.status === 'fulfilled' && activeRes.value.data?.status === 'success' && activeRes.value.data.booking)
        ? activeRes.value.data.booking
        : (dashRes.status === 'fulfilled' && dashRes.value.data?.active_booking ? dashRes.value.data.active_booking : null)

      const serverCancelledTrip = (activeRes.status === 'fulfilled' && activeRes.value.data?.cancelled_trip)
        ? activeRes.value.data.cancelled_trip
        : (dashRes.status === 'fulfilled' && dashRes.value.data?.cancelled_trip ? dashRes.value.data.cancelled_trip : null)

      // Automatic Trip Cancellation Detection for Driver (Strictly ONCE per genuinely cancelled trip from server)
      const serverCancId = serverCancelledTrip?.id ? Number(serverCancelledTrip.id) : null
      if (serverCancId && !acknowledgedCancelledTripIds.has(serverCancId) && !completedTripIdsRef.current.has(serverCancId)) {
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
          bookingRef: serverCancelledTrip.booking_ref || `CTB#${serverCancId}`,
          pickup: serverCancelledTrip.pickup_address,
          dest: serverCancelledTrip.dest_address,
          reason: serverCancelledTrip.cancellation_reason || 'Rider cancelled the ride.',
        })
      }

      if (act?.id) {
        prevActiveRideRef.current = act
      } else {
        prevActiveRideRef.current = null
      }

      setActiveRide(act)
      if (act?.id) {
        setPendingRides([])

        // Immediate Audio/Haptic Alert when driver is assigned to a ride!
        if (act.status === 'driver_assigned' && alertedAssignedTripIdRef.current !== act.id) {
          alertedAssignedTripIdRef.current = act.id
          try {
            Vibration.vibrate([0, 500, 200, 500])
          } catch {}
          playDriverAlertSound().catch(() => {})

          const extraKm = Number(act.extra_pickup_distance_km || 0)
          const pickupDist = Number(act.pickup_distance_km || 0)
          const pickupCash = Math.round(Number(act.pickup_charge || 0))

          if (extraKm > 0 || pickupDist > 2.0) {
            const actualExtra = extraKm > 0 ? extraKm : Math.max(0, pickupDist - 2.0)
            const actualCash = pickupCash > 0 ? pickupCash : Math.round(actualExtra * 10)
            Alert.alert(
              '📢 Pickup Distance Alert (Extra Cash to Collect)',
              `Driver neenga pickup location-la irunthu ${(pickupDist > 0 ? pickupDist : (2.0 + actualExtra)).toFixed(1)} km thoorathil irukkeenga.\n\n` +
              `• 2.0 km Free Pickup\n` +
              `• ${actualExtra.toFixed(1)} km Extra Arrival Distance\n` +
              `• 💰 Customer extra cash pay pannanum: ₹${actualCash}\n\n` +
              `📍 Pickup: ${act.pickup_address || 'Pickup'}\n🏁 Drop: ${act.dest_address || 'Destination'}\n\n` +
              `Idhai confirm seithu pickup location-kku pogalam!`,
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: '✓ Confirm & Proceed',
                  style: 'default',
                  onPress: () => handleUpdateRideStatus('driver_accepted')
                }
              ]
            )
          } else {
            Alert.alert(
              '🚨 New Local Ride Assigned!',
              `A new ride has been assigned to you!\n\n📍 Pickup: ${act.pickup_address}\n🏁 Drop: ${act.dest_address}\n💵 Fare: ₹${Math.round(act.final_fare || act.fare || 0)}\n\nPlease proceed to pickup location!`,
              [{ text: 'View & Proceed to Pickup', style: 'default' }]
            )
          }
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
            playDriverAlertSound().catch(() => {})
          }
        }
      }

      // 5. Promotional Banners
      if (adRes.status === 'fulfilled' && adRes.value.data?.status === 'success') {
        setDriverAds(adRes.value.data.ads || [])
      }

      // 6. Unread Notifications
      if (notifRes.status === 'fulfilled') {
        const unread = notifRes.value.data?.unread || notifRes.value.data?.unread_count || 0
        if (prevUnreadNotifCountRef.current !== null && unread > prevUnreadNotifCountRef.current) {
          playDriverAlertSound().catch(() => {})
        }
        prevUnreadNotifCountRef.current = unread
        setUnreadNotifCount(unread)
      }

      // 7. Recent Rides for Dashboard Compact Cards
      if (tripsRes.status === 'fulfilled') {
        const tList = tripsRes.value.data?.bookings || tripsRes.value.data?.trips || []
        setRecentTrips(Array.isArray(tList) ? tList.slice(0, 5) : [])
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
  }, [loadDashboardData, isOnline, resolveAreaFromCoords])

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
    if (val) {
      const isAccountApproved = (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'approved' ||
                                (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved'
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

    if (!val) {
      // Switching Offline
      setToggling(true)
      try {
        let locData = { lat: 12.9716, lng: 77.5946 }
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          locData = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        } catch {}

        const res = await driverAPI.toggleOnline({ is_online: 0, ...locData })
        if (res.data?.status === 'success') {
          setIsOnline(false)
          Alert.alert('You are Offline 🔴', 'You will not receive new dispatch requests.')
        } else {
          Alert.alert('Status Error', res.data?.message || 'Could not update status.')
        }
      } catch {
        Alert.alert('Error', 'Unable to toggle offline status.')
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
    try {
      const res = await longTripAPI.respondScheduledTrip(longTripId, 'reject', reason)
      if (res.data?.status === 'success') {
        Alert.alert('Assignment Declined', `Trip #${trip.booking_ref} has been returned to Admin Queue.`)
        setAdminAssignedTrips(prev => prev.filter(t => (t.long_trip_id || t.id) !== longTripId))
        setRejectModalTrip(null)
        loadDashboardData()
      } else {
        Alert.alert('Error', res.data?.message || 'Could not decline assignment.')
      }
    } catch {
      Alert.alert('Error', 'Failed to decline trip assignment.')
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
      await driverAPI.respondBooking(rideId, { action: 'reject', reason: reason || selectedReason })
      setPendingRides(prev => prev.filter(r => r.id !== rideId))
      setRejectModalTrip(null)
      loadDashboardData()
    } catch {}
  }

  // Open Complete Trip Modal (Final Distance & Invoice Preview)
  const handleOpenCompleteTripModal = () => {
    if (!activeRide) return
    const initialKm = String(activeRide.distance_km || activeRide.original_distance_km || '')
    setEnteredActualDistance(initialKm)
    setCompleteTripModalVisible(true)
  }

  // Update Ride Status (Normal Trip)
  const handleUpdateRideStatus = async (newStatus, extraParams = {}) => {
    if (!activeRide) return false
    try {
      const res = await driverAPI.updateStatus(activeRide.id, { status: newStatus, ...extraParams })
      if (res.data?.status === 'success') {
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
          Alert.alert('Status Updated', `Ride status: ${newStatus.replace(/_/g, ' ')}`)
        }
        loadDashboardData()
        return true
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to update status.')
        return false
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to update ride status.'
      Alert.alert('Error', errMsg)
      return false
    }
  }

  // Confirm Complete Trip & Submit Distance
  const handleConfirmCompleteTrip = async () => {
    if (!activeRide) return
    setIsSubmittingComplete(true)
    const distNum = parseFloat(enteredActualDistance) || parseFloat(activeRide.distance_km || activeRide.original_distance_km || 0)
    try {
      const ok = await handleUpdateRideStatus('completed', { actual_distance_km: distNum })
      if (ok) {
        setCompleteTripModalVisible(false)
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

  // Quick Actions List (7 professional enterprise cards)
  const quickActionsList = [
    { id: 'trips', label: 'My Trips', icon: 'car-sport', color: '#0F172A', bg: '#FFF8E7', action: () => navigation.navigate('Trips') },
    { id: 'documents', label: 'Documents', icon: 'document-text', color: '#D97706', bg: '#FEF3C7', action: () => navigation.navigate('DriverDocuments') },
    { id: 'vehicle', label: 'Vehicle', icon: 'car', color: '#4F46E5', bg: '#EEF2FF', action: () => setVehicleModalVisible(true) },
    { id: 'wallet', label: 'Wallet', icon: 'wallet', color: '#10B981', bg: '#ECFDF5', action: () => navigation.navigate('Earnings') },
    { id: 'support', label: 'Support', icon: 'headset', color: '#EA580C', bg: '#FFEDD5', action: () => navigation.navigate('DriverSupport') },
    { id: 'settings', label: 'Settings', icon: 'settings-sharp', color: '#475569', bg: '#F1F5F9', action: () => navigation.navigate('Profile') },
    { id: 'history', label: 'Ride History', icon: 'time', color: '#0284C7', bg: '#E0F2FE', action: () => navigation.navigate('Trips') },
  ]

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
            <View style={styles.driverTagPill}>
              <View style={[styles.liveDot, { backgroundColor: isOnline ? '#10B981' : '#94A3B8' }]} />
              <Text style={styles.driverTagText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
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
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'approved' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'verified' ||
            (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved'

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

        {/* 2. ONLINE STATUS CARD (Premium Gradient Card with live GPS, City, Area, Last Updated Time) */}
        {(() => {
          const isKycApproved =
            (driver?.approval_status || user?.approval_status || '').toLowerCase() === 'approved' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'approved' ||
            (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'verified' ||
            (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved'
          return (
            <View style={styles.telemetryCard}>
              <View style={styles.telemetryTopRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.statusBeacon, { backgroundColor: isOnline ? '#10B981' : isKycApproved ? '#94A3B8' : '#F59E0B' }]}>
                      <View style={[styles.statusBeaconInner, { backgroundColor: isOnline ? '#34D399' : isKycApproved ? '#CBD5E1' : '#FCD34D' }]} />
                    </View>
                    <Text style={styles.telemetryCardTitle}>
                      {isOnline ? 'Online · Accepting Rides' : isKycApproved ? 'Offline · Tap to Go Online' : 'Offline · KYC Pending'}
                    </Text>
                  </View>
                  <Text style={styles.telemetryCardSub} numberOfLines={2}>
                    {isOnline
                      ? 'Broadcasting live GPS coordinates to passengers'
                      : isKycApproved
                      ? 'Toggle switch when ready to receive ride requests'
                      : 'Submit and get your KYC approved by Admin to go online'}
                  </Text>
                </View>
                {toggling ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Switch
                    value={isOnline}
                    onValueChange={handleToggleOnline}
                    disabled={!isKycApproved || toggling}
                    trackColor={{ false: '#334155', true: '#10B981' }}
                    thumbColor={isOnline ? '#FFFFFF' : isKycApproved ? '#94A3B8' : '#64748B'}
                  />
                )}
              </View>

              {/* Telemetry Divider */}
              <View style={styles.telemetryDivider} />

              {/* Location & GPS Telemetry Grid */}
              <View style={styles.telemetryPillsRow}>
                <View style={styles.telemetryPill}>
                  <Ionicons name="location" size={13} color="#F59E0B" />
                  <Text style={styles.telemetryPillText} numberOfLines={1}>
                    {currentCity ? `${currentCity}${currentArea ? ` · ${currentArea}` : ''}` : 'Detecting City...'}
                  </Text>
                </View>
                <View style={styles.telemetryPill}>
                  <Ionicons name="radio" size={13} color={isOnline ? '#10B981' : '#94A3B8'} />
                  <Text style={styles.telemetryPillText} numberOfLines={1}>{gpsStatus}</Text>
                </View>
                <View style={styles.telemetryPill}>
                  <Ionicons name="time-outline" size={13} color="#94A3B8" />
                  <Text style={styles.telemetryPillText} numberOfLines={1}>{lastUpdatedTime}</Text>
                </View>
              </View>
            </View>
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
              const fare = Math.round(trip.final_fare || trip.fare_estimate || 0)
              const cd = getScheduleCountdown(trip.pickup_date, trip.pickup_time, nowTime)

              return (
                <View key={tripId} style={styles.assignedTripCard}>
                  <View style={styles.assignedCardTop}>
                    <View>
                      <Text style={styles.bookingRef}>{trip.booking_ref}</Text>
                      <Text style={styles.assignedMetaText}>
                        🗓 {formatDateDisplay(trip.pickup_date)} · ⏱ {formatTime12Hr(trip.pickup_time || '08:30')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.assignedFareText}>₹{fare}</Text>
                      <View style={[styles.countdownPill, { backgroundColor: cd.badgeBg }]}>
                        <Text style={[styles.countdownPillText, { color: cd.badgeColor }]}>{cd.text}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.assignedCustRow}>
                    <View style={styles.custAvatarWrap}>
                      {resolveAssetUrl(trip.customer_avatar_url || trip.customer_avatar) ? (
                        <Image source={{ uri: resolveAssetUrl(trip.customer_avatar_url || trip.customer_avatar) }} style={styles.custAvatarImg} />
                      ) : (
                        <Ionicons name="person" size={16} color={COLORS.primary} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.custName}>{trip.customer_name || 'Passenger'}</Text>
                        <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                      </View>
                      <Text style={styles.vehiclePillText}>{trip.vehicle_type_name || 'Cab'} · {trip.distance_km ? `${trip.distance_km} KM` : 'Outstation'}</Text>
                    </View>
                    {trip.customer_phone ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.chatSmallBtn}
                          onPress={() => Linking.openURL(`sms:${trip.customer_phone}`)}
                        >
                          <Ionicons name="chatbubble" size={14} color={COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.callSmallBtn}
                          onPress={() => Linking.openURL(`tel:${trip.customer_phone}`)}
                        >
                          <Ionicons name="call" size={14} color={COLORS.white} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.routeBox}>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.routeText} numberOfLines={1}>Pickup: {trip.pickup_address}</Text>
                    </View>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.routeText} numberOfLines={1}>Drop: {trip.dest_address}</Text>
                    </View>
                  </View>

                  <View style={styles.assignedActionRow}>
                    <TouchableOpacity
                      style={styles.detailsBtn}
                      onPress={() => setDetailModalTrip(trip)}
                    >
                      <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.detailsBtnText}>Details</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rejectAssignedBtn}
                      onPress={() => {
                        setRejectModalTrip(trip)
                        setRejectIsLongTrip(true)
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                      <Text style={styles.rejectAssignedText}>Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.acceptAssignedBtn, isAccepting && { opacity: 0.7 }]}
                      onPress={() => handleAcceptAdminAssignedTrip(trip)}
                      disabled={isAccepting}
                    >
                      {isAccepting ? (
                        <ActivityIndicator color={COLORS.white} size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={16} color={COLORS.white} style={{ marginRight: 4 }} />
                          <Text style={styles.acceptAssignedText}>Accept Trip</Text>
                        </>
                      )}
                    </TouchableOpacity>
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

          const mapOrigin = isReturnStarted
            ? {
                latitude: parseFloat(activeRide.dest_lat) || 12.9716,
                longitude: parseFloat(activeRide.dest_lng) || 77.5946,
                address: activeRide.dest_address,
              }
            : {
                latitude: parseFloat(activeRide.pickup_lat) || 12.9716,
                longitude: parseFloat(activeRide.pickup_lng) || 77.5946,
                address: activeRide.pickup_address,
              }

          const mapDestination = isReturnStarted
            ? {
                latitude: parseFloat(activeRide.pickup_lat) || 12.9716,
                longitude: parseFloat(activeRide.pickup_lng) || 77.5946,
                address: activeRide.pickup_address,
              }
            : {
                latitude: parseFloat(activeRide.dest_lat) || 12.9716,
                longitude: parseFloat(activeRide.dest_lng) || 77.5946,
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

              {/* Live Ride Status Card */}
              <View style={styles.liveRideSummaryCard}>
                <View style={styles.liveRideCustomerRow}>
                  <View style={styles.liveRideAvatarWrap}>
                    {resolveAssetUrl(activeRide.customer_avatar_url || activeRide.customer_avatar) ? (
                      <Image source={{ uri: resolveAssetUrl(activeRide.customer_avatar_url || activeRide.customer_avatar) }} style={styles.custAvatarImg} />
                    ) : (
                      <Text style={styles.liveRideAvatarText}>
                        {((activeRide.customer_name || 'C')?.[0] || 'C').toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.liveRideCustomerName}>{activeRide.customer_name || 'Passenger'}</Text>
                      <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={styles.livePaymentPill}>
                        <Text style={styles.livePaymentText}>{activeRide.payment_method?.toUpperCase() || 'CASH'}</Text>
                      </View>
                      <Text style={styles.liveDistanceText}>
                        {activeRide.distance_km ? `${parseFloat(activeRide.distance_km).toFixed(1)} KM` : 'Local Ride'}
                      </Text>
                    </View>
                  </View>
                  {activeRide.customer_phone ? (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.chatSmallBtn}
                        onPress={() => Linking.openURL(`sms:${activeRide.customer_phone}`)}
                      >
                        <Ionicons name="chatbubble" size={14} color={COLORS.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.callSmallBtn}
                        onPress={() => Linking.openURL(`tel:${activeRide.customer_phone}`)}
                      >
                        <Ionicons name="call" size={14} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {/* Trip Status Timeline */}
                <View style={styles.tripTimelineCard}>
                  <View style={styles.tripTimelineRow}>
                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, styles.timelineNodeDone]}>
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      </View>
                      <Text style={styles.timelineNodeLabelActive}>Assigned</Text>
                    </View>
                    <View style={[styles.timelineLine, (isArrived || isTripStarted) && styles.timelineLineDone]} />

                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, (isArrived || isTripStarted) ? styles.timelineNodeDone : styles.timelineNodePending]}>
                        {(isArrived || isTripStarted) ? (
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        ) : (
                          <View style={styles.timelineNodeInner} />
                        )}
                      </View>
                      <Text style={(isArrived || isTripStarted) ? styles.timelineNodeLabelActive : styles.timelineNodeLabelPending}>Arrived</Text>
                    </View>
                    <View style={[styles.timelineLine, isTripStarted && styles.timelineLineDone]} />

                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, isTripStarted ? styles.timelineNodeDone : styles.timelineNodePending]}>
                        {isTripStarted ? (
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        ) : (
                          <View style={styles.timelineNodeInner} />
                        )}
                      </View>
                      <Text style={isTripStarted ? styles.timelineNodeLabelActive : styles.timelineNodeLabelPending}>Started</Text>
                    </View>
                    <View style={[styles.timelineLine, activeRide.status === 'completed' && styles.timelineLineDone]} />

                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, activeRide.status === 'completed' ? styles.timelineNodeDone : styles.timelineNodePending]}>
                        {activeRide.status === 'completed' ? (
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        ) : (
                          <View style={styles.timelineNodeInner} />
                        )}
                      </View>
                      <Text style={activeRide.status === 'completed' ? styles.timelineNodeLabelActive : styles.timelineNodeLabelPending}>Drop Off</Text>
                    </View>
                  </View>
                </View>

                {/* Pickup & Destination Line Preview */}
                <View style={styles.liveRoutePreview}>
                  <View style={styles.routeItem}>
                    <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.routeText} numberOfLines={1}>Pickup: {activeRide.pickup_address}</Text>
                  </View>
                  <View style={styles.routeItem}>
                    <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.routeText} numberOfLines={1}>Drop: {activeRide.dest_address}</Text>
                  </View>
                </View>

                {/* Resume Trip / Toggle Live Navigation Button */}
                <TouchableOpacity
                  style={styles.resumeTripBtn}
                  onPress={() => setShowLiveMapDetails(prev => !prev)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={showLiveMapDetails ? "chevron-up" : "navigate"} size={16} color="#0F172A" />
                  <Text style={styles.resumeTripBtnText}>
                    {showLiveMapDetails ? 'Collapse Map View ▴' : 'Resume Trip & View Live Navigation ▾'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showLiveMapDetails && (
                <>
                  {/* Live Interactive Road Directions & Turn-by-Turn GPS Map */}
                  <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', marginVertical: 10 }}>
                    <LiveTripMap
                      origin={mapOrigin}
                      destination={mapDestination}
                      driverLocation={driverLocation || (driver?.lat && driver?.lng ? { latitude: parseFloat(driver.lat), longitude: parseFloat(driver.lng) } : null)}
                      waypoints={isReturnStarted ? [] : rawStops}
                      role="driver"
                      status={activeRide.status}
                      driverInfo={driver}
                      height={230}
                      showNavigationButton={true}
                    />
                  </View>

              {/* Customer Contact & Profile Row (Single Ride) */}
              {!isShared && (
                <View style={styles.customerRow}>
                  <View style={styles.custAvatarWrap}>
                    {resolveAssetUrl(activeRide.customer_avatar_url || activeRide.customer_avatar) ? (
                      <Image
                        source={{ uri: resolveAssetUrl(activeRide.customer_avatar_url || activeRide.customer_avatar) }}
                        style={styles.custAvatarImg}
                      />
                    ) : (
                      <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>
                        {((activeRide.customer_name || 'C')?.[0] || 'C').toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.custName}>{activeRide.customer_name || 'Passenger'}</Text>
                      <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Ionicons name="star" size={9} color="#D97706" />
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#92400E' }}>{activeRide.customer_rating || '5.0'}</Text>
                      </View>
                    </View>
                    <Text style={styles.custPhone}>
                      {activeRide.customer_phone ? `+91 ${activeRide.customer_phone}` : 'Contact via App'}
                    </Text>
                    {Boolean(activeRide.emergency_contact) && (
                      <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '700', marginTop: 1 }}>
                        SOS: +91 {activeRide.emergency_contact}
                      </Text>
                    )}
                  </View>
                  {activeRide.customer_phone ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={styles.chatSmallBtn}
                        onPress={() => Linking.openURL(`sms:${activeRide.customer_phone}`)}
                      >
                        <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.callSmallBtn}
                        onPress={() => Linking.openURL(`tel:${activeRide.customer_phone}`)}
                      >
                        <Ionicons name="call" size={16} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Full Route Details for Single Ride */}
              {!isShared && (
                <View style={styles.routeBox}>
                  {isRoundTrip ? (
                    <>
                      {/* Round Trip Leg 1 */}
                      <View style={{ marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: isOnwardTripStarted && !isReturnPickup && !isReturnStarted ? '#2563EB' : '#64748B' }}>
                            LEG 1: ONWARD JOURNEY ➡️
                          </Text>
                          {(isReturnPickup || isReturnStarted) && (
                            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>REACHED ✓</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.routeItem}>
                          <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669' }}>ORIGIN PICKUP</Text>
                            <Text style={styles.routeText} numberOfLines={1}>{activeRide.pickup_address || 'Customer Pickup'}</Text>
                          </View>
                        </View>
                        <View style={{ width: 1, height: 8, backgroundColor: '#CBD5E1', marginLeft: 3 }} />
                        <View style={styles.routeItem}>
                          <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626' }}>1ST DROP DESTINATION</Text>
                            <Text style={styles.routeText} numberOfLines={1}>{activeRide.dest_address || 'Customer Destination'}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Round Trip Leg 2 */}
                      <View style={{ marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: (isReturnPickup || isReturnStarted) ? '#2563EB' : '#94A3B8' }}>
                            LEG 2: RETURN JOURNEY 🔁
                          </Text>
                          {isReturnStarted && (
                            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: '#166534' }}>IN PROGRESS 🚀</Text>
                            </View>
                          )}
                          {isReturnPickup && (
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: '#92400E' }}>PICKUP READY 📍</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.routeItem}>
                          <View style={[styles.routeDot, { backgroundColor: '#3B82F6' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#2563EB' }}>RETURN PICKUP</Text>
                            <Text style={styles.routeText} numberOfLines={1}>{activeRide.dest_address || 'Customer Destination'}</Text>
                          </View>
                        </View>
                        <View style={{ width: 1, height: 8, backgroundColor: '#CBD5E1', marginLeft: 3 }} />
                        <View style={styles.routeItem}>
                          <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669' }}>FINAL DROP (ORIGIN)</Text>
                            <Text style={styles.routeText} numberOfLines={1}>{activeRide.pickup_address || 'Customer Pickup'}</Text>
                          </View>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.routeItem}>
                        <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 0.5 }}>PICKUP LOCATION</Text>
                          <Text style={styles.routeText} numberOfLines={2}>{activeRide.pickup_address || 'Customer Pickup'}</Text>
                        </View>
                      </View>
                      <View style={{ width: 1, height: 12, backgroundColor: '#CBD5E1', marginLeft: 3 }} />
                      <View style={styles.routeItem}>
                        <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 }}>DESTINATION</Text>
                          <Text style={styles.routeText} numberOfLines={2}>{activeRide.dest_address || 'Customer Destination'}</Text>
                        </View>
                      </View>
                    </>
                  )}

                  {/* Route Metrics: Distance, Fare & Payment Method */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.white, padding: 8, borderRadius: RADIUS.md, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="speedometer-outline" size={13} color={COLORS.gray500} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.gray700 }}>
                        {activeRide.distance_km ? `${parseFloat(activeRide.distance_km).toFixed(1)} KM` : (activeRide.route_distance_km ? `${parseFloat(activeRide.route_distance_km).toFixed(1)} KM` : '—')}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="wallet-outline" size={13} color={COLORS.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '900', color: COLORS.primary }}>
                        ₹{Math.round(activeRide.final_fare || activeRide.fare || activeRide.fare_estimate || activeRide.original_fare || 0)}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>
                        {activeRide.payment_method?.toUpperCase() || 'CASH'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Hourly Rental Package Notice */}
              {!isShared && isHourly && (
                <View style={{ backgroundColor: '#EEF2FF', padding: 10, borderRadius: RADIUS.md, marginBottom: 10, borderWidth: 1, borderColor: '#C7D2FE' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Ionicons name="time" size={15} color="#4F46E5" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#3730A3' }}>
                      Hourly Package: {activeRide.package_hours || 1} Hours ({activeRide.hourly_package_km || ((activeRide.package_hours || 1) * 10)} KM Included)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: '#4338CA', lineHeight: 14 }}>
                    Base Fare: ₹{Math.round(activeRide.base_package_fare || activeRide.fare || activeRide.fare_estimate || 0)}. Any extra minutes or extra distance beyond package will be automatically added to the bill at completion.
                  </Text>
                </View>
              )}

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
                        )}
                      </View>
                    )
                  })}
                </View>
              )}

              {/* Turn-by-Turn GPS Directions */}
              <TouchableOpacity
                style={styles.gpsNavBtn}
                onPress={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${activeTargetLat},${activeTargetLng}&travelmode=driving`
                  Linking.openURL(url)
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate" size={18} color={COLORS.white} />
                <Text style={styles.gpsNavBtnText} numberOfLines={1}>
                  Navigate to {activeTargetName}
                </Text>
              </TouchableOpacity>

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
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#10B981', marginTop: 10 }]}
                          onPress={() => handleUpdateRideStatus('driver_accepted')}
                        >
                          <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={[styles.primaryActionText, { color: '#FFFFFF' }]}>✓ Confirm & Proceed to Pickup</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Confirmed Extra Cash Notice when on the way */}
                    {['driver_accepted', 'accepted', 'waiting_pickup', 'on_the_way'].includes(activeRide.status) && (Number(activeRide.extra_pickup_distance_km) > 0 || Number(activeRide.pickup_distance_km) > 2.0) && (
                      <View style={{ backgroundColor: '#ECFDF5', borderColor: '#10B981', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                        <Text style={{ color: '#065F46', fontSize: 13, fontWeight: 'bold' }}>
                          ✓ Confirmed: Customer-idam ₹{Math.round(activeRide.pickup_charge || (Math.max(0, Number(activeRide.pickup_distance_km || 0) - 2.0) * 10))} Extra Cash Collect Pannavum!
                        </Text>
                        <Text style={{ color: '#047857', fontSize: 11, marginTop: 2 }}>
                          ({Number(activeRide.extra_pickup_distance_km || Math.max(0, Number(activeRide.pickup_distance_km || 0) - 2.0)).toFixed(1)} KM extra arrival distance @ ₹10/KM)
                        </Text>
                      </View>
                    )}

                    {['driver_accepted', 'accepted', 'waiting_pickup', 'on_the_way'].includes(activeRide.status) || (activeRide.status === 'driver_assigned' && !(Number(activeRide.extra_pickup_distance_km) > 0 || Number(activeRide.pickup_distance_km) > 2.0)) ? (
                      <TouchableOpacity
                        style={[styles.primaryActionBtn, { backgroundColor: '#FFC700' }]}
                        onPress={() => handleUpdateRideStatus('driver_arrived')}
                      >
                        <Ionicons name="location-outline" size={20} color="#000000" style={{ marginRight: 6 }} />
                        <Text style={[styles.primaryActionText, { color: '#000000' }]}>I Have Arrived at Pickup</Text>
                      </TouchableOpacity>
                    ) : null}

                    {['driver_arrived', 'driver_reached', 'pickup_reached', 'arrived'].includes(activeRide.status) && (
                      <TouchableOpacity
                        style={[styles.primaryActionBtn, { backgroundColor: '#7C3AED' }]}
                        onPress={() => {
                          setEnteredOtp('')
                          setOtpModalVisible(true)
                        }}
                      >
                        <Ionicons name="key-outline" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                        <Text style={styles.primaryActionText}>Enter Customer Start OTP</Text>
                      </TouchableOpacity>
                    )}

                    {/* 1. Onward Leg Actions */}
                    {isOnwardTripStarted && !isReturnPickup && !isReturnStarted && (() => {
                      if (currIdx < totalStops && rawStops[currIdx]) {
                        return (
                          <TouchableOpacity
                            style={[styles.primaryActionBtn, { backgroundColor: '#FFC700' }]}
                            onPress={async () => {
                              try {
                                const res = await driverAPI.completeStop(activeRide.id)
                                if (res.data?.status === 'success') {
                                  Alert.alert('Stop Completed ✓', `Stop ${currIdx + 1} completed! Navigating to next target.`)
                                  loadDashboardData()
                                }
                              } catch {}
                            }}
                          >
                            <Text style={[styles.primaryActionText, { color: '#000000' }]}>📍 Complete Stop {currIdx + 1} & Continue</Text>
                          </TouchableOpacity>
                        )
                      }

                      // FOR ROUND TRIPS: Do NOT complete trip at destination! Start return pickup instead
                      if (isRoundTrip) {
                        return (
                          <View style={{ gap: 8 }}>
                            <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                              <Ionicons name="repeat" size={16} color="#B45309" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', flex: 1 }}>
                                Round Trip: 1st drop destination reached. When picking up passenger for return journey, tap below.
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.primaryActionBtn, { backgroundColor: '#2563EB' }]}
                              onPress={() => {
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
                            >
                              <Ionicons name="return-down-forward" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                              <Text style={styles.primaryActionText}>Arrived at Destination • Return Pickup</Text>
                            </TouchableOpacity>
                          </View>
                        )
                      }

                      // One-Way Normal Trip / Hourly Trip: Complete Trip & Settle
                      return (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
                          onPress={handleOpenCompleteTripModal}
                        >
                          <Ionicons name="checkmark-done" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                          <Text style={styles.primaryActionText}>
                            {isHourly ? 'Complete Hourly Trip & Settle Fare' : 'Complete Trip & Collect Payment'}
                          </Text>
                        </TouchableOpacity>
                      )
                    })()}

                    {/* 2. Round Trip Return Pickup Stage */}
                    {isRoundTrip && isReturnPickup && (
                      <View style={{ gap: 8 }}>
                        <View style={{ backgroundColor: '#EFF6FF', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#BFDBFE' }}>
                          <Ionicons name="navigate-circle" size={18} color="#1D4ED8" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF', flex: 1 }}>
                            Heading to 1st drop point ({activeRide.dest_address}) to pick up passenger. When passenger has boarded, tap below to start return journey.
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#7C3AED' }]}
                          onPress={() => {
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
                        >
                          <Ionicons name="play-circle" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                          <Text style={styles.primaryActionText}>Passenger Boarded • Start Return Trip 🚀</Text>
                        </TouchableOpacity>
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
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => {
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
                        >
                          <Ionicons name="checkmark-done-circle" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                          <Text style={styles.primaryActionText}>Reached Origin • Complete Round Trip ✓</Text>
                        </TouchableOpacity>
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

                        <TouchableOpacity
                          style={[
                            styles.primaryActionBtn,
                            { backgroundColor: allPassengersBoarded ? '#10B981' : '#94A3B8' }
                          ]}
                          onPress={handleStartSharedJourney}
                          disabled={!allPassengersBoarded}
                        >
                          <Ionicons
                            name={allPassengersBoarded ? 'rocket' : 'lock-closed'}
                            size={20}
                            color={COLORS.white}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.primaryActionText}>
                            {allPassengersBoarded ? 'Start Journey 🚀' : `Start Journey (Locked - ${boardedPassengers.length}/${totalPassengers} Boarded)`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isTripStarted && (
                      <TouchableOpacity
                        style={[
                          styles.primaryActionBtn,
                          { backgroundColor: allPassengersDropped ? '#10B981' : COLORS.primary }
                        ]}
                        onPress={() => {
                          if (!allPassengersDropped) {
                            Alert.alert(
                              'Pending Drops',
                              `Please confirm drop for all passengers first (${droppedPassengers.length}/${totalPassengers} dropped).`,
                              [{ text: 'OK' }]
                            )
                            return
                          }
                          handleOpenCompleteTripModal()
                        }}
                      >
                        <Ionicons name="checkmark-done" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                        <Text style={styles.primaryActionText}>
                          {allPassengersDropped ? 'Complete Shared Journey & Settle Payments ✅' : `Drops In Progress (${droppedPassengers.length}/${totalPassengers} Dropped)`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </>
          )}
        </View>
      )
    })()}

        
{/* 4. TODAY'S SUMMARY CARD */}
        <View style={styles.todaySummaryCard}>
          <View style={styles.todaySummaryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.todayIconWrap}>
                <Ionicons name="wallet" size={16} color="#D97706" />
              </View>
              <Text style={styles.todaySummaryTitle}>Today's Summary</Text>
            </View>
            <Text style={styles.todayGrossText}>₹{grossEarnings}</Text>
          </View>

          {/* Today's Target Progress */}
          <View style={styles.targetProgressContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.targetLabel}>
                Daily Target: <Text style={{ fontWeight: '800', color: '#0F172A' }}>₹{grossEarnings}</Text> / ₹{targetGoal}
              </Text>
              <View style={styles.percentBadge}>
                <Text style={styles.percentBadgeText}>{progressPercent}%</Text>
              </View>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.targetSubText}>
              {grossEarnings >= targetGoal
                ? '🎉 Daily target achieved! Extra rides earn bonus incentives.'
                : `₹${Math.max(0, targetGoal - grossEarnings)} remaining to reach today's target.`}
            </Text>
          </View>

          {/* 6-Metric Compact Grid */}
          <View style={styles.todayMetricsGrid}>
            <View style={styles.todayMetricBox}>
              <Ionicons name="cash" size={15} color="#10B981" />
              <Text style={styles.todayMetricVal}>₹{grossEarnings}</Text>
              <Text style={styles.todayMetricLbl}>Earnings</Text>
            </View>
            <View style={styles.todayMetricBox}>
              <Ionicons name="car-sport" size={15} color="#3B82F6" />
              <Text style={styles.todayMetricVal}>{completedCount}</Text>
              <Text style={styles.todayMetricLbl}>Trips</Text>
            </View>
            <View style={styles.todayMetricBox}>
              <Ionicons name="checkmark-done" size={15} color="#059669" />
              <Text style={styles.todayMetricVal}>{completedCount}</Text>
              <Text style={styles.todayMetricLbl}>Completed</Text>
            </View>
            <View style={styles.todayMetricBox}>
              <Ionicons name="close-circle" size={15} color="#EF4444" />
              <Text style={styles.todayMetricVal}>{cancelledCount}</Text>
              <Text style={styles.todayMetricLbl}>Cancelled</Text>
            </View>
            <View style={styles.todayMetricBox}>
              <Ionicons name="shield-checkmark" size={15} color="#7C3AED" />
              <Text style={styles.todayMetricVal}>{acceptanceRate}</Text>
              <Text style={styles.todayMetricLbl}>Acceptance</Text>
            </View>
            <View style={styles.todayMetricBox}>
              <Ionicons name="time" size={15} color="#D97706" />
              <Text style={styles.todayMetricVal}>{stats?.hours !== undefined && stats?.hours !== null ? `${stats.hours}h` : (isOnline ? '1.0h' : '0.0h')}</Text>
              <Text style={styles.todayMetricLbl}>Online Hours</Text>
            </View>
          </View>
        </View>

        
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

        
{/* 3. LOCATION BASED PROMOTIONAL BANNER CAROUSEL */}
        {cityFilteredAds.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <AdCarousel ads={cityFilteredAds} userRole="driver" navigation={navigation} />
          </View>
        )}

        
{/* 8. QUICK ACTIONS */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="grid-outline" size={16} color="#0F172A" />
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
        </View>
        <View style={styles.quickGrid}>
          {quickActionsList.map(item => (
            <TouchableOpacity key={item.id} style={styles.quickTile} onPress={item.action} activeOpacity={0.8}>
              <View style={[styles.quickIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={styles.quickLabel} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        
{/* 9. PERFORMANCE */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trending-up" size={16} color="#0F172A" />
            <Text style={styles.sectionTitle}>Performance Overview</Text>
          </View>
        </View>
        <View style={styles.performanceCard}>
          {/* 7-Day Weekly Earnings Mini Bar Chart */}
          <View style={styles.chartHeaderRow}>
            <View>
              <Text style={styles.chartTitle}>Past 7 Days Earnings</Text>
              <Text style={styles.chartTotal}>₹{finalWeeklyEarnings}</Text>
            </View>
            <View style={styles.chartPill}>
              <Ionicons name="sparkles" size={12} color="#D97706" />
              <Text style={styles.chartPillText}>Weekly Target</Text>
            </View>
          </View>

          <View style={styles.chartBarsContainer}>
            {weekChartData.map((d, idx) => {
              const barHeight = Math.max(10, Math.round((d.amount / maxWeeklyAmount) * 60))
              return (
                <View key={idx} style={styles.chartBarCol}>
                  <Text style={styles.chartBarVal}>{d.amount > 0 ? `₹${d.amount}` : ''}</Text>
                  <View style={styles.chartBarTrack}>
                    <View
                      style={[
                        styles.chartBarFill,
                        {
                          height: barHeight,
                          backgroundColor: d.isToday ? '#F59E0B' : (d.amount > 0 ? '#10B981' : '#E2E8F0'),
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.chartBarLabel, d.isToday && styles.chartBarLabelActive]}>
                    {d.label}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* Performance Statistics Grid */}
          <View style={styles.perfStatsDivider} />
          <View style={styles.perfStatsRow}>
            <View style={styles.perfStatItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={styles.perfStatVal}>{driver?.rating || '5.0'}</Text>
              </View>
              <Text style={styles.perfStatLbl}>Driver Rating</Text>
            </View>
            <View style={styles.perfStatDividerV} />
            <View style={styles.perfStatItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.perfStatVal}>{acceptanceRate}</Text>
              </View>
              <Text style={styles.perfStatLbl}>Acceptance</Text>
            </View>
            <View style={styles.perfStatDividerV} />
            <View style={styles.perfStatItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.perfStatVal}>{cancellationRate}</Text>
              </View>
              <Text style={styles.perfStatLbl}>Cancellation</Text>
            </View>
            <View style={styles.perfStatDividerV} />
            <View style={styles.perfStatItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="car-sport" size={14} color="#7C3AED" />
                <Text style={styles.perfStatVal}>{driver?.total_trips || stats?.total_trips || completedCount}</Text>
              </View>
              <Text style={styles.perfStatLbl}>Total Trips</Text>
            </View>
          </View>
        </View>

        
{/* 10. RECENT RIDES */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="receipt-outline" size={16} color="#0F172A" />
            <Text style={styles.sectionTitle}>Recent Rides</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Trips')} activeOpacity={0.8}>
            <Text style={styles.viewAllText}>View All →</Text>
          </TouchableOpacity>
        </View>

        {recentTrips && recentTrips.length > 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            {recentTrips.slice(0, 4).map((ride, idx) => {
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
          </View>
        ) : (
          <View style={styles.emptyRecentCard}>
            <Ionicons name="car-outline" size={28} color="#94A3B8" />
            <Text style={styles.emptyRecentTitle}>No rides yet today</Text>
            <Text style={styles.emptyRecentSub}>Go Online to receive incoming ride requests in your city</Text>
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
                      <Text style={styles.custPhone}>{detailModalTrip.customer_phone ? `+91 ${detailModalTrip.customer_phone}` : '—'}</Text>
                    </View>
                  </View>
                  {detailModalTrip.customer_phone ? (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <TouchableOpacity
                        style={styles.sheetActionBtn}
                        onPress={() => Linking.openURL(`tel:${detailModalTrip.customer_phone}`)}
                      >
                        <Ionicons name="call" size={14} color={COLORS.primary} />
                        <Text style={styles.sheetActionBtnText}>Call Customer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.sheetActionBtn}
                        onPress={() => Linking.openURL(`sms:${detailModalTrip.customer_phone}`)}
                      >
                        <Ionicons name="chatbubble" size={14} color={COLORS.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {/* Route Information */}
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>ROUTE & SCHEDULE</Text>
                  <View style={styles.routeBox}>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.routeText}>Pickup: {detailModalTrip.pickup_address}</Text>
                    </View>
                    <View style={styles.routeItem}>
                      <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.routeText}>Drop: {detailModalTrip.dest_address}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                    <Text style={styles.sheetLabel}>Travel Date: {formatDateDisplay(detailModalTrip.pickup_date)}</Text>
                    <Text style={styles.sheetLabel}>Pickup Time: {formatTime12Hr(detailModalTrip.pickup_time || '08:30')}</Text>
                  </View>
                </View>

                {/* Billing & Distance */}
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
        <View style={styles.modalOverlay}>
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

            {/* Action Buttons */}
            <View style={styles.incomingBtnRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => {
                  setRejectModalTrip(activeIncoming)
                  setRejectIsLongTrip(false)
                }}
              >
                <Text style={styles.rejectBtnText}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptBtn, respondingPendingId === activeIncoming?.id && { opacity: 0.7 }]}
                onPress={() => handleAcceptInstantRide(activeIncoming.id)}
                disabled={respondingPendingId === activeIncoming?.id}
              >
                {respondingPendingId === activeIncoming?.id ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={18} color="#0F172A" />
                    <Text style={styles.acceptBtnText}>Accept Ride ({countdown}s)</Text>
                  </View>
                )}
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

      {/* ── Enterprise Ride Cancelled by Customer Alert Modal ── */}
      <Modal
        visible={Boolean(cancelledNotice) && isFocused}
        animationType="fade"
        transparent={true}
        onRequestClose={handleDismissCancelledNotice}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dialogCard, { padding: 22, alignItems: 'center' }]}>
            <View style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: '#FEE2E2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              borderWidth: 3,
              borderColor: '#FECACA'
            }}>
              <Ionicons name="close-circle" size={44} color="#DC2626" />
            </View>

            <View style={{
              backgroundColor: '#FEF2F2',
              borderColor: '#FCA5A5',
              borderWidth: 1,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
              marginBottom: 8,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#B91C1C', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Trip Cancelled by Rider
              </Text>
            </View>

            <Text style={{ fontSize: 19, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 4 }}>
              Ride Has Been Cancelled
            </Text>

            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 16 }}>
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
            <View style={{
              width: '100%',
              backgroundColor: '#FFFBEB',
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: '#FDE68A',
              marginBottom: 16,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400E', marginBottom: 2 }}>
                Cancellation Reason:
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#78350F' }}>
                "{cancelledNotice?.reason || 'Customer cancelled this booking.'}"
              </Text>
            </View>

            {/* Driver Reassurance Banner */}
            <View style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#F0FDF4',
              borderRadius: 10,
              padding: 10,
              borderWidth: 1,
              borderColor: '#BBF7D0',
              marginBottom: 18,
            }}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534', flex: 1 }}>
                You are Online & Available. New requests will appear automatically.
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
                Got It · Continue Driving 🚕
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Complete Trip & Final Distance Modal ── */}
      <Modal
        visible={completeTripModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !isSubmittingComplete && setCompleteTripModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.otpModalCard, { maxHeight: '92%', width: '92%', paddingVertical: 18, paddingHorizontal: 16 }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 2, borderColor: '#A7F3D0' }}>
                  <Ionicons name="checkmark-done-circle" size={32} color="#10B981" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>Complete Trip & Final Bill</Text>
                <Text style={{ fontSize: 12, color: COLORS.gray500, marginTop: 2 }}>Booking #{activeRide?.booking_ref || ''}</Text>
              </View>

              {/* Trip Subtype Badge */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }}>
                <View style={{ backgroundColor: activeRide?.trip_sub_type === 'hourly' ? '#EFF6FF' : '#FEF3C7', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: activeRide?.trip_sub_type === 'hourly' ? '#BFDBFE' : '#FDE68A' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: activeRide?.trip_sub_type === 'hourly' ? '#1D4ED8' : '#B45309' }}>
                    {activeRide?.trip_sub_type === 'hourly' ? `⏱️ Hourly Rental (${activeRide.package_hours || 1} hrs)` : `🚗 ${activeRide?.trip_type === 'round_trip' ? 'Round Trip' : 'Drop Taxi / Point-to-Point'}`}
                  </Text>
                </View>
              </View>

              {/* Booked Route Distance */}
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: COLORS.gray600 }}>Initial Booked Distance:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textPrimary }}>
                    {Number(activeRide?.original_distance_km || activeRide?.distance_km || 0).toFixed(1)} km
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: COLORS.gray600 }}>Initial Booked Fare:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textPrimary }}>
                    ₹{Math.round(Number(activeRide?.base_package_fare || activeRide?.fare_estimate || activeRide?.final_fare || 0))}
                  </Text>
                </View>
              </View>

              {/* Actual Distance Input Field */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 }}>
                  Actual Distance Traveled (KM)
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.gray500, marginBottom: 8 }}>
                  Customer route change or extra stops? Enter actual odometer KM:
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.primary || '#FBBF24', paddingHorizontal: 12, height: 48 }}>
                  <Ionicons name="speedometer-outline" size={20} color={COLORS.primary || '#D97706'} style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}
                    value={enteredActualDistance}
                    onChangeText={setEnteredActualDistance}
                    keyboardType="numeric"
                    placeholder="Enter actual km"
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.gray500 }}>KM</Text>
                </View>
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

                const baseFare = Number(activeRide?.base_package_fare || (isHourly ? (pkgHours * Number(activeRide?.hourly_rate || 250)) : (activeRide?.fare_estimate || activeRide?.final_fare || 0)))
                const pickupCharge = (activeRide?.pickup_charge_accepted && activeRide?.pickup_charge) ? Number(activeRide.pickup_charge) : 0
                const onlinePaid = Number(activeRide?.online_paid || 0)
                const discount = Number(activeRide?.discount_amount || 0)
                const totalFinal = Math.max(0, Math.round(baseFare + extraKmFare + extraMinFare + pickupCharge - discount))
                const cashToCollect = Math.max(0, Math.round(totalFinal - onlinePaid))

                return (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534', marginBottom: 8, letterSpacing: 0.5 }}>
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

                    <View style={{ height: 1, backgroundColor: '#A7F3D0', marginVertical: 8 }} />

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

                    <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>Collect Cash from Customer:</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#B45309' }}>₹{cashToCollect}</Text>
                    </View>
                  </View>
                )
              })()}

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setCompleteTripModalVisible(false)}
                  disabled={isSubmittingComplete}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray600 }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                  onPress={handleConfirmCompleteTrip}
                  disabled={isSubmittingComplete}
                >
                  {isSubmittingComplete ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Complete & Collect</Text>
                    </>
                  )}
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
    borderWidth: 1,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  telemetryCardSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    lineHeight: 15,
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
    gap: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  telemetryPillText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: '#CBD5E1',
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
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: RADIUS.xxl,
    borderWidth: 2,
    borderColor: COLORS.primary,
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
})

export default DriverHomeScreen
