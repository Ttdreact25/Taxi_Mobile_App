import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  StatusBar,
  Image,
  Dimensions,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  Switch,
  Share,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps'
import Constants from 'expo-constants'
import { vehicleTypesAPI, bookingsAPI, customerAPI, paymentAPI, couponsAPI, settingsAPI, resolveAssetUrl } from '../../api/api'
import { searchPlacesService, reverseGeocodeService, getPopularDestinations, TAMIL_NADU_HUBS } from '../../services/locationSearchService'
import { fetchRouteDirections, calculateDistanceKm } from '../../services/directionService'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import ModernBottomSheet from '../../components/common/ModernBottomSheet'
import UniversalRouteMap from '../../components/common/UniversalRouteMap'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const VEHICLE_DEFAULT_ICONS = {
  'Mini (3+1)': 'car-sport',
  'Sedan (4+1)': 'car-sport',
  'SUV (6+1 & 7+1)': 'bus',
  'SUV XL (7+1)': 'bus',
  'Bike': 'bicycle',
  'Auto': 'car',
  'Mini': 'car-sport',
  'Sedan': 'car-sport',
  'SUV': 'bus',
}

const QUICK_TIME_PRESETS = [
  '06:00 AM',
  '08:30 AM',
  '10:00 AM',
  '01:30 PM',
  '05:00 PM',
  '08:30 PM',
  '10:30 PM',
]

const ALL_TIME_SLOTS = [
  '05:00 AM', '05:30 AM', '06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM',
  '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM',
  '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM',
  '11:00 PM', '11:30 PM',
]


const getRelativeTimeString = (hoursToAdd = 2) => {
  const d = new Date(Date.now() + hoursToAdd * 3600 * 1000)
  const coeff = 1000 * 60 * 5
  const rounded = new Date(Math.round(d.getTime() / coeff) * coeff)
  let h = rounded.getHours()
  const m = rounded.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm} ${ampm}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const formatDurationHours = (mins) => {
  if (!mins || mins <= 0) return '0 min'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h > 0 && m > 0) return `${h} hr${h > 1 ? 's' : ''} ${m} min${m > 1 ? 's' : ''}`
  if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`
  return `${m} mins`
}

export default function BookingScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const mapRef = useRef(null)
  const destInputRef = useRef(null)

  // Initial Route Params
  const {
    vehicleTypeId: initTypeId,
    pickup: initPickup,
    destination: initDest,
    destCoords: initDestCoords,
    tripMode: initTripMode, // 'local' | 'outstation' | 'shared'
    isRoundTrip: initIsRoundTrip,
    coupon: initCouponCode,
  } = route.params || {}

  // ── Locations & Autocomplete State ──
  const [pickup, setPickup] = useState(initPickup || '')
  const [destination, setDestination] = useState(initDest || '')
  const [pickupCoords, setPickupCoords] = useState(null)
  const [destCoords, setDestCoords] = useState(initDestCoords || null)
  const [activeInput, setActiveInput] = useState(initDest ? null : 'destination') // 'pickup' | 'destination' | null
  const [predictions, setPredictions] = useState([])
  const [loadingPredictions, setLoadingPredictions] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // ── Route & Map Direction State ──
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [routeDistanceKm, setRouteDistanceKm] = useState(0)
  const [routeDurationMins, setRouteDurationMins] = useState(0)
  const [simulatedCabs, setSimulatedCabs] = useState([])

  // ── Trip Business Rules State ──
  // ONE COMMON FLOW: Local (<= 50 km) vs Outstation (> 50 km), One Way vs Round Trip, Shared (Outstation with 50/50 split)
  const [tripTypeCategory, setTripTypeCategory] = useState(
    initTripMode === 'local' ? 'local' : 'outstation'
  )
  const [isSharedTrip, setIsSharedTrip] = useState(false)
  const [isRoundTrip, setIsRoundTrip] = useState(Boolean(initIsRoundTrip))
  const [outstationTripSubType, setOutstationTripSubType] = useState(
    initIsRoundTrip ? 'round_trip' : null
  ) // null | 'one_way' | 'round_trip' (starts unselected)
  const [rideTimingMode, setRideTimingMode] = useState('now') // 'now' | 'schedule'
  const [localTripSubType, setLocalTripSubType] = useState(null) // null | 'drop' | 'hourly' (starts unselected)
  const [hourlyPackageHours, setHourlyPackageHours] = useState(2) // 1, 2, 3, 4, 6, 8, 10, 12 hours

  // ── Step-by-Step Progressive Disclosure State ──
  // Step 1: Location Setup -> Step 2: Service Selection -> Step 3: Ride Timing -> Step 4: Cabs & Fares Reveal
  const hasInitialDest = Boolean(initDest && (initDestCoords || (typeof initDest === 'string' && initDest.trim().length > 2)))
  const [bookingStep, setBookingStep] = useState(hasInitialDest ? 2 : 1)
  const fadeAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current

  const animateStepTransition = useCallback((nextStep) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    } catch { }
    fadeAnim.setValue(0)
    slideAnim.setValue(18)
    if (typeof nextStep === 'number') {
      setBookingStep(nextStep)
    }
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 16,
        stiffness: 140,
        useNativeDriver: true,
      }),
    ]).start()
  }, [fadeAnim, slideAnim])

  // Ensure trip mode remains strictly synchronized with user's navigation choice
  useEffect(() => {
    if (initTripMode === 'outstation' || initTripMode === 'shared') {
      setTripTypeCategory('outstation')
      setIsSharedTrip(false)
    } else if (initTripMode === 'local') {
      setTripTypeCategory('local')
      setIsSharedTrip(false)
    }
    if (typeof initIsRoundTrip === 'boolean') {
      setIsRoundTrip(initIsRoundTrip)
    }
  }, [initTripMode, initIsRoundTrip])

  // Determine Trip Characteristics: Shared trip is strictly an Outstation trip with 50/50 sharing enabled
  const isOutstationTrip = tripTypeCategory === 'outstation'
  const isLocalTrip = tripTypeCategory === 'local'
  const isSharingEligible = isOutstationTrip && (routeDistanceKm > 240 || isSharedTrip)

  // Strict Distance Limit Rules:
  // 1. Local Trip: Within 50 KM straight-line radius (or <= 60 KM road distance to accommodate city outskirts like Chengalpattu)
  const isWithinLocalRadius = (pickupCoords && destCoords)
    ? (calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude) <= 50.0 || routeDistanceKm <= 60.0)
    : (routeDistanceKm <= 60.0)
  const isLocalDistanceTooFar = isLocalTrip && localTripSubType !== 'hourly' && !isWithinLocalRadius && routeDistanceKm > 60
  // 2. Outstation Trip: Strictly > 50 KM road distance AND outside local radius
  const isOutstationDistanceTooShort = isOutstationTrip && routeDistanceKm > 0 && isWithinLocalRadius && routeDistanceKm <= 50
  // 3. Shared Trip: Strictly > 240 KM
  const isSharingDistanceTooShort = isSharedTrip && routeDistanceKm > 0 && routeDistanceKm <= 240
  const isDistanceInvalid = isOutstationDistanceTooShort || isSharingDistanceTooShort || isLocalDistanceTooFar

  // Prompt Modal when user in Local Trip sets high distance (> 50 KM)
  const [showOutstationPromptModal, setShowOutstationPromptModal] = useState(false)

  const handleSwitchToOutstationFromPrompt = () => {
    setShowOutstationPromptModal(false)
    setTripTypeCategory('outstation')
    setIsSharedTrip(false)
    setIsRoundTrip(false)
    fetchDynamicFares(routeDistanceKm, routeDurationMins)
  }

  const handleChangeDestinationFromPrompt = () => {
    setShowOutstationPromptModal(false)
    setDestination('')
    setDestCoords(null)
    setRouteDistanceKm(0)
    setRouteCoordinates([])
    animateStepTransition(1)
    setTimeout(() => {
      handleFocusDestination()
    }, 300)
  }

  // ── Date & Time Scheduling State (Available for One Way & Round Trip) ──
  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const dayAfterStr = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]

  const [departureDate, setDepartureDate] = useState(todayStr)
  const [departureTime, setDepartureTime] = useState('10:00 AM')
  const [returnDate, setReturnDate] = useState(tomorrowStr)
  const [returnTime, setReturnTime] = useState('05:00 PM')

  // Calendar Modal State
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [activeDateTarget, setActiveDateTarget] = useState('departure') // 'departure' | 'return'
  const [calDate, setCalDate] = useState(new Date())

  // ── Vehicle Selection & Dynamic Fares ──
  const [vehicleTypes, setVehicleTypes] = useState([])
  const [selectedType, setSelectedType] = useState(initTypeId || null)
  const [fareEstimates, setFareEstimates] = useState({})
  const [loadingFares, setLoadingFares] = useState(false)
  const selectedVt = vehicleTypes.find(v => v.id === selectedType) || (vehicleTypes.length > 0 ? vehicleTypes[0] : null)

  // ── SUV Identification & Rooftop Carrier Rules (RTO Regulations permit rooftop carrier ONLY on SUV cabs) ──
  const isSUVType = (vt) => {
    if (!vt) return false
    const name = String(vt.name || '').toLowerCase()
    const category = String(vt.category || vt.category_name || '').toLowerCase()
    const cap = Number(vt.capacity || 0)
    return (
      name.includes('suv') ||
      category.includes('suv') ||
      /innova|ertiga|xylo|scorpio|tavera|marazzo|bolero|carens|safari|harrier|xuv/i.test(name) ||
      cap >= 6
    )
  }
  const isSUVSelected = Boolean(isSUVType(selectedVt))

  // ── Payment & Offers ──
  const [paymentMethod, setPaymentMethod] = useState('cash') // 'cash' | 'razorpay' | 'wallet'
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)

  // ── Ride Preferences & Review Screen (Matching Screenshot Alignment) ──
  const [showReviewScreen, setShowReviewScreen] = useState(false)
  const [passengerCount, setPassengerCount] = useState(1) // Number of persons traveling
  const [luggageCount, setLuggageCount] = useState(2) // Number of bags stepper
  const [rooftopCarrier, setRooftopCarrier] = useState(false) // Rooftop carrier toggle (SUV only)
  const [hasPets, setHasPets] = useState(false) // Traveling with pets toggle
  const [adminPetCharge, setAdminPetCharge] = useState(150) // Admin configured Pet charge
  const [adminRooftopCharge, setAdminRooftopCharge] = useState(250) // Admin configured Rooftop carrier charge
  const [waitingHours, setWaitingHours] = useState(0) // Driver waiting hours

  // Auto-clamp passengerCount to selected vehicle capacity
  useEffect(() => {
    const maxPax = selectedVt?.passenger_capacity || (isSUVSelected ? 7 : (selectedVt?.name?.includes('3') ? 3 : 4))
    if (passengerCount > maxPax) {
      setPassengerCount(Math.max(1, maxPax))
    }
  }, [selectedType, selectedVt, isSUVSelected])

  // Strictly enforce: If a non-SUV vehicle is selected, auto-turn off rooftop carrier
  useEffect(() => {
    if (!isSUVSelected && rooftopCarrier) {
      setRooftopCarrier(false)
    }
  }, [selectedType, isSUVSelected, rooftopCarrier])
  const [driverInstructions, setDriverInstructions] = useState('') // Special pickup instructions
  const [passengerName, setPassengerName] = useState(user?.name || 'Rohith Ram')
  const [passengerPhone, setPassengerPhone] = useState(user?.phone || '+91 8838603768')
  const [passengerEmail, setPassengerEmail] = useState(user?.email || 'rohithsandy194@gmail.com')
  const [showEditPassengerModal, setShowEditPassengerModal] = useState(false)
  const [tempPassengerName, setTempPassengerName] = useState(user?.name || 'Rohith Ram')
  const [tempPassengerPhone, setTempPassengerPhone] = useState(user?.phone || '+91 8838603768')
  const [tempPassengerEmail, setTempPassengerEmail] = useState(user?.email || 'rohithsandy194@gmail.com')
  const [showWaitingModal, setShowWaitingModal] = useState(false)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [selectedHour, setSelectedHour] = useState('10')
  const [selectedMinute, setSelectedMinute] = useState('55')
  const [selectedPeriod, setSelectedPeriod] = useState('AM')
  const searchTimerRef = useRef(null)
  const searchRequestIdRef = useRef(0)

  const handleOpenTimeModal = (target = 'departure') => {
    setActiveDateTarget(target)
    const timeStr = (target === 'return' ? returnTime : departureTime) || '10:55 AM'
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match) {
      setSelectedHour(String(parseInt(match[1], 10)))
      setSelectedMinute(match[2])
      setSelectedPeriod(match[3].toUpperCase())
    } else {
      setSelectedHour('10')
      setSelectedMinute('55')
      setSelectedPeriod('AM')
    }
    setShowTimeModal(true)
  }
  const [showFareDetailModal, setShowFareDetailModal] = useState(false)
  const [hasIntermediateStop, setHasIntermediateStop] = useState(false)
  const [intermediateStop, setIntermediateStop] = useState('')
  const [intermediateStopCoords, setIntermediateStopCoords] = useState(null)
  const [searchCardCollapsed, setSearchCardCollapsed] = useState(false)

  // Clear intermediate stop if user switches to Local Drop (Local Point-to-Point)
  useEffect(() => {
    if (tripTypeCategory === 'local' && localTripSubType === 'drop') {
      if (hasIntermediateStop || intermediateStop) {
        setHasIntermediateStop(false)
        setIntermediateStop('')
        setIntermediateStopCoords(null)
        if (activeInput === 'stop') setActiveInput(null)
      }
    }
  }, [tripTypeCategory, localTripSubType])

  const getCardDateParts = (dateString, timeString) => {
    try {
      const dt = dateString ? new Date(dateString + 'T00:00:00') : new Date()
      const day = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
      const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' })
      return { day, weekday, time: timeString || '10:00 AM' }
    } catch {
      return { day: '9 Oct 26', weekday: 'Friday', time: timeString || '10:00 AM' }
    }
  }

  // Keep passenger details in sync with authenticated user
  useEffect(() => {
    if (user?.name) { setPassengerName(user.name); setTempPassengerName(user.name); }
    if (user?.phone) { setPassengerPhone(user.phone); setTempPassengerPhone(user.phone); }
    if (user?.email) { setPassengerEmail(user.email); setTempPassengerEmail(user.email); }
  }, [user])

  // Fetch Current Location on Mount (Ultra-Fast Dual Stage: Instant Last Known + Background Fresh GPS)
  useEffect(() => {
    let mounted = true
      ; (async () => {
        let hadInitialLoc = false
        try {
          setIsLocating(true)
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            // 1. STAGE 1: Instant Cached Location (0ms immediate response)
            const lastLoc = await Location.getLastKnownPositionAsync().catch(() => null)
            if (lastLoc && mounted) {
              hadInitialLoc = true
              const coords = { latitude: lastLoc.coords.latitude, longitude: lastLoc.coords.longitude }
              setPickupCoords(coords)
              if (mapRef.current) {
                mapRef.current.animateToRegion({
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: 0.035,
                  longitudeDelta: 0.035,
                }, 300)
              }
              generateNearbyCabs(coords)
              setIsLocating(false)
              reverseGeocodeService(coords.latitude, coords.longitude).then(addr => {
                if (mounted && addr && addr !== 'Select Location') {
                  setPickup(typeof addr === 'string' ? addr : addr?.address || 'Current Location')
                }
              }).catch(() => { })
            }

            // 2. STAGE 2: Fresh GPS runs in background (Never blocks UI thread!)
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              .then(async (freshLoc) => {
                if (freshLoc && mounted) {
                  const coords = { latitude: freshLoc.coords.latitude, longitude: freshLoc.coords.longitude }
                  setPickupCoords(coords)
                  if (!hadInitialLoc && mapRef.current) {
                    mapRef.current.animateToRegion({
                      latitude: coords.latitude,
                      longitude: coords.longitude,
                      latitudeDelta: 0.035,
                      longitudeDelta: 0.035,
                    }, 400)
                  }
                  generateNearbyCabs(coords)
                  if (!pickup || pickup === 'Current Location') {
                    const rev = await reverseGeocodeService(coords.latitude, coords.longitude)
                    const addr = typeof rev === 'string' ? rev : rev?.address
                    if (addr && addr !== 'Select Location' && mounted) {
                      setPickup(addr)
                    } else if (mounted && !pickup) {
                      setPickup('Current Location')
                    }
                  }
                }
              })
              .catch(() => { })
              .finally(() => {
                if (mounted) setIsLocating(false)
              })
          }
        } catch (err) {
          console.warn('Location detection notice:', err)
        } finally {
          if (mounted && hadInitialLoc) setIsLocating(false)
        }
      })()

    return () => { mounted = false }
  }, [])

  // Auto-focus destination when customer lands on screen without pre-filled destination
  useEffect(() => {
    if (!hasInitialDest) {
      const timer = setTimeout(() => {
        handleFocusDestination()
      }, 450)
      return () => clearTimeout(timer)
    }
  }, [])

  // Load Active Vehicle Categories from Backend
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await vehicleTypesAPI.types()
        const types = res.data?.types || res.data?.categories || []
        setVehicleTypes(types)
        if (types.length > 0 && !selectedType) {
          setSelectedType(types[0].id)
        }
      } catch (err) {
        console.warn('Failed to fetch vehicle categories:', err)
      }
    }

    const fetchAddonSettings = async () => {
      try {
        const res = await settingsAPI.getAll()
        const s = res.data?.settings || {}
        if (s.pet_charge !== undefined && s.pet_charge !== null && s.pet_charge !== '') {
          setAdminPetCharge(Number(s.pet_charge))
        }
        if (s.rooftop_carrier_charge !== undefined && s.rooftop_carrier_charge !== null && s.rooftop_carrier_charge !== '') {
          setAdminRooftopCharge(Number(s.rooftop_carrier_charge))
        }
      } catch (err) {
        console.warn('Failed to fetch addon settings:', err)
      }
    }

    fetchVehicles()
    fetchAddonSettings()
  }, [])

  // Scatter realistic nearby cabs around the pickup location
  const generateNearbyCabs = (center) => {
    if (!center) return
    const cabs = [
      { id: 'cab-1', lat: center.latitude + 0.0035, lng: center.longitude + 0.0025, heading: 45 },
      { id: 'cab-2', lat: center.latitude - 0.0028, lng: center.longitude + 0.0038, heading: 120 },
      { id: 'cab-3', lat: center.latitude + 0.0018, lng: center.longitude - 0.0042, heading: 260 },
      { id: 'cab-4', lat: center.latitude - 0.0032, lng: center.longitude - 0.0022, heading: 330 },
    ]
    setSimulatedCabs(cabs)
  }

  // Update Route Polyline & Fares whenever pickup, destination, or intermediate stop coordinates change
  useEffect(() => {
    if (pickupCoords?.latitude && destCoords?.latitude) {
      updateDirections()
    } else {
      setFareEstimates({})
      setRouteCoordinates([])
    }
  }, [pickupCoords, destCoords, isRoundTrip, isSharedTrip, tripTypeCategory, localTripSubType, hourlyPackageHours, hasIntermediateStop, intermediateStopCoords])

  const updateDirections = async () => {
    if (!pickupCoords || !destCoords) return
    setLoadingFares(true)
    const waypoints = (hasIntermediateStop && intermediateStopCoords?.latitude && intermediateStopCoords?.longitude)
      ? [intermediateStopCoords]
      : []

    try {
      const res = await fetchRouteDirections(pickupCoords, destCoords, waypoints)
      let distKm = res?.distanceKm
      if (!distKm || distKm <= 0) {
        if (waypoints.length > 0) {
          const d1 = calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, waypoints[0].latitude, waypoints[0].longitude)
          const d2 = calculateDistanceKm(waypoints[0].latitude, waypoints[0].longitude, destCoords.latitude, destCoords.longitude)
          distKm = Math.max(0.5, d1 + d2)
        } else {
          distKm = Math.max(0.5, calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude))
        }
      }
      distKm = Math.max(0.5, distKm)
      const durMins = Math.max(2, res?.durationMins || Math.round(distKm * 2.4))
      setRouteDistanceKm(distKm)
      setRouteDurationMins(durMins)

      if (res?.coordinates?.length > 0) {
        setRouteCoordinates(res.coordinates)
      } else {
        setRouteCoordinates(waypoints.length > 0 ? [pickupCoords, waypoints[0], destCoords] : [pickupCoords, destCoords])
      }

      // Fit map bounds to encompass all waypoints & endpoints
      if (mapRef.current) {
        const fitPts = waypoints.length > 0 ? [pickupCoords, waypoints[0], destCoords] : [pickupCoords, destCoords]
        mapRef.current.fitToCoordinates(fitPts, {
          edgePadding: { top: insets.top + 160, right: 60, bottom: 320, left: 60 },
          animated: true,
        })
      }

      // If route distance exceeds 50 km radius limit, show prompt modal asking user to book in Outstation
      const isWithinRad = (pickupCoords && destCoords)
        ? (calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude) <= 50.0 || distKm <= 60.0)
        : (distKm <= 60.0)
      if (!isWithinRad && distKm > 60 && tripTypeCategory === 'local' && localTripSubType !== 'hourly') {
        setShowOutstationPromptModal(true)
      }

      // Automatically calculate dynamic fares from backend & admin rates
      fetchDynamicFares(distKm, durMins)
    } catch (err) {
      console.warn('Direction route fallback calculation:', err)
      let distKm = 0
      if (waypoints.length > 0) {
        const d1 = calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, waypoints[0].latitude, waypoints[0].longitude)
        const d2 = calculateDistanceKm(waypoints[0].latitude, waypoints[0].longitude, destCoords.latitude, destCoords.longitude)
        distKm = Math.max(0.5, d1 + d2)
      } else {
        distKm = Math.max(0.5, calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude))
      }
      distKm = Math.max(0.5, distKm)
      const durMins = Math.max(2, Math.round(distKm * 2.4))
      setRouteDistanceKm(distKm)
      setRouteDurationMins(durMins)
      setRouteCoordinates(waypoints.length > 0 ? [pickupCoords, waypoints[0], destCoords] : [pickupCoords, destCoords])

      const isWithinRadFallback = (pickupCoords && destCoords)
        ? (calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude) <= 50.0 || distKm <= 60.0)
        : (distKm <= 60.0)
      if (!isWithinRadFallback && distKm > 60 && tripTypeCategory === 'local' && localTripSubType !== 'hourly') {
        setShowOutstationPromptModal(true)
      }

      fetchDynamicFares(distKm, durMins)
    } finally {
      setLoadingFares(false)
    }
  }

  // Calculate Dynamic Fare using Admin settings
  const fetchDynamicFares = async (distKm, durMins) => {
    try {
      const isOutstation = (tripTypeCategory === 'outstation') || (!isWithinLocalRadius && distKm > 60 && localTripSubType !== 'hourly')
      const effectiveMode = isOutstation ? 'outstation' : tripTypeCategory
      const payload = {
        pickup_lat: pickupCoords?.latitude || 13.0827,
        pickup_lng: pickupCoords?.longitude || 80.2707,
        dest_lat: destCoords?.latitude || (pickupCoords?.latitude || 13.0827),
        dest_lng: destCoords?.longitude || (pickupCoords?.longitude || 80.2707),
        distance_km: distKm,
        duration_min: durMins,
        is_round_trip: isRoundTrip,
        trip_type: isOutstation ? (isRoundTrip ? 'outstation_round_trip' : 'outstation_one_way') : (isRoundTrip ? 'local_round_trip' : 'local'),
        trip_mode: effectiveMode,
        trip_sub_type: !isOutstation ? localTripSubType : (isRoundTrip ? 'round_trip' : 'one_way'),
        package_hours: (!isOutstation && localTripSubType === 'hourly') ? hourlyPackageHours : 0,
        is_long_trip: isOutstation,
        is_outstation: isOutstation,
        is_shared: isSharedTrip,
      }

      const res = await bookingsAPI.fareEstimate(payload)
      if (res.data?.status === 'success') {
        const estimatesMap = {}
        const rawList = res.data.all_estimates || []
        if (Array.isArray(rawList) && rawList.length > 0) {
          rawList.forEach(item => {
            const vId = item.vehicle_type_id || item.id
            if (vId) {
              if (localTripSubType === 'hourly' && !isOutstation) {
                estimatesMap[vId] = Math.round(item.base_package_fare || (hourlyPackageHours * (item.hourly_rate || 250)))
              } else {
                estimatesMap[vId] = Math.round(item.final_fare || item.final || item.total_fare || item.fare || item.subtotal || 0)
              }
            }
          })
        } else if (res.data.estimates && typeof res.data.estimates === 'object') {
          Object.keys(res.data.estimates).forEach(k => {
            const val = res.data.estimates[k]
            if (localTripSubType === 'hourly' && !isOutstation) {
              estimatesMap[k] = Math.round(typeof val === 'object' ? (val.base_package_fare || val.base_fare || (hourlyPackageHours * (val.hourly_rate || 250))) : val)
            } else {
              estimatesMap[k] = Math.round(typeof val === 'object' ? (val.final_fare || val.final || val.total_fare || 0) : val)
            }
          })
        }

        if (Object.keys(estimatesMap).length > 0) {
          setFareEstimates(estimatesMap)
        } else {
          fallbackClientCalculateFares(distKm, durMins, isOutstation)
        }
      } else {
        fallbackClientCalculateFares(distKm, durMins, isOutstation)
      }
    } catch (err) {
      fallbackClientCalculateFares(distKm, durMins, tripTypeCategory === 'outstation')
    }
  }

  const fallbackClientCalculateFares = (distKm, durMins, isOutstation) => {
    const estimates = {}
    vehicleTypes.forEach(vt => {
      if (!isOutstation && localTripSubType === 'hourly') {
        const hourlyRate = parseFloat(vt.hourly_rate || 250)
        const basePackage = hourlyPackageHours * hourlyRate
        estimates[vt.id] = Math.round(basePackage)
        return
      }

      const baseFare = parseFloat(vt.base_fare || (vt.name?.toLowerCase().includes('mini') ? 80 : 120))
      const kmRate = isRoundTrip
        ? parseFloat(vt.round_trip_per_km || vt.price_per_km || 20)
        : isOutstation
          ? parseFloat(vt.one_way_per_km || vt.price_per_km || 18)
          : parseFloat(vt.price_per_km || 15)
      const minRate = isRoundTrip
        ? parseFloat(vt.round_trip_per_min || vt.price_per_min || 1.5)
        : parseFloat(vt.price_per_min || 1.5)

      const billableDist = isRoundTrip ? distKm * 2 : distKm
      const billableMins = isRoundTrip ? durMins * 2 : durMins

      let totalFare = baseFare + (billableDist * kmRate) + (billableMins * minRate)
      if (isSharedTrip) {
        totalFare = totalFare * 0.5 // 50% split for ride sharing
      }
      estimates[vt.id] = Math.round(totalFare)
    })
    setFareEstimates(estimates)
  }

  // Open instant suggestions when user focuses on destination
  const handleFocusDestination = () => {
    setActiveInput('destination')
    destInputRef.current?.focus()
    if (!destination || destination.trim().length < 2) {
      const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
      setPredictions(popular)
    } else {
      handleSearchTextChange(destination, 'destination')
    }
  }

  // Open instant suggestions when user focuses on pickup
  const handleFocusPickup = () => {
    setActiveInput('pickup')
    if (!pickup || pickup.trim().length < 2) {
      const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
      setPredictions(popular)
    } else {
      handleSearchTextChange(pickup, 'pickup')
    }
  }

  // Live Location Autocomplete Search with Instant 0ms Matching + 200ms Debounce & Cancellation Guard
  const handleSearchTextChange = (text, target) => {
    if (target === 'pickup') {
      setPickup(text)
    } else if (target === 'stop') {
      setIntermediateStop(text)
      setIntermediateStopCoords(null)
    } else {
      setDestination(text)
    }

    const clean = (text || '').trim()
    if (!clean) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
      setPredictions(popular)
      setLoadingPredictions(false)
      return
    }

    // 1. STAGE 1: Instant 0ms Local Matching from TAMIL_NADU_HUBS
    const qLower = clean.toLowerCase()
    const instantLocalMatches = TAMIL_NADU_HUBS.filter(hub => {
      const hName = hub.name.toLowerCase()
      const hAddr = hub.address.toLowerCase()
      return hName.includes(qLower) || hAddr.includes(qLower)
    }).map(hub => {
      const dist = calculateDistanceKm(pickupCoords?.latitude || 13.0827, pickupCoords?.longitude || 80.2707, hub.lat, hub.lng)
      return {
        place_id: `instant_${hub.lat}_${hub.lng}_${encodeURIComponent(hub.name)}`,
        description: `${hub.name}, ${hub.address}`,
        structured_formatting: {
          main_text: hub.name,
          secondary_text: hub.address,
        },
        geometry: { location: { lat: hub.lat, lng: hub.lng } },
        latitude: hub.lat,
        longitude: hub.lng,
        distance_km: dist,
        category_tag: hub.tag,
      }
    })

    if (instantLocalMatches.length > 0) {
      setPredictions(instantLocalMatches.slice(0, 10))
    }

    // 2. STAGE 2: Debounced 200ms Live Multi-Engine Search with Cancellation Guard
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    const currentReqId = ++searchRequestIdRef.current
    if (clean.length < 2) return

    setLoadingPredictions(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchPlacesService(clean, pickupCoords?.latitude, pickupCoords?.longitude)
        // Discard older out-of-order response
        if (searchRequestIdRef.current !== currentReqId) return

        if (Array.isArray(res) && res.length > 0) {
          setPredictions(res)
        } else if (instantLocalMatches.length > 0) {
          setPredictions(instantLocalMatches)
        } else {
          const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
          const filtered = popular.filter(item =>
            item.description.toLowerCase().includes(qLower) ||
            (item.structured_formatting?.main_text || '').toLowerCase().includes(qLower)
          )
          setPredictions(filtered)
        }
      } catch (err) {
        if (searchRequestIdRef.current === currentReqId && instantLocalMatches.length === 0) {
          setPredictions(getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude))
        }
      } finally {
        if (searchRequestIdRef.current === currentReqId) {
          setLoadingPredictions(false)
        }
      }
    }, 150)
  }

  // Handle selecting a prediction (correctly extracting latitude and longitude numbers)
  const handleSelectPrediction = (item, target) => {
    Keyboard.dismiss()
    setPredictions([])
    setActiveInput(null)

    const lat = parseFloat(item.latitude || item.geometry?.location?.lat || item.lat || 0)
    const lng = parseFloat(item.longitude || item.geometry?.location?.lng || item.lng || 0)
    const coords = (lat && lng && !isNaN(lat) && !isNaN(lng)) ? { latitude: lat, longitude: lng } : null

    const displayName = item.structured_formatting?.main_text
      ? `${item.structured_formatting.main_text}, ${item.structured_formatting.secondary_text || ''}`
      : (item.description || item.address || item.name)

    if (target === 'pickup') {
      setPickup(displayName)
      if (coords) {
        setPickupCoords(coords)
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          }, 500)
        }
      }
    } else if (target === 'stop') {
      setIntermediateStop(displayName)
      if (coords) {
        setIntermediateStopCoords(coords)
      }
    } else {
      setDestination(displayName)
      if (coords) {
        setDestCoords(coords)
      }
      if (tripTypeCategory === 'local' && !localTripSubType) {
        setLocalTripSubType('drop')
      }
      if (tripTypeCategory === 'outstation' && !outstationTripSubType) {
        setOutstationTripSubType('one_way')
        setIsRoundTrip(false)
        setIsSharedTrip(false)
      }
    }
  }

  // Handle Quick Destination Preset Chips
  const handleQuickPresetSelect = async (preset) => {
    const currentLat = pickupCoords?.latitude || 13.0827
    const currentLng = pickupCoords?.longitude || 80.2707
    try {
      const preds = await searchPlacesService(preset.query, currentLat, currentLng)
      if (preds && preds.length > 0) {
        handleSelectPrediction(preds[0], 'destination')
      } else {
        setDestination(preset.name)
        handleFocusDestination()
      }
    } catch {
      setDestination(preset.name)
      handleFocusDestination()
    }
  }

  // Automatically resolve text on enter / submit
  const handleLocationSubmit = async (target) => {
    const text = target === 'pickup' ? pickup : (target === 'stop' ? intermediateStop : destination)
    if (!text || text.trim().length < 2) return

    if (target === 'pickup' && pickupCoords) return
    if (target === 'stop' && intermediateStopCoords) return
    if (target === 'destination' && destCoords) return

    try {
      const preds = await searchPlacesService(text, pickupCoords?.latitude, pickupCoords?.longitude)
      if (preds && preds.length > 0) {
        handleSelectPrediction(preds[0], target)
      }
    } catch (e) {
      console.warn('Geocoding submit notice:', e)
    }
  }

  const handleSwapLocations = () => {
    const tempP = pickup
    const tempPC = pickupCoords
    setPickup(destination)
    setPickupCoords(destCoords)
    setDestination(tempP)
    setDestCoords(tempPC)
  }

  const handleUseCurrentLocation = async () => {
    try {
      setIsLocating(true)
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location Permission Required', 'Please enable location permissions in device settings to detect your current pickup spot.')
        setIsLocating(false)
        return
      }

      // Fast response: Cached Last Known position
      const lastLoc = await Location.getLastKnownPositionAsync().catch(() => null)
      if (lastLoc) {
        const coords = { latitude: lastLoc.coords.latitude, longitude: lastLoc.coords.longitude }
        setPickupCoords(coords)
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 350)
        }
        generateNearbyCabs(coords)
        reverseGeocodeService(coords.latitude, coords.longitude).then(addr => {
          if (addr && addr !== 'Select Location') {
            setPickup(typeof addr === 'string' ? addr : addr?.address || 'Current Location')
          } else {
            setPickup('Current Location')
          }
        }).catch(() => {
          setPickup('Current Location')
        })
      }

      // Fresh GPS fix with balanced accuracy
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(async (freshLoc) => {
          if (freshLoc) {
            const coords = { latitude: freshLoc.coords.latitude, longitude: freshLoc.coords.longitude }
            setPickupCoords(coords)
            if (!lastLoc && mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }, 350)
            }
            generateNearbyCabs(coords)
            const rev = await reverseGeocodeService(coords.latitude, coords.longitude)
            const addr = typeof rev === 'string' ? rev : rev?.address
            if (addr && addr !== 'Select Location') {
              setPickup(addr)
            } else if (!lastLoc) {
              setPickup('Current Location')
            }
          }
        })
        .catch((err) => {
          console.warn('GPS location fetch error:', err)
        })
        .finally(() => {
          setIsLocating(false)
          setActiveInput(null)
          setPredictions([])
          Keyboard.dismiss()
        })
    } catch (e) {
      console.warn('handleUseCurrentLocation error:', e)
      setIsLocating(false)
    }
  }

  const handleRecenterMap = async () => {
    try {
      if (pickupCoords && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: pickupCoords.latitude,
          longitude: pickupCoords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 300)
      }
      const lastLoc = await Location.getLastKnownPositionAsync().catch(() => null)
      if (lastLoc) {
        const coords = { latitude: lastLoc.coords.latitude, longitude: lastLoc.coords.longitude }
        setPickupCoords(coords)
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 300)
        }
        if (!pickup || pickup === 'Current Location') {
          reverseGeocodeService(coords.latitude, coords.longitude).then(addr => {
            if (addr && addr !== 'Select Location') {
              setPickup(typeof addr === 'string' ? addr : addr?.address || 'Current Location')
            }
          }).catch(() => { })
        }
      }
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(loc => {
          if (loc) {
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
            setPickupCoords(coords)
            if (mapRef.current && !lastLoc) {
              mapRef.current.animateToRegion({
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }, 300)
            }
            if (!pickup || pickup === 'Current Location') {
              reverseGeocodeService(coords.latitude, coords.longitude).then(addr => {
                if (addr && addr !== 'Select Location') {
                  setPickup(typeof addr === 'string' ? addr : addr?.address || 'Current Location')
                }
              }).catch(() => { })
            }
          }
        })
        .catch(() => { })
    } catch (e) { }
  }

  // Toggle 50/50 Share Ride with Full Fare Alert Commitment
  const handleToggleSharing = () => {
    if (isSharedTrip) {
      setIsSharedTrip(false)
      fetchDynamicFares(routeDistanceKm, routeDurationMins)
      return
    }

    if (user?.verification_status && user?.verification_status !== 'verified') {
      Alert.alert(
        'Identity Verification Required 🛡️',
        'Only Admin-verified passengers can publish or join a 50/50 Shared Trip. Please complete your Aadhaar KYC verification.',
        [
          { text: 'Verify Identity', onPress: () => navigation.navigate('IdentityVerification') },
          { text: 'Cancel', style: 'cancel' }
        ]
      )
      return
    }

    Alert.alert(
      'Shared Outstation Trip Terms ⚠️',
      'When you enable ride sharing, any verified co-passenger can join your trip.\n\n⚠️ IMPORTANT RULE:\nIf NO other passenger joins your shared ride before departure time, YOU (the 1st customer who booked) must pay the FULL TRIP AMOUNT.\n\nDo you accept and want to enable ride sharing?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I Agree & Enable',
          onPress: () => {
            setIsSharedTrip(true)
            fetchDynamicFares(routeDistanceKm, routeDurationMins)
          }
        }
      ]
    )
  }

  // Confirm and Create Booking
  const handleBookRide = async () => {
    if (!pickupCoords || !pickup?.trim()) {
      Alert.alert('Select Pickup Location', 'Please set your pickup location to proceed.')
      return
    }

    if (!destCoords || !destination?.trim()) {
      Alert.alert('Destination Required 📍', 'Entha trip-kum destination illamal book seiya mudiyadhu. Please enter your drop destination.')
      return
    }

    if (Math.abs(pickupCoords.latitude - destCoords.latitude) < 0.0001 && Math.abs(pickupCoords.longitude - destCoords.longitude) < 0.0001) {
      Alert.alert('Invalid Destination 📍', 'Pickup and destination cannot be the same location. Please enter a valid drop destination.')
      return
    }

    const isHourlyLocal = (!isOutstationTrip && localTripSubType === 'hourly')
    const effectiveDestCoords = destCoords
    const effectiveDestAddress = destination.trim()

    // ── 50 KM Local Radius Max & Auto-Conversion to Long Trip / 240 KM Sharing Enforcement ──
    let effectiveOutstation = isOutstationTrip
    let effectiveTripTypeCategory = tripTypeCategory
    const isWithinRadOnSubmit = (pickupCoords && destCoords)
      ? (calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude) <= 50.0 || routeDistanceKm <= 60.0)
      : (routeDistanceKm <= 60.0)
    if (tripTypeCategory === 'local' && !isWithinRadOnSubmit && routeDistanceKm > 60 && !isHourlyLocal) {
      setShowOutstationPromptModal(true)
      return
    }

    if (effectiveOutstation && routeDistanceKm > 0 && isWithinRadOnSubmit && routeDistanceKm <= 50) {
      Alert.alert(
        '🚫 Minimum Distance Required',
        `Outstation trips require a minimum travel distance of 50 km. Your selected route is ${routeDistanceKm.toFixed(1)} km.\n\nPlease select Local Trip mode.`,
        [{ text: 'OK', style: 'default' }]
      )
      return
    }

    if (isSharedTrip && routeDistanceKm <= 240) {
      Alert.alert(
        '🚫 Ride Sharing Limit',
        `Ride Sharing is only available for trips greater than 240 km. Your selected route is ${routeDistanceKm.toFixed(1)} km.`,
        [{ text: 'OK', style: 'default' }]
      )
      return
    }

    const selectedVt = vehicleTypes.find(v => v.id === selectedType) || vehicleTypes[0]
    if (!selectedVt) {
      Alert.alert('Select Category', 'Please select a vehicle category.')
      return
    }

    // Dynamic Fare Calculation
    const baseFare = parseFloat(selectedVt.base_fare || 80)
    const kmRate = isRoundTrip
      ? parseFloat(selectedVt.round_trip_per_km || selectedVt.price_per_km || 20)
      : effectiveOutstation
        ? parseFloat(selectedVt.one_way_per_km || selectedVt.price_per_km || 18)
        : parseFloat(selectedVt.price_per_km || 15)
    const minRate = parseFloat(selectedVt.price_per_min || 1.5)
    const billableDist = isRoundTrip ? routeDistanceKm * 2 : routeDistanceKm
    const billableMins = isRoundTrip ? routeDurationMins * 2 : routeDurationMins
    let rawFare = fareEstimates[selectedVt.id] || Math.round(baseFare + (billableDist * kmRate) + (billableMins * minRate))
    if (isSharedTrip) rawFare *= 0.5

    const waitHourlyRate = parseFloat(selectedVt.waiting_charge_per_hour || (selectedVt.waiting_charge_per_min ? selectedVt.waiting_charge_per_min * 60 : (selectedVt.waiting_charge ? selectedVt.waiting_charge * 60 : 100)))
    const waitingCharge = waitingHours > 0 ? Math.round(waitingHours * waitHourlyRate) : 0
    const petCharge = hasPets ? adminPetCharge : 0
    const rooftopCharge = (isSUVSelected && rooftopCarrier) ? adminRooftopCharge : 0

    const discountAmount = appliedCoupon?.discount_amount || 0
    const finalFare = Math.max(30, Math.round(rawFare + waitingCharge + petCharge + rooftopCharge - discountAmount))

    setBookingLoading(true)
    try {
      // Build structured preferences note string to guarantee display on all Admin panels & driver sheets
      const notesParts = []
      if (passengerCount > 0) notesParts.push(`👥 Passengers: ${passengerCount} Person${passengerCount > 1 ? 's' : ''}`)
      if (hasIntermediateStop && intermediateStop?.trim()) notesParts.push(`🛑 Via Stop: ${intermediateStop.trim()}`)
      if (luggageCount > 0) notesParts.push(`🧳 Luggage: ${luggageCount} Bags`)
      if (hasPets) notesParts.push(`🐾 Traveling with Pets: Yes (+₹${petCharge})`)
      if (isSUVSelected && rooftopCarrier) notesParts.push(`📦 Rooftop Carrier: Yes (+₹${rooftopCharge})`)
      if (waitingHours > 0) notesParts.push(`⏱️ Waiting Time: ${waitingHours} hrs (₹${waitingCharge})`)
      if (driverInstructions?.trim()) notesParts.push(`📝 Driver Note: ${driverInstructions.trim()}`)
      if (passengerName?.trim() && passengerName !== user?.name) {
        notesParts.push(`👤 Passenger: ${passengerName.trim()}${passengerPhone ? ` (${passengerPhone.trim()})` : ''}`)
      }
      const compiledNotes = notesParts.join(' | ')

      const payload = {
        vehicle_type_id: selectedVt.id,
        pickup_address: pickup,
        dest_address: effectiveDestAddress,
        pickup_lat: pickupCoords.latitude,
        pickup_lng: pickupCoords.longitude,
        dest_lat: effectiveDestCoords.latitude,
        dest_lng: effectiveDestCoords.longitude,
        distance_km: routeDistanceKm || (isHourlyLocal ? (hourlyPackageHours * 10) : 5),
        duration_minutes: routeDurationMins || (isHourlyLocal ? (hourlyPackageHours * 60) : 15),
        duration_min: routeDurationMins || (isHourlyLocal ? (hourlyPackageHours * 60) : 15),
        fare: finalFare,
        final_fare: finalFare,
        payment_method: paymentMethod,
        is_round_trip: isRoundTrip,
        is_emergency: 0,
        priority: 'standard',
        booking_mode: rideTimingMode,
        departure_date: departureDate,
        departure_time: departureTime,
        pickup_date: departureDate,
        pickup_time: departureTime,
        return_pickup_date: isRoundTrip ? returnDate : null,
        return_pickup_time: isRoundTrip ? returnTime : null,
        return_date: isRoundTrip ? returnDate : null,
        return_time: isRoundTrip ? returnTime : null,
        is_shared: isSharedTrip,
        trip_type: effectiveOutstation ? (isRoundTrip ? 'outstation_round_trip' : 'outstation_one_way') : (isRoundTrip ? 'local_round_trip' : 'local'),
        trip_mode: effectiveTripTypeCategory,
        trip_sub_type: !effectiveOutstation ? localTripSubType : (isRoundTrip ? 'round_trip' : 'one_way'),
        package_hours: (!effectiveOutstation && localTripSubType === 'hourly') ? hourlyPackageHours : 0,
        is_long_trip: effectiveOutstation,
        is_outstation: effectiveOutstation,
        coupon_code: appliedCoupon?.code || null,
        coupon_id: appliedCoupon?.id || null,
        discount_amount: appliedCoupon?.discount_amount || 0,
        city_name: getDetectedCity() || '',
        notes: compiledNotes || null,
        passenger_count: passengerCount,
        passengers_count: passengerCount,
        passengers: passengerCount,
        luggage_count: luggageCount,
        bags_count: luggageCount,
        has_pets: hasPets ? 1 : 0,
        pets: hasPets ? 1 : 0,
        traveling_with_pets: hasPets ? 1 : 0,
        pet_charge: petCharge,
        rooftop_carrier: (isSUVSelected && rooftopCarrier) ? 1 : 0,
        roof_carrier: (isSUVSelected && rooftopCarrier) ? 1 : 0,
        rooftop: (isSUVSelected && rooftopCarrier) ? 1 : 0,
        rooftop_charge: rooftopCharge,
        waiting_time_hours: waitingHours,
        waiting_hours: waitingHours,
        waiting_charge: waitingCharge,
        driver_instructions: driverInstructions || null,
        passenger_name: passengerName || null,
        passenger_phone: passengerPhone || null,
        passenger_email: passengerEmail || null,
        via_stop: (hasIntermediateStop && intermediateStop?.trim()) ? intermediateStop.trim() : null,
        intermediate_stop: (hasIntermediateStop && intermediateStop?.trim()) ? intermediateStop.trim() : null,
        intermediate_stop_lat: (hasIntermediateStop && intermediateStopCoords?.latitude) ? intermediateStopCoords.latitude : null,
        intermediate_stop_lng: (hasIntermediateStop && intermediateStopCoords?.longitude) ? intermediateStopCoords.longitude : null,
        stops: (hasIntermediateStop && intermediateStop?.trim()) ? [{
          address: intermediateStop.trim(),
          lat: intermediateStopCoords?.latitude || null,
          lng: intermediateStopCoords?.longitude || null,
          completed: false
        }] : null,
      }

      const res = await bookingsAPI.create(payload)
      if (res.data?.status === 'success' && res.data?.booking_id) {
        setShowReviewScreen(false)
        if (isSharedTrip) {
          Alert.alert(
            'Shared Ride Published 🎉',
            'Your 50/50 shared outstation ride is live! Co-passengers can now discover and request to join your trip.',
            [
              {
                text: 'View in Shared Rides 👥',
                onPress: () => navigation.navigate('SharedTrips')
              },
              {
                text: 'Track Booking 📍',
                onPress: () => navigation.navigate('BookingTrack', { bookingId: res.data.booking_id })
              }
            ]
          )
        } else {
          navigation.navigate('BookingTrack', { bookingId: res.data.booking_id })
        }
      } else {
        Alert.alert('Booking Error', res.data?.message || 'Could not place booking. Please try again.')
      }
    } catch (err) {
      Alert.alert('Booking Failed', err.response?.data?.message || err.message || 'Network error occurred.')
    } finally {
      setBookingLoading(false)
    }
  }

  // Calendar Helpers
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return 'Select Date'
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }
    return dateStr
  }

  const curYear = calDate.getFullYear()
  const curMonth = calDate.getMonth()
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
  const firstDayIndex = new Date(curYear, curMonth, 1).getDay()
  const todayDateObj = new Date()

  const handleSelectCalendarDay = (dayNum) => {
    const y = calDate.getFullYear()
    const m = String(calDate.getMonth() + 1).padStart(2, '0')
    const d = String(dayNum).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`

    if (activeDateTarget === 'return') {
      setReturnDate(dateStr)
    } else {
      setDepartureDate(dateStr)
    }
  }

  const handleMapPress = async (e) => {
    const coord = e.nativeEvent?.coordinate
    if (!coord || !coord.latitude || !coord.longitude) return
    try {
      const addrRes = await reverseGeocodeService(coord.latitude, coord.longitude)
      const addr = typeof addrRes === 'string' ? addrRes : addrRes?.address || `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`
      if (activeInput === 'pickup') {
        setPickupCoords(coord)
        setPickup(addr)
        setActiveInput(null)
      } else {
        setDestCoords(coord)
        setDestination(addr)
        setActiveInput(null)
        animateStepTransition(2)
      }
    } catch (err) {
      console.warn('Map tap geocode error:', err)
    }
  }

  // ── City Detection & Coupon Management ──
  const getDetectedCity = useCallback(() => {
    if (pickup && typeof pickup === 'string') {
      const lower = pickup.toLowerCase()
      if (lower.includes('chennai') || lower.includes('madras')) return 'Chennai'
      if (lower.includes('madurai')) return 'Madurai'
      if (lower.includes('coimbatore') || lower.includes('kovai')) return 'Coimbatore'
      if (lower.includes('trichy') || lower.includes('tiruchirappalli')) return 'Trichy'
      if (lower.includes('salem')) return 'Salem'
      if (lower.includes('tirunelveli')) return 'Tirunelveli'
    }
    return null
  }, [pickup])

  const fetchCityCoupons = useCallback(async () => {
    setLoadingCoupons(true)
    setCouponError('')
    try {
      const cityName = getDetectedCity()
      const [res, tripsRes] = await Promise.allSettled([
        couponsAPI.active({
          city: cityName || '',
          latitude: pickupCoords?.latitude,
          longitude: pickupCoords?.longitude,
        }),
        bookingsAPI.myTrips({ per_page: 50 }),
      ])

      const list = res.status === 'fulfilled' ? (res.value.data?.coupons || []) : []
      const usedCodes = new Set()
      const usedIds = new Set()
      if (tripsRes.status === 'fulfilled') {
        const trips = tripsRes.value?.data?.bookings || tripsRes.value?.data?.trips || []
        trips.forEach(t => {
          if (t.status !== 'cancelled') {
            if (t.coupon_id) usedIds.add(Number(t.coupon_id))
            if (t.coupon_code) usedCodes.add(String(t.coupon_code).toUpperCase().trim())
          }
        })
      }

      // Strict City Filter on frontend:
      // If coupon belongs to Madurai (or any specific city), show ONLY if ride city matches!
      const currentCityLower = (cityName || '').toLowerCase().trim()
      const filteredByCity = list.filter(c => {
        if (!c.city_name && (!c.city_id || Number(c.city_id) === 0)) {
          return true // Global / All-cities coupon
        }
        if (!currentCityLower) {
          return false // If city is unknown, hide city-specific coupons
        }
        const cCityLower = String(c.city_name || '').toLowerCase().trim()
        return currentCityLower.includes(cCityLower) || cCityLower.includes(currentCityLower)
      })

      const processed = filteredByCity.map(c => {
        const isUsed = Boolean(
          c.is_used ||
          c.is_disabled ||
          usedIds.has(Number(c.id)) ||
          usedCodes.has(String(c.code).toUpperCase().trim())
        )
        return {
          ...c,
          is_used: isUsed,
          is_disabled: isUsed,
        }
      })

      setAvailableCoupons(processed)
    } catch (err) {
      console.warn('Failed to load active coupons:', err)
    } finally {
      setLoadingCoupons(false)
    }
  }, [getDetectedCity, pickupCoords])

  const handleValidateAndApplyCoupon = useCallback(async (codeToApply) => {
    const code = (codeToApply || couponInput || '').trim().toUpperCase()
    if (!code) {
      setCouponError('Please enter a promo code')
      Alert.alert('Promo Code Required', 'Please enter a valid promo code.')
      return
    }

    const selectedVt = vehicleTypes.find(v => v.id === selectedType) || vehicleTypes[0]
    const baseFare = parseFloat(selectedVt?.base_fare || 80)
    const rawFare = selectedVt ? (fareEstimates[selectedVt.id] || Math.round(baseFare + (routeDistanceKm * 18))) : 150
    const cityName = getDetectedCity()

    setLoadingCoupons(true)
    setCouponError('')
    try {
      const res = await couponsAPI.validate({
        code,
        fare: rawFare,
        city: cityName || '',
        city_name: cityName || '',
        pickup_lat: pickupCoords?.latitude,
        pickup_lng: pickupCoords?.longitude,
      })

      if (res.data?.status === 'success' && res.data?.coupon) {
        const cp = res.data.coupon
        const discount = parseFloat(res.data.discount || cp.discount_amount || 0)
        setAppliedCoupon({
          ...cp,
          discount_amount: discount,
          final_fare: res.data.final_fare,
        })
        setShowCouponModal(false)
        setCouponInput('')
        Alert.alert('Offer Applied 🎉', `${cp.code} applied successfully! You save ₹${discount} on this ride.`)
      } else {
        const msg = res.data?.message || 'Invalid or expired promo code for this ride.'
        setCouponError(msg)
        Alert.alert('Invalid Promo Code', msg)
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to validate promo code.'
      setCouponError(msg)
      Alert.alert('Coupon Notice', msg)
    } finally {
      setLoadingCoupons(false)
    }
  }, [couponInput, vehicleTypes, selectedType, fareEstimates, routeDistanceKm, getDetectedCity, pickupCoords])

  const handleRemoveCoupon = useCallback(() => {
    setAppliedCoupon(null)
    setCouponError('')
  }, [])

  // Auto-apply initial coupon code passed from route params (e.g. from HomeScreen promo card)
  useEffect(() => {
    if (initCouponCode && vehicleTypes.length > 0) {
      handleValidateAndApplyCoupon(initCouponCode)
    }
  }, [initCouponCode, vehicleTypes.length])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── 1. Full Screen Interactive Map (Zero Black Screen Guaranteed) ── */}
      <UniversalRouteMap
        ref={mapRef}
        pickupCoords={pickupCoords}
        destCoords={destCoords}
        routeCoordinates={routeCoordinates}
        simulatedCabs={simulatedCabs}
        waypoints={hasIntermediateStop && intermediateStopCoords ? [{ ...intermediateStopCoords, address: intermediateStop }] : []}
        onMapPress={handleMapPress}
        initialRegion={{
          latitude: pickupCoords?.latitude || 13.0827,
          longitude: pickupCoords?.longitude || 80.2707,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
      />

      {/* Floating Recenter FAB */}
      <TouchableOpacity
        style={[
          styles.floatingRecenterFab,
          { bottom: searchCardCollapsed ? Math.min(536, SCREEN_HEIGHT * 0.60 + 16) : 90 },
        ]}
        onPress={handleRecenterMap}
        activeOpacity={0.85}
      >
        <Ionicons name="locate-outline" size={22} color="#0F172A" />
      </TouchableOpacity>

      {/* ── 3. Modern Draggable Bottom Sheet (Rendered ONLY after tapping "Search Cabs") ── */}
      {searchCardCollapsed && (
        <ModernBottomSheet
          snapPoints={[
            Math.min(460, SCREEN_HEIGHT * 0.58),
            Math.min(580, SCREEN_HEIGHT * 0.72),
            Math.min(720, SCREEN_HEIGHT * 0.88),
          ]}
          initialIndex={1}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
            {/* ── Cabs & Live Fares (Opened after Search Cabs is pressed) ── */}
            <Animated.View style={[styles.stepAnimatedWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Trip Summary / Modify Bar */}
              <View style={styles.step4SummaryBar}>
                <TouchableOpacity
                  style={styles.step4SummaryPill}
                  onPress={() => setSearchCardCollapsed(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="location" size={11} color="#D97706" />
                  <Text style={styles.step4SummaryPillText} numberOfLines={1}>
                    {destination ? destination.slice(0, 12) : 'Location'}...
                  </Text>
                  <Ionicons name="pencil" size={10} color="#94A3B8" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.step4SummaryPill}
                  onPress={() => setSearchCardCollapsed(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="car-sport" size={11} color="#7C3AED" />
                  <Text style={styles.step4SummaryPillText} numberOfLines={1}>
                    {isOutstationTrip ? (isRoundTrip ? 'Round Trip' : 'One Way') : (localTripSubType === 'hourly' ? `${hourlyPackageHours}h Rental` : 'Local Drop')}
                  </Text>
                  <Ionicons name="pencil" size={10} color="#94A3B8" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.step4SummaryPill}
                  onPress={() => handleOpenTimeModal('departure')}
                  activeOpacity={0.8}
                >
                  <Ionicons name={rideTimingMode === 'now' ? 'flash' : 'calendar'} size={11} color="#059669" />
                  <Text style={styles.step4SummaryPillText} numberOfLines={1}>
                    {rideTimingMode === 'now' ? 'Ride Now' : departureTime}
                  </Text>
                  <Ionicons name="pencil" size={10} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Route Metrics Row */}
              {routeDistanceKm > 0 && (
                <View style={styles.routeMetricsRow}>
                  <View style={styles.metricItem}>
                    <Ionicons name="navigate-circle" size={16} color="#D97706" />
                    <Text style={styles.metricText}>
                      {routeDistanceKm.toFixed(1)} km {isRoundTrip ? `(Round: ${(routeDistanceKm * 2).toFixed(0)} km)` : ''}
                    </Text>
                  </View>
                  <View style={styles.metricDot} />
                  <View style={styles.metricItem}>
                    <Ionicons name="time" size={16} color="#64748B" />
                    <Text style={styles.metricText}>
                      ~{formatDurationHours(isRoundTrip ? routeDurationMins * 2 : routeDurationMins)} duration
                    </Text>
                  </View>
                </View>
              )}

              {/* Vehicle Category List Header */}
              <Text style={styles.sectionHeaderTitle}>Select Available Vehicle</Text>

              {/* Vehicle Category List */}
              <View style={styles.vehicleListContainer}>
                {loadingFares && Object.keys(fareEstimates).length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#D97706" />
                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Calculating fares from admin rates...</Text>
                  </View>
                ) : (
                  vehicleTypes.map((vt, index) => {
                    const isSelected = selectedType === vt.id
                    const baseFare = parseFloat(vt.base_fare || (index === 0 ? 80 : index === 1 ? 120 : 200))
                    const kmRate = isRoundTrip
                      ? parseFloat(vt.round_trip_per_km || vt.price_per_km || 20)
                      : isOutstationTrip
                        ? parseFloat(vt.one_way_per_km || vt.price_per_km || 18)
                        : parseFloat(vt.price_per_km || 15)
                    const minRate = parseFloat(isRoundTrip ? (vt.round_trip_per_min || 1.5) : (vt.price_per_min || 1.5))

                    const billableDist = isRoundTrip ? routeDistanceKm * 2 : routeDistanceKm
                    const billableMins = isRoundTrip ? routeDurationMins * 2 : routeDurationMins
                    let calculatedFare = baseFare + (billableDist * kmRate) + (billableMins * minRate)
                    if (isSharedTrip) calculatedFare *= 0.5

                    const isHourlyLocal = (!isOutstationTrip && localTripSubType === 'hourly')
                    const displayPrice = isHourlyLocal
                      ? (fareEstimates[vt.id] || Math.round(hourlyPackageHours * (parseFloat(vt.hourly_rate) || 250)))
                      : (routeDistanceKm > 0 ? (fareEstimates[vt.id] || Math.round(calculatedFare)) : null)

                    const etaMins = Math.max(1, index * 2 + 1)
                    const dropMins = routeDurationMins || 18

                    let badgeLabel = null
                    let badgeBg = '#FEF3C7'
                    let badgeColor = '#D97706'

                    if (index === 0) {
                      badgeLabel = 'Lowest Fare'
                      badgeBg = '#ECFDF5'
                      badgeColor = '#059669'
                    } else if (vt.name.toLowerCase().includes('mini') || vt.name.toLowerCase().includes('bike')) {
                      badgeLabel = 'Fastest'
                      badgeBg = '#FEF3C7'
                      badgeColor = '#D97706'
                    } else if (vt.name.toLowerCase().includes('sedan')) {
                      badgeLabel = 'Popular'
                      badgeBg = '#FEF3C7'
                      badgeColor = '#B45309'
                    }

                    return (
                      <TouchableOpacity
                        key={vt.id}
                        style={[
                          styles.vehicleCard,
                          isSelected && styles.vehicleCardSelected,
                        ]}
                        onPress={() => setSelectedType(vt.id)}
                        activeOpacity={0.88}
                      >
                        <View style={styles.vehicleIconWrap}>
                          {vt.icon_url ? (
                            <Image
                              source={{ uri: resolveAssetUrl(vt.icon_url) }}
                              style={styles.vehicleImg}
                              resizeMode="contain"
                            />
                          ) : (
                            <Ionicons
                              name={VEHICLE_DEFAULT_ICONS[vt.name] || 'car'}
                              size={28}
                              color={isSelected ? '#D97706' : '#475569'}
                            />
                          )}
                        </View>

                        <View style={styles.vehicleInfoWrap}>
                          <View style={styles.vehicleTitleRow}>
                            <Text style={[styles.vehicleName, isSelected && styles.vehicleNameSelected]}>
                              {vt.name}
                            </Text>
                            {badgeLabel && (
                              <View style={[styles.miniBadge, { backgroundColor: badgeBg }]}>
                                <Text style={[styles.miniBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.vehicleSubDetail}>
                            {isHourlyLocal
                              ? `₹${vt.hourly_rate || 250}/hr · ${hourlyPackageHours} ${hourlyPackageHours === 1 ? 'Hr' : 'Hrs'} Unlimited Rental`
                              : routeDistanceKm > 0
                                ? `₹${kmRate}/km · ${etaMins} mins away · ~${formatDurationHours(dropMins)} drop`
                                : `₹${kmRate}/km · ₹${minRate}/min · Fast pickup`}
                          </Text>
                        </View>

                        <View style={styles.vehiclePriceWrap}>
                          {appliedCoupon && displayPrice !== null ? (
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.vehiclePriceText, { fontSize: 11, textDecorationLine: 'line-through', color: '#94A3B8' }]}>
                                ₹{displayPrice}
                              </Text>
                              <Text style={[styles.vehiclePriceText, isSelected && styles.vehiclePriceSelected, { color: '#059669', fontWeight: '800' }]}>
                                ₹{Math.max(30, displayPrice - (appliedCoupon.discount_amount || 0))}
                              </Text>
                            </View>
                          ) : (
                            <Text style={[styles.vehiclePriceText, isSelected && styles.vehiclePriceSelected]}>
                              {displayPrice !== null ? `₹${displayPrice}` : `From ₹${Math.round(baseFare)}`}
                            </Text>
                          )}
                          {isSelected && (
                            <View style={styles.checkCircle}>
                              <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    )
                  })
                )}
              </View>

              {/* Payment Method & Offers Row */}
              <View style={styles.paymentOffersRow}>
                <TouchableOpacity
                  style={styles.methodSelectorPill}
                  onPress={() => setShowPaymentModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={paymentMethod === 'cash' ? 'cash-outline' : paymentMethod === 'razorpay' ? 'card-outline' : 'wallet-outline'}
                    size={16}
                    color="#0F172A"
                  />
                  <Text style={styles.methodSelectorText}>
                    {paymentMethod === 'cash' ? 'Cash on Drop' : paymentMethod === 'razorpay' ? 'Razorpay Online' : 'Wallet'}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color="#64748B" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.promoSelectorPill,
                    appliedCoupon && { borderColor: '#10B981', backgroundColor: '#ECFDF5' }
                  ]}
                  onPress={() => {
                    fetchCityCoupons()
                    setShowCouponModal(true)
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={appliedCoupon ? "pricetag" : "pricetag-outline"}
                    size={14}
                    color={appliedCoupon ? "#059669" : "#D97706"}
                  />
                  <Text style={[
                    styles.promoSelectorText,
                    appliedCoupon && { color: '#059669', fontWeight: '800' }
                  ]}>
                    {appliedCoupon ? `Applied: ${appliedCoupon.code} (-₹${appliedCoupon.discount_amount})` : 'Offers'}
                  </Text>
                  {appliedCoupon && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation()
                        handleRemoveCoupon()
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ marginLeft: 4 }}
                    >
                      <Ionicons name="close-circle" size={15} color="#059669" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {/* Tollgate & Parking Notice Banner */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: '#FFFBEB',
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 10,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: '#FDE68A',
              }}>
                <Ionicons name="information-circle" size={15} color="#D97706" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>
                  ℹ️ Tollgate &amp; parking charges extra (pay as per actual receipts)
                </Text>
              </View>

              {/* Golden CTA Button */}
              <TouchableOpacity
                style={[
                  styles.bookRideBtn,
                  ((isDistanceInvalid && !isLocalDistanceTooFar) || !destination?.trim() || !destCoords) && styles.bookRideBtnDisabled,
                  isLocalDistanceTooFar && { backgroundColor: '#2563EB' }
                ]}
                onPress={() => {
                  if (!destination?.trim() || !destCoords) {
                    Alert.alert(
                      'Destination Required 📍',
                      'Please select or enter your destination address. Entha trip-kum destination illamal book seiya mudiyadhu.'
                    )
                    return
                  }
                  if (isLocalDistanceTooFar) {
                    setShowOutstationPromptModal(true)
                    return
                  }
                  if (isOutstationDistanceTooShort) {
                    Alert.alert(
                      'Minimum 50 KM Required',
                      `Outstation trips require a minimum travel distance of 50 km. Your selected route is ${routeDistanceKm.toFixed(1)} km.\n\nPlease select Local Trip mode or choose a farther destination.`
                    )
                    return
                  }
                  if (isSharingDistanceTooShort) {
                    Alert.alert(
                      'Ride Sharing Distance Limit',
                      `50/50 Ride Sharing is only available for trips greater than 240 km. Your route is ${routeDistanceKm.toFixed(1)} km.`
                    )
                    return
                  }
                  setShowReviewScreen(true)
                }}
                disabled={bookingLoading}
                activeOpacity={0.88}
              >
                {bookingLoading ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <Text style={[
                    styles.bookRideBtnText,
                    ((isDistanceInvalid && !isLocalDistanceTooFar) || !destination?.trim() || !destCoords) && styles.bookRideBtnDisabledText,
                    isLocalDistanceTooFar && { color: '#FFFFFF', fontWeight: '800' }
                  ]}>
                    {!destination?.trim() || !destCoords
                      ? '📍 Enter Destination to Book'
                      : isLocalDistanceTooFar
                        ? '⚠️ Route > 50 KM Radius · Book in Outstation ➔'
                        : isOutstationDistanceTooShort
                          ? '⚠️ Min 50 km Required for Outstation'
                          : isSharingDistanceTooShort
                            ? '⚠️ Min 240 km for Ride Sharing'
                            : selectedVt?.name
                              ? `Ride with ${selectedVt.name} ➔`
                              : 'Select Vehicle & Continue ➔'}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </ModernBottomSheet>
      )}

      {/* ── 2. Floating Top Header & Search Card (Rendered after Bottom Sheet with high elevation to always display dropdown over sheet) ── */}
      <SafeAreaView style={[styles.topHeaderContainer, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        {bookingStep === 4 && searchCardCollapsed ? (
          <View style={searchCardStyles.compactBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 10 }}>
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={searchCardStyles.compactBarTitle} numberOfLines={1}>
                {pickup ? pickup.split(',')[0] : 'Pickup'} ➔ {destination ? destination.split(',')[0] : 'Drop'}
              </Text>
              <Text style={searchCardStyles.compactBarSub} numberOfLines={1}>
                {isOutstationTrip ? (isRoundTrip ? 'Round Trip' : 'One Way') : (localTripSubType === 'hourly' ? `${hourlyPackageHours}h Rental` : 'Local Drop')} • {routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={searchCardStyles.modifyBtnPill}
              onPress={() => setSearchCardCollapsed(false)}
              activeOpacity={0.8}
            >
              <Text style={searchCardStyles.modifyBtnText}>Modify ✎</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={searchCardStyles.cardContainer}>
            {/* Top Bar with Back, Title, Recenter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.floatingRoundBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={18} color="#0F172A" />
              </TouchableOpacity>

              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>
                {isOutstationTrip ? 'Outstation Cab' : 'Local City Taxi'}
              </Text>

              <TouchableOpacity
                onPress={handleRecenterMap}
                style={styles.floatingRoundBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="locate" size={17} color="#D97706" />
              </TouchableOpacity>
            </View>

            {/* 1. Radio Mode Toggle Row */}
            <View style={searchCardStyles.modeToggleRow}>
              {isOutstationTrip ? (
                <>
                  {outstationTripSubType === null ? (
                    <>
                      <TouchableOpacity
                        style={searchCardStyles.modeRadioPillBig}
                        onPress={() => {
                          setOutstationTripSubType('one_way')
                          setIsRoundTrip(false)
                          setIsSharedTrip(false)
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={searchCardStyles.modeRadioCircleBig} />
                        <Text style={searchCardStyles.modeRadioTextBig}>
                          One Way
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.modeRadioPillBig}
                        onPress={() => {
                          setOutstationTripSubType('round_trip')
                          setIsRoundTrip(true)
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={searchCardStyles.modeRadioCircleBig} />
                        <Text style={searchCardStyles.modeRadioTextBig}>
                          Round Trip
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={searchCardStyles.selectedOptionTopContainer}>
                      <TouchableOpacity
                        style={searchCardStyles.selectedOptionBigBadge}
                        onPress={() => setOutstationTripSubType(null)}
                        activeOpacity={0.85}
                      >
                        <View style={searchCardStyles.selectedRadioCircleFilled}>
                          <View style={searchCardStyles.selectedRadioDot} />
                        </View>
                        <Text style={searchCardStyles.selectedOptionBigText}>
                          {outstationTripSubType === 'round_trip' ? 'Round Trip' : 'One Way'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.switchOptionBtn}
                        onPress={() => setOutstationTripSubType(null)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="swap-horizontal" size={16} color="#D97706" />
                        <Text style={searchCardStyles.switchOptionText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {localTripSubType === null ? (
                    <>
                      <TouchableOpacity
                        style={searchCardStyles.modeRadioPillBig}
                        onPress={() => {
                          if (!isWithinLocalRadius && routeDistanceKm > 60) {
                            setShowOutstationPromptModal(true)
                            return
                          }
                          setLocalTripSubType('drop')
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={searchCardStyles.modeRadioCircleBig} />
                        <Text style={searchCardStyles.modeRadioTextBig}>
                          Local Drop
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.modeRadioPillBig}
                        onPress={() => setLocalTripSubType('hourly')}
                        activeOpacity={0.85}
                      >
                        <View style={searchCardStyles.modeRadioCircleBig} />
                        <Text style={searchCardStyles.modeRadioTextBig}>
                          Hourly Rental
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={searchCardStyles.selectedOptionTopContainer}>
                      <TouchableOpacity
                        style={searchCardStyles.selectedOptionBigBadge}
                        onPress={() => setLocalTripSubType(null)}
                        activeOpacity={0.85}
                      >
                        <View style={searchCardStyles.selectedRadioCircleFilled}>
                          <View style={searchCardStyles.selectedRadioDot} />
                        </View>
                        <Text style={searchCardStyles.selectedOptionBigText}>
                          {localTripSubType === 'drop' ? 'Local Drop' : 'Hourly Rental'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.switchOptionBtn}
                        onPress={() => setLocalTripSubType(null)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="swap-horizontal" size={16} color="#D97706" />
                        <Text style={searchCardStyles.switchOptionText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Mode Helper Subtitle */}
            <Text style={searchCardStyles.modeTaglineText}>
              {isOutstationTrip
                ? (outstationTripSubType === 'round_trip'
                  ? 'Round trip - Keep the cab till return'
                  : outstationTripSubType === 'one_way'
                    ? 'One way - Direct drop to your destination'
                    : 'Select trip type: One Way or Round Trip')
                : (localTripSubType === 'hourly'
                  ? 'Hourly Rental - Keep the cab with you for multiple stops'
                  : localTripSubType === 'drop'
                    ? 'Point to point drop - Fast & reliable city commute'
                    : 'Select ride type: Local Drop or Hourly Rental')}
            </Text>

            {/* 2. Route Box: Pickup, Swap, Drop, Intermediate Stop */}
            <View style={searchCardStyles.routeBox}>
              {/* Pickup Row */}
              <View style={searchCardStyles.routeRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={searchCardStyles.dotLabelRow}>
                    <View style={searchCardStyles.dotIndicatorGreen} />
                    <Text style={searchCardStyles.dotLabelText}>Pickup</Text>
                  </View>
                  <TextInput
                    style={[searchCardStyles.routeInputTitle, activeInput === 'pickup' && { color: '#0F172A' }]}
                    placeholder="Enter pickup address"
                    placeholderTextColor="#94A3B8"
                    value={pickup}
                    onChangeText={(t) => handleSearchTextChange(t, 'pickup')}
                    onFocus={handleFocusPickup}
                    onSubmitEditing={() => handleLocationSubmit('pickup')}
                  />
                  <Text style={searchCardStyles.routeSubText} numberOfLines={1}>
                    {pickup ? (pickup.length > 30 ? pickup.slice(0, 30) + '...' : pickup) : 'Current location or landmark'}
                  </Text>
                </View>
                {Boolean(pickup) ? (
                  <TouchableOpacity
                    style={searchCardStyles.inlineClearBtn}
                    onPress={() => {
                      setPickup('')
                      setPickupCoords(null)
                      const popular = getPopularDestinations(null, null)
                      setPredictions(popular)
                      setActiveInput('pickup')
                    }}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="close-circle" size={19} color="#94A3B8" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={searchCardStyles.gpsLocateInlineBtn}
                    onPress={handleUseCurrentLocation}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    activeOpacity={0.7}
                  >
                    {isLocating ? (
                      <ActivityIndicator size="small" color="#059669" />
                    ) : (
                      <>
                        <Ionicons name="locate" size={15} color="#059669" />
                        <Text style={searchCardStyles.gpsLocateInlineText}>GPS</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={searchCardStyles.routeDividerRow}>
                <View style={searchCardStyles.routeDividerLine} />
                <TouchableOpacity
                  style={searchCardStyles.floatingSwapBtn}
                  onPress={() => {
                    const tempP = pickup
                    const tempPCoords = pickupCoords
                    setPickup(destination)
                    setPickupCoords(destCoords)
                    setDestination(tempP)
                    setDestCoords(tempPCoords)
                  }}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="swap-vertical" size={18} color="#D97706" />
                </TouchableOpacity>
              </View>

              {/* Drop Row */}
              <View style={searchCardStyles.routeRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={searchCardStyles.dotLabelRow}>
                    <View style={searchCardStyles.dotIndicatorRed} />
                    <Text style={searchCardStyles.dotLabelText}>Drop</Text>
                  </View>
                  <TextInput
                    ref={destInputRef}
                    style={[searchCardStyles.routeInputTitle, activeInput === 'destination' && { color: '#0F172A' }]}
                    placeholder="Enter destination city or place"
                    placeholderTextColor="#94A3B8"
                    value={destination}
                    onChangeText={(t) => handleSearchTextChange(t, 'destination')}
                    onFocus={handleFocusDestination}
                    onSubmitEditing={() => handleLocationSubmit('destination')}
                  />
                  <Text style={searchCardStyles.routeSubText} numberOfLines={1}>
                    {destination ? (destination.length > 30 ? destination.slice(0, 30) + '...' : destination) : 'Tamil Nadu & beyond'}
                  </Text>
                </View>
                {Boolean(destination) && (
                  <TouchableOpacity
                    style={searchCardStyles.inlineClearBtn}
                    onPress={() => {
                      setDestination('')
                      setDestCoords(null)
                      setRouteDistanceKm(0)
                      setFareEstimates({})
                      setPredictions([])
                      if (destInputRef.current) {
                        destInputRef.current.focus()
                      }
                    }}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="close-circle" size={19} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Intermediate Stop (Via Stop) Row if active */}
              {hasIntermediateStop && !(tripTypeCategory === 'local' && localTripSubType === 'drop') && (
                <>
                  <View style={searchCardStyles.routeDividerRow}>
                    <View style={searchCardStyles.routeDividerLine} />
                  </View>
                  <View style={searchCardStyles.routeRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={searchCardStyles.dotLabelRow}>
                        <View style={searchCardStyles.dotIndicatorAmber} />
                        <Text style={searchCardStyles.dotLabelText}>Via Stop</Text>
                      </View>
                      <TextInput
                        style={[searchCardStyles.routeInputTitle, activeInput === 'stop' && { color: '#0F172A' }]}
                        placeholder="e.g. Trichy, Dindigul, Central..."
                        placeholderTextColor="#94A3B8"
                        value={intermediateStop}
                        onChangeText={(t) => handleSearchTextChange(t, 'stop')}
                        onFocus={() => {
                          setActiveInput('stop')
                          if (intermediateStop && intermediateStop.trim().length >= 2) {
                            handleSearchTextChange(intermediateStop, 'stop')
                          } else {
                            const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
                            setPredictions(popular)
                          }
                        }}
                        onSubmitEditing={() => handleLocationSubmit('stop')}
                      />
                      <Text style={searchCardStyles.routeSubText}>Intermediate halt point</Text>
                    </View>
                    <TouchableOpacity
                      style={searchCardStyles.inlineClearBtn}
                      onPress={() => {
                        setIntermediateStop('')
                        setIntermediateStopCoords(null)
                        setHasIntermediateStop(false)
                        if (activeInput === 'stop') {
                          setActiveInput(null)
                          setPredictions([])
                        }
                      }}
                      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="close-circle" size={19} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* ── Search Results & Suggestions rendered directly beneath Drop / Route inputs ── */}
            {activeInput && (predictions.length > 0 || activeInput === 'pickup') && (
              <View style={searchCardStyles.inlinePredictionsBox}>
                <View style={searchCardStyles.predHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons
                      name={activeInput === 'destination' ? 'navigate' : 'pin'}
                      size={14}
                      color="#D97706"
                    />
                    <Text style={searchCardStyles.predHeaderText}>
                      {activeInput === 'destination'
                        ? (destination.length > 0 ? 'Search Results' : '✨ Suggested Destinations')
                        : activeInput === 'stop'
                        ? (intermediateStop.length > 0 ? 'Search Results' : '✨ Via Stop Suggestions')
                        : (pickup.length > 0 ? 'Search Results' : '✨ Pickup Location Suggestions')}
                    </Text>
                  </View>
                  {loadingPredictions && <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 8 }} />}
                  <TouchableOpacity
                    onPress={() => { setActiveInput(null); setPredictions([]); Keyboard.dismiss(); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="close" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* 📍 Quick One-Tap Current Location GPS Detect Action */}
                {activeInput === 'pickup' && (
                  <TouchableOpacity
                    style={searchCardStyles.currentLocRow}
                    onPress={handleUseCurrentLocation}
                    activeOpacity={0.75}
                  >
                    <View style={searchCardStyles.currentLocIconBox}>
                      <Ionicons name="navigate" size={17} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={searchCardStyles.currentLocTitle}>Use Current Location</Text>
                      <Text style={searchCardStyles.currentLocSub}>Tap to detect your exact GPS pickup spot</Text>
                    </View>
                    {isLocating ? (
                      <ActivityIndicator size="small" color="#059669" />
                    ) : (
                      <View style={searchCardStyles.currentLocBadge}>
                        <Text style={searchCardStyles.currentLocBadgeText}>Detect GPS</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                <ScrollView
                  keyboardShouldPersistTaps="always"
                  nestedScrollEnabled={true}
                  style={{ maxHeight: 250 }}
                  showsVerticalScrollIndicator={false}
                >
                  {predictions.map((item, idx) => {
                    const isAirport = item.category_tag?.includes('Airport') || item.description?.toLowerCase().includes('airport')
                    const isStation = item.category_tag?.includes('Railway') || item.description?.toLowerCase().includes('station')
                    const isBus = item.category_tag?.includes('Bus') || item.description?.toLowerCase().includes('bus')
                    const isMall = item.category_tag?.includes('Mall') || item.category_tag?.includes('Shopping') || item.description?.toLowerCase().includes('mall')

                    const iconName = isAirport ? 'airplane' :
                      isStation ? 'train' :
                        isBus ? 'bus' :
                          isMall ? 'cart' : 'location'

                    const iconBg = isAirport ? '#EFF6FF' :
                      isStation ? '#F5F3FF' :
                        isBus ? '#ECFDF5' :
                          isMall ? '#FEF2F2' : '#FFFBEB'

                    const iconColor = isAirport ? '#2563EB' :
                      isStation ? '#7C3AED' :
                        isBus ? '#059669' :
                          isMall ? '#DC2626' : '#D97706'

                    return (
                      <TouchableOpacity
                        key={`inline-pred-${idx}`}
                        style={styles.predictionItem}
                        onPress={() => handleSelectPrediction(item, activeInput)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.predIconBox, { backgroundColor: iconBg }]}>
                          <Ionicons name={iconName} size={15} color={iconColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.predTitle} numberOfLines={1}>
                            {item.structured_formatting?.main_text || item.description?.split(',')[0] || item.description}
                          </Text>
                          <Text style={styles.predSub} numberOfLines={1}>
                            {item.structured_formatting?.secondary_text || item.description}
                          </Text>
                        </View>
                        {item.distance_km ? (
                          <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
                            <Text style={styles.predDistText}>{item.distance_km} km</Text>
                            {item.category_tag ? (
                              <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '600' }} numberOfLines={1}>
                                {item.category_tag.split(' ')[0]}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            )}

            {/* When NOT actively choosing suggestions, show Trip details, Dates & Search Cabs CTA */}
            {(!activeInput || (predictions.length === 0 && activeInput !== 'pickup')) && (
              <>
                {/* 3. Add Stop Button — Hidden ONLY for Local Drop (Point-to-Point) */}
                {!(tripTypeCategory === 'local' && localTripSubType === 'drop') && (
                  <TouchableOpacity
                    style={searchCardStyles.addStopBtn}
                    onPress={() => {
                      if (hasIntermediateStop) {
                        setHasIntermediateStop(false)
                        setIntermediateStop('')
                        setIntermediateStopCoords(null)
                        if (activeInput === 'stop') setActiveInput(null)
                      } else {
                        setHasIntermediateStop(true)
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={hasIntermediateStop ? 'remove-circle-outline' : 'add'} size={16} color="#D97706" />
                    <Text style={searchCardStyles.addStopText}>{hasIntermediateStop ? 'Remove Via Stop' : '+ Add Stop'}</Text>
                  </TouchableOpacity>
                )}

                {/* 4. Dates & Times Row (Matching exact side-by-side alignment across all trip modes) */}
                {isOutstationTrip && isRoundTrip ? (
                  <View style={{ marginBottom: 12 }}>
                    {/* Departure Journey Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                      <Ionicons name="arrow-forward-circle" size={14} color="#D97706" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F172A', marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Departure Journey
                      </Text>
                    </View>
                    <View style={[searchCardStyles.datesGrid, { marginBottom: 10 }]}>
                      <TouchableOpacity
                        style={searchCardStyles.dateCardCol}
                        onPress={() => { setActiveDateTarget('departure'); setShowCalendarModal(true); }}
                        activeOpacity={0.85}
                      >
                        <Text style={searchCardStyles.dateCardLabel}>Departure date</Text>
                        <View style={searchCardStyles.dateCardValueRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="calendar-outline" size={16} color="#D97706" />
                            <Text style={searchCardStyles.dateCardValueText}>{getCardDateParts(departureDate, departureTime).day}</Text>
                          </View>
                          <Ionicons name="chevron-down" size={14} color="#64748B" />
                        </View>
                        <Text style={searchCardStyles.dateCardSubDay}>{getCardDateParts(departureDate, departureTime).weekday}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.dateCardCol}
                        onPress={() => handleOpenTimeModal('departure')}
                        activeOpacity={0.85}
                      >
                        <Text style={searchCardStyles.dateCardLabel}>Pickup Time</Text>
                        <View style={searchCardStyles.dateCardValueRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={16} color="#D97706" />
                            <Text style={searchCardStyles.dateCardValueText}>{departureTime || '10:00 AM'}</Text>
                          </View>
                          <Ionicons name="chevron-down" size={14} color="#64748B" />
                        </View>
                        <Text style={searchCardStyles.dateCardSubDay}>{rideTimingMode === 'now' ? '⚡ Immediate' : '📅 Scheduled'}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Return Journey Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                      <Ionicons name="arrow-undo-circle" size={14} color="#7C3AED" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F172A', marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Return Journey
                      </Text>
                    </View>
                    <View style={[searchCardStyles.datesGrid, { marginBottom: 0 }]}>
                      <TouchableOpacity
                        style={searchCardStyles.dateCardCol}
                        onPress={() => { setActiveDateTarget('return'); setShowCalendarModal(true); }}
                        activeOpacity={0.85}
                      >
                        <Text style={searchCardStyles.dateCardLabel}>Return date</Text>
                        <View style={searchCardStyles.dateCardValueRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="calendar-outline" size={16} color="#7C3AED" />
                            <Text style={searchCardStyles.dateCardValueText}>{getCardDateParts(returnDate, returnTime).day}</Text>
                          </View>
                          <Ionicons name="chevron-down" size={14} color="#64748B" />
                        </View>
                        <Text style={searchCardStyles.dateCardSubDay}>{getCardDateParts(returnDate, returnTime).weekday}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.dateCardCol}
                        onPress={() => handleOpenTimeModal('return')}
                        activeOpacity={0.85}
                      >
                        <Text style={searchCardStyles.dateCardLabel}>Return Time</Text>
                        <View style={searchCardStyles.dateCardValueRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={16} color="#7C3AED" />
                            <Text style={searchCardStyles.dateCardValueText}>{returnTime || '05:00 PM'}</Text>
                          </View>
                          <Ionicons name="chevron-down" size={14} color="#64748B" />
                        </View>
                        <Text style={searchCardStyles.dateCardSubDay}>🔄 Return Leg</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : isLocalTrip && localTripSubType === 'hourly' ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={searchCardStyles.dateCardLabel}>Select Rental Duration</Text>
                    <View style={searchCardStyles.hourlyPkgRow}>
                      {[2, 4, 6, 8, 10].map((h) => (
                        <TouchableOpacity
                          key={`pkg-${h}`}
                          style={[searchCardStyles.hourlyPkgChip, hourlyPackageHours === h && searchCardStyles.hourlyPkgChipActive]}
                          onPress={() => setHourlyPackageHours(h)}
                        >
                          <Text style={[searchCardStyles.hourlyPkgText, hourlyPackageHours === h && searchCardStyles.hourlyPkgTextActive]}>
                            {h}h/{h * 10}km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={searchCardStyles.datesGrid}>
                      <TouchableOpacity
                        style={searchCardStyles.dateCardCol}
                        onPress={() => { setActiveDateTarget('departure'); setShowCalendarModal(true); }}
                        activeOpacity={0.85}
                      >
                        <Text style={searchCardStyles.dateCardLabel}>Departure date</Text>
                        <View style={searchCardStyles.dateCardValueRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="calendar-outline" size={16} color="#D97706" />
                            <Text style={searchCardStyles.dateCardValueText}>{getCardDateParts(departureDate, departureTime).day}</Text>
                          </View>
                          <Ionicons name="chevron-down" size={14} color="#64748B" />
                        </View>
                        <Text style={searchCardStyles.dateCardSubDay}>{getCardDateParts(departureDate, departureTime).weekday}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={searchCardStyles.dateCardCol}
                        onPress={() => handleOpenTimeModal('departure')}
                        activeOpacity={0.85}
                      >
                        <Text style={searchCardStyles.dateCardLabel}>Pickup Time</Text>
                        <View style={searchCardStyles.dateCardValueRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={16} color="#D97706" />
                            <Text style={searchCardStyles.dateCardValueText}>{departureTime || '10:00 AM'}</Text>
                          </View>
                          <Ionicons name="chevron-down" size={14} color="#64748B" />
                        </View>
                        <Text style={searchCardStyles.dateCardSubDay}>{rideTimingMode === 'now' ? '⚡ Immediate' : '📅 Scheduled'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={searchCardStyles.datesGrid}>
                    <TouchableOpacity
                      style={searchCardStyles.dateCardCol}
                      onPress={() => { setActiveDateTarget('departure'); setShowCalendarModal(true); }}
                      activeOpacity={0.85}
                    >
                      <Text style={searchCardStyles.dateCardLabel}>Departure date</Text>
                      <View style={searchCardStyles.dateCardValueRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="calendar-outline" size={16} color="#D97706" />
                          <Text style={searchCardStyles.dateCardValueText}>{getCardDateParts(departureDate, departureTime).day}</Text>
                        </View>
                        <Ionicons name="chevron-down" size={14} color="#64748B" />
                      </View>
                      <Text style={searchCardStyles.dateCardSubDay}>{getCardDateParts(departureDate, departureTime).weekday}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={searchCardStyles.dateCardCol}
                      onPress={() => handleOpenTimeModal('departure')}
                      activeOpacity={0.85}
                    >
                      <Text style={searchCardStyles.dateCardLabel}>Pickup Time</Text>
                      <View style={searchCardStyles.dateCardValueRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="time-outline" size={16} color="#D97706" />
                          <Text style={searchCardStyles.dateCardValueText}>{departureTime || '10:00 AM'}</Text>
                        </View>
                        <Ionicons name="chevron-down" size={14} color="#64748B" />
                      </View>
                      <Text style={searchCardStyles.dateCardSubDay}>{rideTimingMode === 'now' ? '⚡ Immediate' : '📅 Scheduled'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 4b. 50/50 Shared Trip Opt-in Card (> 240 KM) */}
                {(isOutstationTrip || routeDistanceKm > 240) && routeDistanceKm > 240 && (
                  <View style={searchCardStyles.sharedTripOptInCard}>
                    <View style={searchCardStyles.sharedTripOptInHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 }}>
                        <View style={searchCardStyles.sharedTripOptInIconBox}>
                          <Ionicons name="people" size={18} color="#7C3AED" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={searchCardStyles.sharedTripOptInTitle}>Enable 50/50 Shared Trip</Text>
                            <View style={searchCardStyles.sharedTripOptInBadge}>
                              <Text style={searchCardStyles.sharedTripOptInBadgeText}>SAVE 50%</Text>
                            </View>
                          </View>
                          <Text style={searchCardStyles.sharedTripOptInSub}>
                            Route is {routeDistanceKm.toFixed(0)} km (&gt;240 km). Share with a verified co-passenger & pay half fare!
                          </Text>
                        </View>
                      </View>
                      <Switch
                        value={isSharedTrip}
                        onValueChange={handleToggleSharing}
                        trackColor={{ false: '#CBD5E1', true: '#DDD6FE' }}
                        thumbColor={isSharedTrip ? '#7C3AED' : '#FFFFFF'}
                        ios_backgroundColor="#CBD5E1"
                      />
                    </View>
                    {isSharedTrip && (
                      <View style={searchCardStyles.sharedTripActiveNotice}>
                        <Ionicons name="checkmark-circle" size={14} color="#059669" />
                        <Text style={searchCardStyles.sharedTripActiveNoticeText}>
                          Shared Trip Active: Cabs will be priced at 50% split fare & posted for passenger matching.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* 5. Big Search Cabs Button (Yellow #FFC700 theme) */}
                <TouchableOpacity
                  style={searchCardStyles.searchBtn}
                  onPress={() => {
                    if (!destination?.trim() || !destCoords) {
                      Alert.alert(
                        'Enter Destination 📍',
                        'Please enter or select a destination drop location to view available cabs.'
                      )
                      handleFocusDestination()
                      return
                    }
                    if (isOutstationDistanceTooShort) {
                      Alert.alert(
                        'Outstation Minimum Distance',
                        `Outstation trips require a minimum travel distance of 50 km. Your route is ${routeDistanceKm.toFixed(1)} km.\n\nPlease select Local Trip mode or choose a farther destination.`
                      )
                      return
                    }
                    if (isSharingDistanceTooShort) {
                      Alert.alert(
                        'Ride Sharing Distance Limit',
                        `50/50 Ride Sharing is only available for trips greater than 240 km. Your route is ${routeDistanceKm.toFixed(1)} km.`
                      )
                      return
                    }
                    setSearchCardCollapsed(true)
                    animateStepTransition(4)
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={searchCardStyles.searchBtnText}>Search Cabs</Text>
                  <Ionicons name="arrow-forward" size={18} color="#0F172A" />
                </TouchableOpacity>

                {/* 6. Recent Searches Chip */}
                <TouchableOpacity
                  style={searchCardStyles.recentTripChip}
                  onPress={() => {
                    if (isOutstationTrip) {
                      setDestination('Madurai, Tamil Nadu')
                      setDestCoords({ latitude: 9.9252, longitude: 78.1198 })
                    } else {
                      setDestination('Central Railway Station, Chennai')
                      setDestCoords({ latitude: 13.0827, longitude: 80.2755 })
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="time-outline" size={13} color="#64748B" />
                  <Text style={searchCardStyles.recentTripText}>
                    {pickup ? pickup.split(',')[0] : 'KK Nagar West'} ➔ {isOutstationTrip ? 'Madurai' : 'Central Station'}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color="#94A3B8" />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </SafeAreaView>


      {/* ── Distance Exceeds Local Limit (Book in Outstation) Popup Modal ── */}
      <Modal
        visible={showOutstationPromptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOutstationPromptModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { padding: 22, alignItems: 'center' }]}>
            {/* Header Icon */}
            <View style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: '#FEF3C7',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              borderWidth: 2,
              borderColor: '#FDE68A'
            }}>
              <Ionicons name="car-sport" size={28} color="#D97706" />
            </View>

            {/* Title */}
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', textAlign: 'center' }}>
              Distance Exceeds Local Limit
            </Text>

            {/* Distance Badge Pill */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#EFF6FF',
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              marginTop: 8,
              gap: 6
            }}>
              <Ionicons name="navigate-circle" size={16} color="#2563EB" />
              <Text style={{ color: '#2563EB', fontWeight: '800', fontSize: 13.5 }}>
                Route: {routeDistanceKm > 0 ? routeDistanceKm.toFixed(1) : '50+'} KM
              </Text>
            </View>

            {/* Explanation Message */}
            <Text style={{ color: '#475569', fontSize: 13.5, lineHeight: 21, textAlign: 'center', marginTop: 12 }}>
              Local City trips are limited up to <Text style={{ fontWeight: '800', color: '#0F172A' }}>50 KM Radius</Text>.
              {'\n'}Since your destination is <Text style={{ fontWeight: '800', color: '#DC2626' }}>{routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} KM` : 'over limit'}</Text>, please book under <Text style={{ fontWeight: '800', color: '#2563EB' }}>Outstation Trip</Text> to get intercity cab options and dedicated highway rates.
            </Text>

            {/* Primary Action Button */}
            <TouchableOpacity
              style={{
                backgroundColor: '#2563EB',
                borderRadius: 12,
                paddingVertical: 14,
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 18,
                flexDirection: 'row',
                gap: 8,
                ...SHADOW.small
              }}
              activeOpacity={0.85}
              onPress={handleSwitchToOutstationFromPrompt}
            >
              <Ionicons name="arrow-forward-circle" size={19} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
                Book in Outstation 🚗
              </Text>
            </TouchableOpacity>

            {/* Secondary Action: Change Destination */}
            <TouchableOpacity
              style={{
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 12,
                paddingVertical: 12,
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 10,
                flexDirection: 'row',
                gap: 6
              }}
              activeOpacity={0.85}
              onPress={handleChangeDestinationFromPrompt}
            >
              <Ionicons name="pencil" size={15} color="#475569" />
              <Text style={{ color: '#475569', fontSize: 13.5, fontWeight: '700' }}>
                Change Local Destination (≤ 50 KM Radius)
              </Text>
            </TouchableOpacity>

            {/* Close/Dismiss Link */}
            <TouchableOpacity
              style={{ paddingVertical: 10, marginTop: 4 }}
              activeOpacity={0.7}
              onPress={() => setShowOutstationPromptModal(false)}
            >
              <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>
                Stay on Screen
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 4. Interactive Month Calendar & Time Picker Modal ── */}
      <Modal visible={showCalendarModal} transparent animationType="fade" onRequestClose={() => setShowCalendarModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCalendarModal(false)}>
          <View style={styles.calendarModalCard} onStartShouldSetResponder={() => true}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar" size={20} color="#D97706" />
                <Text style={styles.modalTitle}>
                  {activeDateTarget === 'departure' ? 'Select Departure Date & Time' : 'Select Return Pickup Date & Time'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCalendarModal(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Date Shortcuts */}
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                onPress={() => {
                  if (activeDateTarget === 'return') setReturnDate(todayStr)
                  else setDepartureDate(todayStr)
                }}
                style={[
                  styles.quickDateChip,
                  (activeDateTarget === 'return' ? returnDate : departureDate) === todayStr && styles.quickDateChipActive
                ]}
              >
                <Text style={[
                  styles.quickDateText,
                  (activeDateTarget === 'return' ? returnDate : departureDate) === todayStr && styles.quickDateTextActive
                ]}>Today</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (activeDateTarget === 'return') setReturnDate(tomorrowStr)
                  else setDepartureDate(tomorrowStr)
                }}
                style={[
                  styles.quickDateChip,
                  (activeDateTarget === 'return' ? returnDate : departureDate) === tomorrowStr && styles.quickDateChipActive
                ]}
              >
                <Text style={[
                  styles.quickDateText,
                  (activeDateTarget === 'return' ? returnDate : departureDate) === tomorrowStr && styles.quickDateTextActive
                ]}>Tomorrow</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (activeDateTarget === 'return') setReturnDate(dayAfterStr)
                  else setDepartureDate(dayAfterStr)
                }}
                style={[
                  styles.quickDateChip,
                  (activeDateTarget === 'return' ? returnDate : departureDate) === dayAfterStr && styles.quickDateChipActive
                ]}
              >
                <Text style={[
                  styles.quickDateText,
                  (activeDateTarget === 'return' ? returnDate : departureDate) === dayAfterStr && styles.quickDateTextActive
                ]}>Day After</Text>
              </TouchableOpacity>
            </View>

            {/* Month Selector Navigation */}
            <View style={styles.calendarMonthNav}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setCalDate(new Date(curYear, curMonth - 1, 1))}
              >
                <Ionicons name="chevron-back" size={18} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {MONTH_NAMES[curMonth]} {curYear}
              </Text>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setCalDate(new Date(curYear, curMonth + 1, 1))}
              >
                <Ionicons name="chevron-forward" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Days of Week Row */}
            <View style={styles.calDaysOfWeekRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                <Text key={`header-${i}`} style={styles.calDayHeaderCell}>{d}</Text>
              ))}
            </View>

            {/* Month Calendar Grid */}
            <View style={styles.calendarGrid}>
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.calDayCell} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1
                const dayDate = new Date(curYear, curMonth, dayNum)
                const isPast = dayDate < new Date(todayDateObj.getFullYear(), todayDateObj.getMonth(), todayDateObj.getDate())
                const dayStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                const isSelected = (activeDateTarget === 'return' ? returnDate : departureDate) === dayStr

                return (
                  <TouchableOpacity
                    key={`day-${dayNum}`}
                    disabled={isPast}
                    onPress={() => handleSelectCalendarDay(dayNum)}
                    style={[
                      styles.calDayCell,
                      isSelected && styles.calDayCellSelected,
                      isPast && styles.calDayCellDisabled
                    ]}
                  >
                    <Text style={[
                      styles.calDayCellText,
                      isSelected && styles.calDayCellTextSelected,
                      isPast && styles.calDayCellTextDisabled
                    ]}>
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Time Picker Section */}
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.timeSectionTitle}>
                  {activeDateTarget === 'return' ? 'Select Return Pickup Time' : 'Select Departure Time'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="time" size={13} color={activeDateTarget === 'return' ? '#059669' : '#D97706'} />
                  <Text style={{ fontSize: 13, fontWeight: '900', color: activeDateTarget === 'return' ? '#059669' : '#D97706' }}>
                    {activeDateTarget === 'return' ? returnTime : departureTime}
                  </Text>
                </View>
              </View>

              {/* Quick Relative Shortcuts for Return */}
              {activeDateTarget === 'return' && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', marginBottom: 4 }}>
                    Quick Relative Duration:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {[
                      { label: '+1 Hr', h: 1 },
                      { label: '+2 Hrs', h: 2 },
                      { label: '+3 Hrs', h: 3 },
                      { label: '+4 Hrs', h: 4 },
                      { label: '+6 Hrs', h: 6 },
                    ].map((item, idx) => {
                      const relTime = getRelativeTimeString(item.h)
                      const isActive = (returnTime === relTime)
                      return (
                        <TouchableOpacity
                          key={`rel-${idx}`}
                          style={[styles.quickRelTimeChip, isActive && styles.quickRelTimeChipActive]}
                          onPress={() => setReturnTime(relTime)}
                        >
                          <Text style={[styles.quickRelTimeText, isActive && styles.quickRelTimeTextActive]}>
                            {item.label} ({relTime})
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Complete List of Time Slots */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timePresetsRow}>
                {ALL_TIME_SLOTS.map((t, idx) => {
                  const isTimeSelected = (activeDateTarget === 'return' ? returnTime : departureTime) === t
                  return (
                    <TouchableOpacity
                      key={`time-${idx}`}
                      style={[styles.timeChip, isTimeSelected && styles.timeChipActive]}
                      onPress={() => {
                        if (activeDateTarget === 'return') setReturnTime(t)
                        else setDepartureTime(t)
                      }}
                    >
                      <Text style={[styles.timeChipText, isTimeSelected && styles.timeChipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>

            {/* Confirm Selection Button */}
            <TouchableOpacity
              style={styles.calendarConfirmBtn}
              onPress={() => setShowCalendarModal(false)}
            >
              <Text style={styles.calendarConfirmBtnText}>
                Confirm {activeDateTarget === 'departure' ? 'Departure Time' : 'Return Time'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 5. Payment Method Selector Modal ── */}
      <Modal visible={showPaymentModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Choose Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.payOptionItem, paymentMethod === 'cash' && styles.payOptionItemSelected]}
              onPress={() => { setPaymentMethod('cash'); setShowPaymentModal(false); }}
            >
              <Ionicons name="cash-outline" size={20} color="#10B981" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.payOptionTitle}>Cash on Drop</Text>
                <Text style={styles.payOptionSub}>Pay driver after completing your trip</Text>
              </View>
              {paymentMethod === 'cash' && <Ionicons name="checkmark-circle" size={20} color="#D97706" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payOptionItem, paymentMethod === 'razorpay' && styles.payOptionItemSelected]}
              onPress={() => { setPaymentMethod('razorpay'); setShowPaymentModal(false); }}
            >
              <Ionicons name="card-outline" size={20} color="#D97706" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.payOptionTitle}>Online Payment (Razorpay)</Text>
                <Text style={styles.payOptionSub}>UPI, Google Pay, PhonePe, Cards, Netbanking</Text>
              </View>
              {paymentMethod === 'razorpay' && <Ionicons name="checkmark-circle" size={20} color="#D97706" />}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 6. Coupon & Promo Modal ── */}
      <Modal visible={showCouponModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="pricetag" size={16} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Offers & Promo Codes</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    {getDetectedCity() ? `Exclusive deals in ${getDetectedCity()}` : 'Save more on your ride'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowCouponModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Currently Applied Banner */}
            {appliedCoupon && (
              <View style={styles.appliedCouponBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#065F46' }}>
                      {appliedCoupon.code} Applied!
                    </Text>
                    <Text style={{ fontSize: 11, color: '#047857' }}>
                      ₹{appliedCoupon.discount_amount} deducted from your ride fare
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.removeCouponBtn}
                  onPress={handleRemoveCoupon}
                  activeOpacity={0.8}
                >
                  <Text style={styles.removeCouponBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Manual Promo Code Input */}
            <View style={styles.couponInputRow}>
              <TextInput
                style={styles.couponTextInput}
                placeholder="ENTER PROMO CODE"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                autoCorrect={false}
                value={couponInput}
                onChangeText={(t) => {
                  setCouponInput(t.toUpperCase())
                  if (couponError) setCouponError('')
                }}
              />
              <TouchableOpacity
                style={[styles.couponApplyBtn, (!couponInput.trim() || loadingCoupons) && { opacity: 0.6 }]}
                disabled={!couponInput.trim() || loadingCoupons}
                onPress={() => handleValidateAndApplyCoupon(couponInput)}
                activeOpacity={0.85}
              >
                {loadingCoupons ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.couponApplyBtnText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>

            {couponError ? (
              <View style={styles.couponErrorRow}>
                <Ionicons name="alert-circle" size={14} color="#DC2626" />
                <Text style={styles.couponErrorText}>{couponError}</Text>
              </View>
            ) : null}

            {/* Available City Coupons Section */}
            <View style={{ marginTop: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                {getDetectedCity() ? `Available Offers in ${getDetectedCity()}` : 'Available Offers'}
              </Text>
              {loadingCoupons && <ActivityIndicator size="small" color="#D97706" />}
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {availableCoupons.length > 0 ? (
                availableCoupons.map((c) => {
                  const isCurrent = appliedCoupon?.code === c.code
                  const isUsed = Boolean(c.is_used || c.is_disabled)
                  const discountTag = c.discount_type === 'percent'
                    ? `${c.discount_value}% OFF`
                    : `FLAT ₹${c.discount_value} OFF`
                  return (
                    <View key={c.id || c.code} style={[styles.couponCardItem, isCurrent && styles.couponCardItemActive, isUsed && { opacity: 0.6, backgroundColor: '#F8FAFC' }]}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <View style={[styles.couponCodeBadge, isUsed && { backgroundColor: '#E2E8F0', borderColor: '#CBD5E1' }]}>
                            <Text style={[styles.couponCodeBadgeText, isUsed && { color: '#64748B' }]}>{c.code}</Text>
                          </View>
                          {isUsed ? (
                            <View style={[styles.couponDiscountBadge, { backgroundColor: '#F1F5F9' }]}>
                              <Text style={[styles.couponDiscountBadgeText, { color: '#64748B' }]}>ALREADY USED</Text>
                            </View>
                          ) : (
                            <View style={styles.couponDiscountBadge}>
                              <Text style={styles.couponDiscountBadgeText}>{discountTag}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.couponItemDesc, isUsed && { color: '#94A3B8' }]} numberOfLines={2}>
                          {isUsed ? 'Offer valid once per user. Already used on your previous ride.' : (c.description || `Get ${discountTag} on your booking`)}
                        </Text>
                        {parseFloat(c.min_fare) > 0 && !isUsed && (
                          <Text style={styles.couponMinFareText}>
                            Min booking fare: ₹{c.min_fare}
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.couponItemApplyBtn,
                          isCurrent && styles.couponItemAppliedBtn,
                          isUsed && { backgroundColor: '#E2E8F0', elevation: 0 },
                        ]}
                        disabled={isCurrent || isUsed || loadingCoupons}
                        onPress={isUsed ? null : () => handleValidateAndApplyCoupon(c.code)}
                        activeOpacity={isUsed ? 1 : 0.8}
                      >
                        <Text style={[
                          styles.couponItemApplyBtnText,
                          isCurrent && styles.couponItemAppliedBtnText,
                          isUsed && { color: '#94A3B8' },
                        ]}>
                          {isCurrent ? 'APPLIED ✓' : (isUsed ? 'USED' : 'APPLY')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                })
              ) : !loadingCoupons ? (
                <View style={styles.emptyCouponsWrap}>
                  <Ionicons name="pricetags-outline" size={28} color="#CBD5E1" />
                  <Text style={styles.emptyCouponsText}>
                    No exclusive offers listed right now.
                  </Text>
                  <Text style={styles.emptyCouponsSubText}>
                    Enter any valid promo code above to receive instant discount!
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 7. Ride Confirmation & Preferences Review Screen (Matching User Screenshot Alignment) ── */}
      <Modal visible={showReviewScreen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowReviewScreen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

          {/* Top Bar with Back Button & Title */}
          <View style={reviewStyles.headerRow}>
            <TouchableOpacity
              onPress={() => setShowReviewScreen(false)}
              style={reviewStyles.backCircleBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={22} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={reviewStyles.headerTitle}>
                Ride with {vehicleTypes.find(v => v.id === selectedType)?.name || 'Hatch Back'}
              </Text>
              <Text style={reviewStyles.headerSubDate}>
                {(() => {
                  try {
                    const dt = departureDate ? new Date(departureDate + 'T00:00:00') : new Date()
                    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                  } catch {
                    return '9 Oct 26'
                  }
                })()}
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 150 }}
          >
            {/* 1. Pickup Time Card */}
            <TouchableOpacity
              style={reviewStyles.cardWrap}
              onPress={() => handleOpenTimeModal('departure')}
              activeOpacity={0.88}
            >
              <View style={reviewStyles.timePinkBox}>
                <Ionicons name="time" size={22} color="#D97706" />
              </View>
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={reviewStyles.timeLabel}>{isRoundTrip ? 'Departure Pickup Time' : 'Pickup Time'}</Text>
                <Text style={reviewStyles.timeValue}>{departureTime || '10:00 AM'}</Text>
              </View>
              <Ionicons name="chevron-down" size={20} color="#64748B" />
            </TouchableOpacity>

            {isRoundTrip && (
              <TouchableOpacity
                style={[reviewStyles.cardWrap, { marginTop: -4 }]}
                onPress={() => handleOpenTimeModal('return')}
                activeOpacity={0.88}
              >
                <View style={[reviewStyles.timePinkBox, { backgroundColor: '#F3E8FF' }]}>
                  <Ionicons name="time" size={22} color="#7C3AED" />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={reviewStyles.timeLabel}>Return Pickup Time</Text>
                  <Text style={reviewStyles.timeValue}>{returnTime || '05:00 PM'}</Text>
                </View>
                <Ionicons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>
            )}

            {/* 2. Passenger Details Card */}
            <View style={reviewStyles.cardWrapCol}>
              <View style={reviewStyles.cardHeaderRow}>
                <Text style={reviewStyles.cardTitle}>Passenger Details</Text>
                <TouchableOpacity onPress={() => setShowEditPassengerModal(true)} activeOpacity={0.7}>
                  <Text style={reviewStyles.editLink}>Edit &gt;</Text>
                </TouchableOpacity>
              </View>

              <View style={reviewStyles.passengerRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-outline" size={17} color="#64748B" />
                  <Text style={reviewStyles.passengerLabel}>Full Name</Text>
                </View>
                <Text style={reviewStyles.passengerVal}>{passengerName || user?.name || 'Rohith Ram'}</Text>
              </View>

              <View style={reviewStyles.passengerRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="call-outline" size={17} color="#64748B" />
                  <Text style={reviewStyles.passengerLabel}>Phone</Text>
                </View>
                <Text style={reviewStyles.passengerVal}>{passengerPhone || user?.phone || '+91 8838603768'}</Text>
              </View>

              <View style={[reviewStyles.passengerRow, { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="mail-outline" size={17} color="#64748B" />
                  <Text style={reviewStyles.passengerLabel}>Email</Text>
                </View>
                <Text style={reviewStyles.passengerValEmail}>{passengerEmail || user?.email || 'rohithsandy194@gmail.com'}</Text>
              </View>
            </View>

            {/* 3. Optional Requests Card */}
            <View style={reviewStyles.cardWrapCol}>
              <View style={reviewStyles.cardHeaderRow}>
                <View>
                  <Text style={reviewStyles.cardTitle}>Optional Requests</Text>
                  <Text style={reviewStyles.cardSub}>Make your ride more comfortable</Text>
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await Share.share({
                        message: `Cab booking for ${passengerName} on CityOneTaxi! Pickup: ${pickup || 'Pickup'}, Drop: ${destination || 'Destination'}.`,
                      })
                    } catch {}
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-social-outline" size={16} color="#D97706" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>Share</Text>
                </TouchableOpacity>
              </View>

              {/* Item: Total Persons / Passengers Stepper */}
              <View style={reviewStyles.optItemRow}>
                <Ionicons name="people-outline" size={20} color="#0F172A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={reviewStyles.optItemTitle}>Total Persons / Passengers</Text>
                    <View style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: '#EFF6FF',
                      borderWidth: 1,
                      borderColor: '#BFDBFE'
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#1D4ED8' }}>
                        Max {selectedVt?.passenger_capacity || (isSUVSelected ? 7 : (selectedVt?.name?.includes('3') ? 3 : 4))} Seats
                      </Text>
                    </View>
                  </View>
                  <Text style={reviewStyles.optItemSub}>Total people traveling in this ride</Text>
                </View>
                <View style={reviewStyles.stepperWrap}>
                  <TouchableOpacity
                    onPress={() => setPassengerCount(Math.max(1, passengerCount - 1))}
                    style={reviewStyles.stepperBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={16} color="#0F172A" />
                  </TouchableOpacity>
                  <Text style={reviewStyles.stepperVal}>{passengerCount} {passengerCount === 1 ? 'Person' : 'Persons'}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const maxPax = selectedVt?.passenger_capacity || (isSUVSelected ? 7 : (selectedVt?.name?.includes('3') ? 3 : 4))
                      if (passengerCount >= maxPax) {
                        Alert.alert('Vehicle Capacity Limit', `Selected vehicle (${selectedVt?.name || 'Cab'}) seats up to ${maxPax} passengers.`)
                        return
                      }
                      setPassengerCount(passengerCount + 1)
                    }}
                    style={[reviewStyles.stepperBtn, { backgroundColor: '#FEF3C7' }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={16} color="#D97706" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Item: Rooftop Luggage Carrier (Restricted strictly to SUV cabs as per RTO regulations) */}
              <View style={[reviewStyles.optItemRow, !isSUVSelected && { opacity: 0.75 }]}>
                <Ionicons
                  name="briefcase-outline"
                  size={20}
                  color={isSUVSelected ? '#0F172A' : '#94A3B8'}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[reviewStyles.optItemTitle, !isSUVSelected && { color: '#64748B' }]}>
                      Rooftop Luggage Carrier
                    </Text>
                    <View style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: isSUVSelected ? '#FEF3C7' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: isSUVSelected ? '#F59E0B' : '#CBD5E1'
                    }}>
                      <Text style={{
                        fontSize: 10,
                        fontWeight: '800',
                        color: isSUVSelected ? '#B45309' : '#64748B'
                      }}>
                        {isSUVSelected ? '✅ SUV ONLY' : '🔒 SUV ONLY'}
                      </Text>
                    </View>
                    {isSUVSelected && (
                      <View style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: '#FFF1F2',
                        borderWidth: 1,
                        borderColor: '#FECDD3'
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#E11D48' }}>
                          + ₹{adminRooftopCharge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={reviewStyles.optItemSub}>
                    {isSUVSelected
                      ? `Secure roof carrier for extra luggage (+₹${adminRooftopCharge} carrier charge)`
                      : 'Locked: RTO rules allow roof carrier only on SUV cabs'}
                  </Text>
                </View>
                <Switch
                  value={Boolean(isSUVSelected && rooftopCarrier)}
                  onValueChange={(val) => {
                    if (!isSUVSelected) {
                      Alert.alert(
                        'SUV Only Feature 🚙',
                        'As per RTO safety regulations, rooftop luggage carriers are strictly permitted only on SUV & 7-seater vehicles (e.g. Innova / SUV). Please select an SUV vehicle to enable rooftop carrier.'
                      )
                      return
                    }
                    setRooftopCarrier(val)
                  }}
                  disabled={!isSUVSelected}
                  trackColor={{ false: '#E2E8F0', true: '#FFC700' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Notice Banner: RTO Rules & Additional Charge Warning */}
              <View style={[
                reviewStyles.rtoWarningBox,
                !isSUVSelected && { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                isSUVSelected && rooftopCarrier && { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }
              ]}>
                <Ionicons
                  name={isSUVSelected ? (rooftopCarrier ? 'alert-circle' : 'information-circle') : 'lock-closed'}
                  size={16}
                  color={isSUVSelected ? (rooftopCarrier ? '#B45309' : '#D97706') : '#64748B'}
                />
                <Text style={[
                  reviewStyles.rtoWarningText,
                  !isSUVSelected && { color: '#64748B' },
                  isSUVSelected && rooftopCarrier && { color: '#92400E', fontWeight: '700' }
                ]}>
                  {isSUVSelected
                    ? (rooftopCarrier
                        ? `⚠️ Rooftop Carrier Enabled: Carrier charge (+₹${adminRooftopCharge}) will be added to total ride fare & invoice.`
                        : `SUV Selected: Rooftop luggage carrier is available (+₹${adminRooftopCharge} additional charge).`)
                    : 'RTO regulations prohibit rooftop carrier on Mini, Sedan & Hatchbacks. Switch vehicle to SUV to enable.'}
                </Text>
              </View>

              {/* Item: Luggage & Bags Stepper */}
              <View style={reviewStyles.optItemRow}>
                <Ionicons name="bag-handle-outline" size={20} color="#0F172A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={reviewStyles.optItemTitle}>Luggage &amp; Bags Count</Text>
                  <Text style={reviewStyles.optItemSub}>Number of bags &amp; suitcases you are carrying</Text>
                </View>
                <View style={reviewStyles.stepperWrap}>
                  <TouchableOpacity
                    onPress={() => setLuggageCount(Math.max(0, luggageCount - 1))}
                    style={reviewStyles.stepperBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={16} color="#0F172A" />
                  </TouchableOpacity>
                  <Text style={reviewStyles.stepperVal}>{luggageCount} Bags</Text>
                  <TouchableOpacity
                    onPress={() => setLuggageCount(Math.min(10, luggageCount + 1))}
                    style={[reviewStyles.stepperBtn, { backgroundColor: '#FEF3C7' }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={16} color="#D97706" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Item: Traveling with Pets */}
              <View style={reviewStyles.optItemRow}>
                <Ionicons name="paw-outline" size={20} color="#0F172A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={reviewStyles.optItemTitle}>Traveling with Pets</Text>
                    <View style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: '#ECFDF5',
                      borderWidth: 1,
                      borderColor: '#A7F3D0'
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669' }}>
                        + ₹{adminPetCharge}
                      </Text>
                    </View>
                  </View>
                  <Text style={reviewStyles.optItemSub}>Pet-friendly verified cab &amp; driver (+₹{adminPetCharge} surcharge)</Text>
                </View>
                <Switch
                  value={hasPets}
                  onValueChange={setHasPets}
                  trackColor={{ false: '#E2E8F0', true: '#FFC700' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Item: Driver Waiting Time */}
              <View style={reviewStyles.optItemRow}>
                <Ionicons name="time-outline" size={20} color="#0F172A" style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={reviewStyles.optItemTitle}>Driver Waiting Time</Text>
                  <Text style={reviewStyles.optItemSub}>Additional waiting hours if needed</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowWaitingModal(true)}
                  style={reviewStyles.dropdownPill}
                  activeOpacity={0.8}
                >
                  <Text style={reviewStyles.dropdownPillText}>{waitingHours} hrs</Text>
                  <Ionicons name="chevron-down" size={14} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Item: Driver Instructions (Optional) */}
              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="document-text-outline" size={20} color="#0F172A" />
                  <Text style={reviewStyles.optItemTitle}>Driver Instructions (Optional)</Text>
                </View>
                <Text style={[reviewStyles.optItemSub, { marginLeft: 28, marginTop: 2 }]}>
                  Pickup landmarks, gate directions, or special instructions.
                </Text>
                <View style={reviewStyles.notesInputBox}>
                  <TextInput
                    style={reviewStyles.notesInput}
                    placeholder="e.g. Near metro station gate, call before arrival..."
                    placeholderTextColor="#94A3B8"
                    value={driverInstructions}
                    onChangeText={(t) => setDriverInstructions(t.slice(0, 100))}
                    multiline
                    maxLength={100}
                  />
                  <Text style={reviewStyles.notesCharCount}>{driverInstructions.length}/100</Text>
                </View>
              </View>
            </View>

            {/* 4. Safe & Reliable Ride Banner */}
            <View style={reviewStyles.safetyBanner}>
              <View style={reviewStyles.safetyShieldCircle}>
                <Ionicons name="shield-checkmark" size={18} color="#16A34A" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={reviewStyles.safetyTitle}>Safe &amp; Reliable Ride</Text>
                <Text style={reviewStyles.safetySub}>
                  Verified drivers &bull; GPS tracking &bull; 24/7 customer support
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Sticky Bottom Bar */}
          <View style={[reviewStyles.bottomStickyBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
            <View style={reviewStyles.bottomActionRow}>
              <TouchableOpacity
                onPress={() => setShowFareDetailModal(true)}
                style={{ flex: 1 }}
                activeOpacity={0.8}
              >
                <Text style={reviewStyles.totalFareLabel}>Total Fare</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Text style={reviewStyles.totalFareAmount}>
                    ₹{(() => {
                      const activeV = vehicleTypes.find(v => v.id === selectedType) || vehicleTypes[0]
                      if (!activeV) return 7215
                      const bFare = parseFloat(activeV.base_fare || 80)
                      const kRate = isRoundTrip
                        ? parseFloat(activeV.round_trip_per_km || activeV.price_per_km || 20)
                        : isOutstationTrip
                          ? parseFloat(activeV.one_way_per_km || activeV.price_per_km || 18)
                          : parseFloat(activeV.price_per_km || 15)
                      const mRate = parseFloat(activeV.price_per_min || 1.5)
                      const bDist = isRoundTrip ? routeDistanceKm * 2 : routeDistanceKm
                      const bMins = isRoundTrip ? routeDurationMins * 2 : routeDurationMins
                      let calc = fareEstimates[activeV.id] || Math.round(bFare + (bDist * kRate) + (bMins * mRate))
                      if (isSharedTrip) calc *= 0.5
                      const waitHourlyRate = parseFloat(activeV.waiting_charge_per_hour || (activeV.waiting_charge_per_min ? activeV.waiting_charge_per_min * 60 : (activeV.waiting_charge ? activeV.waiting_charge * 60 : 100)))
                      const waitingCharge = waitingHours > 0 ? Math.round(waitingHours * waitHourlyRate) : 0
                      const petCharge = hasPets ? adminPetCharge : 0
                      const rooftopCharge = (isSUVSelected && rooftopCarrier) ? adminRooftopCharge : 0
                      const disc = appliedCoupon?.discount_amount || 0
                      return Math.max(30, Math.round(calc + waitingCharge + petCharge + rooftopCharge - disc))
                    })()}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#0F172A" />
                </View>
                <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '800', marginTop: 2 }}>
                  * Tollgate &amp; parking extra
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={reviewStyles.confirmBookingBtn}
                onPress={handleBookRide}
                disabled={bookingLoading}
                activeOpacity={0.88}
              >
                {bookingLoading ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : (
                  <>
                    <Text style={reviewStyles.confirmBtnText}>Confirm Booking</Text>
                    <Ionicons name="chevron-forward" size={16} color="#0F172A" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={reviewStyles.zeroAdvanceRow}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={reviewStyles.zeroAdvanceText}>
                Zero Advance &bull; Pay after ride &bull; Tollgate &amp; parking extra as per actuals
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Passenger Details Modal ── */}
      <Modal visible={showEditPassengerModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { padding: 20 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Edit Passenger Details</Text>
              <TouchableOpacity onPress={() => setShowEditPassengerModal(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 12, marginBottom: 4 }}>Full Name</Text>
            <TextInput
              style={reviewStyles.editInput}
              value={tempPassengerName}
              onChangeText={setTempPassengerName}
              placeholder="e.g. Rohith Ram"
            />

            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 12, marginBottom: 4 }}>Phone Number</Text>
            <TextInput
              style={reviewStyles.editInput}
              value={tempPassengerPhone}
              onChangeText={setTempPassengerPhone}
              placeholder="+91 9876543210"
              keyboardType="phone-pad"
            />

            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 12, marginBottom: 4 }}>Email Address</Text>
            <TextInput
              style={reviewStyles.editInput}
              value={tempPassengerEmail}
              onChangeText={setTempPassengerEmail}
              placeholder="name@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[reviewStyles.confirmBookingBtn, { width: '100%', marginTop: 20, justifyContent: 'center' }]}
              onPress={() => {
                setPassengerName(tempPassengerName.trim() || user?.name || 'Rohith Ram')
                setPassengerPhone(tempPassengerPhone.trim() || user?.phone || '+91 8838603768')
                setPassengerEmail(tempPassengerEmail.trim() || user?.email || 'rohithsandy194@gmail.com')
                setShowEditPassengerModal(false)
              }}
            >
              <Text style={reviewStyles.confirmBtnText}>Save Passenger Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Driver Waiting Hours Selector Modal ── */}
      <Modal visible={showWaitingModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { padding: 20 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Driver Waiting Time</Text>
              <TouchableOpacity onPress={() => setShowWaitingModal(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12, gap: 8 }}>
              {(() => {
                const activeV = vehicleTypes.find(v => v.id === selectedType) || vehicleTypes[0]
                const waitHourlyRate = activeV ? parseFloat(activeV.waiting_charge_per_hour || (activeV.waiting_charge_per_min ? activeV.waiting_charge_per_min * 60 : (activeV.waiting_charge ? activeV.waiting_charge * 60 : 100))) : 100
                return [0, 1, 2, 3, 4, 5].map((hrs) => (
                  <TouchableOpacity
                    key={`wait-${hrs}`}
                    style={[
                      reviewStyles.waitOptionItem,
                      waitingHours === hrs && { borderColor: '#FFC700', backgroundColor: '#FEF3C7' }
                    ]}
                    onPress={() => {
                      setWaitingHours(hrs)
                      setShowWaitingModal(false)
                    }}
                  >
                    <Text style={[reviewStyles.waitOptionText, waitingHours === hrs && { color: '#B45309', fontWeight: '800' }]}>
                      {hrs === 0 ? '0 hrs (Standard Pickup)' : `${hrs} Hour${hrs > 1 ? 's' : ''} Additional Waiting (+₹${Math.round(hrs * waitHourlyRate)})`}
                    </Text>
                    {waitingHours === hrs && <Ionicons name="checkmark-circle" size={18} color="#D97706" />}
                  </TouchableOpacity>
                ))
              })()}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Pickup Time Selector Modal (Matching User Reference Layout) ── */}
      <Modal visible={showTimeModal} transparent animationType="slide" onRequestClose={() => setShowTimeModal(false)}>
        <View style={timePickerStyles.modalOverlay}>
          <TouchableOpacity
            style={timePickerStyles.backdropTouchable}
            activeOpacity={1}
            onPress={() => setShowTimeModal(false)}
          />
          <View style={timePickerStyles.sheetContainer}>
            {/* Top Handle Bar */}
            <View style={timePickerStyles.handleBar} />

            {/* Header with Title & Close Icon */}
            <View style={timePickerStyles.headerRow}>
              <Text style={timePickerStyles.headerTitle}>
                {activeDateTarget === 'return' ? 'Select Return Time' : 'Select Pickup Time'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowTimeModal(false)}
                style={timePickerStyles.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Top Display Box: Big Time Display + AM/PM Toggle */}
            <View style={timePickerStyles.displayRow}>
              <View style={timePickerStyles.timeDisplayBox}>
                <Text style={timePickerStyles.timeDisplayText}>
                  {String(selectedHour).padStart(2, '0')}:{selectedMinute}
                </Text>
              </View>

              <View style={timePickerStyles.periodToggleCol}>
                <TouchableOpacity
                  style={[
                    timePickerStyles.periodBtn,
                    selectedPeriod === 'AM' && timePickerStyles.periodBtnActive
                  ]}
                  onPress={() => setSelectedPeriod('AM')}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    timePickerStyles.periodBtnText,
                    selectedPeriod === 'AM' && timePickerStyles.periodBtnTextActive
                  ]}>
                    AM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    timePickerStyles.periodBtn,
                    selectedPeriod === 'PM' && timePickerStyles.periodBtnActive
                  ]}
                  onPress={() => setSelectedPeriod('PM')}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    timePickerStyles.periodBtnText,
                    selectedPeriod === 'PM' && timePickerStyles.periodBtnTextActive
                  ]}>
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* HOUR Section */}
            <Text style={timePickerStyles.sectionLabel}>HOUR</Text>
            <View style={timePickerStyles.gridContainer}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((h) => {
                const isSelected = String(parseInt(selectedHour, 10)) === h
                return (
                  <TouchableOpacity
                    key={`hour-${h}`}
                    style={[
                      timePickerStyles.gridCell,
                      isSelected && timePickerStyles.gridCellActive
                    ]}
                    onPress={() => setSelectedHour(h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      timePickerStyles.gridCellText,
                      isSelected && timePickerStyles.gridCellTextActive
                    ]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* MINUTE Section */}
            <Text style={timePickerStyles.sectionLabel}>MINUTE</Text>
            <View style={timePickerStyles.gridContainer}>
              {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => {
                const isSelected = selectedMinute === m
                return (
                  <TouchableOpacity
                    key={`min-${m}`}
                    style={[
                      timePickerStyles.gridCell,
                      isSelected && timePickerStyles.gridCellActive
                    ]}
                    onPress={() => setSelectedMinute(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      timePickerStyles.gridCellText,
                      isSelected && timePickerStyles.gridCellTextActive
                    ]}>
                      :{m}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Set Time CTA Button */}
            <TouchableOpacity
              style={timePickerStyles.submitBtn}
              onPress={() => {
                const formattedTime = `${String(selectedHour).padStart(2, '0')}:${selectedMinute} ${selectedPeriod}`
                if (activeDateTarget === 'return') {
                  setReturnTime(formattedTime)
                } else {
                  setDepartureTime(formattedTime)
                }
                setShowTimeModal(false)
              }}
              activeOpacity={0.88}
            >
              <Text style={timePickerStyles.submitBtnText}>
                Set {String(selectedHour).padStart(2, '0')}:{selectedMinute} {selectedPeriod}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Fare Breakdown Accordion Modal ── */}
      <Modal visible={showFareDetailModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { padding: 20 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Fare Breakdown</Text>
              <TouchableOpacity onPress={() => setShowFareDetailModal(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#64748B' }}>Estimated Distance</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{routeDistanceKm.toFixed(1)} km</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#64748B' }}>Trip Mode</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                  {isOutstationTrip ? 'Outstation Cab' : 'Local City Drop'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#64748B' }}>Total Passengers</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                  {passengerCount} {passengerCount === 1 ? 'Person' : 'Persons'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#64748B' }}>Bags &amp; Luggage</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{luggageCount} Bags</Text>
              </View>
              {rooftopCarrier && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>Rooftop Luggage Carrier (SUV)</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>+₹{adminRooftopCharge}</Text>
                </View>
              )}
              {hasPets && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: '#059669', fontWeight: '600' }}>Traveling with Pets Surcharge</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>+₹{adminPetCharge}</Text>
                </View>
              )}
              {waitingHours > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: '#D97706' }}>Driver Waiting ({waitingHours} hrs)</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>
                    +₹{(() => {
                      const activeV = vehicleTypes.find(v => v.id === selectedType) || vehicleTypes[0]
                      const waitHourlyRate = activeV ? parseFloat(activeV.waiting_charge_per_hour || (activeV.waiting_charge_per_min ? activeV.waiting_charge_per_min * 60 : (activeV.waiting_charge ? activeV.waiting_charge * 60 : 100))) : 100
                      return Math.round(waitingHours * waitHourlyRate)
                    })()}
                  </Text>
                </View>
              )}
              {appliedCoupon && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: '#059669' }}>Coupon Discount ({appliedCoupon.code})</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>-₹{appliedCoupon.discount_amount}</Text>
                </View>
              )}
              {/* Tollgate & Parking Charges Row */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFBEB',
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#FDE68A',
                marginVertical: 2,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="information-circle" size={15} color="#D97706" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#B45309' }}>Tollgate &amp; Parking</Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>Extra (as per receipts)</Text>
              </View>

              <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>Final Payable</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#D97706' }}>
                  ₹{(() => {
                    const activeV = vehicleTypes.find(v => v.id === selectedType) || vehicleTypes[0]
                    if (!activeV) return 7215
                    const bFare = parseFloat(activeV.base_fare || 80)
                    const kRate = isRoundTrip
                      ? parseFloat(activeV.round_trip_per_km || activeV.price_per_km || 20)
                      : isOutstationTrip
                        ? parseFloat(activeV.one_way_per_km || activeV.price_per_km || 18)
                        : parseFloat(activeV.price_per_km || 15)
                    const mRate = parseFloat(activeV.price_per_min || 1.5)
                    const bDist = isRoundTrip ? routeDistanceKm * 2 : routeDistanceKm
                    const bMins = isRoundTrip ? routeDurationMins * 2 : routeDurationMins
                    let calc = fareEstimates[activeV.id] || Math.round(bFare + (bDist * kRate) + (bMins * mRate))
                    if (isSharedTrip) calc *= 0.5
                    const waitHourlyRate = parseFloat(activeV.waiting_charge_per_hour || (activeV.waiting_charge_per_min ? activeV.waiting_charge_per_min * 60 : (activeV.waiting_charge ? activeV.waiting_charge * 60 : 100)))
                    const waitingCharge = waitingHours > 0 ? Math.round(waitingHours * waitHourlyRate) : 0
                    const petCharge = hasPets ? adminPetCharge : 0
                    const rooftopCharge = (isSUVSelected && rooftopCarrier) ? adminRooftopCharge : 0
                    const disc = appliedCoupon?.discount_amount || 0
                    return Math.max(30, Math.round(calc + waitingCharge + petCharge + rooftopCharge - disc))
                  })()}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
                * Tollgate tolls & parking permit charges are extra and to be paid directly to driver as per actual receipts.
              </Text>
            </View>
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

  // ── Top Header & Location Inputs ──
  topHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 999,
    paddingHorizontal: 16,
  },
  topCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  floatingRoundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripBadgeContainer: {
    flex: 1,
    alignItems: 'center',
  },
  tripTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  localPill: {
    backgroundColor: '#FFF8E7',
  },
  outstationPill: {
    backgroundColor: '#F5F3FF',
  },
  sharePill: {
    backgroundColor: '#ECFDF5',
  },
  tripTypeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  locationInputsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  inputsColumn: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  greenDotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 10,
  },
  redDotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 10,
  },
  locationDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 18,
  },
  locationTextInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  locationTextInputActive: {
    color: '#B45309',
  },
  clearBtn: {
    padding: 4,
  },
  swapBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  // ── Autocomplete Dropdown ──
  predictionsDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 6,
    paddingVertical: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 1000,
    zIndex: 10000,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  predHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFBEB',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  predHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F1F5F9',
  },
  predIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  predTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  predSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  predDistText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '700',
    marginLeft: 8,
  },

  // ── Map Markers ──
  pickupMarkerWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  destMarkerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingRecenterFab: {
    position: 'absolute',
    right: 16,
    bottom: 520,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 40,
  },

  // ── Trip Category Tabs (Local vs Outstation vs Shared) ──
  tripCategoryScroll: {
    marginTop: 2,
    marginBottom: 12,
  },
  tripCategoryScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  tripCategoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  tripCategoryTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  tabIconWrap: {
    marginRight: 6,
  },
  tripCategoryTabText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.1,
  },
  tripCategoryTabTextActive: {
    color: '#FFFFFF',
  },
  kmBadge: {
    marginLeft: 7,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  kmBadgeActive: {
    backgroundColor: 'rgba(255, 199, 0, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 199, 0, 0.4)',
  },
  kmBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  kmBadgeTextActive: {
    color: '#FFC700',
    fontWeight: '900',
  },

  // ── Distance Restriction Alert Boxes ──
  distanceRestrictionAlertBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    padding: 12,
    marginBottom: 10,
  },
  restrictionAlertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  restrictionAlertTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#991B1B',
    marginBottom: 2,
  },
  restrictionAlertSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
    lineHeight: 16,
  },
  restrictionSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 2,
  },
  restrictionSwitchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Dedicated Mode Header ──
  dedicatedTripHeader: {
    marginBottom: 10,
    marginTop: 2,
  },
  outstationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dedicatedTripBadgeLocal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dedicatedTripTitleLocal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    flex: 1,
  },
  dedicatedTripPillLocal: {
    backgroundColor: '#D97706',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dedicatedTripPillTextLocal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dedicatedTripBadgeOutstation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F3FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flex: 1,
  },
  dedicatedTripTitleOutstation: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6D28D9',
    flex: 1,
  },
  dedicatedTripPillOutstation: {
    backgroundColor: '#7C3AED',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dedicatedTripPillTextOutstation: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dedicatedTripBadgeShared: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dedicatedTripTitleShared: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
    flex: 1,
  },
  dedicatedTripPillShared: {
    backgroundColor: '#059669',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dedicatedTripPillTextShared: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Prominent Large Sub-Mode Segmented Selector ──
  tripModesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  largeToggleSegmentedWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    width: '100%',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  largeSegmentedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  largeSegmentedBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  largeSegmentedText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#64748B',
  },
  largeSegmentedTextActive: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ── Hourly Package Box & Chips ──
  hourlyPackageBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  hourlyPackageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  hourlyPackageIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourlyPackageTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  hourlyPackageSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 1,
  },
  hourlyChipsRow: {
    gap: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  hourlyChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 70,
  },
  hourlyChipActive: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },
  hourlyChipHours: {
    fontSize: 12,
    fontWeight: '800',
    color: '#78350F',
  },
  hourlyChipHoursActive: {
    color: '#FFFFFF',
  },
  hourlyChipKm: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
    marginTop: 2,
  },
  hourlyChipKmActive: {
    color: '#FEF3C7',
  },
  hourlyInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  hourlyInfoText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
    lineHeight: 14,
  },

  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shareChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  shareChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  shareChipTextActive: {
    color: '#059669',
  },

  // Timing Pills (Ride Now vs Schedule Later)
  timingPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  timingPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timingPillBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  timingPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  timingPillTextActive: {
    color: '#FFFFFF',
  },


  quickRelTimeChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  quickRelTimeChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  quickRelTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  quickRelTimeTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  // ── Date & Time Selector Bar ──
  dateTimeSelectorCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  dateTimeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateTimeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dateTimeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  dateTimeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  changePill: {
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  changePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },

  // ── Route Metrics ──
  routeMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  metricDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#94A3B8',
    marginHorizontal: 8,
  },
  sharingTagBadge: {
    marginLeft: 'auto',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sharingTagText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '800',
  },
  sharedTripNoticeCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  sharedTripNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  sharedTripNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  sharedTripNoticeText: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 16,
    fontWeight: '500',
  },

  // ── Vehicle List ──
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleListContainer: {
    gap: 8,
    marginBottom: 14,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  vehicleCardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  vehicleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehicleImg: {
    width: '90%',
    height: '90%',
  },
  vehicleInfoWrap: {
    flex: 1,
    marginLeft: 12,
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  vehicleNameSelected: {
    color: '#B45309',
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  vehicleSubDetail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  vehiclePriceWrap: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  vehiclePriceText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  vehiclePriceSelected: {
    color: '#B45309',
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  // ── Payment & Offers Bar ──
  paymentOffersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 12,
  },
  methodSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  methodSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  promoSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  promoSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },

  // ── High Converting CTA Button ──
  bookRideBtn: {
    backgroundColor: '#FBBF24',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  bookRideBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.3,
  },
  bookRideBtnDisabled: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#F87171',
    shadowOpacity: 0,
    elevation: 1,
  },
  bookRideBtnDisabledText: {
    color: '#991B1B',
    fontWeight: '800',
    fontSize: 13,
  },

  // ── Calendar Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  calendarModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  quickDateChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  quickDateChipActive: {
    backgroundColor: '#F59E0B',
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickDateTextActive: {
    color: '#000000',
    fontWeight: '900',
  },
  calendarMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 4,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  calendarMonthTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  calDaysOfWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  calDayHeaderCell: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 6,
  },
  calDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 2,
  },
  calDayCellSelected: {
    backgroundColor: '#F59E0B',
  },
  calDayCellDisabled: {
    opacity: 0.25,
  },
  calDayCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  calDayCellTextSelected: {
    color: '#000000',
    fontWeight: '900',
  },
  calDayCellTextDisabled: {
    color: '#94A3B8',
  },
  timeSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  timePresetsRow: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 14,
  },
  timeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  timeChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  calendarConfirmBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  calendarConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ── Modal Styles ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContentCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  payOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  payOptionItemSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  payOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  payOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  couponTextInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontWeight: '700',
    fontSize: 13,
    color: '#0F172A',
  },
  couponApplyBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponApplyBtnText: {
    color: '#000000',
    fontWeight: '900',
    fontSize: 13,
  },

  // ── Step-by-Step Progressive Disclosure Stepper ──
  progressiveStepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepperItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  stepperItemCurrent: {
    backgroundColor: '#FEF3C7',
  },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  stepperLineCompleted: {
    backgroundColor: '#10B981',
  },
  stepperBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBadgeCurrent: {
    backgroundColor: '#D97706',
  },
  stepperBadgeCompleted: {
    backgroundColor: '#10B981',
  },
  stepperNum: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  stepperNumCurrent: {
    color: '#FFFFFF',
  },
  stepperText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  stepperTextCurrent: {
    color: '#B45309',
    fontWeight: '900',
  },
  stepperTextCompleted: {
    color: '#10B981',
    fontWeight: '700',
  },

  // ── Step Animated Content Card ──
  stepAnimatedWrap: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  stepIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  stepBadgeTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  stepMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  stepSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Quick Popular Destinations in Step 1 ──
  quickPresetsWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  quickPresetsHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickPresetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickPresetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickPresetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },

  // ── Action Buttons for Stepper ──
  stepActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 12,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  stepActionBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.3,
  },

  // ── Confirmed Previous Step Summaries ──
  confirmedSummaryBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  confirmedSummaryText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#166534',
  },
  confirmedSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  editStepPill: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  editStepPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },

  // ── Large Service & Timing Selection Cards ──
  largeCardsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 10,
  },
  serviceSelectCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    minHeight: 145,
  },
  serviceSelectCardActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  serviceSelectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceRadioRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },
  serviceCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  serviceCardSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginBottom: 8,
  },
  serviceTagBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  serviceTagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },

  // ── 50/50 Ride Sharing Card Option ──
  shareCardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  shareCardOptionActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  shareCardOptionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  shareCardOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  shareCheckPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  shareCheckPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ── Step 4 Top Summary Bar ──
  step4SummaryBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  step4SummaryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  step4SummaryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    marginHorizontal: 3,
  },

  // ── Dynamic Coupon & Promo Modal Styles ──
  appliedCouponBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  removeCouponBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  removeCouponBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  couponErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  couponErrorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  couponCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  couponCardItemActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  couponCodeBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D97706',
  },
  couponCodeBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  couponDiscountBadge: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  couponDiscountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  couponItemDesc: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
    marginTop: 2,
  },
  couponMinFareText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontStyle: 'italic',
  },
  couponItemApplyBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  couponItemAppliedBtn: {
    backgroundColor: '#10B981',
  },
  couponItemApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  couponItemAppliedBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCouponsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyCouponsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyCouponsSubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
})

const reviewStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubDate: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  cardWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  timePinkBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  cardWrapCol: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  editLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D97706',
  },
  passengerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  passengerLabel: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 8,
    fontWeight: '500',
  },
  passengerVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  passengerValEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  optItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  optItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  optItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  rtoWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  rtoWarningText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 6,
    flex: 1,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginHorizontal: 8,
  },
  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  dropdownPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  notesInputBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    minHeight: 68,
  },
  notesInput: {
    fontSize: 12.5,
    color: '#0F172A',
    minHeight: 44,
    textAlignVertical: 'top',
    padding: 0,
  },
  notesCharCount: {
    fontSize: 10.5,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 2,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  safetyShieldCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  safetySub: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 2,
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 12,
  },
  bottomActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalFareLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  totalFareAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  confirmBookingBtn: {
    backgroundColor: '#FFC700',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#D97706',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  zeroAdvanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  zeroAdvanceText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  editInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 6,
  },
  waitOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  waitOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
})

const searchCardStyles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 6,
  },
  modeRadioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  modeRadioPillBig: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  modeRadioCircleBig: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRadioTextBig: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  selectedOptionTopContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  selectedOptionBigBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 26,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    gap: 9,
    shadowColor: '#D97706',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  selectedRadioCircleFilled: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  selectedRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D97706',
  },
  selectedOptionBigText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.2,
  },
  switchOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  switchOptionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  modeRadioPillActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  modeRadioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRadioCircleActive: {
    borderColor: '#D97706',
  },
  modeRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  modeRadioText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modeRadioTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  modeTaglineText: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '500',
  },
  routeBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    position: 'relative',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dotLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dotIndicatorGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  dotIndicatorRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  dotIndicatorAmber: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  dotLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  routeInputTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    padding: 0,
  },
  routeSubText: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  routeDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    position: 'relative',
  },
  routeDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  floatingSwapBtn: {
    position: 'absolute',
    right: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
    marginBottom: 10,
    gap: 6,
  },
  addStopText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  datesGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  dateCardCol: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
  },
  dateCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  dateCardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateCardValueText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 6,
  },
  dateCardSubDay: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 4,
  },
  sharedTripOptInCard: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1.5,
    borderColor: '#C4B5FD',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  sharedTripOptInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sharedTripOptInIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedTripOptInTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#5B21B6',
  },
  sharedTripOptInBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sharedTripOptInBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  sharedTripOptInSub: {
    fontSize: 10.5,
    color: '#6D28D9',
    marginTop: 2,
    lineHeight: 14,
    fontWeight: '500',
  },
  sharedTripActiveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  sharedTripActiveNoticeText: {
    fontSize: 10.5,
    color: '#065F46',
    fontWeight: '600',
    flex: 1,
  },
  searchBtn: {
    backgroundColor: '#FFC700',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#D97706',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  searchBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  recentTripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
    alignSelf: 'flex-start',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  recentTripText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  compactBarTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  compactBarSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modifyBtnPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    marginLeft: 8,
  },
  modifyBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },
  hourlyPkgRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  hourlyPkgChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  hourlyPkgChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  hourlyPkgText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  hourlyPkgTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  inlineClearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  inlinePredictionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 4,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  predHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  predHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gpsLocateInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignSelf: 'center',
  },
  gpsLocateInlineText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  currentLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  currentLocIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  currentLocSub: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 1,
  },
  currentLocBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  currentLocBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#166534',
  },
})

const timePickerStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 20,
  },
  handleBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  timeDisplayBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplayText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.5,
  },
  periodToggleCol: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  periodBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBtnActive: {
    backgroundColor: '#D97706',
    shadowColor: '#D97706',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  periodBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#64748B',
  },
  periodBtnTextActive: {
    color: '#FFFFFF',
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginBottom: 14,
  },
  gridCell: {
    width: '15.2%',
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
    borderWidth: 2,
  },
  gridCellText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
  },
  gridCellTextActive: {
    color: '#B45309',
    fontWeight: '900',
  },
  submitBtn: {
    backgroundColor: '#FFC700',
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#D97706',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
})

