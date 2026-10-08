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
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps'
import Constants from 'expo-constants'
import { vehicleTypesAPI, bookingsAPI, customerAPI, paymentAPI, couponsAPI, resolveAssetUrl } from '../../api/api'
import { searchPlacesService, reverseGeocodeService, getPopularDestinations } from '../../services/locationSearchService'
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
  const [isSharedTrip, setIsSharedTrip] = useState(initTripMode === 'shared')
  const [isRoundTrip, setIsRoundTrip] = useState(Boolean(initIsRoundTrip))
  const [rideTimingMode, setRideTimingMode] = useState('now') // 'now' | 'schedule'
  const [localTripSubType, setLocalTripSubType] = useState('drop') // 'drop' | 'hourly'
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
    } catch {}
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
    if (initTripMode === 'outstation') {
      setTripTypeCategory('outstation')
      setIsSharedTrip(false)
    } else if (initTripMode === 'shared') {
      setTripTypeCategory('outstation')
      setIsSharedTrip(true)
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
  // 1. Local Trip: Maximum 50 KM (if > 50 KM, auto-converted to Long Trip / Outstation)
  // 2. Outstation Trip: Strictly > 50 KM
  const isOutstationDistanceTooShort = isOutstationTrip && routeDistanceKm > 0 && routeDistanceKm <= 50
  // 3. Shared Trip: Strictly > 240 KM
  const isSharingDistanceTooShort = isSharedTrip && routeDistanceKm > 0 && routeDistanceKm <= 240
  const isDistanceInvalid = isOutstationDistanceTooShort || isSharingDistanceTooShort

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

  // Fetch Current Location on Mount (Ultra-Fast Dual Stage: Instant Last Known + Background Fresh GPS)
  useEffect(() => {
    let mounted = true
    ;(async () => {
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
            }).catch(() => {})
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
            .catch(() => {})
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
    fetchVehicles()
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

  // Update Route Polyline & Fares whenever pickup and destination coordinates are selected
  useEffect(() => {
    if (pickupCoords?.latitude && destCoords?.latitude) {
      updateDirections()
    } else {
      setFareEstimates({})
      setRouteCoordinates([])
    }
  }, [pickupCoords, destCoords, isRoundTrip, isSharedTrip, tripTypeCategory, localTripSubType, hourlyPackageHours])

  const updateDirections = async () => {
    if (!pickupCoords || !destCoords) return
    setLoadingFares(true)
    try {
      const res = await fetchRouteDirections(pickupCoords, destCoords)
      const distKm = Math.max(0.5, res?.distanceKm || calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude))
      const durMins = Math.max(2, res?.durationMins || Math.round(distKm * 2.4))
      setRouteDistanceKm(distKm)
      setRouteDurationMins(durMins)

      if (res?.coordinates?.length > 0) {
        setRouteCoordinates(res.coordinates)
      } else {
        setRouteCoordinates([pickupCoords, destCoords])
      }

      // Fit map bounds to encompass both endpoints
      if (mapRef.current) {
        mapRef.current.fitToCoordinates([pickupCoords, destCoords], {
          edgePadding: { top: insets.top + 160, right: 60, bottom: 320, left: 60 },
          animated: true,
        })
      }

      // If route distance exceeds 50 km, automatically convert to Long Trip (Outstation)
      if (distKm > 50 && tripTypeCategory === 'local') {
        setTripTypeCategory('outstation')
      }

      // Automatically calculate dynamic fares from backend & admin rates
      fetchDynamicFares(distKm, durMins)
    } catch (err) {
      console.warn('Direction route fallback calculation:', err)
      const distKm = Math.max(0.5, calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude))
      const durMins = Math.max(2, Math.round(distKm * 2.4))
      setRouteDistanceKm(distKm)
      setRouteDurationMins(durMins)
      setRouteCoordinates([pickupCoords, destCoords])

      if (distKm > 50 && tripTypeCategory === 'local') {
        setTripTypeCategory('outstation')
      }

      fetchDynamicFares(distKm, durMins)
    } finally {
      setLoadingFares(false)
    }
  }

  // Calculate Dynamic Fare using Admin settings
  const fetchDynamicFares = async (distKm, durMins) => {
    try {
      const isOutstation = (tripTypeCategory === 'outstation') || (distKm > 50 && localTripSubType !== 'hourly')
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

  // Live Location Autocomplete Search
  const handleSearchTextChange = async (text, target) => {
    if (target === 'pickup') {
      setPickup(text)
    } else {
      setDestination(text)
    }

    if (!text || text.trim().length === 0) {
      const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
      setPredictions(popular)
      return
    }

    if (text.trim().length === 1) {
      const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
      const q = text.toLowerCase()
      const filtered = popular.filter(item =>
        item.description.toLowerCase().includes(q) ||
        (item.structured_formatting?.main_text || '').toLowerCase().includes(q)
      )
      setPredictions(filtered.length > 0 ? filtered : popular)
      return
    }

    setLoadingPredictions(true)
    try {
      const res = await searchPlacesService(text, pickupCoords?.latitude, pickupCoords?.longitude)
      if (res && res.length > 0) {
        setPredictions(res)
      } else {
        const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
        const q = text.toLowerCase()
        const filtered = popular.filter(item =>
          item.description.toLowerCase().includes(q) ||
          (item.structured_formatting?.main_text || '').toLowerCase().includes(q)
        )
        setPredictions(filtered)
      }
    } catch {
      const popular = getPopularDestinations(pickupCoords?.latitude, pickupCoords?.longitude)
      setPredictions(popular)
    } finally {
      setLoadingPredictions(false)
    }
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
    } else {
      setDestination(displayName)
      if (coords) {
        setDestCoords(coords)
      }
      animateStepTransition(2)
    }
  }

  // Handle Quick Destination Preset Chips in Step 1
  const handleQuickPresetSelect = async (preset) => {
    const currentLat = pickupCoords?.latitude || 13.0827
    const currentLng = pickupCoords?.longitude || 80.2707
    try {
      const preds = await searchPlacesService(preset.query, currentLat, currentLng)
      if (preds && preds.length > 0) {
        handleSelectPrediction(preds[0], 'destination')
      } else {
        setDestination(preset.name)
        animateStepTransition(2)
        handleFocusDestination()
      }
    } catch {
      setDestination(preset.name)
      animateStepTransition(2)
      handleFocusDestination()
    }
  }

  // Automatically resolve text on enter / submit
  const handleLocationSubmit = async (target) => {
    const text = target === 'pickup' ? pickup : destination
    if (!text || text.trim().length < 2) return

    if (target === 'pickup' && pickupCoords) return
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
          }).catch(() => {})
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
              }).catch(() => {})
            }
          }
        })
        .catch(() => {})
    } catch (e) {}
  }

  // Toggle 50/50 Share Ride with Full Fare Alert Commitment
  const handleToggleSharing = () => {
    if (isSharedTrip) {
      setIsSharedTrip(false)
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

    // ── 50 KM Local Max & Auto-Conversion to Long Trip / 240 KM Sharing Enforcement ──
    let effectiveOutstation = isOutstationTrip
    let effectiveTripTypeCategory = tripTypeCategory
    if (routeDistanceKm > 50 && !isHourlyLocal) {
      effectiveOutstation = true
      effectiveTripTypeCategory = 'outstation'
      if (tripTypeCategory !== 'outstation') {
        setTripTypeCategory('outstation')
      }
    }

    if (effectiveOutstation && routeDistanceKm > 0 && routeDistanceKm <= 50) {
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
    const rawFare = fareEstimates[selectedVt.id] || Math.round(baseFare + (billableDist * kmRate) + (billableMins * minRate))
    const discountAmount = appliedCoupon?.discount_amount || 0
    const finalFare = Math.max(30, rawFare - discountAmount)

    setBookingLoading(true)
    try {
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
      }

      const res = await bookingsAPI.create(payload)
      if (res.data?.status === 'success' && res.data?.booking_id) {
        navigation.navigate('BookingTrack', { bookingId: res.data.booking_id })
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
      const res = await couponsAPI.active({
        city: cityName || '',
        latitude: pickupCoords?.latitude,
        longitude: pickupCoords?.longitude,
      })
      const list = res.data?.coupons || []
      setAvailableCoupons(list)
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
        onMapPress={handleMapPress}
        initialRegion={{
          latitude: pickupCoords?.latitude || 13.0827,
          longitude: pickupCoords?.longitude || 80.2707,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
      />

      {/* Floating Recenter Map Button */}
      <TouchableOpacity
        style={[
          styles.floatingRecenterFab,
          { bottom: bookingStep === 1 ? 236 : Math.min(536, SCREEN_HEIGHT * 0.60 + 16) },
        ]}
        onPress={handleRecenterMap}
        activeOpacity={0.85}
      >
        <Ionicons name="locate-outline" size={22} color="#0F172A" />
      </TouchableOpacity>

      {/* ── 3. Modern Draggable Bottom Sheet ── */}
      <ModernBottomSheet
        snapPoints={[
          220,
          Math.min(520, SCREEN_HEIGHT * 0.60),
          Math.min(600, SCREEN_HEIGHT * 0.70),
        ]}
        initialIndex={bookingStep === 1 ? 0 : 1}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
          {/* ── Progressive Stepper Indicator ── */}
          <View style={styles.progressiveStepperWrap}>
            {[
              { id: 1, label: 'Route', icon: 'location' },
              { id: 2, label: isOutstationTrip ? 'Outstation' : 'Service', icon: 'car-sport' },
              { id: 3, label: 'Timing', icon: 'time' },
              { id: 4, label: 'Cabs & Fare', icon: 'pricetag' },
            ].map((step, idx) => {
              const isCompleted = bookingStep > step.id
              const isCurrent = bookingStep === step.id
              return (
                <React.Fragment key={step.id}>
                  {idx > 0 && (
                    <View style={[styles.stepperLine, bookingStep > idx && styles.stepperLineCompleted]} />
                  )}
                  <TouchableOpacity
                    style={[styles.stepperItem, isCurrent && styles.stepperItemCurrent]}
                    onPress={() => {
                      if (step.id === 1) {
                        animateStepTransition(1)
                        handleFocusDestination()
                      } else if (step.id <= Math.max(bookingStep, (destination && destCoords ? 2 : 1))) {
                        animateStepTransition(step.id)
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.stepperBadge,
                      isCurrent && styles.stepperBadgeCurrent,
                      isCompleted && styles.stepperBadgeCompleted,
                    ]}>
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.stepperNum, isCurrent && styles.stepperNumCurrent]}>{step.id}</Text>
                      )}
                    </View>
                    <Text style={[
                      styles.stepperText,
                      isCurrent && styles.stepperTextCurrent,
                      isCompleted && styles.stepperTextCompleted,
                    ]}>
                      {step.label}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              )
            })}
          </View>

          {/* ── STEP 1: Set Drop Location ── */}
          {bookingStep === 1 && (
            <Animated.View style={[styles.stepAnimatedWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="location" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.stepBadgeTag}>
                    <Text style={styles.stepBadgeTagText}>STEP 1 OF 4</Text>
                  </View>
                  <Text style={styles.stepMainTitle}>Where are you going?</Text>
                  <Text style={styles.stepSubTitle}>Type your drop location or choose a popular destination</Text>
                </View>
              </View>

              {/* Quick Popular Destination Chips */}
              <View style={styles.quickPresetsWrap}>
                <Text style={styles.quickPresetsHeader}>Popular Destinations in City:</Text>
                <View style={styles.quickPresetsGrid}>
                  {[
                    { name: 'Airport', icon: 'airplane-outline', query: 'Airport' },
                    { name: 'Central Railway', icon: 'train-outline', query: 'Railway Station' },
                    { name: 'Bus Terminal', icon: 'bus-outline', query: 'Bus Stand' },
                    { name: 'Shopping Mall', icon: 'cart-outline', query: 'Mall' },
                    { name: 'Hospital', icon: 'medkit-outline', query: 'Hospital' },
                  ].map((p, pIdx) => (
                    <TouchableOpacity
                      key={pIdx}
                      style={styles.quickPresetPill}
                      onPress={() => handleQuickPresetSelect(p)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={p.icon} size={13} color="#B45309" />
                      <Text style={styles.quickPresetText}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={styles.stepActionBtn}
                onPress={handleFocusDestination}
                activeOpacity={0.88}
              >
                <Ionicons name="search" size={16} color="#000000" />
                <Text style={styles.stepActionBtnText}>Type Drop Location ➔</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 2: Service Selection (Local Drop vs Hourly | One Way vs Round Trip) ── */}
          {bookingStep === 2 && (
            <Animated.View style={[styles.stepAnimatedWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Destination Summary Bar */}
              <View style={styles.confirmedSummaryBar}>
                <Ionicons name="checkmark-circle" size={15} color="#10B981" />
                <Text style={styles.confirmedSummaryText} numberOfLines={1}>
                  Drop: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{destination || 'Selected'}</Text>
                  {routeDistanceKm > 0 ? ` (${routeDistanceKm.toFixed(1)} km)` : ''}
                </Text>
                <TouchableOpacity onPress={handleFocusDestination} style={styles.editStepPill}>
                  <Text style={styles.editStepPillText}>Change</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.stepHeaderRow}>
                <View style={[styles.stepIconWrap, { backgroundColor: isOutstationTrip ? '#F3E8FF' : '#FEF3C7' }]}>
                  <Ionicons name={isOutstationTrip ? 'map' : 'car-sport'} size={20} color={isOutstationTrip ? '#7C3AED' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.stepBadgeTag, { backgroundColor: isOutstationTrip ? '#F3E8FF' : '#FEF3C7' }]}>
                    <Text style={[styles.stepBadgeTagText, { color: isOutstationTrip ? '#7C3AED' : '#B45309' }]}>STEP 2 OF 4</Text>
                  </View>
                  <Text style={styles.stepMainTitle}>{isOutstationTrip ? 'Outstation Trip Mode' : 'Local Service Type'}</Text>
                  <Text style={styles.stepSubTitle}>
                    {isOutstationTrip
                      ? 'Choose One Way or Round Trip for outstation travel'
                      : 'Choose point-to-point drop or hourly rental package'}
                  </Text>
                </View>
              </View>

              {/* Service Selection Cards */}
              <View style={styles.largeCardsGrid}>
                {isOutstationTrip ? (
                  <>
                    <TouchableOpacity
                      style={[styles.serviceSelectCard, !isRoundTrip && styles.serviceSelectCardActive]}
                      onPress={() => {
                        setIsRoundTrip(false)
                        setTimeout(() => animateStepTransition(3), 160)
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.serviceSelectCardTop}>
                        <View style={[styles.serviceIconBubble, !isRoundTrip && { backgroundColor: '#7C3AED' }]}>
                          <Ionicons name="arrow-forward" size={16} color={!isRoundTrip ? '#FFFFFF' : '#64748B'} />
                        </View>
                        <View style={[styles.serviceRadioRing, !isRoundTrip && { borderColor: '#7C3AED' }]}>
                          {!isRoundTrip && <View style={[styles.serviceRadioDot, { backgroundColor: '#7C3AED' }]} />}
                        </View>
                      </View>
                      <Text style={[styles.serviceCardTitle, !isRoundTrip && { color: '#7C3AED' }]}>One Way Trip</Text>
                      <Text style={styles.serviceCardSub}>Single drop to destination city. Pay only for one way.</Text>
                      <View style={styles.serviceTagBadge}>
                        <Text style={styles.serviceTagBadgeText}>Single City Drop</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.serviceSelectCard, isRoundTrip && styles.serviceSelectCardActive]}
                      onPress={() => {
                        setIsRoundTrip(true)
                        setTimeout(() => animateStepTransition(3), 160)
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.serviceSelectCardTop}>
                        <View style={[styles.serviceIconBubble, isRoundTrip && { backgroundColor: '#7C3AED' }]}>
                          <Ionicons name="repeat" size={16} color={isRoundTrip ? '#FFFFFF' : '#64748B'} />
                        </View>
                        <View style={[styles.serviceRadioRing, isRoundTrip && { borderColor: '#7C3AED' }]}>
                          {isRoundTrip && <View style={[styles.serviceRadioDot, { backgroundColor: '#7C3AED' }]} />}
                        </View>
                      </View>
                      <Text style={[styles.serviceCardTitle, isRoundTrip && { color: '#7C3AED' }]}>Round Trip</Text>
                      <Text style={styles.serviceCardSub}>Return back with same cab. Discounted return km fare.</Text>
                      <View style={[styles.serviceTagBadge, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.serviceTagBadgeText, { color: '#059669' }]}>Save on Return</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.serviceSelectCard, localTripSubType === 'drop' && styles.serviceSelectCardActive]}
                      onPress={() => {
                        setLocalTripSubType('drop')
                        setIsRoundTrip(false)
                        setTimeout(() => animateStepTransition(3), 160)
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.serviceSelectCardTop}>
                        <View style={[styles.serviceIconBubble, localTripSubType === 'drop' && { backgroundColor: '#D97706' }]}>
                          <Ionicons name="car-sport" size={16} color={localTripSubType === 'drop' ? '#FFFFFF' : '#64748B'} />
                        </View>
                        <View style={[styles.serviceRadioRing, localTripSubType === 'drop' && { borderColor: '#D97706' }]}>
                          {localTripSubType === 'drop' && <View style={[styles.serviceRadioDot, { backgroundColor: '#D97706' }]} />}
                        </View>
                      </View>
                      <Text style={[styles.serviceCardTitle, localTripSubType === 'drop' && { color: '#B45309' }]}>Local Drop</Text>
                      <Text style={styles.serviceCardSub}>Standard point-to-point drop within city limits.</Text>
                      <View style={styles.serviceTagBadge}>
                        <Text style={styles.serviceTagBadgeText}>Point to Point</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.serviceSelectCard, localTripSubType === 'hourly' && styles.serviceSelectCardActive]}
                      onPress={() => {
                        setLocalTripSubType('hourly')
                        setIsRoundTrip(false)
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.serviceSelectCardTop}>
                        <View style={[styles.serviceIconBubble, localTripSubType === 'hourly' && { backgroundColor: '#D97706' }]}>
                          <Ionicons name="time" size={16} color={localTripSubType === 'hourly' ? '#FFFFFF' : '#64748B'} />
                        </View>
                        <View style={[styles.serviceRadioRing, localTripSubType === 'hourly' && { borderColor: '#D97706' }]}>
                          {localTripSubType === 'hourly' && <View style={[styles.serviceRadioDot, { backgroundColor: '#D97706' }]} />}
                        </View>
                      </View>
                      <Text style={[styles.serviceCardTitle, localTripSubType === 'hourly' && { color: '#B45309' }]}>Hourly Package</Text>
                      <Text style={styles.serviceCardSub}>Keep cab for multiple stops and errands.</Text>
                      <View style={[styles.serviceTagBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.serviceTagBadgeText, { color: '#B45309' }]}>Multi-Stop Rental</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Hourly Duration Selector */}
              {!isOutstationTrip && localTripSubType === 'hourly' && (
                <View style={styles.hourlyPackageBox}>
                  <Text style={styles.hourlyPackageTitle}>CHOOSE RENTAL DURATION:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyChipsRow}>
                    {[1, 2, 3, 4, 6, 8, 10, 12].map(hrs => {
                      const isSel = hourlyPackageHours === hrs
                      return (
                        <TouchableOpacity
                          key={hrs}
                          style={[styles.hourlyChip, isSel && styles.hourlyChipActive]}
                          onPress={() => setHourlyPackageHours(hrs)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.hourlyChipHours, isSel && styles.hourlyChipHoursActive]}>
                            {hrs} {hrs === 1 ? 'Hour' : 'Hours'}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                  <View style={styles.hourlyInfoBanner}>
                    <Ionicons name="information-circle" size={13} color="#D97706" />
                    <Text style={styles.hourlyInfoText}>
                      Unlimited local errands within {hourlyPackageHours} {hourlyPackageHours === 1 ? 'hr' : 'hrs'}. Overtime billed automatically on drop.
                    </Text>
                  </View>
                </View>
              )}

              {/* Shared Trip Option (if eligible) */}
              {isSharingEligible && (
                <TouchableOpacity
                  style={[styles.shareCardOption, isSharedTrip && styles.shareCardOptionActive]}
                  onPress={handleToggleSharing}
                  activeOpacity={0.85}
                >
                  <Ionicons name="people" size={18} color={isSharedTrip ? '#059669' : '#64748B'} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.shareCardOptionTitle, isSharedTrip && { color: '#065F46' }]}>
                      50/50 Ride Sharing Available
                    </Text>
                    <Text style={styles.shareCardOptionSub}>
                      Split trip fare with another passenger heading the same way.
                    </Text>
                  </View>
                  <View style={[styles.shareCheckPill, isSharedTrip && { backgroundColor: '#059669' }]}>
                    <Text style={styles.shareCheckPillText}>{isSharedTrip ? '✓ Active' : 'Enable'}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Distance Warning Alert */}
              {isOutstationDistanceTooShort && (
                <View style={[styles.distanceRestrictionAlertBox, { backgroundColor: '#FFFBEB', borderColor: '#FCD34D', marginTop: 10 }]}>
                  <View style={styles.restrictionAlertHeader}>
                    <Ionicons name="alert-circle" size={18} color="#D97706" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.restrictionAlertTitle, { color: '#B45309' }]}>
                        Min 50 km Required for Outstation ({routeDistanceKm.toFixed(1)} km)
                      </Text>
                      <Text style={[styles.restrictionAlertSub, { color: '#92400E' }]}>
                        This route is within local limits. Switch to Local Trip mode or pick a farther destination.
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Next Button to Step 3 */}
              <TouchableOpacity
                style={styles.stepActionBtn}
                onPress={() => animateStepTransition(3)}
                activeOpacity={0.88}
              >
                <Text style={styles.stepActionBtnText}>Next: Ride Timing ➔</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 3: Ride Timing (Ride Now vs Schedule) ── */}
          {bookingStep === 3 && (
            <Animated.View style={[styles.stepAnimatedWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Summary Pills */}
              <View style={styles.confirmedSummaryRow}>
                <View style={styles.confirmedSummaryBar}>
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  <Text style={styles.confirmedSummaryText} numberOfLines={1}>
                    {destination ? destination.slice(0, 16) : 'Destination'}
                  </Text>
                  <TouchableOpacity onPress={() => animateStepTransition(1)} style={styles.editStepPill}>
                    <Text style={styles.editStepPillText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.confirmedSummaryBar}>
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                  <Text style={styles.confirmedSummaryText}>
                    {isOutstationTrip ? (isRoundTrip ? 'Round Trip' : 'One Way') : (localTripSubType === 'hourly' ? `${hourlyPackageHours}h Rental` : 'Local Drop')}
                  </Text>
                  <TouchableOpacity onPress={() => animateStepTransition(2)} style={styles.editStepPill}>
                    <Text style={styles.editStepPillText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.stepHeaderRow}>
                <View style={[styles.stepIconWrap, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="time" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.stepBadgeTag, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.stepBadgeTagText, { color: '#059669' }]}>STEP 3 OF 4</Text>
                  </View>
                  <Text style={styles.stepMainTitle}>When do you want to ride?</Text>
                  <Text style={styles.stepSubTitle}>Book for immediate pickup or schedule in advance</Text>
                </View>
              </View>

              {/* Dual Timing Cards */}
              <View style={styles.largeCardsGrid}>
                {/* Ride Now Card */}
                <TouchableOpacity
                  style={[styles.serviceSelectCard, rideTimingMode === 'now' && styles.serviceSelectCardActive]}
                  onPress={() => {
                    setRideTimingMode('now')
                    setTimeout(() => animateStepTransition(4), 160)
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.serviceSelectCardTop}>
                    <View style={[styles.serviceIconBubble, rideTimingMode === 'now' && { backgroundColor: '#D97706' }]}>
                      <Ionicons name="flash" size={16} color={rideTimingMode === 'now' ? '#FFFFFF' : '#64748B'} />
                    </View>
                    <View style={[styles.serviceRadioRing, rideTimingMode === 'now' && { borderColor: '#D97706' }]}>
                      {rideTimingMode === 'now' && <View style={[styles.serviceRadioDot, { backgroundColor: '#D97706' }]} />}
                    </View>
                  </View>
                  <Text style={[styles.serviceCardTitle, rideTimingMode === 'now' && { color: '#B45309' }]}>Ride Now</Text>
                  <Text style={styles.serviceCardSub}>Nearest verified driver arrives in 3-5 mins.</Text>
                  <View style={[styles.serviceTagBadge, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.serviceTagBadgeText, { color: '#059669' }]}>Instant Dispatch ⚡</Text>
                  </View>
                </TouchableOpacity>

                {/* Schedule Card */}
                <TouchableOpacity
                  style={[styles.serviceSelectCard, rideTimingMode === 'schedule' && styles.serviceSelectCardActive]}
                  onPress={() => {
                    setRideTimingMode('schedule')
                    setActiveDateTarget('departure')
                    setShowCalendarModal(true)
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.serviceSelectCardTop}>
                    <View style={[styles.serviceIconBubble, rideTimingMode === 'schedule' && { backgroundColor: '#D97706' }]}>
                      <Ionicons name="calendar" size={16} color={rideTimingMode === 'schedule' ? '#FFFFFF' : '#64748B'} />
                    </View>
                    <View style={[styles.serviceRadioRing, rideTimingMode === 'schedule' && { borderColor: '#D97706' }]}>
                      {rideTimingMode === 'schedule' && <View style={[styles.serviceRadioDot, { backgroundColor: '#D97706' }]} />}
                    </View>
                  </View>
                  <Text style={[styles.serviceCardTitle, rideTimingMode === 'schedule' && { color: '#B45309' }]}>Schedule Ride</Text>
                  <Text style={styles.serviceCardSub}>Pre-book for a guaranteed pickup at chosen time.</Text>
                  <View style={styles.serviceTagBadge}>
                    <Text style={styles.serviceTagBadgeText}>Advance Booking 📅</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Schedule Details Bar (if schedule selected) */}
              {rideTimingMode === 'schedule' && (
                <View style={styles.dateTimeSelectorCard}>
                  <TouchableOpacity
                    style={styles.dateTimeBlock}
                    onPress={() => {
                      setActiveDateTarget('departure')
                      setShowCalendarModal(true)
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.dateTimeIconBox}>
                      <Ionicons name="calendar" size={16} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dateTimeLabel}>DEPARTURE DATE & TIME</Text>
                      <Text style={styles.dateTimeValue}>
                        {formatDateDisplay(departureDate)} · {departureTime}
                      </Text>
                    </View>
                    <View style={styles.changePill}>
                      <Text style={styles.changePillText}>Change 📅</Text>
                    </View>
                  </TouchableOpacity>

                  {isRoundTrip && (
                    <TouchableOpacity
                      style={[styles.dateTimeBlock, { borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: 8, paddingTop: 8 }]}
                      onPress={() => {
                        setActiveDateTarget('return')
                        setShowCalendarModal(true)
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.dateTimeIconBox, { backgroundColor: '#ECFDF5' }]}>
                        <Ionicons name="swap-horizontal" size={16} color="#059669" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dateTimeLabel, { color: '#059669' }]}>RETURN PICKUP DATE & TIME</Text>
                        <Text style={styles.dateTimeValue}>
                          {formatDateDisplay(returnDate)} · {returnTime}
                        </Text>
                      </View>
                      <View style={[styles.changePill, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.changePillText, { color: '#059669' }]}>Change 📅</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Reveal Cabs Button */}
              <TouchableOpacity
                style={styles.stepActionBtn}
                onPress={() => animateStepTransition(4)}
                activeOpacity={0.88}
              >
                <Text style={styles.stepActionBtnText}>View Available Cabs & Fares 🚖 ➔</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── STEP 4: Cabs & Live Fares (The Grand Opening Reveal) ── */}
          {bookingStep === 4 && (
            <Animated.View style={[styles.stepAnimatedWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Step 1, 2, 3 Quick Summary / Edit Bar */}
              <View style={styles.step4SummaryBar}>
                <TouchableOpacity
                  style={styles.step4SummaryPill}
                  onPress={() => animateStepTransition(1)}
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
                  onPress={() => animateStepTransition(2)}
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
                  onPress={() => animateStepTransition(3)}
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

              {/* Golden CTA Button */}
              <TouchableOpacity
                style={[
                  styles.bookRideBtn,
                  (isDistanceInvalid || !destination?.trim() || !destCoords) && styles.bookRideBtnDisabled,
                ]}
                onPress={() => {
                  if (!destination?.trim() || !destCoords) {
                    Alert.alert(
                      'Destination Required 📍',
                      'Please select or enter your destination address. Entha trip-kum destination illamal book seiya mudiyadhu.'
                    )
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
                  handleBookRide()
                }}
                disabled={bookingLoading}
                activeOpacity={0.88}
              >
                {bookingLoading ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <Text style={[
                    styles.bookRideBtnText,
                    (isDistanceInvalid || !destination?.trim() || !destCoords) && styles.bookRideBtnDisabledText,
                  ]}>
                    {!destination?.trim() || !destCoords
                      ? '📍 Enter Destination to Book'
                      : isOutstationDistanceTooShort
                      ? '⚠️ Min 50 km Required for Outstation'
                      : isSharingDistanceTooShort
                      ? '⚠️ Min 240 km for Ride Sharing'
                      : rideTimingMode === 'now'
                      ? (isOutstationTrip ? '⚡ Ride Now (Outstation)' : '⚡ Ride Now')
                      : (isOutstationTrip ? '📅 Schedule Outstation Ride' : '📅 Schedule Ride')}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </ModernBottomSheet>

      {/* ── 2. Floating Top Header & Search Card (Rendered after Bottom Sheet with high elevation to always display dropdown over sheet) ── */}
      <SafeAreaView style={[styles.topHeaderContainer, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={styles.topCard}>
          {/* Back Button & Location Title */}
          <View style={styles.topBarRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.floatingRoundBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.tripBadgeContainer}>
              <View style={[styles.tripTypePill, isSharedTrip ? styles.sharePill : isOutstationTrip ? styles.outstationPill : styles.localPill]}>
                <Ionicons
                  name={isSharedTrip ? 'people' : isOutstationTrip ? 'map' : 'car-sport'}
                  size={12}
                  color={isSharedTrip ? '#059669' : isOutstationTrip ? '#7C3AED' : '#D97706'}
                />
                <Text style={[styles.tripTypeText, { color: isSharedTrip ? '#059669' : isOutstationTrip ? '#7C3AED' : '#D97706' }]}>
                  {isSharedTrip ? '50/50 SHARED OUTSTATION (>240 KM)' : isOutstationTrip ? 'OUTSTATION TRIP (>50 KM)' : 'LOCAL TRIP (≤50 KM)'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleRecenterMap}
              style={styles.floatingRoundBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="locate" size={18} color="#D97706" />
            </TouchableOpacity>
          </View>

          {/* Location Inputs Block with Swap Button */}
          <View style={styles.locationInputsWrap}>
            <View style={styles.inputsColumn}>
              {/* Pickup Input Row */}
              <View style={styles.inputRow}>
                <View style={styles.greenDotIndicator} />
                <TextInput
                  style={[styles.locationTextInput, activeInput === 'pickup' && styles.locationTextInputActive]}
                  placeholder="Pickup Location"
                  placeholderTextColor="#94A3B8"
                  value={pickup}
                  onChangeText={(t) => handleSearchTextChange(t, 'pickup')}
                  onFocus={handleFocusPickup}
                  onSubmitEditing={() => handleLocationSubmit('pickup')}
                />
              </View>

              <View style={styles.locationDivider} />

              {/* Destination Input Row */}
              <View style={styles.inputRow}>
                <View style={styles.redDotIndicator} />
                <TextInput
                  ref={destInputRef}
                  style={[styles.locationTextInput, activeInput === 'destination' && styles.locationTextInputActive]}
                  placeholder="Where to? (Enter Destination)"
                  placeholderTextColor="#94A3B8"
                  value={destination}
                  onChangeText={(t) => handleSearchTextChange(t, 'destination')}
                  onFocus={handleFocusDestination}
                  onSubmitEditing={() => handleLocationSubmit('destination')}
                />
                {destination ? (
                  <TouchableOpacity onPress={() => { setDestination(''); setDestCoords(null); setRouteDistanceKm(0); setFareEstimates({}); animateStepTransition(1); handleFocusDestination(); }} style={styles.clearBtn}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Swap Button */}
            <TouchableOpacity onPress={handleSwapLocations} style={styles.swapBtn} activeOpacity={0.8}>
              <Ionicons name="swap-vertical" size={18} color="#D97706" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Autocomplete Predictions Dropdown */}
        {activeInput && predictions.length > 0 && (
          <View style={styles.predictionsDropdown}>
            <View style={styles.predHeaderRow}>
              <Ionicons
                name={activeInput === 'destination' ? 'navigate' : 'pin'}
                size={13}
                color="#D97706"
              />
              <Text style={styles.predHeaderText}>
                {activeInput === 'destination'
                  ? (destination.length > 0 ? 'Search Results' : '✨ Suggested Destinations Near You')
                  : (pickup.length > 0 ? 'Search Results' : '✨ Suggested Pickup Points')}
              </Text>
              {loadingPredictions && <ActivityIndicator size="small" color="#D97706" style={{ marginLeft: 'auto' }} />}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true} style={{ maxHeight: 260 }}>
              {predictions.map((item, idx) => {
                const isAirport = item.category_tag?.includes('Airport') || item.description?.toLowerCase().includes('airport')
                const isStation = item.category_tag?.includes('Railway') || item.description?.toLowerCase().includes('station')
                const isBus = item.category_tag?.includes('Bus') || item.description?.toLowerCase().includes('bus')
                const isMall = item.category_tag?.includes('Mall') || item.category_tag?.includes('Shopping') || item.description?.toLowerCase().includes('mall')
                const isHospital = item.category_tag?.includes('Hospital')
                const isBeach = item.description?.toLowerCase().includes('beach')
                const isTemple = item.category_tag?.includes('Temple')
                const isTech = item.category_tag?.includes('IT') || item.category_tag?.includes('Company')

                const iconName = isAirport ? 'airplane' :
                  isStation ? 'train' :
                  isBus ? 'bus' :
                  isMall ? 'cart' :
                  isHospital ? 'medkit' :
                  isBeach ? 'sunny' :
                  isTemple ? 'business' :
                  isTech ? 'briefcase' : 'location'

                const iconBg = isAirport ? '#EFF6FF' :
                  isStation ? '#F5F3FF' :
                  isBus ? '#ECFDF5' :
                  isMall ? '#FEF2F2' :
                  '#FFFBEB'

                const iconColor = isAirport ? '#2563EB' :
                  isStation ? '#7C3AED' :
                  isBus ? '#059669' :
                  isMall ? '#DC2626' :
                  '#D97706'

                return (
                  <TouchableOpacity
                    key={`pred-${idx}`}
                    style={styles.predictionItem}
                    onPress={() => handleSelectPrediction(item, activeInput)}
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
      </SafeAreaView>

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
                  const discountTag = c.discount_type === 'percent'
                    ? `${c.discount_value}% OFF`
                    : `FLAT ₹${c.discount_value} OFF`
                  return (
                    <View key={c.id || c.code} style={[styles.couponCardItem, isCurrent && styles.couponCardItemActive]}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <View style={styles.couponCodeBadge}>
                            <Text style={styles.couponCodeBadgeText}>{c.code}</Text>
                          </View>
                          <View style={styles.couponDiscountBadge}>
                            <Text style={styles.couponDiscountBadgeText}>{discountTag}</Text>
                          </View>
                        </View>
                        <Text style={styles.couponItemDesc} numberOfLines={2}>
                          {c.description || `Get ${discountTag} on your booking`}
                        </Text>
                        {parseFloat(c.min_fare) > 0 && (
                          <Text style={styles.couponMinFareText}>
                            Min booking fare: ₹{c.min_fare}
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.couponItemApplyBtn,
                          isCurrent && styles.couponItemAppliedBtn
                        ]}
                        disabled={isCurrent || loadingCoupons}
                        onPress={() => handleValidateAndApplyCoupon(c.code)}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.couponItemApplyBtnText,
                          isCurrent && styles.couponItemAppliedBtnText
                        ]}>
                          {isCurrent ? 'APPLIED ✓' : 'APPLY'}
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
