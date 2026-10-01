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
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps'
import Constants from 'expo-constants'
import { vehicleTypesAPI, bookingsAPI, customerAPI, paymentAPI, resolveAssetUrl } from '../../api/api'
import { searchPlacesService, reverseGeocodeService } from '../../services/locationSearchService'
import { fetchRouteDirections, calculateDistanceKm } from '../../services/directionService'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import ModernBottomSheet from '../../components/common/ModernBottomSheet'

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

const EMERGENCY_RETURN_PRESETS = [
  { label: '+1 Hr', hours: 1 },
  { label: '+2 Hrs', hours: 2 },
  { label: '+3 Hrs', hours: 3 },
  { label: '+4 Hrs', hours: 4 },
  { label: '+6 Hrs', hours: 6 },
  { label: 'Tonight (8 PM)', time: '08:00 PM', isToday: true },
  { label: 'Tonight (10 PM)', time: '10:00 PM', isToday: true },
  { label: 'Tomorrow (9 AM)', time: '09:00 AM', isTomorrow: true },
  { label: 'Tomorrow (6 PM)', time: '06:00 PM', isTomorrow: true },
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

  // Initial Route Params
  const {
    vehicleTypeId: initTypeId,
    pickup: initPickup,
    destination: initDest,
    destCoords: initDestCoords,
    tripMode: initTripMode, // 'local' | 'outstation' | 'shared'
    isRoundTrip: initIsRoundTrip,
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
  // ONE COMMON FLOW: Local (<= 130 km) vs Outstation (> 130 km), One Way vs Round Trip, Shared
  const [tripTypeCategory, setTripTypeCategory] = useState(
    initTripMode === 'outstation' ? 'outstation' : (initTripMode === 'shared' ? 'shared' : 'local')
  )
  const [isRoundTrip, setIsRoundTrip] = useState(Boolean(initIsRoundTrip))
  const [isEmergencyRide, setIsEmergencyRide] = useState(false) // Emergency / Immediate option (Local only)
  const [rideTimingMode, setRideTimingMode] = useState('now') // 'now' | 'schedule'

  // Determine Trip Characteristics
  const isOutstationTrip = tripTypeCategory === 'outstation'
  const isLocalTrip = tripTypeCategory === 'local'
  const isSharedTrip = tripTypeCategory === 'shared'
  const isSharingEligible = routeDistanceKm >= 240 || isSharedTrip

  // Strict Distance Limit Rules:
  // 1. Local Trip: Strictly <= 130 KM (more than 130 KM NOT allowed!)
  const isLocalDistanceExceeded = isLocalTrip && routeDistanceKm > 130
  // 2. Outstation Trip: Strictly > 130 KM (less than 130 KM NOT allowed!)
  const isOutstationDistanceTooShort = isOutstationTrip && routeDistanceKm > 0 && routeDistanceKm <= 130
  const isDistanceInvalid = isLocalDistanceExceeded || isOutstationDistanceTooShort

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
  const [bookingLoading, setBookingLoading] = useState(false)

  // Outstation trips do not need emergency mode (User requirement: Local trips only)
  useEffect(() => {
    if (isOutstationTrip && isEmergencyRide) {
      setIsEmergencyRide(false)
    }
  }, [isOutstationTrip])

  // Fetch Current Location on Mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setIsLocating(true)
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
          if (mounted) {
            setPickupCoords(coords)
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.035,
                longitudeDelta: 0.035,
              }, 600)
            }
          }

          // Reverse geocode if no pickup text
          if (!pickup) {
            const rev = await reverseGeocodeService(coords.latitude, coords.longitude)
            if (rev?.address && mounted) {
              setPickup(rev.address)
            } else if (mounted) {
              setPickup('Current Location')
            }
          }

          // Generate simulated nearby cabs around pickup
          if (mounted) {
            generateNearbyCabs(coords)
          }
        }
      } catch (err) {
        console.warn('Location detection notice:', err)
      } finally {
        if (mounted) setIsLocating(false)
      }
    })()

    return () => { mounted = false }
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

  // Update Route Polyline & Fares whenever pickup or destination coordinates change
  useEffect(() => {
    if (pickupCoords?.latitude && destCoords?.latitude) {
      updateDirections()
    }
  }, [pickupCoords, destCoords, isRoundTrip, isSharedTrip, tripTypeCategory])

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

      // Automatically calculate dynamic fares from backend & admin rates
      fetchDynamicFares(distKm, durMins)
    } catch (err) {
      console.warn('Direction route fallback calculation:', err)
      const distKm = Math.max(0.5, calculateDistanceKm(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude))
      const durMins = Math.max(2, Math.round(distKm * 2.4))
      setRouteDistanceKm(distKm)
      setRouteDurationMins(durMins)
      setRouteCoordinates([pickupCoords, destCoords])
      fetchDynamicFares(distKm, durMins)
    } finally {
      setLoadingFares(false)
    }
  }

  // Calculate Dynamic Fare using Admin settings
  const fetchDynamicFares = async (distKm, durMins) => {
    try {
      const isOutstation = (tripTypeCategory === 'outstation')
      const payload = {
        pickup_lat: pickupCoords.latitude,
        pickup_lng: pickupCoords.longitude,
        dest_lat: destCoords.latitude,
        dest_lng: destCoords.longitude,
        distance_km: distKm,
        duration_min: durMins,
        is_round_trip: isRoundTrip,
        trip_type: isOutstation ? (isRoundTrip ? 'outstation_round_trip' : 'outstation_one_way') : (isRoundTrip ? 'local_round_trip' : 'local'),
        trip_mode: tripTypeCategory,
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
            if (vId) estimatesMap[vId] = Math.round(item.final_fare || item.final || item.total_fare || item.fare || item.subtotal || 0)
          })
        } else if (res.data.estimates && typeof res.data.estimates === 'object') {
          Object.keys(res.data.estimates).forEach(k => {
            const val = res.data.estimates[k]
            estimatesMap[k] = Math.round(typeof val === 'object' ? (val.final_fare || val.final || val.total_fare || 0) : val)
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

  // Live Location Autocomplete Search
  const handleSearchTextChange = async (text, target) => {
    if (target === 'pickup') {
      setPickup(text)
    } else {
      setDestination(text)
    }

    if (!text || text.trim().length < 2) {
      setPredictions([])
      return
    }

    setLoadingPredictions(true)
    try {
      const res = await searchPlacesService(text, pickupCoords?.latitude, pickupCoords?.longitude)
      setPredictions(res || [])
    } catch {
      setPredictions([])
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

  const handleRecenterMap = () => {
    if (pickupCoords && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: pickupCoords.latitude,
        longitude: pickupCoords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500)
    }
  }

  // Toggle 50/50 Share Ride with Full Fare Alert Commitment
  const handleToggleSharing = () => {
    if (isSharedTrip) {
      setTripTypeCategory(routeDistanceKm > 130 ? 'outstation' : 'local')
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
            setTripTypeCategory('shared')
            setIsEmergencyRide(false)
          }
        }
      ]
    )
  }

  // Confirm and Create Booking
  const handleBookRide = async () => {
    if (!pickupCoords || !destCoords) {
      Alert.alert('Select Location', 'Please enter your destination to view route and vehicle pricing.')
      return
    }

    // ── Strict 130 KM Distance Restriction Enforcement ──
    if (isLocalDistanceExceeded) {
      Alert.alert(
        '🚫 Local Trip Limit Exceeded',
        `Local trips are strictly allowed up to 130 km only. Your selected route is ${routeDistanceKm.toFixed(1)} km.\n\nPlease switch to Outstation Trip to proceed.`,
        [
          {
            text: 'Switch to Outstation',
            onPress: () => {
              setTripTypeCategory('outstation')
              setIsEmergencyRide(false)
            },
          },
          { text: 'Change Destination', style: 'cancel' }
        ]
      )
      return
    }

    if (isOutstationDistanceTooShort) {
      Alert.alert(
        '🚫 Minimum Distance Required',
        `Outstation trips require a minimum travel distance of 130 km. Your selected route is ${routeDistanceKm.toFixed(1)} km.\n\nPlease switch to Local Trip to proceed.`,
        [
          {
            text: 'Switch to Local Trip',
            onPress: () => setTripTypeCategory('local'),
          },
          { text: 'Change Destination', style: 'cancel' }
        ]
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
      : isOutstationTrip
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
        dest_address: destination,
        pickup_lat: pickupCoords.latitude,
        pickup_lng: pickupCoords.longitude,
        dest_lat: destCoords.latitude,
        dest_lng: destCoords.longitude,
        distance_km: routeDistanceKm,
        duration_minutes: routeDurationMins,
        duration_min: routeDurationMins,
        fare: finalFare,
        final_fare: finalFare,
        payment_method: paymentMethod,
        is_round_trip: isRoundTrip,
        is_emergency: isEmergencyRide ? 1 : 0,
        priority: isEmergencyRide ? 'emergency' : 'standard',
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
        trip_type: isOutstationTrip ? (isRoundTrip ? 'outstation_round_trip' : 'outstation_one_way') : (isRoundTrip ? 'local_round_trip' : 'local'),
        trip_mode: tripTypeCategory,
        is_long_trip: isOutstationTrip,
        is_outstation: isOutstationTrip,
        coupon_code: appliedCoupon?.code || null,
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── 1. Full Screen Interactive Map ── */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
        initialRegion={{
          latitude: pickupCoords?.latitude || 13.0827,
          longitude: pickupCoords?.longitude || 80.2707,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        onMapReady={() => {
          setMapReady(true)
          if (pickupCoords) {
            mapRef.current?.animateToRegion({
              latitude: pickupCoords.latitude,
              longitude: pickupCoords.longitude,
              latitudeDelta: 0.035,
              longitudeDelta: 0.035,
            }, 400)
          }
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {/* Route Direction Polyline */}
        {routeCoordinates.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="rgba(245, 158, 11, 0.35)"
              strokeWidth={8}
            />
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#F59E0B"
              strokeWidth={4.5}
            />
          </>
        )}

        {/* Pickup Pin */}
        {pickupCoords && (
          <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.pickupMarkerWrap}>
              <View style={styles.pickupMarkerRing} />
              <View style={styles.pickupMarkerDot} />
            </View>
          </Marker>
        )}

        {/* Destination Pin */}
        {destCoords && (
          <Marker coordinate={destCoords} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.destMarkerWrap}>
              <Ionicons name="location" size={32} color="#EF4444" />
            </View>
          </Marker>
        )}

        {/* Nearby Simulated / Live Cabs on Map */}
        {simulatedCabs.map(cab => (
          <Marker
            key={cab.id}
            coordinate={{ latitude: cab.lat, longitude: cab.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={cab.heading}
          >
            <View style={styles.carMarkerBox}>
              <Ionicons name="car-sport" size={18} color="#0F172A" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── 2. Floating Top Header & Search Card ── */}
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
              <View style={[styles.tripTypePill, isEmergencyRide ? styles.emergencyPill : isOutstationTrip ? styles.outstationPill : styles.localPill]}>
                <Ionicons
                  name={isEmergencyRide ? 'flash' : isOutstationTrip ? 'map' : 'navigate'}
                  size={12}
                  color={isEmergencyRide ? '#DC2626' : isOutstationTrip ? '#7C3AED' : '#D97706'}
                />
                <Text style={[styles.tripTypeText, { color: isEmergencyRide ? '#DC2626' : isOutstationTrip ? '#7C3AED' : '#D97706' }]}>
                  {isEmergencyRide ? '🚨 EMERGENCY IMMEDIATE RIDE' : isOutstationTrip ? 'OUTSTATION TRIP (>130 KM)' : 'LOCAL TRIP (0-130 KM)'}
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
                  onFocus={() => setActiveInput('pickup')}
                  onSubmitEditing={() => handleLocationSubmit('pickup')}
                />
              </View>

              <View style={styles.locationDivider} />

              {/* Destination Input Row */}
              <View style={styles.inputRow}>
                <View style={styles.redDotIndicator} />
                <TextInput
                  style={[styles.locationTextInput, activeInput === 'destination' && styles.locationTextInputActive]}
                  placeholder="Where to? (Enter Destination)"
                  placeholderTextColor="#94A3B8"
                  value={destination}
                  onChangeText={(t) => handleSearchTextChange(t, 'destination')}
                  onFocus={() => setActiveInput('destination')}
                  onSubmitEditing={() => handleLocationSubmit('destination')}
                />
                {destination ? (
                  <TouchableOpacity onPress={() => { setDestination(''); setDestCoords(null); setRouteDistanceKm(0); setFareEstimates({}); }} style={styles.clearBtn}>
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
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
              {predictions.map((item, idx) => (
                <TouchableOpacity
                  key={`pred-${idx}`}
                  style={styles.predictionItem}
                  onPress={() => handleSelectPrediction(item, activeInput)}
                >
                  <View style={styles.predIconBox}>
                    <Ionicons name="location-outline" size={16} color="#64748B" />
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
                    <Text style={styles.predDistText}>{item.distance_km} km</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>

      {/* Floating Recenter Map Button */}
      <TouchableOpacity
        style={styles.floatingRecenterFab}
        onPress={handleRecenterMap}
        activeOpacity={0.85}
      >
        <Ionicons name="locate-outline" size={22} color="#0F172A" />
      </TouchableOpacity>

      {/* ── 3. Modern Draggable Bottom Sheet ── */}
      <ModernBottomSheet
        snapPoints={[190, 500, SCREEN_HEIGHT * 0.88]}
        initialIndex={1}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
          {/* ── Trip Category Tabs: [ ⚡ Local Trip (≤130 km) | 🛣️ Outstation (>130 km) | 👥 50/50 Share ] ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tripCategoryScrollContent}
            style={styles.tripCategoryScroll}
          >
            <TouchableOpacity
              style={[styles.tripCategoryTab, isLocalTrip && styles.tripCategoryTabActive]}
              onPress={() => setTripTypeCategory('local')}
              activeOpacity={0.8}
            >
              <View style={styles.tabIconWrap}>
                <Ionicons
                  name="car-sport"
                  size={15}
                  color={isLocalTrip ? '#FFC700' : '#D97706'}
                />
              </View>
              <Text style={[styles.tripCategoryTabText, isLocalTrip && styles.tripCategoryTabTextActive]}>
                Local Trip
              </Text>
              <View style={[styles.kmBadge, isLocalTrip && styles.kmBadgeActive]}>
                <Text style={[styles.kmBadgeText, isLocalTrip && styles.kmBadgeTextActive]}>≤130 km</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tripCategoryTab, isOutstationTrip && styles.tripCategoryTabActive]}
              onPress={() => {
                setTripTypeCategory('outstation')
                setIsEmergencyRide(false)
              }}
              activeOpacity={0.8}
            >
              <View style={styles.tabIconWrap}>
                <Ionicons
                  name="map"
                  size={14}
                  color={isOutstationTrip ? '#FFC700' : '#D97706'}
                />
              </View>
              <Text style={[styles.tripCategoryTabText, isOutstationTrip && styles.tripCategoryTabTextActive]}>
                Outstation
              </Text>
              <View style={[styles.kmBadge, isOutstationTrip && styles.kmBadgeActive]}>
                <Text style={[styles.kmBadgeText, isOutstationTrip && styles.kmBadgeTextActive]}>&gt;130 km</Text>
              </View>
            </TouchableOpacity>

            {isSharingEligible && (
              <TouchableOpacity
                style={[styles.tripCategoryTab, isSharedTrip && styles.tripCategoryTabActive]}
                onPress={handleToggleSharing}
                activeOpacity={0.8}
              >
                <View style={styles.tabIconWrap}>
                  <Ionicons
                    name="people"
                    size={15}
                    color={isSharedTrip ? '#FFC700' : '#059669'}
                  />
                </View>
                <Text style={[styles.tripCategoryTabText, isSharedTrip && styles.tripCategoryTabTextActive]}>
                  50/50 Share
                </Text>
                <View style={[styles.kmBadge, isSharedTrip ? styles.kmBadgeActive : { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.kmBadgeText, isSharedTrip ? styles.kmBadgeTextActive : { color: '#059669' }]}>Save 50%</Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* ── Strict 130 KM Distance Restriction Alert Banners ── */}
          {/* 1. Local Trip Distance Exceeded (> 130 km) */}
          {isLocalDistanceExceeded && (
            <View style={styles.distanceRestrictionAlertBox}>
              <View style={styles.restrictionAlertHeader}>
                <Ionicons name="close-circle" size={20} color="#DC2626" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.restrictionAlertTitle}>
                    Local Trip Distance Exceeded ({routeDistanceKm.toFixed(1)} km)
                  </Text>
                  <Text style={styles.restrictionAlertSub}>
                    Local trips are strictly allowed up to 130 km only. For journeys beyond 130 km, please switch to Outstation Trip.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.restrictionSwitchBtn}
                onPress={() => {
                  setTripTypeCategory('outstation')
                  setIsEmergencyRide(false)
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-forward-circle" size={16} color="#FFFFFF" />
                <Text style={styles.restrictionSwitchBtnText}>
                  Switch to Outstation Trip (&gt;130 km)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 2. Outstation Trip Distance Too Short (<= 130 km) */}
          {isOutstationDistanceTooShort && (
            <View style={[styles.distanceRestrictionAlertBox, { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }]}>
              <View style={styles.restrictionAlertHeader}>
                <Ionicons name="alert-circle" size={20} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.restrictionAlertTitle, { color: '#B45309' }]}>
                    Minimum 130 KM Required for Outstation ({routeDistanceKm.toFixed(1)} km)
                  </Text>
                  <Text style={[styles.restrictionAlertSub, { color: '#92400E' }]}>
                    Outstation trips require a minimum travel distance of 130 km. For city rides within 130 km, please switch to Local Trip.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.restrictionSwitchBtn, { backgroundColor: '#D97706' }]}
                onPress={() => {
                  setTripTypeCategory('local')
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-forward-circle" size={16} color="#FFFFFF" />
                <Text style={styles.restrictionSwitchBtnText}>
                  Switch to Local Trip (≤130 km)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Trip Rules & Options Bar: [ One Way | Round Trip ] + [ Emergency ] + [ 50/50 Share ] */}
          <View style={styles.tripModesRow}>
            {/* One Way / Round Trip Toggle */}
            <View style={styles.toggleSegmentedWrap}>
              <TouchableOpacity
                style={[styles.segmentedBtn, !isRoundTrip && styles.segmentedBtnActive]}
                onPress={() => setIsRoundTrip(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentedText, !isRoundTrip && styles.segmentedTextActive]}>
                  One Way
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentedBtn, isRoundTrip && styles.segmentedBtnActive]}
                onPress={() => {
                  setIsRoundTrip(true)
                  if (isEmergencyRide) {
                    setReturnDate(todayStr)
                    setReturnTime(getRelativeTimeString(2))
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentedText, isRoundTrip && styles.segmentedTextActive]}>
                  Round Trip
                </Text>
              </TouchableOpacity>
            </View>

            {/* Emergency Ride Option (ONLY for Local Trips - Immediate Car Needed Right Now) */}
            {!isOutstationTrip && (
              <TouchableOpacity
                style={[styles.emergencyChip, isEmergencyRide && styles.emergencyChipActive]}
                onPress={() => {
                  const nextState = !isEmergencyRide
                  setIsEmergencyRide(nextState)
                  if (nextState) {
                    setRideTimingMode('now')
                    setDepartureDate(todayStr)
                    const now = new Date()
                    const hh = String(now.getHours() % 12 || 12).padStart(2, '0')
                    const mm = String(now.getMinutes()).padStart(2, '0')
                    const ampm = now.getHours() >= 12 ? 'PM' : 'AM'
                    setDepartureTime(`${hh}:${mm} ${ampm}`)
                    if (isRoundTrip) {
                      setReturnDate(todayStr)
                      setReturnTime(getRelativeTimeString(2))
                    }
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="flash" size={13} color={isEmergencyRide ? '#FFFFFF' : '#DC2626'} />
                <Text style={[styles.emergencyChipText, isEmergencyRide && styles.emergencyChipTextActive]}>
                  🚨 Emergency
                </Text>
              </TouchableOpacity>
            )}

            {/* 50/50 Ride Share Option */}
            {isSharingEligible && (
              <TouchableOpacity
                style={[styles.shareChip, isSharedTrip && styles.shareChipActive]}
                onPress={handleToggleSharing}
                activeOpacity={0.8}
              >
                <Ionicons name="people" size={13} color={isSharedTrip ? '#059669' : '#475569'} />
                <Text style={[styles.shareChipText, isSharedTrip && styles.shareChipTextActive]}>
                  50/50 Share
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Emergency Alert Banner */}
          {isEmergencyRide && (
            <View style={styles.emergencyAlertBanner}>
              <Ionicons name="flash" size={18} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={styles.emergencyAlertTitle}>
                  🚨 IMMEDIATE CAR REQUIRED RIGHT NOW
                </Text>
                <Text style={styles.emergencyAlertText}>
                  Emergency priority active: Nearest online driver will be dispatched instantly!
                </Text>
              </View>
            </View>
          )}

          {/* If Emergency Ride is ON and Round Trip is selected: Prominent Return Time Chooser */}
          {isEmergencyRide && isRoundTrip && (
            <View style={styles.emergencyReturnCard}>
              <View style={styles.emergencyReturnHeader}>
                <View style={styles.emergencyReturnHeaderLeft}>
                  <View style={styles.emergencyReturnIconBox}>
                    <Ionicons name="swap-horizontal" size={16} color="#059669" />
                  </View>
                  <View>
                    <Text style={styles.emergencyReturnTitle}>RETURN PICKUP TIME (ROUND TRIP)</Text>
                    <Text style={styles.emergencyReturnSubtitle}>
                      Immediate Departure (Now) ➔ Choose Return Time
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.emergencyReturnCalBtn}
                  onPress={() => {
                    setActiveDateTarget('return')
                    setShowCalendarModal(true)
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={13} color="#059669" />
                  <Text style={styles.emergencyReturnCalBtnText}>Custom 📅</Text>
                </TouchableOpacity>
              </View>

              {/* Selected Return Status Bar */}
              <TouchableOpacity
                style={styles.emergencySelectedReturnBar}
                onPress={() => {
                  setActiveDateTarget('return')
                  setShowCalendarModal(true)
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="time" size={16} color="#059669" />
                <Text style={styles.emergencySelectedReturnText}>
                  Return on: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{formatDateDisplay(returnDate)}</Text> at <Text style={{ fontWeight: '900', color: '#059669' }}>{returnTime}</Text>
                </Text>
                <View style={styles.changeReturnPill}>
                  <Text style={styles.changeReturnPillText}>Change 🕒</Text>
                </View>
              </TouchableOpacity>

              {/* Quick One-Tap Return Duration Options */}
              <Text style={styles.quickReturnLabel}>Quick Return Duration Options:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickReturnChipsScroll}>
                {EMERGENCY_RETURN_PRESETS.map((preset, pIdx) => {
                  const targetTime = preset.hours ? getRelativeTimeString(preset.hours) : preset.time
                  const targetDate = preset.isTomorrow ? tomorrowStr : todayStr
                  const isPresetActive = (returnDate === targetDate && returnTime === targetTime)

                  return (
                    <TouchableOpacity
                      key={`ret-preset-${pIdx}`}
                      style={[styles.quickReturnChip, isPresetActive && styles.quickReturnChipActive]}
                      onPress={() => {
                        setReturnDate(targetDate)
                        setReturnTime(targetTime)
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.quickReturnChipText, isPresetActive && styles.quickReturnChipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {/* Ride Timing Mode Tabs & Calendar: Shown for Regular Rides */}
          {!isEmergencyRide && (
            <>
              {/* Ride Timing Mode Tabs: [ Ride Now ⚡ | Schedule Later 📅 ] */}
              <View style={styles.timingPillsRow}>
                <TouchableOpacity
                  style={[styles.timingPillBtn, rideTimingMode === 'now' && styles.timingPillBtnActive]}
                  onPress={() => setRideTimingMode('now')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash-outline" size={13} color={rideTimingMode === 'now' ? '#FFFFFF' : '#475569'} />
                  <Text style={[styles.timingPillText, rideTimingMode === 'now' && styles.timingPillTextActive]}>
                    Ride Now
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.timingPillBtn, rideTimingMode === 'schedule' && styles.timingPillBtnActive]}
                  onPress={() => {
                    setRideTimingMode('schedule')
                    setActiveDateTarget('departure')
                    setShowCalendarModal(true)
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={13} color={rideTimingMode === 'schedule' ? '#FFFFFF' : '#475569'} />
                  <Text style={[styles.timingPillText, rideTimingMode === 'schedule' && styles.timingPillTextActive]}>
                    Schedule Date & Time
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Schedule / Outstation / Round Trip Date & Time Bar (Available on ONE WAY too!) */}
              <View style={styles.dateTimeSelectorCard}>
                {/* Departure Date & Time */}
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
                    <Text style={styles.dateTimeLabel}>DEPARTURE DATE & TIME (ONE WAY / DEPARTURE)</Text>
                    <Text style={styles.dateTimeValue}>
                      {formatDateDisplay(departureDate)} · {departureTime}
                    </Text>
                  </View>
                  <View style={styles.changePill}>
                    <Text style={styles.changePillText}>Calendar 📅</Text>
                  </View>
                </TouchableOpacity>

                {/* Return Date & Time (Shown when Round Trip is selected) */}
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
                      <Text style={[styles.changePillText, { color: '#059669' }]}>Calendar 📅</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Route Distance & ETA Indicator */}
          {routeDistanceKm > 0 && (
            <View style={styles.routeMetricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="navigate-circle" size={16} color="#D97706" />
                <Text style={styles.metricText}>
                  {routeDistanceKm.toFixed(1)} km {isRoundTrip ? '(Round Trip: ' + (routeDistanceKm * 2).toFixed(0) + ' km)' : ''}
                </Text>
              </View>
              <View style={styles.metricDot} />
              <View style={styles.metricItem}>
                <Ionicons name="time" size={16} color="#64748B" />
                <Text style={styles.metricText}>
                  ~{formatDurationHours(isRoundTrip ? routeDurationMins * 2 : routeDurationMins)} duration
                </Text>
              </View>
              {isSharedTrip && (
                <View style={styles.sharingTagBadge}>
                  <Text style={styles.sharingTagText}>50% Split</Text>
                </View>
              )}
            </View>
          )}

          {/* 50/50 Shared Trip Notice Card */}
          {isSharedTrip && (
            <View style={styles.sharedTripNoticeCard}>
              <View style={styles.sharedTripNoticeHeader}>
                <Ionicons name="information-circle" size={17} color="#D97706" />
                <Text style={styles.sharedTripNoticeTitle}>50/50 Ride Share Policy</Text>
              </View>
              <Text style={styles.sharedTripNoticeText}>
                Other passengers can join your ride. If no other customer joins before departure time, you must pay the full trip fare.
              </Text>
            </View>
          )}

          {/* Vehicle Category List (Matching Reference Image Stage 1) */}
          <Text style={styles.sectionHeaderTitle}>Select Vehicle</Text>
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

                const displayPrice = routeDistanceKm > 0
                  ? (fareEstimates[vt.id] || Math.round(calculatedFare))
                  : null

                const etaMins = Math.max(1, index * 2 + 1)
                const dropMins = routeDurationMins || 18

                // Determine dynamic badges: Fastest, Lowest Fare, Popular
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
                    {/* Vehicle Thumbnail */}
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

                    {/* Vehicle Details */}
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
                        {routeDistanceKm > 0
                          ? `₹${kmRate}/km · ${etaMins} mins away · ~${formatDurationHours(dropMins)} drop`
                          : `₹${kmRate}/km · ₹${minRate}/min · Fast pickup`}
                      </Text>
                    </View>

                    {/* Vehicle Price & Selection Indicator */}
                    <View style={styles.vehiclePriceWrap}>
                      <Text style={[styles.vehiclePriceText, isSelected && styles.vehiclePriceSelected]}>
                        {displayPrice !== null ? `₹${displayPrice}` : `From ₹${Math.round(baseFare)}`}
                      </Text>
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
            {/* Payment Method Selector */}
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

            {/* Promo Code / Offers */}
            <TouchableOpacity
              style={styles.promoSelectorPill}
              onPress={() => setShowCouponModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="pricetag-outline" size={14} color="#D97706" />
              <Text style={styles.promoSelectorText}>
                {appliedCoupon ? `Applied: ${appliedCoupon.code}` : 'Offers'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── High-Converting Golden / Yellow CTA Button ── */}
          <TouchableOpacity
            style={[
              styles.bookRideBtn,
              isEmergencyRide && styles.bookEmergencyBtn,
              isDistanceInvalid && styles.bookRideBtnDisabled,
            ]}
            onPress={() => {
              if (isLocalDistanceExceeded) {
                setTripTypeCategory('outstation')
                setIsEmergencyRide(false)
                return
              }
              if (isOutstationDistanceTooShort) {
                setTripTypeCategory('local')
                return
              }
              handleBookRide()
            }}
            disabled={bookingLoading}
            activeOpacity={0.88}
          >
            {bookingLoading ? (
              <ActivityIndicator color={isEmergencyRide ? '#FFFFFF' : '#000000'} size="small" />
            ) : (
              <Text style={[
                styles.bookRideBtnText,
                isEmergencyRide && styles.bookEmergencyBtnText,
                isDistanceInvalid && styles.bookRideBtnDisabledText,
              ]}>
                {isLocalDistanceExceeded
                  ? '⚠️ Exceeds 130 km — Switch to Outstation'
                  : isOutstationDistanceTooShort
                  ? '⚠️ Under 130 km — Switch to Local Trip'
                  : isEmergencyRide
                  ? (isRoundTrip ? '⚡ Book Emergency Round Trip' : '⚡ Book Emergency Ride')
                  : isOutstationTrip
                  ? 'Book Outstation Ride'
                  : 'Book Ride'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </ModernBottomSheet>

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
      <Modal visible={showCouponModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContentCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Apply Promo Code</Text>
              <TouchableOpacity onPress={() => setShowCouponModal(false)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.couponInputRow}>
              <TextInput
                style={styles.couponTextInput}
                placeholder="ENTER PROMO CODE"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                value={couponInput}
                onChangeText={setCouponInput}
              />
              <TouchableOpacity
                style={styles.couponApplyBtn}
                onPress={() => {
                  if (couponInput.trim().toUpperCase() === 'FIRST50') {
                    setAppliedCoupon({ code: 'FIRST50', discount_amount: 50 })
                    Alert.alert('Coupon Applied', '₹50 discount applied on this ride!')
                    setShowCouponModal(false)
                  } else {
                    Alert.alert('Invalid Coupon', 'Please enter a valid active promo code.')
                  }
                }}
              >
                <Text style={styles.couponApplyBtnText}>Apply</Text>
              </TouchableOpacity>
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
    zIndex: 50,
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
  emergencyPill: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
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
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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

  // ── Trip Mode Segmented Bar ──
  tripModesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  toggleSegmentedWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  segmentedBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  segmentedBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  segmentedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentedTextActive: {
    color: '#0F172A',
  },

  emergencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emergencyChipActive: {
    backgroundColor: '#DC2626',
    borderColor: '#B91C1C',
  },
  emergencyChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  emergencyChipTextActive: {
    color: '#FFFFFF',
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

  // Emergency Alert Banner
  emergencyAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  emergencyAlertTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#991B1B',
    marginBottom: 2,
  },
  emergencyAlertText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
    flex: 1,
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

  // Emergency Return Time Card
  emergencyReturnCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 12,
    marginBottom: 10,
  },
  emergencyReturnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  emergencyReturnHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  emergencyReturnIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyReturnTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  emergencyReturnSubtitle: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '600',
  },
  emergencyReturnCalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  emergencyReturnCalBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  emergencySelectedReturnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 8,
    gap: 6,
  },
  emergencySelectedReturnText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  changeReturnPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeReturnPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  quickReturnLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  quickReturnChipsScroll: {
    gap: 6,
    paddingBottom: 2,
  },
  quickReturnChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  quickReturnChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  quickReturnChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  quickReturnChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
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
  bookEmergencyBtn: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  bookEmergencyBtnText: {
    color: '#FFFFFF',
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
})
