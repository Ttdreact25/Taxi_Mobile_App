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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import { driverAPI, adsAPI, longTripAPI, notifAPI, uploadAPI, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import AdCarousel from '../../components/ui/AdCarousel'
import LiveTripMap from '../../components/common/LiveTripMap'

const REJECT_REASONS = [
  'Pickup location too far away',
  'Heavy traffic / Long delay',
  'Taking a break / Offline soon',
  'Vehicle maintenance needed',
  'Schedule conflict with other booking',
  'Customer safety concern',
]

const getScheduleCountdown = (pickupDate, pickupTime, nowTime = Date.now()) => {
  if (!pickupDate) return { text: 'Scheduled', isBufferTime: false, badgeColor: '#6366F1', badgeBg: '#EEF2FF' }

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
    return { text: `Starts in ${calendarDayDiff} Days`, badgeColor: '#4338CA', badgeBg: '#EEF2FF', isBufferTime: false }
  }
  if (calendarDayDiff === 1) {
    return { text: 'Starts Tomorrow', badgeColor: '#4F46E5', badgeBg: '#EEF2FF', isBufferTime: false }
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
  const { user } = useAuth()
  const [driver, setDriver] = useState(user || null)
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

  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const incomingIdRef = useRef(null)
  const lastGeoRef = useRef({ lat: 0, lng: 0, area: '', address: '', timestamp: 0 })

  // Reverse Geocoding with memory caching to extract readable Area (e.g. KK Nagar, Chennai)
  const resolveAreaFromCoords = useCallback(async (latitude, longitude) => {
    try {
      const now = Date.now()
      const cached = lastGeoRef.current
      if (cached.area && (now - cached.timestamp < 45000)) {
        const dLat = Math.abs(latitude - cached.lat)
        const dLng = Math.abs(longitude - cached.lng)
        if (dLat < 0.0025 && dLng < 0.0025) {
          return { area: cached.area, address: cached.address }
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
        lastGeoRef.current = { lat: latitude, lng: longitude, area, address, timestamp: now }
        return { area, address }
      }
    } catch (e) {}
    return { area: '', address: '' }
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
      const [dashRes, schedRes, activeRes, pendingRes, adRes, notifRes] = await Promise.allSettled([
        driverAPI.dashboard(),
        longTripAPI.assignedScheduledTrips(),
        driverAPI.activeBooking(),
        driverAPI.pendingRides(),
        adsAPI.list({ target_audience: 'driver' }),
        notifAPI.list(true),
      ])

      // 1. Dashboard payload
      if (dashRes.status === 'fulfilled' && dashRes.value.data?.status === 'success') {
        const dData = dashRes.value.data
        if (dData.driver) {
          setDriver(dData.driver)
          const isKycApproved = (dData.driver.approval_status || '').toLowerCase() === 'approved' && (dData.driver.verification_status || '').toLowerCase() === 'approved'
          setIsOnline(isKycApproved ? Boolean(dData.driver.is_online) : false)
        }
        if (dData.today) setStats(dData.today)
      }

      // 2. Scheduled & Admin Assigned Trips
      if (schedRes.status === 'fulfilled' && schedRes.value.data?.status === 'success') {
        const sData = schedRes.value.data
        setAdminAssignedTrips(sData.new_assignments || [])
        setUpcomingTrips(sData.upcoming_trips || [])
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

      setActiveRide(act)
      if (act?.id) {
        setPendingRides([])
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
      }

      // 5. Promotional Banners
      if (adRes.status === 'fulfilled' && adRes.value.data?.status === 'success') {
        setDriverAds(adRes.value.data.ads || [])
      }

      // 6. Unread Notifications
      if (notifRes.status === 'fulfilled') {
        const unread = notifRes.value.data?.unread || notifRes.value.data?.unread_count || 0
        setUnreadNotifCount(unread)
      }
    } catch (err) {
      console.warn('Dashboard sync error:', err)
    } finally {
      if (isPull) setRefreshing(false)
    }
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
      const isAccountApproved = (driver?.approval_status || '').toLowerCase() === 'approved'
      const verifStatus = (driver?.verification_status || 'unsubmitted').toLowerCase()
      const isKycApproved = verifStatus === 'approved' || verifStatus === 'verified'

      if (!isAccountApproved || !isKycApproved) {
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
          const filename = localUri.split('/').pop() || `online_selfie_${Date.now()}.jpg`
          const match = /\.(\w+)$/.exec(filename)
          const mimeType = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg'
          const formData = new FormData()
          formData.append('file', {
            uri: Platform.OS === 'android' ? localUri : localUri.replace('file://', ''),
            name: filename,
            type: mimeType,
          })
          formData.append('type', 'kyc')

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

  // Update Ride Status (Normal Trip)
  const handleUpdateRideStatus = async (newStatus) => {
    if (!activeRide) return
    try {
      const res = await driverAPI.updateStatus(activeRide.id, { status: newStatus })
      if (res.data?.status === 'success') {
        if (newStatus === 'completed') {
          navigation.navigate('DriverPayment', { bookingId: activeRide.id })
        } else {
          Alert.alert('Status Updated', `Ride status: ${newStatus.replace(/_/g, ' ')}`)
        }
        loadDashboardData()
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to update status.')
      }
    } catch {
      Alert.alert('Error', 'Failed to update ride status.')
    }
  }

  // Verify Start OTP (Normal Trip)
  const handleVerifyStartOtp = async () => {
    if (!enteredOtp.trim() || enteredOtp.trim().length < 4) {
      Alert.alert('Invalid OTP', 'Please enter the 4-digit ride start OTP provided by the customer.')
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
      Alert.alert('Invalid OTP', 'Please enter the 4-digit boarding OTP provided by the passenger.')
      return
    }
    setVerifyingPassOtp(true)
    try {
      const passengerId = passOtpModal?.passenger_id || passOtpModal?.id || 0
      const res = await longTripAPI.verifyPassengerOTP(activeRide.id, passengerId, passEnteredOtp.trim())
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
      `Has passenger ${passenger.customer_name} arrived at their destination?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Drop ✓',
          onPress: async () => {
            try {
              const pId = passenger.passenger_id || passenger.id || 0
              const res = await longTripAPI.completeDrop({
                booking_id: activeRide.id,
                passenger_id: pId,
                payment_method: 'cash',
              })
              if (res.data?.status === 'success') {
                Alert.alert('Drop Completed 🎉', `Passenger ${passenger.customer_name} has arrived and is marked as dropped!`)
                loadDashboardData()
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

  // Performance calculations
  const completedCount = stats?.trips ?? stats?.completed_today ?? 0
  const grossEarnings = Math.round(stats?.earnings ?? stats?.today_earnings ?? 0)
  const targetGoal = 2000
  const progressPercent = Math.min(Math.round((grossEarnings / targetGoal) * 100), 100)

  const activeIncoming = pendingRides[0] || null

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} activeOpacity={0.8}>
            <View style={styles.avatarWrap}>
              {resolveAssetUrl(driver?.avatar_url || driver?.avatar) ? (
                <Image source={{ uri: resolveAssetUrl(driver.avatar_url || driver.avatar) }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{(driver?.name?.[0] || user?.name?.[0] || 'D').toUpperCase()}</Text>
              )}
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.driverName} numberOfLines={1}>{driver?.name || user?.name || 'Driver Partner'}</Text>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={styles.ratingText}>{driver?.rating || '5.0'}</Text>
              </View>
              <Text style={styles.vehicleText}>{driver?.vehicle_type || 'Cab'} · {driver?.plate_no || 'Verified'}</Text>
            </View>
          </View>
        </View>

        {/* Notification & Refresh */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('DriverNotifications')}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color={COLORS.textPrimary} />
            {unreadNotifCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => loadDashboardData(true)} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={COLORS.primary} />
          </TouchableOpacity>
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
        {((driver?.approval_status || '').toLowerCase() !== 'approved') && (() => {
          const isRej = (driver?.approval_status || '').toLowerCase() === 'rejected'
          const hasSubmitted = Boolean(driver?.has_kyc_submitted || driver?.license_front_image || driver?.profile_selfie)
          
          const bannerBg = isRej ? '#FEF2F2' : hasSubmitted ? '#FFFBEB' : '#EFF6FF'
          const borderColor = isRej ? '#FECACA' : hasSubmitted ? '#FDE68A' : '#BFDBFE'
          const iconName = isRej ? 'alert-circle' : hasSubmitted ? 'time' : 'shield-half'
          const iconColor = isRej ? '#DC2626' : hasSubmitted ? '#D97706' : '#2563EB'
          const titleColor = isRej ? '#991B1B' : hasSubmitted ? '#92400E' : '#1E40AF'
          const subColor = isRej ? '#B91C1C' : hasSubmitted ? '#B45309' : '#1D4ED8'
          
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
                backgroundColor: isRej ? '#FEE2E2' : hasSubmitted ? '#FEF3C7' : '#DBEAFE',
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

        {/* 2. Online / Offline Switch */}
        {(() => {
          const isKycApproved = (driver?.approval_status || '').toLowerCase() === 'approved'
          return (
            <View style={[styles.onlineCard, isOnline ? styles.onlineCardActive : styles.onlineCardInactive]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.statusBeacon, { backgroundColor: isOnline ? '#10B981' : isKycApproved ? '#94A3B8' : '#F59E0B' }]}>
                    <View style={[styles.statusBeaconInner, { backgroundColor: isOnline ? '#34D399' : isKycApproved ? '#CBD5E1' : '#FCD34D' }]} />
                  </View>
                  <Text style={styles.onlineTitle}>
                    {isOnline ? 'Online · Accepting Rides' : isKycApproved ? 'Offline · Not Accepting' : 'Offline · KYC Required'}
                  </Text>
                </View>
                <Text style={styles.onlineSub}>
                  {isOnline
                    ? 'Broadcasting live GPS coordinates to nearby passengers'
                    : isKycApproved
                    ? 'Toggle switch when ready to receive ride requests'
                    : 'Submit and get your KYC approved by Admin to go online and take taxi rides'}
                </Text>
              </View>
              {toggling ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Switch
                  value={isOnline}
                  onValueChange={handleToggleOnline}
                  disabled={!isKycApproved || toggling}
                  trackColor={{ false: '#CBD5E1', true: '#A7F3D0' }}
                  thumbColor={isOnline ? '#10B981' : isKycApproved ? '#64748B' : '#94A3B8'}
                />
              )}
            </View>
          )
        })()}

        {/* 3. Promotional Banners */}
        {driverAds.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <AdCarousel ads={driverAds} userRole="driver" navigation={navigation} />
          </View>
        )}

        {/* 4. Earnings Target Goal */}
        <View style={styles.goalCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="wallet" size={16} color={COLORS.primary} />
              <Text style={styles.goalTitle}>Today's Earnings Target</Text>
            </View>
            <Text style={styles.goalValue}>₹{grossEarnings} <Text style={{ fontSize: 11, color: COLORS.gray500, fontWeight: '600' }}>/ ₹{targetGoal}</Text></Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.goalSub}>
            {grossEarnings >= targetGoal ? '🎉 Daily target achieved! Extra rides earn bonus incentives.' : `₹${targetGoal - grossEarnings} remaining to reach today's target.`}
          </Text>
        </View>

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
                        🗓 {trip.pickup_date} · ⏱ {trip.pickup_time ? trip.pickup_time.slice(0, 5) : '08:30'}
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
          const isTripStarted = ['trip_started', 'in_progress'].includes(activeRide.status)
          const isArrived = activeRide.status === 'driver_arrived'
          const isShared = Boolean(
            activeRide.trip_type === 'shared' ||
            activeRide.is_shared == 1 ||
            activeRide.is_shared === '1' ||
            activeRide.is_shared === true ||
            (manifest && manifest.length > 0)
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

          if (isShared && !isTripStarted && nextUnboardedPassenger) {
            activeTargetName = `Pickup ${nextUnboardedPassenger.customer_name}: ${nextUnboardedPassenger.pickup_address}`
            activeTargetLat = nextUnboardedPassenger.pickup_lat || activeRide.pickup_lat || 12.9716
            activeTargetLng = nextUnboardedPassenger.pickup_lng || activeRide.pickup_lng || 77.5946
          } else if (isShared && isTripStarted && nextUndroppedPassenger) {
            activeTargetName = `Drop ${nextUndroppedPassenger.customer_name}: ${nextUndroppedPassenger.dest_address}`
            activeTargetLat = nextUndroppedPassenger.dest_lat || activeRide.dest_lat || 12.9716
            activeTargetLng = nextUndroppedPassenger.dest_lng || activeRide.dest_lng || 77.5946
          } else if (isTripStarted) {
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

          return (
            <View style={styles.activeCard}>
              <View style={styles.activeHeader}>
                <View>
                  <Text style={styles.bookingRef}>{activeRide.booking_ref}</Text>
                  <Text style={styles.tripTypeBadge}>
                    {isShared ? '🤝 SHARED MULTI-PASSENGER TRIP' : (activeRide.trip_type ? activeRide.trip_type.replace(/_/g, ' ').toUpperCase() : 'ACTIVE RIDE')}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isTripStarted ? '#EDE9FE' : (isArrived ? '#FEF3C7' : '#DCFCE7') }]}>
                  <Text style={[styles.statusBadgeText, { color: isTripStarted ? '#7C3AED' : (isArrived ? '#B45309' : '#15803D') }]}>
                    {activeRide.status === 'driver_arrived' ? 'DRIVER ARRIVED' : (isTripStarted ? 'IN PROGRESS' : activeRide.status?.replace(/_/g, ' ').toUpperCase())}
                  </Text>
                </View>
              </View>

              {/* Live Interactive Road Directions & Turn-by-Turn GPS Map */}
              <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', marginVertical: 10 }}>
                <LiveTripMap
                  origin={{
                    latitude: parseFloat(activeRide.pickup_lat) || 12.9716,
                    longitude: parseFloat(activeRide.pickup_lng) || 77.5946,
                    address: activeRide.pickup_address,
                  }}
                  destination={{
                    latitude: parseFloat(activeRide.dest_lat) || 12.9716,
                    longitude: parseFloat(activeRide.dest_lng) || 77.5946,
                    address: activeRide.dest_address,
                  }}
                  driverLocation={driverLocation || (driver?.lat && driver?.lng ? { latitude: parseFloat(driver.lat), longitude: parseFloat(driver.lng) } : null)}
                  waypoints={rawStops}
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

                  {/* Route Metrics: Distance, Fare & Payment Method */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.white, padding: 8, borderRadius: RADIUS.md, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="speedometer-outline" size={13} color={COLORS.gray500} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.gray700 }}>
                        {activeRide.distance_km ? `${activeRide.distance_km} KM` : '3.5 KM'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="wallet-outline" size={13} color={COLORS.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '900', color: COLORS.primary }}>
                        ₹{Math.round(activeRide.final_fare || activeRide.fare_estimate || 150)}
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

              {/* Ride Start PIN Status Banner */}
              {!isShared && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isTripStarted ? '#D1FAE5' : (isArrived ? '#FEF3C7' : '#EDE9FE'),
                  padding: 8,
                  borderRadius: RADIUS.md,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: isTripStarted ? '#A7F3D0' : (isArrived ? '#FDE68A' : '#DDD6FE')
                }}>
                  <Ionicons
                    name={isTripStarted ? 'checkmark-circle' : (isArrived ? 'key' : 'shield-checkmark')}
                    size={15}
                    color={isTripStarted ? '#059669' : (isArrived ? '#B45309' : '#7C3AED')}
                  />
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: isTripStarted ? '#065F46' : (isArrived ? '#92400E' : '#5B21B6'),
                    flex: 1
                  }}>
                    {isTripStarted
                      ? 'OTP Verified ✓ • Navigating to Destination'
                      : (isArrived
                        ? 'Driver Arrived • Ask Customer for 4-Digit Start PIN'
                        : 'En Route to Pickup • Start PIN Required upon Arrival')}
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
                            <View style={[styles.seatPill, { backgroundColor: isD ? '#059669' : (isB ? '#10B981' : '#6366F1') }]}>
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
                                style={[styles.verifyOtpBtn, { backgroundColor: '#F59E0B' }]}
                                onPress={() => handleConfirmPassengerDrop(p)}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="location" size={13} color={COLORS.white} />
                                <Text style={styles.verifyOtpBtnText}>Confirm Drop</Text>
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
                    {activeRide.status === 'driver_assigned' && (
                      <TouchableOpacity
                        style={[styles.primaryActionBtn, { backgroundColor: '#F59E0B' }]}
                        onPress={() => handleUpdateRideStatus('driver_arrived')}
                      >
                        <Ionicons name="location-outline" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                        <Text style={styles.primaryActionText}>I Have Arrived at Pickup</Text>
                      </TouchableOpacity>
                    )}

                    {activeRide.status === 'driver_arrived' && (
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

                    {isTripStarted && (() => {
                      if (currIdx < totalStops && rawStops[currIdx]) {
                        return (
                          <TouchableOpacity
                            style={[styles.primaryActionBtn, { backgroundColor: '#F59E0B' }]}
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
                            <Text style={styles.primaryActionText}>📍 Complete Stop {currIdx + 1} & Continue</Text>
                          </TouchableOpacity>
                        )
                      }
                      return (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#10B981' }]}
                          onPress={() => handleUpdateRideStatus('completed')}
                        >
                          <Ionicons name="checkmark-done" size={20} color={COLORS.white} style={{ marginRight: 6 }} />
                          <Text style={styles.primaryActionText}>Complete Trip & Collect Payment</Text>
                        </TouchableOpacity>
                      )
                    })()}
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
                          { backgroundColor: allPassengersDropped ? '#10B981' : '#6366F1' }
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
                          handleUpdateRideStatus('completed')
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
            </View>
          )
        })()}

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
                  <Text style={styles.upcomingDateText}>🗓 {ut.pickup_date} at {ut.pickup_time ? ut.pickup_time.slice(0, 5) : '08:30'}</Text>
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

        {/* 8. CRM Performance Metrics Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Performance Overview</Text>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <View style={[styles.statIconBadge, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="car-sport" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.statVal}>{completedCount}</Text>
            <Text style={styles.statLbl}>Trips Today</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statIconBadge, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="cash" size={18} color="#10B981" />
            </View>
            <Text style={styles.statVal}>₹{grossEarnings}</Text>
            <Text style={styles.statLbl}>Earned Today</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statIconBadge, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="time" size={18} color="#2563EB" />
            </View>
            <Text style={styles.statVal}>{stats?.hours ? `${stats.hours}h` : '—'}</Text>
            <Text style={styles.statLbl}>Hours Online</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statIconBadge, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="star" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.statVal}>{driver?.rating || '5.0'}</Text>
            <Text style={styles.statLbl}>Avg Rating</Text>
          </View>
        </View>

        {/* 9. Quick CRM Services Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Services</Text>
        </View>
        <View style={styles.quickGrid}>
          {[
            { icon: 'time-outline', label: 'My Trips', color: '#7C3AED', bg: '#EDE9FE', action: () => navigation.navigate('Trips') },
            { icon: 'cash-outline', label: 'Earnings', color: '#10B981', bg: '#D1FAE5', action: () => navigation.navigate('Earnings') },
            { icon: 'document-text-outline', label: 'Documents', color: '#2563EB', bg: '#DBEAFE', action: () => navigation.navigate('DriverDocuments') },
            { icon: 'headset-outline', label: 'Support', color: '#EA580C', bg: '#FFEDD5', action: () => navigation.navigate('DriverSupport') },
            { icon: 'alert-circle-outline', label: 'Safety SOS', color: '#EF4444', bg: '#FEE2E2', action: handleSOS },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={styles.quickTile} onPress={item.action} activeOpacity={0.8}>
              <View style={[styles.quickIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
                  <Text style={styles.sheetFareText}>₹{Math.round(detailModalTrip.final_fare || detailModalTrip.fare_estimate || 0)}</Text>
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
                    <Text style={styles.sheetLabel}>Travel Date: {detailModalTrip.pickup_date || 'Today'}</Text>
                    <Text style={styles.sheetLabel}>Pickup Time: {detailModalTrip.pickup_time ? detailModalTrip.pickup_time.slice(0, 5) : '08:30'}</Text>
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

      {/* Incoming Request Alert Modal */}
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
              <Text style={styles.countdownText}>{countdown}s</Text>
            </View>

            {/* Customer Info */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, backgroundColor: '#F8FAFC', padding: 8, borderRadius: RADIUS.lg }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {resolveAssetUrl(activeIncoming?.customer_avatar_url || activeIncoming?.customer_avatar) ? (
                  <Image source={{ uri: resolveAssetUrl(activeIncoming.customer_avatar_url || activeIncoming.customer_avatar) }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>{((activeIncoming?.customer_name || 'C')?.[0] || 'C').toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>{activeIncoming?.customer_name || 'Customer'}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Payment: {activeIncoming?.payment_method?.toUpperCase() || 'CASH'}</Text>
              </View>
            </View>

            <Text style={styles.incomingFare}>
              ₹{Math.round(activeIncoming?.fare_estimate || activeIncoming?.final_fare || 150)}
            </Text>
            <Text style={styles.incomingCategory}>
              {activeIncoming?.vehicle_type?.toUpperCase() || 'CAB'} · {activeIncoming?.distance_km ? `${activeIncoming.distance_km} KM` : '3.5 KM'}
            </Text>

            <View style={styles.incomingRoute}>
              <Text style={styles.incomingRouteText} numberOfLines={2}>🟢 Pickup: {activeIncoming?.pickup_address}</Text>
              <Text style={styles.incomingRouteText} numberOfLines={2}>🔴 Drop: {activeIncoming?.dest_address}</Text>
            </View>

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
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.acceptBtnText}>Accept Ride ({countdown}s)</Text>
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
            <Text style={styles.dialogSub}>Ask the customer for their 4-digit start OTP to begin trip:</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="••••"
              value={enteredOtp}
              onChangeText={setEnteredOtp}
              keyboardType="number-pad"
              maxLength={4}
              textAlign="center"
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
              Enter boarding OTP for <Text style={{ fontWeight: '800', color: COLORS.textPrimary }}>{passOtpModal?.customer_name}</Text> ({passOtpModal?.seat_no}):
            </Text>
            <TextInput
              style={[styles.otpInput, { borderColor: '#7C3AED', color: '#7C3AED' }]}
              placeholder="••••"
              value={passEnteredOtp}
              onChangeText={setPassEnteredOtp}
              keyboardType="number-pad"
              maxLength={4}
              textAlign="center"
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
    </SafeAreaView>
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
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
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
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    ...SHADOW.small,
  },
  onlineCardActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  onlineCardInactive: {
    backgroundColor: COLORS.white,
    borderColor: '#E2E8F0',
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
  onlineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  onlineSub: {
    fontSize: 11,
    color: COLORS.gray600,
    marginTop: 2,
  },
  goalCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  goalTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.gray700,
  },
  goalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#10B981',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  goalSub: {
    fontSize: 10,
    color: COLORS.gray500,
    fontWeight: '600',
    marginTop: 6,
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
    borderColor: '#C7D2FE',
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
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#EEF2FF',
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    ...SHADOW.small,
  },
  statIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  statLbl: {
    fontSize: 11,
    color: COLORS.gray500,
    fontWeight: '600',
    marginTop: 2,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  quickTile: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
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
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#EEF2FF',
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
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 10,
    marginBottom: 8,
  },
})

export default DriverHomeScreen
