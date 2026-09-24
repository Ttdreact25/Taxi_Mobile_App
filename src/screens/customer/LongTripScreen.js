import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch, Platform, Modal
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import MapView, { Marker } from 'react-native-maps'
import { COLORS } from '../../constants/theme'
import { vehicleTypesAPI, bookingAPI, longTripAPI, settingsAPI } from '../../api/api'
import { searchPlacesService, reverseGeocodeService } from '../../services/locationSearchService'

const VEHICLE_ICONS = {
  'Bike': 'bicycle',
  'Scooty': 'bicycle',
  'Auto': 'car',
  'Mini Car (3 Seater)': 'car-sport',
  'Car (3 Seater)': 'car-sport',
  'Car (7 Seater)': 'bus',
  'Standard': 'car',
}

const HOURS_LIST = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const MINUTES_LIST = ['00', '15', '30', '45']
const QUICK_PRESETS = [
  { label: '🌅 06:00 AM', h: '06', m: '00', p: 'AM' },
  { label: '☀️ 08:30 AM', h: '08', m: '30', p: 'AM' },
  { label: '🚕 10:00 AM', h: '10', m: '00', p: 'AM' },
  { label: '🍽️ 01:30 PM', h: '01', m: '30', p: 'PM' },
  { label: '🌇 05:00 PM', h: '05', m: '00', p: 'PM' },
  { label: '🌙 08:30 PM', h: '08', m: '30', p: 'PM' },
  { label: '🌌 10:30 PM', h: '10', m: '30', p: 'PM' },
]

export default function LongTripScreen({ navigation }) {
  const sessionToken = useRef(Math.random().toString(36).substring(2))
  const debounceRef = useRef(null)
  const isSubmittingRef = useRef(false)

  // 1 & 2. Locations
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [pickupCoords, setPickupCoords] = useState(null)
  const [destCoords, setDestCoords] = useState(null)
  const [activeInput, setActiveInput] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [isLocating, setIsLocating] = useState(false)

  // Interactive Map Picker State
  const [mapPickerVisible, setMapPickerVisible] = useState(false)
  const [mapTargetMode, setMapTargetMode] = useState('pickup') // 'pickup' | 'destination'
  const [mapRegion, setMapRegion] = useState({
    latitude: 13.0382,
    longitude: 80.2315,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  })
  const [mapSelectedAddress, setMapSelectedAddress] = useState('')
  const [geocodingAddress, setGeocodingAddress] = useState(false)
  const mapRef = useRef(null)
  const geocodeTimerRef = useRef(null)

  // 3 & 4. Booking Mode, Travel Date & Pickup Time
  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowObj = new Date(Date.now() + 86400000)
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0]
  const dayAfterObj = new Date(Date.now() + 86400000 * 2)
  const dayAfterStr = dayAfterObj.toISOString().split('T')[0]

  const [bookingMode, setBookingMode] = useState('schedule') // 'now' | 'schedule'
  const [passengerCount, setPassengerCount] = useState(1)
  const [payMethod, setPayMethod] = useState('cash')
  const [travelDate, setTravelDate] = useState(todayStr)
  const [pickupTime, setPickupTime] = useState('08:30') // 24hr string (HH:MM)

  // Interactive Calendar & Clock Picker Modals
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [calDate, setCalDate] = useState(new Date())
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [clockHour, setClockHour] = useState('08')
  const [clockMinute, setClockMinute] = useState('30')
  const [clockPeriod, setClockPeriod] = useState('AM')

  // 5. Vehicle Category
  const [vehicleTypes, setVehicleTypes] = useState([])
  const [selectedType, setSelectedType] = useState(null)

  // 6. Enable Sharing
  const [isSharingEnabled, setIsSharingEnabled] = useState(false)
  const [minSharingKm, setMinSharingKm] = useState(250)
  const [longTripMinKm, setLongTripMinKm] = useState(130)

  // 7. Fare Summary & Estimation State
  const [fareEst, setFareEst] = useState(null)
  const [estimating, setEstimating] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [distanceError, setDistanceError] = useState(null)
  const [confirmedTripData, setConfirmedTripData] = useState(null)

  useEffect(() => {
    vehicleTypesAPI.list()
      .then(res => {
        const types = res.data?.types || []
        setVehicleTypes(types)
        if (types.length > 0) setSelectedType(types[0].id)
      })
      .catch(() => {})

    settingsAPI.get('long_trip_min_km')
      .then(res => {
        const val = res.data?.data?.value || res.data?.value
        if (val) setLongTripMinKm(parseFloat(val))
      })
      .catch(() => {})

    settingsAPI.get('min_sharing_distance_km')
      .then(res => {
        const val = res.data?.data?.value || res.data?.value
        if (val) setMinSharingKm(parseFloat(val))
      })
      .catch(() => {})

    locateCurrentPosition()
  }, [])

  const locateCurrentPosition = async () => {
    setIsLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setIsLocating(false)
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setPickupCoords({ lat, lng })

      const addr = await reverseGeocodeService(lat, lng)
      setPickup(addr)
    } catch { } finally {
      setIsLocating(false)
    }
  }

  const fetchPredictions = (q) => {
    if (!q || q.length < 2) { setPredictions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlacesService(q, pickupCoords?.lat, pickupCoords?.lng, sessionToken.current)
        setPredictions(results)
      } catch { setPredictions([]) }
    }, 280)
  }

  const selectPrediction = async (pred) => {
    setPredictions([])
    let coordsObj = null

    // Direct coordinates if available on prediction
    const pLat = pred.latitude ?? pred.geometry?.location?.lat
    const pLng = pred.longitude ?? pred.geometry?.location?.lng
    if (pLat && pLng && !isNaN(parseFloat(pLat)) && !isNaN(parseFloat(pLng))) {
      coordsObj = { lat: parseFloat(pLat), lng: parseFloat(pLng) }
    } else if (pred.place_id) {
      const parts = pred.place_id.split('_')
      if (parts.length >= 3 && !isNaN(parseFloat(parts[1])) && !isNaN(parseFloat(parts[2]))) {
        coordsObj = { lat: parseFloat(parts[1]), lng: parseFloat(parts[2]) }
      } else if (!pred.place_id.startsWith('local_')) {
        try {
          const r = await bookingAPI.placeDetails(pred.place_id, sessionToken.current)
          const resData = r.data || {}
          const latVal = resData.latitude ?? resData.lat ?? resData.location?.lat ?? resData.geometry?.location?.lat
          const lngVal = resData.longitude ?? resData.lng ?? resData.location?.lng ?? resData.geometry?.location?.lng
          if (latVal !== undefined && lngVal !== undefined && !isNaN(parseFloat(latVal)) && !isNaN(parseFloat(lngVal))) {
            coordsObj = { lat: parseFloat(latVal), lng: parseFloat(lngVal) }
          }
        } catch { }
      }
    }

    if (activeInput === 'pickup') {
      setPickup(pred.description)
      if (coordsObj) setPickupCoords(coordsObj)
    } else {
      setDestination(pred.description)
      if (coordsObj) setDestCoords(coordsObj)
    }
    setActiveInput(null)
  }

  // Automatic Calculation when Pickup, Destination, Vehicle Category or Time changes
  useEffect(() => {
    if (pickup && destination && selectedType) {
      calculateFareAndRoute()
    }
  }, [pickup, destination, pickupCoords, destCoords, selectedType, travelDate, pickupTime])

  const calculateFareAndRoute = async () => {
    if (!pickup || !destination || !selectedType) return
    setEstimating(true)
    setDistanceError(null)

    try {
      // Directly send addresses and coordinates to backend Google Maps Routing Service
      const r = await bookingAPI.fareEstimate({
        pickup_lat: pickupCoords?.lat || 0,
        pickup_lng: pickupCoords?.lng || 0,
        dest_lat: destCoords?.lat || 0,
        dest_lng: destCoords?.lng || 0,
        pickup_address: pickup,
        dest_address: destination,
        vehicle_type_id: selectedType,
        is_long_trip: true,
        booking_time: pickupTime ? `${pickupTime}:00` : '08:30:00'
      })

      const data = r.data
      if (data?.status === 'success') {
        const estData = data.data || data
        const selected = estData.selected || estData.estimates?.[0] || estData
        const km = parseFloat(selected?.distance_km || estData.distance_km || estData.route?.distance_km || 0)
        const mins = parseInt(selected?.traffic_duration_min || selected?.duration_min || estData.duration_min || estData.route?.duration_min || 0, 10)
        const fare = parseFloat(selected?.final_fare || selected?.total_fare || selected?.estimated_fare || estData.final_fare || 0)

        if (km > 0 && km < longTripMinKm) {
          setDistanceError(`Scheduled Long Trip is available for routes over ${longTripMinKm} km. Your route is ${km.toFixed(1)} km — please use Local Trip booking.`)
          setFareEst(null)
          return
        }

        setFareEst(estData)

        if (km < minSharingKm) {
          setIsSharingEnabled(false)
        }
      } else {
        setDistanceError(data?.message || 'Unable to calculate road distance. Please verify pickup and destination.')
        setFareEst(null)
      }
    } catch (err) {
      setDistanceError('Failed to calculate route via Google Maps. Please check locations.')
      setFareEst(null)
    } finally {
      setEstimating(false)
    }
  }

  const formatTime12Hr = (time24) => {
    if (!time24) return '08:30 AM'
    const [hStr, mStr] = time24.split(':')
    let h = parseInt(hStr, 10)
    const m = mStr || '00'
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`
  }

  const formatDuration = (mins) => {
    if (!mins) return 'Calculating...'
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h > 0) return `${h} hr${h > 1 ? 's' : ''} ${m} min${m > 1 ? 's' : ''}`
    return `${m} mins`
  }

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return 'Select Date'
    try {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
        return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      }
      return dateStr
    } catch {
      return dateStr
    }
  }

  // Open Interactive Map Location Picker
  const handleSelectOnMap = (targetMode) => {
    let mode = 'pickup'
    if (typeof targetMode === 'string') {
      mode = targetMode
    } else if (activeInput === 'dest') {
      mode = 'destination'
    }

    setMapTargetMode(mode)
    let initLat = 13.0382
    let initLng = 80.2315
    let initAddr = ''

    if (mode === 'pickup') {
      if (pickupCoords?.lat && pickupCoords?.lng) {
        initLat = parseFloat(pickupCoords.lat)
        initLng = parseFloat(pickupCoords.lng)
      }
      initAddr = pickup || 'Chennai, Tamil Nadu'
    } else {
      if (destCoords?.lat && destCoords?.lng) {
        initLat = parseFloat(destCoords.lat)
        initLng = parseFloat(destCoords.lng)
      }
      initAddr = destination || 'Madurai, Tamil Nadu'
    }

    const newReg = {
      latitude: initLat,
      longitude: initLng,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    }
    setMapRegion(newReg)
    setMapSelectedAddress(initAddr)
    setMapPickerVisible(true)

    setTimeout(() => {
      mapRef.current?.animateToRegion(newReg, 500)
    }, 300)
  }

  // Reverse geocode on map pan via multi-engine service
  const handleRegionChangeComplete = (region) => {
    setMapRegion(region)
    setGeocodingAddress(true)
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)

    geocodeTimerRef.current = setTimeout(async () => {
      try {
        const addr = await reverseGeocodeService(region.latitude, region.longitude)
        setMapSelectedAddress(addr)
      } catch {
        setMapSelectedAddress(`${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)}`)
      } finally {
        setGeocodingAddress(false)
      }
    }, 300)
  }

  // GPS Floating Button Re-center
  const handleRecenterGPS = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      if (pos?.coords) {
        const newReg = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        }
        setMapRegion(newReg)
        mapRef.current?.animateToRegion(newReg, 500)
      }
    } catch {
      Alert.alert('GPS Error', 'Could not fetch current GPS location.')
    }
  }

  // Confirm selected location pin
  const handleConfirmMapLocation = () => {
    const finalAddr = mapSelectedAddress.trim() || `${mapRegion.latitude.toFixed(4)}, ${mapRegion.longitude.toFixed(4)}`
    const finalCoords = { lat: mapRegion.latitude, lng: mapRegion.longitude }

    if (mapTargetMode === 'pickup') {
      setPickup(finalAddr)
      setPickupCoords(finalCoords)
    } else {
      setDestination(finalAddr)
      setDestCoords(finalCoords)
    }

    setMapPickerVisible(false)
    Alert.alert(
      'Location Set 📍',
      `${mapTargetMode === 'pickup' ? 'Pickup' : 'Destination'} set to:\n${finalAddr}`
    )
  }

  // Toggle AM / PM directly
  const handleTogglePeriod = (newPeriod) => {
    setClockPeriod(newPeriod)
    const [hStr, mStr] = (pickupTime || '08:30').split(':')
    let h = parseInt(hStr, 10)
    const m = mStr || '30'
    if (newPeriod === 'PM' && h < 12) h += 12
    if (newPeriod === 'AM' && h >= 12) h -= 12
    setPickupTime(`${String(h).padStart(2, '0')}:${m}`)
  }

  // Confirm Clock Pickup Time
  const handleConfirmClockTime = () => {
    let h = parseInt(clockHour, 10)
    if (clockPeriod === 'PM' && h < 12) h += 12
    if (clockPeriod === 'AM' && h === 12) h = 0
    const time24 = `${String(h).padStart(2, '0')}:${clockMinute}`
    setPickupTime(time24)
    setShowTimePicker(false)
  }

  // Select Calendar Day
  const handleSelectCalendarDay = (dayNum) => {
    const y = calDate.getFullYear()
    const m = String(calDate.getMonth() + 1).padStart(2, '0')
    const d = String(dayNum).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`
    setTravelDate(dateStr)
    setShowDatePicker(false)
  }

  // Current parsed time for AM/PM indicators
  const currentHourNum = parseInt((pickupTime || '08:30').split(':')[0], 10)
  const isCurrentPM = currentHourNum >= 12

  // Match Estimate values exactly with Web and Backend
  const selectedVehicleObj = vehicleTypes.find(v => v.id === selectedType)
  const allEstimatesList = fareEst?.estimates || fareEst?.data?.estimates || []
  const matchedTypeEstimate = allEstimatesList.find(e => e.vehicle_type_id == selectedType || e.id == selectedType)
  const selectedEstimate = matchedTypeEstimate || fareEst?.selected || fareEst?.estimates?.[0] || fareEst?.data?.selected || fareEst
  
  const distanceKm = parseFloat(selectedEstimate?.distance_km || fareEst?.distance_km || fareEst?.route?.distance_km || 0)
  const durationMins = parseInt(selectedEstimate?.traffic_duration_min || selectedEstimate?.duration_min || fareEst?.duration_min || fareEst?.route?.duration_min || 0, 10)
  const baseFare = parseFloat(selectedEstimate?.base_fare || selectedVehicleObj?.base_fare || 0)
  const perKmRate = parseFloat(selectedEstimate?.price_per_km || selectedEstimate?.per_km_rate || selectedVehicleObj?.price_per_km || selectedVehicleObj?.per_km_rate || 15)
  const perMinRate = parseFloat(selectedEstimate?.price_per_min || selectedEstimate?.per_min_rate || selectedVehicleObj?.price_per_min || selectedVehicleObj?.per_min_rate || 2)
  const totalFare = parseFloat(selectedEstimate?.final_fare || selectedEstimate?.total_fare || selectedEstimate?.estimated_fare || fareEst?.final_fare || fareEst?.estimated_fare || ((distanceKm * perKmRate) + (durationMins * perMinRate) + baseFare) || 0)

  const isEligibleForSharing = distanceKm >= minSharingKm

  const hasMandatoryFields = Boolean(
    pickup.trim() &&
    destination.trim() &&
    selectedType &&
    (bookingMode === 'now' || (travelDate && pickupTime))
  )

  const isFormValid = Boolean(
    hasMandatoryFields &&
    distanceKm >= longTripMinKm &&
    !distanceError &&
    !estimating
  )

  const handleConfirmBooking = async () => {
    if (!pickup.trim()) {
      Alert.alert('Missing Field', 'Please enter a valid Pickup Location')
      return
    }
    if (!destination.trim()) {
      Alert.alert('Missing Field', 'Please enter a valid Destination Location')
      return
    }
    if (!selectedType) {
      Alert.alert('Missing Field', 'Please select a vehicle category')
      return
    }
    if (bookingMode === 'schedule' && (!travelDate || !pickupTime)) {
      Alert.alert('Missing Field', 'Please select a valid Travel Date and Pickup Time')
      return
    }
    if (distanceError) {
      Alert.alert('Short Route', distanceError)
      return
    }

    if (isSubmittingRef.current || scheduling) return
    isSubmittingRef.current = true
    setScheduling(true)
    try {
      const payload = {
        pickup_address: pickup.trim(),
        dest_address: destination.trim(),
        pickup_lat: pickupCoords?.lat || 0,
        pickup_lng: pickupCoords?.lng || 0,
        dest_lat: destCoords?.lat || 0,
        dest_lng: destCoords?.lng || 0,
        vehicle_type_id: selectedType,
        travel_date: bookingMode === 'now' ? todayStr : travelDate,
        pickup_date: bookingMode === 'now' ? todayStr : travelDate,
        pickup_time: bookingMode === 'now' ? new Date().toTimeString().split(' ')[0] : (pickupTime.length === 5 ? `${pickupTime}:00` : pickupTime),
        booking_type: bookingMode, // 'now' or 'schedule'
        passenger_count: passengerCount || 1,
        trip_type: 'one_way',
        is_shared: isSharingEnabled ? 1 : 0,
        is_long_trip: 1,
        payment_method: payMethod || 'cash',
        estimated_fare: totalFare,
        distance_km: distanceKm > 0 ? distanceKm : 0,
        duration_min: durationMins > 0 ? durationMins : 0,
      }

      const res = await longTripAPI.create(payload)

      if (res.data?.status === 'success' || res.data?.booking_id || res.data?.data?.booking_id) {
        const bRef = res.data?.booking_ref || res.data?.data?.booking_ref || ('TRIP' + String(Date.now()).slice(-6))
        const bId = res.data?.booking_id || res.data?.data?.booking_id || res.data?.data?.id
        
        // Immediately reset form inputs to prevent duplicate submissions
        setPickup('')
        setDestination('')
        setPickupCoords(null)
        setDestCoords(null)
        setFareEst(null)
        setTotalFare(0)
        setDistanceKm(0)
        setDurationMins(0)

        Alert.alert(
          'Booking Successful 🎉',
          `Your outstation trip has been scheduled successfully!\n\nBooking Reference: #${bRef}`,
          [
            {
              text: 'View E-Ticket 🎟️',
              onPress: () => {
                if (bId) {
                  navigation.replace('Ticket', { bookingId: bId, bookingRef: bRef })
                } else {
                  navigation.replace('TripHistory')
                }
              }
            },
            {
              text: 'OK / Close',
              onPress: () => {
                navigation.goBack()
              }
            }
          ],
          { cancelable: false }
        )
      } else {
        isSubmittingRef.current = false
        Alert.alert('Booking Notice', res.data?.message || 'Could not process Outstation Trip. Please try again.')
      }
    } catch (err) {
      isSubmittingRef.current = false
      const msg = err.response?.data?.message || err.message || 'Server connection error.'
      Alert.alert('Error', msg)
    } finally {
      setScheduling(false)
    }
  }

  // Calendar Helpers for Month Grid
  const curYear = calDate.getFullYear()
  const curMonth = calDate.getMonth()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate()
  const firstDayIndex = new Date(curYear, curMonth, 1).getDay()
  const todayDateObj = new Date()

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ── Top Header ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.headerTitle}>Schedule Long Trip</Text>
          <Text style={styles.headerSub}>Intercity & Outstation (≥ {longTripMinKm} km)</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── MODE SELECTOR (RIDE NOW VS SCHEDULE) ─────────────────── */}
        <View style={styles.modeToggleCard}>
          <TouchableOpacity
            style={[styles.modeToggleBtn, bookingMode === 'now' && styles.modeToggleBtnActive]}
            onPress={() => setBookingMode('now')}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={16} color={bookingMode === 'now' ? '#FFFFFF' : '#64748B'} />
            <Text style={[styles.modeToggleBtnText, bookingMode === 'now' && styles.modeToggleBtnTextActive]}>
               Ride Now
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeToggleBtn, bookingMode === 'schedule' && styles.modeToggleBtnActive]}
            onPress={() => setBookingMode('schedule')}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar" size={16} color={bookingMode === 'schedule' ? '#FFFFFF' : '#64748B'} />
            <Text style={[styles.modeToggleBtnText, bookingMode === 'schedule' && styles.modeToggleBtnTextActive]}>
               Schedule Trip
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 1 & 2. LOCATIONS ─────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1 & 2. Route Locations</Text>

          {/* Pickup Input */}
          <View style={styles.inputWrap}>
            <View style={styles.dotGreen} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter Pickup Location"
              placeholderTextColor="#94A3B8"
              value={pickup}
              onChangeText={t => { setPickup(t); setActiveInput('pickup'); fetchPredictions(t) }}
              onFocus={() => setActiveInput('pickup')}
            />
            {pickup.length > 0 && (
              <TouchableOpacity onPress={() => { setPickup(''); setPickupCoords(null) }}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dashedLine} />

          {/* Destination Input */}
          <View style={styles.inputWrap}>
            <Ionicons name="location" size={16} color="#EF4444" style={{ marginLeft: -2 }} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter Outstation Destination (City/Town)"
              placeholderTextColor="#94A3B8"
              value={destination}
              onChangeText={t => { setDestination(t); setActiveInput('dest'); fetchPredictions(t) }}
              onFocus={() => setActiveInput('dest')}
            />
            {destination.length > 0 && (
              <TouchableOpacity onPress={() => { setDestination(''); setDestCoords(null) }}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Map Location Actions */}
          <View style={styles.mapActionRow}>
            <TouchableOpacity
              style={styles.mapActionPill}
              onPress={() => handleSelectOnMap(activeInput === 'dest' ? 'destination' : 'pickup')}
              activeOpacity={0.8}
            >
              <Ionicons name="map" size={15} color={COLORS.primary} />
              <Text style={styles.mapActionPillText}>Select on Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mapActionPill}
              onPress={locateCurrentPosition}
              activeOpacity={0.8}
            >
              <Ionicons name="locate" size={15} color={COLORS.primary} />
              <Text style={styles.mapActionPillText}>
                {isLocating ? 'Locating...' : 'Use Live GPS'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Auto-suggestions list */}
          {predictions.length > 0 && (
            <View style={styles.predictionsBox}>
              {predictions.map(p => (
                <TouchableOpacity
                  key={p.place_id}
                  style={styles.predItem}
                  onPress={() => selectPrediction(p)}
                >
                  <Ionicons name="location-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.predMain} numberOfLines={1}>
                      {p.structured_formatting?.main_text || p.description}
                    </Text>
                    {p.structured_formatting?.secondary_text && (
                      <Text style={styles.predSub} numberOfLines={1}>
                        {p.structured_formatting.secondary_text}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {distanceError && (
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{distanceError}</Text>
            </View>
          )}
        </View>

        {/* ── 3. VEHICLE CATEGORY ─────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>3. Vehicle Category</Text>
          <View style={{ gap: 8 }}>
            {vehicleTypes.map(v => {
              const isSelected = selectedType === v.id
              const vPricePerKm = v.price_per_km || v.per_km_rate || 15
              const vPricePerMin = v.price_per_min || v.per_min_rate || 2
              return (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => setSelectedType(v.id)}
                  style={[styles.vehicleCard, isSelected && styles.vehicleCardActive]}
                >
                  <Ionicons name={VEHICLE_ICONS[v.name] || 'car'} size={24} color={isSelected ? COLORS.primary : '#64748B'} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.vehicleName, isSelected && styles.vehicleNameActive]}>{v.name}</Text>
                    <Text style={styles.vehicleRates}>₹{vPricePerKm}/km • ₹{vPricePerMin}/min {v.capacity ? `• ${v.capacity} Seats` : ''}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* ── 4 & 5. TRAVEL DATE & TIME (FOR SCHEDULED MODE) ─────── */}
        {bookingMode === 'now' ? (
          <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.selectorIconWrap, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="flash" size={20} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { marginBottom: 2, color: '#166534' }]}>⚡ Immediate Departure</Text>
                <Text style={{ fontSize: 11, color: '#15803D', fontWeight: '500' }}>
                  Trip will be dispatched immediately to available drivers upon booking confirmation.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* ── 4. TRAVEL DATE (INTERACTIVE CALENDAR) ───────────────── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.cardTitle}>4. Travel Date *</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.openPickerBtn}>
                  <Ionicons name="calendar" size={13} color={COLORS.primary} />
                  <Text style={styles.openPickerBtnText}>Open Calendar</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Date Shortcuts */}
              <View style={styles.rowGrid}>
                <TouchableOpacity
                  onPress={() => setTravelDate(todayStr)}
                  style={[styles.dateChip, travelDate === todayStr && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipText, travelDate === todayStr && styles.dateChipTextActive]}>
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTravelDate(tomorrowStr)}
                  style={[styles.dateChip, travelDate === tomorrowStr && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipText, travelDate === tomorrowStr && styles.dateChipTextActive]}>
                    Tomorrow
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTravelDate(dayAfterStr)}
                  style={[styles.dateChip, travelDate === dayAfterStr && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipText, travelDate === dayAfterStr && styles.dateChipTextActive]}>
                    Day After
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Selected Date Touch Card */}
              <TouchableOpacity
                style={styles.dateSelectorCard}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.selectorIconWrap}>
                    <Ionicons name="calendar" size={20} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={styles.selectorSubLabel}>Selected Travel Date</Text>
                    <Text style={styles.selectorMainLabel}>{formatDateDisplay(travelDate)}</Text>
                  </View>
                </View>
                <View style={styles.changeActionBadge}>
                  <Text style={styles.changeActionBadgeText}>Change</Text>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                </View>
              </TouchableOpacity>
            </View>

            {/* ── 5. PICKUP TIME (INTERACTIVE CLOCK & QUICK AM/PM) ─────── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.cardTitle}>5. Pickup Time *</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.openPickerBtn}>
                  <Ionicons name="time" size={13} color={COLORS.primary} />
                  <Text style={styles.openPickerBtnText}>Open Clock</Text>
                </TouchableOpacity>
              </View>

              {/* Quick AM / PM Segmented Switch */}
              <View style={styles.periodToggleMainRow}>
                <Text style={styles.periodRowTitle}>Time Period:</Text>
                <View style={styles.periodPillWrap}>
                  <TouchableOpacity
                    style={[styles.periodPill, !isCurrentPM && styles.periodPillActive]}
                    onPress={() => handleTogglePeriod('AM')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sunny" size={14} color={!isCurrentPM ? '#FFFFFF' : '#F59E0B'} style={{ marginRight: 4 }} />
                    <Text style={[styles.periodPillText, !isCurrentPM && styles.periodPillTextActive]}>AM (Morning)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.periodPill, isCurrentPM && styles.periodPillActive]}
                    onPress={() => handleTogglePeriod('PM')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="moon" size={14} color={isCurrentPM ? '#FFFFFF' : '#818CF8'} style={{ marginRight: 4 }} />
                    <Text style={[styles.periodPillText, isCurrentPM && styles.periodPillTextActive]}>PM (Evening/Night)</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Selected Time Touch Card */}
              <TouchableOpacity
                style={styles.dateSelectorCard}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.selectorIconWrap, { backgroundColor: '#EDE9FE' }]}>
                    <Ionicons name="time" size={20} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={styles.selectorSubLabel}>Scheduled Departure Time</Text>
                    <Text style={styles.selectorMainLabel}>{formatTime12Hr(pickupTime)}</Text>
                  </View>
                </View>
                <View style={styles.changeActionBadge}>
                  <Text style={styles.changeActionBadgeText}>Pick Time</Text>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 6. ENABLE SHARING (ONLY IF DISTANCE >= 250 KM) ───────── */}
        {isEligibleForSharing && (
          <View style={[styles.card, isSharingEnabled && styles.sharingCardActive]}>
            <View style={styles.sharingHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.cardTitle}>6. Enable Sharing</Text>
                  <View style={styles.splitTag}><Text style={styles.splitTagText}>SAVE 50%</Text></View>
                </View>
                <Text style={styles.sharingSub}>Distance ≥ {minSharingKm} KM. Share your ride & split common fare 50/50.</Text>
              </View>
              <Switch
                value={isSharingEnabled}
                onValueChange={setIsSharingEnabled}
                trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        )}

        {/* ── 7. PROFESSIONAL BOOKING SUMMARY CARD & CONFIRM BUTTON ─ */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={16} color="#A5B4FC" />
              <Text style={styles.summaryTitle}>Booking Summary</Text>
            </View>
            <View style={styles.scheduledTag}>
              <Text style={styles.scheduledTagText}>LONG TRIP OUTSTATION</Text>
            </View>
          </View>

          <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <Text style={styles.sumRouteText} numberOfLines={1}>📍 {pickup || 'Enter pickup location above'}</Text>
            <Text style={styles.sumArrow}>↓</Text>
            <Text style={styles.sumRouteText} numberOfLines={1}>🏁 {destination || 'Enter destination location above'}</Text>
          </View>

          {/* Clean 3-Metric Summary: Distance, ETA, Total Fare */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 10, marginBottom: 10 }}>
            <View style={{ width: '48%' }}>
              <Text style={{ fontSize: 10, color: '#818CF8' }}>Distance (Road):</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: distanceKm > 0 ? '#4ADE80' : '#FFFFFF', marginTop: 1 }}>
                {distanceKm > 0 ? `${distanceKm.toFixed(0)} KM` : (estimating ? 'Calculating...' : '—')}
              </Text>
            </View>
            <View style={{ width: '48%' }}>
              <Text style={{ fontSize: 10, color: '#818CF8' }}>Duration (ETA):</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF', marginTop: 1 }}>
                {durationMins > 0 ? formatDuration(durationMins) : (estimating ? 'Calculating...' : '—')}
              </Text>
            </View>
            <View style={{ width: '48%' }}>
              <Text style={{ fontSize: 10, color: '#818CF8' }}>Vehicle Category:</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', marginTop: 1 }}>{selectedVehicleObj?.name || 'Standard'}</Text>
            </View>
            <View style={{ width: '48%' }}>
              <Text style={{ fontSize: 10, color: '#818CF8' }}>Schedule:</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', marginTop: 1 }}>{travelDate ? `${travelDate} ${formatTime12Hr(pickupTime)}` : 'Select date'}</Text>
            </View>
          </View>

          {/* Total Fare Card */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#A5B4FC' }}>Estimated Total Fare:</Text>
              <Text style={{ fontSize: 10, color: '#C7D2FE', marginTop: 1 }}>Exact backend Google Maps fare</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#4ADE80' }}>
              {estimating ? '...' : `₹${Math.round(totalFare)}`}
            </Text>
          </View>

          {/* Confirm Long Trip Booking Button */}
          <TouchableOpacity
            onPress={handleConfirmBooking}
            disabled={!isFormValid || scheduling || isSubmittingRef.current}
            style={[
              styles.confirmBtn,
              (!isFormValid || scheduling || isSubmittingRef.current) && styles.confirmBtnDisabled
            ]}
          >
            {scheduling ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.confirmBtnText}>Confirm Long Trip Booking</Text>
              </>
            )}
          </TouchableOpacity>

          {!isFormValid && (
            <View style={styles.validationHint}>
              <Ionicons name="information-circle-outline" size={14} color="#FCD34D" />
              <Text style={styles.validationHintText}>
                {distanceError
                  ? distanceError
                  : !pickup.trim()
                  ? 'Please enter a Pickup Location to proceed.'
                  : !destination.trim()
                  ? 'Please enter a Destination Location to proceed.'
                  : distanceKm > 0 && distanceKm < longTripMinKm
                  ? `Scheduled Long Trip requires distance ≥ ${longTripMinKm} km. Please use Local Trip.`
                  : 'Please fill all mandatory fields to confirm booking.'}
              </Text>
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── Interactive Calendar Date Picker Modal ──────────────── */}
      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar" size={20} color={COLORS.primary} />
                <Text style={styles.modalHeaderTitle}>Select Travel Date</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.modalCloseIcon}>
                <Ionicons name="close" size={20} color="#64748B" />
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
                {monthNames[curMonth]} {curYear}
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
                const isSelected = travelDate === dayStr

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

            {/* Quick Shortcuts */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.calQuickBtn}
                onPress={() => { setTravelDate(todayStr); setShowDatePicker(false) }}
              >
                <Text style={styles.calQuickBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calQuickBtn}
                onPress={() => { setTravelDate(tomorrowStr); setShowDatePicker(false) }}
              >
                <Text style={styles.calQuickBtnText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calQuickBtn}
                onPress={() => { setTravelDate(dayAfterStr); setShowDatePicker(false) }}
              >
                <Text style={styles.calQuickBtnText}>Day After</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Interactive Clock Time Picker Modal ─────────────────── */}
      <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time" size={20} color={COLORS.primary} />
                <Text style={styles.modalHeaderTitle}>Select Pickup Time</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTimePicker(false)} style={styles.modalCloseIcon}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Digital Clock Display Header with AM/PM Switch */}
            <View style={styles.clockDisplayBox}>
              <View style={styles.clockDigitBox}>
                <Text style={styles.clockDigitText}>{clockHour}</Text>
                <Text style={styles.clockDigitSub}>HOUR</Text>
              </View>
              <Text style={styles.clockColon}>:</Text>
              <View style={styles.clockDigitBox}>
                <Text style={styles.clockDigitText}>{clockMinute}</Text>
                <Text style={styles.clockDigitSub}>MIN</Text>
              </View>

              {/* AM / PM Toggle in Clock Display */}
              <View style={styles.periodToggleRow}>
                <TouchableOpacity
                  style={[styles.periodBtn, clockPeriod === 'AM' && styles.periodBtnActive]}
                  onPress={() => setClockPeriod('AM')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.periodBtnText, clockPeriod === 'AM' && styles.periodBtnTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.periodBtn, clockPeriod === 'PM' && styles.periodBtnActive]}
                  onPress={() => setClockPeriod('PM')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.periodBtnText, clockPeriod === 'PM' && styles.periodBtnTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Time Presets */}
            <Text style={styles.pickerSectionLabel}>Quick Presets:</Text>
            <View style={styles.timePresetRow}>
              {QUICK_PRESETS.map((item, idx) => (
                <TouchableOpacity
                  key={`preset-${idx}`}
                  style={[
                    styles.timePresetChip,
                    clockHour === item.h && clockMinute === item.m && clockPeriod === item.p && styles.timePresetChipActive
                  ]}
                  onPress={() => {
                    setClockHour(item.h)
                    setClockMinute(item.m)
                    setClockPeriod(item.p)
                  }}
                >
                  <Text style={[
                    styles.timePresetChipText,
                    clockHour === item.h && clockMinute === item.m && clockPeriod === item.p && styles.timePresetChipTextActive
                  ]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Hour Selector Grid (1 to 12 - unique keys) */}
            <Text style={styles.pickerSectionLabel}>Select Hour (1 - 12):</Text>
            <View style={styles.hoursGrid}>
              {HOURS_LIST.map(h => (
                <TouchableOpacity
                  key={`hour-cell-${h}`}
                  style={[styles.hourCell, clockHour === h && styles.hourCellActive]}
                  onPress={() => setClockHour(h)}
                >
                  <Text style={[styles.hourCellText, clockHour === h && styles.hourCellTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Minute Selector Grid */}
            <Text style={styles.pickerSectionLabel}>Select Minutes:</Text>
            <View style={styles.minutesGrid}>
              {MINUTES_LIST.map(m => (
                <TouchableOpacity
                  key={`min-cell-${m}`}
                  style={[styles.minuteCell, clockMinute === m && styles.minuteCellActive]}
                  onPress={() => setClockMinute(m)}
                >
                  <Text style={[styles.minuteCellText, clockMinute === m && styles.minuteCellTextActive]}>:{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Confirm Time Button */}
            <TouchableOpacity style={styles.clockConfirmBtn} onPress={handleConfirmClockTime}>
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.clockConfirmBtnText}>
                Set Pickup Time ({clockHour}:{clockMinute} {clockPeriod})
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Interactive Map Location Picker Modal ────────────────── */}
      <Modal visible={mapPickerVisible} animationType="slide" onRequestClose={() => setMapPickerVisible(false)}>
        <SafeAreaView style={styles.mapModalContainer} edges={['top', 'bottom']}>
          {/* Map Top Navigation Bar */}
          <View style={styles.mapTopNav}>
            <TouchableOpacity onPress={() => setMapPickerVisible(false)} style={styles.mapCloseBtn}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.mapTopTitle}>Pin Outstation Route</Text>
              <Text style={styles.mapTopSub}>Drag map to position pin</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>

          {/* Mode Selector Segmented Tabs */}
          <View style={styles.mapModeToggleRow}>
            <TouchableOpacity
              style={[styles.mapModeBtn, mapTargetMode === 'pickup' && styles.mapModeBtnActiveGreen]}
              onPress={() => {
                setMapTargetMode('pickup')
                if (pickupCoords) {
                  mapRef.current?.animateToRegion({
                    latitude: pickupCoords.lat,
                    longitude: pickupCoords.lng,
                    latitudeDelta: 0.012,
                    longitudeDelta: 0.012,
                  }, 400)
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="ellipse" size={10} color={mapTargetMode === 'pickup' ? '#10B981' : '#94A3B8'} />
              <Text style={[styles.mapModeBtnText, mapTargetMode === 'pickup' && styles.mapModeBtnTextActive]}>
                Pickup Point
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mapModeBtn, mapTargetMode === 'destination' && styles.mapModeBtnActiveRed]}
              onPress={() => {
                setMapTargetMode('destination')
                if (destCoords) {
                  mapRef.current?.animateToRegion({
                    latitude: destCoords.lat,
                    longitude: destCoords.lng,
                    latitudeDelta: 0.012,
                    longitudeDelta: 0.012,
                  }, 400)
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="location" size={12} color={mapTargetMode === 'destination' ? '#EF4444' : '#94A3B8'} />
              <Text style={[styles.mapModeBtnText, mapTargetMode === 'destination' && styles.mapModeBtnTextActive]}>
                Drop Destination
              </Text>
            </TouchableOpacity>
          </View>

          {/* Map View & Fixed Center Pin */}
          <View style={styles.mapCanvasWrap}>
            <MapView
              ref={mapRef}
              style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%' }]}
              initialRegion={mapRegion}
              onMapReady={() => {
                mapRef.current?.animateToRegion(mapRegion, 300)
              }}
              onRegionChangeComplete={handleRegionChangeComplete}
              showsUserLocation={true}
              showsMyLocationButton={false}
              showsCompass={false}
              toolbarEnabled={false}
            />

            {/* Central Animated Pin Pointer */}
            <View pointerEvents="none" style={styles.mapCenterPinContainer}>
              <View style={[styles.mapPinBubble, { backgroundColor: mapTargetMode === 'pickup' ? '#10B981' : '#EF4444' }]}>
                <Text style={styles.mapPinBubbleText}>
                  {mapTargetMode === 'pickup' ? 'Set Pickup' : 'Set Outstation Drop'}
                </Text>
              </View>
              <Ionicons
                name="location"
                size={40}
                color={mapTargetMode === 'pickup' ? '#10B981' : '#EF4444'}
                style={{ marginTop: -4 }}
              />
              <View style={styles.mapPinShadow} />
            </View>

            {/* GPS Floating Re-center Button */}
            <TouchableOpacity style={styles.mapGpsBtn} onPress={handleRecenterGPS} activeOpacity={0.85}>
              <Ionicons name="locate" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Bottom Confirmation Card */}
          <View style={styles.mapBottomCard}>
            <View style={styles.mapAddressHeader}>
              <View style={[styles.mapAddressBadge, { backgroundColor: mapTargetMode === 'pickup' ? '#ECFDF5' : '#FEF2F2' }]}>
                <Text style={[styles.mapAddressBadgeText, { color: mapTargetMode === 'pickup' ? '#059669' : '#DC2626' }]}>
                  {mapTargetMode === 'pickup' ? '🟢 PICKUP POINT' : '🔴 OUTSTATION DESTINATION'}
                </Text>
              </View>
              {geocodingAddress && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            <Text style={styles.mapAddressMainText} numberOfLines={2}>
              {mapSelectedAddress || 'Locating pin address...'}
            </Text>

            <TouchableOpacity
              style={[styles.mapConfirmBtn, { backgroundColor: mapTargetMode === 'pickup' ? '#10B981' : COLORS.primary }]}
              onPress={handleConfirmMapLocation}
              activeOpacity={0.88}
            >
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.mapConfirmBtnText}>
                Confirm {mapTargetMode === 'pickup' ? 'Pickup Location' : 'Destination'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 🌟 Outstation / Long Trip Booking Success Modal */}
      <Modal
        visible={Boolean(confirmedTripData)}
        animationType="fade"
        transparent={false}
      >
        <SafeAreaView style={styles.successModalContainer}>
          <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
            {/* Celebration Icon Header */}
            <View style={styles.successHero}>
              <View style={styles.successIconRing}>
                <Ionicons name="checkmark-circle" size={76} color="#10B981" />
              </View>
              <Text style={styles.successTitle}>Trip Scheduled! 🌟</Text>
              <Text style={styles.successSubtitle}>Your outstation ride is confirmed and reserved</Text>

              {/* Reference ID Badge */}
              <View style={styles.successRefBadge}>
                <Ionicons name="ticket-outline" size={14} color="#4F46E5" />
                <Text style={styles.successRefText}>Ref: #{confirmedTripData?.bookingRef}</Text>
              </View>
            </View>

            {/* Schedule Date & Time Banner */}
            <View style={styles.scheduleBanner}>
              <View style={styles.scheduleBannerItem}>
                <Ionicons name="calendar" size={18} color="#4F46E5" />
                <View>
                  <Text style={styles.scheduleBannerLabel}>DEPARTURE DATE</Text>
                  <Text style={styles.scheduleBannerValue}>{confirmedTripData?.travelDate}</Text>
                </View>
              </View>
              <View style={styles.scheduleBannerDivider} />
              <View style={styles.scheduleBannerItem}>
                <Ionicons name="time" size={18} color="#D97706" />
                <View>
                  <Text style={styles.scheduleBannerLabel}>PICKUP TIME</Text>
                  <Text style={styles.scheduleBannerValue}>{confirmedTripData?.formattedTime}</Text>
                </View>
              </View>
            </View>

            {/* Service & Fare Summary Card */}
            <View style={styles.successSummaryCard}>
              <View style={styles.summaryTopRow}>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.summaryVehicleName}>{confirmedTripData?.vehicleName}</Text>
                  <View style={[styles.serviceTypeBadge, confirmedTripData?.isShared ? styles.badgeShared : styles.badgePrivate]}>
                    <Text style={[styles.serviceTypeBadgeText, confirmedTripData?.isShared ? styles.badgeTextShared : styles.badgeTextPrivate]}>
                      {confirmedTripData?.isShared ? '👥 50/50 Fare Sharing' : '🛣️ Private Outstation'}
                    </Text>
                  </View>
                </View>
                <View style={styles.fareInfo}>
                  <Text style={styles.summaryFareAmount}>₹{confirmedTripData?.fare}</Text>
                  <Text style={styles.summaryDistance}>{confirmedTripData?.distanceKm} km</Text>
                </View>
              </View>

              <View style={styles.summaryDivider} />

              {/* Route Summary */}
              <View style={styles.routeBox}>
                <View style={styles.routeStopRow}>
                  <View style={styles.dotPickup} />
                  <View style={styles.routeStopTextWrap}>
                    <Text style={styles.routeStopLabel}>PICKUP LOCATION</Text>
                    <Text style={styles.routeStopAddress} numberOfLines={2}>{confirmedTripData?.pickup}</Text>
                  </View>
                </View>

                <View style={styles.routeLine} />

                <View style={styles.routeStopRow}>
                  <View style={styles.dotDest} />
                  <View style={styles.routeStopTextWrap}>
                    <Text style={styles.routeStopLabel}>OUTSTATION DESTINATION</Text>
                    <Text style={styles.routeStopAddress} numberOfLines={2}>{confirmedTripData?.destination}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Helpful Notice */}
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={20} color="#0284C7" />
              <Text style={styles.noticeText}>
                Driver allocation and cab details will be assigned prior to departure time. You can monitor the status anytime from your trips tab.
              </Text>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.ticketBtn}
              onPress={() => {
                const bId = confirmedTripData?.bookingId
                const bRef = confirmedTripData?.bookingRef
                setConfirmedTripData(null)
                if (bId) {
                  navigation.replace('Ticket', { bookingId: bId, bookingRef: bRef })
                } else {
                  navigation.replace('TripHistory')
                }
              }}
              activeOpacity={0.88}
            >
              <Ionicons name="receipt" size={20} color="#FFFFFF" />
              <Text style={styles.ticketBtnText}>View E-Ticket 🎟️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tripsBtn}
              onPress={() => {
                setConfirmedTripData(null)
                navigation.replace('TripHistory')
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color="#4F46E5" />
              <Text style={styles.tripsBtnText}>View Scheduled Trips</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeReturnBtn}
              onPress={() => {
                setConfirmedTripData(null)
                navigation.navigate('CustomerTabs', { screen: 'Home' })
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="home-outline" size={16} color="#64748B" />
              <Text style={styles.homeReturnBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0'
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  modeToggleCard: { flexDirection: 'row', backgroundColor: '#EDE9FE', borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
  modeToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 9, gap: 6 },
  modeToggleBtnActive: { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
  modeToggleBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  modeToggleBtnTextActive: { color: '#FFFFFF', fontWeight: '800' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', gap: 8 },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
  textInput: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '500', padding: 0 },
  dashedLine: { width: 2, height: 16, borderLeftWidth: 1.5, borderColor: '#CBD5E1', borderStyle: 'dashed', marginLeft: 16, marginVertical: 4 },
  predictionsBox: { marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  predItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  predMain: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  predSub: { fontSize: 10, color: '#64748B' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEE2E2', padding: 10, borderRadius: 10, marginTop: 10 },
  errorText: { fontSize: 11, color: '#DC2626', fontWeight: '600', flex: 1 },
  rowGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dateChip: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', alignItems: 'center' },
  dateChipActive: { borderColor: COLORS.primary, backgroundColor: '#EDE9FE' },
  dateChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  dateChipTextActive: { color: COLORS.primary, fontWeight: '800' },
  openPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  openPickerBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  dateSelectorCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 12 },
  selectorIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  selectorSubLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  selectorMainLabel: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  changeActionBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  changeActionBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  periodToggleMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  periodRowTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', marginLeft: 4 },
  periodPillWrap: { flexDirection: 'row', gap: 6 },
  periodPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  periodPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodPillText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  periodPillTextActive: { color: '#FFFFFF', fontWeight: '800' },
  vehicleCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  vehicleCardActive: { borderColor: COLORS.primary, backgroundColor: '#FAF5FF' },
  vehicleName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  vehicleNameActive: { color: COLORS.primary },
  vehicleRates: { fontSize: 11, color: '#64748B', marginTop: 2 },
  sharingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sharingCardActive: { borderColor: COLORS.primary, backgroundColor: '#FAF5FF' },
  splitTag: { backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  splitTagText: { fontSize: 9, fontWeight: '800', color: '#16A34A' },
  sharingSub: { fontSize: 11, color: '#64748B', marginTop: 3 },
  summaryCard: { backgroundColor: '#1E1B4B', borderRadius: 18, padding: 18 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: '#A5B4FC' },
  scheduledTag: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  scheduledTagText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  sumRouteText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  sumArrow: { fontSize: 10, color: '#A5B4FC', marginLeft: 14, marginVertical: 2 },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  validationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  validationHintText: {
    fontSize: 11,
    color: '#FCD34D',
    fontWeight: '600',
    flex: 1,
  },

  // Map Action Pill Styles
  mapActionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  mapActionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  mapActionPillText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // Interactive Map Picker Styles
  mapModalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  mapTopNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  mapCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  mapTopTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  mapTopSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  mapModeToggleRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 10 },
  mapModeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  mapModeBtnActiveGreen: { backgroundColor: '#ECFDF5', borderColor: '#10B981', borderWidth: 1.5 },
  mapModeBtnActiveRed: { backgroundColor: '#FEF2F2', borderColor: '#EF4444', borderWidth: 1.5 },
  mapModeBtnText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  mapModeBtnTextActive: { color: '#0F172A', fontWeight: '800' },
  mapCanvasWrap: { flex: 1, position: 'relative' },
  mapCenterPinContainer: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -40 }, { translateY: -60 }], alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  mapPinBubble: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  mapPinBubbleText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  mapPinShadow: { width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.3)', marginTop: -2 },
  mapGpsBtn: { position: 'absolute', right: 16, bottom: 20, width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  mapBottomCard: { padding: 20, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  mapAddressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mapAddressBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  mapAddressBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  mapAddressMainText: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginVertical: 6, minHeight: 38 },
  mapConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  mapConfirmBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Calendar & Clock Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  modalCloseIcon: { padding: 4 },
  calendarMonthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  monthNavBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  calendarMonthTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  calDaysOfWeekRow: { flexDirection: 'row', marginBottom: 8 },
  calDayHeaderCell: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDayCell: { width: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, marginVertical: 2 },
  calDayCellSelected: { backgroundColor: COLORS.primary },
  calDayCellDisabled: { opacity: 0.25 },
  calDayCellText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  calDayCellTextSelected: { color: '#FFFFFF', fontWeight: '900' },
  calDayCellTextDisabled: { color: '#94A3B8' },
  calQuickBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  calQuickBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Clock Modal Styles
  clockDisplayBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, marginVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  clockDigitBox: { alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.primary },
  clockDigitText: { fontSize: 26, fontWeight: '900', color: COLORS.primary },
  clockDigitSub: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginTop: 2 },
  clockColon: { fontSize: 28, fontWeight: '900', color: '#64748B', marginHorizontal: 8 },
  periodToggleRow: { marginLeft: 16, gap: 6 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodBtnText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  periodBtnTextActive: { color: '#FFFFFF' },
  pickerSectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  timePresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  timePresetChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  timePresetChipActive: { backgroundColor: '#EDE9FE', borderColor: COLORS.primary },
  timePresetChipText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  timePresetChipTextActive: { color: COLORS.primary, fontWeight: '800' },
  hoursGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hourCell: { width: '22%', backgroundColor: '#F8FAFC', paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  hourCellActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  hourCellText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  hourCellTextActive: { color: '#FFFFFF', fontWeight: '900' },
  minutesGrid: { flexDirection: 'row', gap: 8 },
  minuteCell: { flex: 1, backgroundColor: '#F8FAFC', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  minuteCellActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  minuteCellText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  minuteCellTextActive: { color: '#FFFFFF', fontWeight: '900' },
  clockConfirmBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  clockConfirmBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Outstation Success Modal Styles
  successModalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  successScroll: { padding: 24, alignItems: 'center', justifyContent: 'center', minHeight: '100%' },
  successHero: { alignItems: 'center', marginBottom: 20 },
  successIconRing: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 3, borderColor: '#A7F3D0' },
  successTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 4, textAlign: 'center' },
  successSubtitle: { fontSize: 13, fontWeight: '600', color: '#64748B', textAlign: 'center', marginBottom: 12 },
  successRefBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#C7D2FE' },
  successRefText: { fontSize: 12, fontWeight: '800', color: '#4F46E5', letterSpacing: 0.5 },

  scheduleBanner: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 16 },
  scheduleBannerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleBannerDivider: { width: 1, height: 32, backgroundColor: '#CBD5E1', marginHorizontal: 8 },
  scheduleBannerLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  scheduleBannerValue: { fontSize: 13, fontWeight: '900', color: '#0F172A', marginTop: 1 },

  successSummaryCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleInfo: { flex: 1 },
  summaryVehicleName: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  serviceTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  badgePrivate: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
  badgeShared: { backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#DDD6FE' },
  serviceTypeBadgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextPrivate: { color: '#4F46E5' },
  badgeTextShared: { color: '#7C3AED' },
  fareInfo: { alignItems: 'flex-end' },
  summaryFareAmount: { fontSize: 22, fontWeight: '900', color: '#059669' },
  summaryDistance: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 2 },
  summaryDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14 },

  routeBox: { gap: 4 },
  routeStopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dotPickup: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', marginTop: 4 },
  dotDest: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginTop: 4 },
  routeLine: { width: 2, height: 18, backgroundColor: '#CBD5E1', marginLeft: 4, marginVertical: -2 },
  routeStopTextWrap: { flex: 1 },
  routeStopLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  routeStopAddress: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 1 },

  noticeCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0F9FF', padding: 12, borderRadius: 12, marginBottom: 18, borderWidth: 1, borderColor: '#BAE6FD' },
  noticeText: { flex: 1, fontSize: 11, color: '#0369A1', lineHeight: 16, fontWeight: '500' },

  ticketBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#4F46E5', paddingVertical: 16, borderRadius: 16, marginBottom: 10, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  ticketBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  tripsBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EEF2FF', paddingVertical: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  tripsBtnText: { color: '#4F46E5', fontSize: 14, fontWeight: '800' },
  homeReturnBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F8FAFC', paddingVertical: 12, borderRadius: 16 },
  homeReturnBtnText: { color: '#64748B', fontSize: 13, fontWeight: '700' }
})
