import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Share,
  Dimensions,
  StatusBar,
  Modal,
  Platform,
  TextInput,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps'
import { bookingsAPI, reviewsAPI, resolveAssetUrl, getInvoiceUrl } from '../../api/api'
import { fetchRouteDirections, calculateDistanceKm, calculateBearing } from '../../services/directionService'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import ModernBottomSheet from '../../components/common/ModernBottomSheet'
import UniversalRouteMap from '../../components/common/UniversalRouteMap'
import { playCustomerTaxiReachedAlert } from '../../services/SoundService'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const CUSTOMER_CANCEL_REASONS = [
  { id: 'too_long', label: 'Driver is taking too long to arrive', icon: 'time-outline' },
  { id: 'wrong_loc', label: 'Selected wrong pickup location', icon: 'location-outline' },
  { id: 'driver_asked', label: 'Driver requested cancellation', icon: 'call-outline' },
  { id: 'changed_mind', label: 'Change of plans / No longer travelling', icon: 'walk-outline' },
  { id: 'found_alt', label: 'Found another vehicle / cab', icon: 'car-outline' },
  { id: 'other', label: 'Other reason', icon: 'chatbox-ellipses-outline' },
]

const formatDurationHours = (mins) => {
  if (!mins || mins <= 0) return '0 min'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h > 0 && m > 0) return `${h} hr${h > 1 ? 's' : ''} ${m} min${m > 1 ? 's' : ''}`
  if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`
  return `${m} mins`
}

const CustomerWaitingTimerCard = ({ arrivedAt, freeWaitingMins = 5, waitingRate = 2, categoryName = 'Cab' }) => {
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
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (isFree) {
    const remainingSec = freeWaitSec - elapsedSec
    return (
      <View style={{
        backgroundColor: '#F0FDF4',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#BBF7D0',
        marginBottom: 10,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <Ionicons name="hourglass-outline" size={16} color="#059669" />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#065F46', marginLeft: 6 }}>
              Free Waiting ({freeWaitingMins} mins limit)
            </Text>
          </View>
          <View style={{
            backgroundColor: '#059669',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>
              {formatMMSS(remainingSec)}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, color: '#047857', marginTop: 4 }}>
          ℹ️ Driver has arrived. Extra waiting beyond {freeWaitingMins} mins is charged at ₹{waitingRate}/min as per {categoryName} policy.
        </Text>
      </View>
    )
  }

  const extraSec = elapsedSec - freeWaitSec
  const extraMins = Math.max(1, Math.ceil(extraSec / 60))
  const accruedCharge = Math.round(extraMins * (Number(waitingRate) || 2))

  return (
    <View style={{
      backgroundColor: '#FEF2F2',
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: '#FECACA',
      marginBottom: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <Ionicons name="alert-circle" size={16} color="#DC2626" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#991B1B', marginLeft: 6 }}>
            Free Waiting Exceeded (+{extraMins} mins)
          </Text>
        </View>
        <View style={{
          backgroundColor: '#DC2626',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>
            +₹{accruedCharge}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 11, color: '#991B1B', marginTop: 4, fontWeight: '600' }}>
        Extra waiting fee of ₹{waitingRate}/min (+₹{accruedCharge}) is being added to your trip invoice.
      </Text>
    </View>
  )
}

export default function BookingTrackScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { bookingId } = route.params || {}
  const mapRef = useRef(null)
  const pollTimerRef = useRef(null)

  // Live Booking Data State
  const [booking, setBooking] = useState(null)
  const [trackingData, setTrackingData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Map & Route Coordinates
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [routeDistanceKm, setRouteDistanceKm] = useState(0)
  const [routeDurationMins, setRouteDurationMins] = useState(0)
  const [driverSpeed, setDriverSpeed] = useState(42) // km/h live or simulated speed
  const [nextTurnInstruction, setNextTurnInstruction] = useState('Continue straight onto main road')
  const [bookingWaypoints, setBookingWaypoints] = useState([])

  // UI Modals
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedCancelReason, setSelectedCancelReason] = useState(CUSTOMER_CANCEL_REASONS[0].id)
  const [customCancelText, setCustomCancelText] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const isCancelledAlertShownRef = useRef(false)
  const hasAlertedArrivalRef = useRef(false)
  const [acceptingPickup, setAcceptingPickup] = useState(false)
  const [pickupChargeDismissed, setPickupChargeDismissed] = useState(false)
  const [showDriverProfileModal, setShowDriverProfileModal] = useState(false)

  // Safe navigation back to Customer Home screen
  const returnToCustomerHome = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
    }
    try {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home', params: { screen: 'HomeScreen' } }],
      })
    } catch (e1) {
      try {
        navigation.navigate('Home', { screen: 'HomeScreen' })
      } catch (e2) {
        try {
          navigation.navigate('HomeScreen')
        } catch (e3) {
          try {
            navigation.navigate('Home')
          } catch (e4) {
            navigation.goBack()
          }
        }
      }
    }
  }, [navigation])

  const hasPendingPickupCharge =
    !['completed', 'TRIP_COMPLETED'].includes(booking?.status) &&
    !['cancelled', 'CANCELLED'].includes(booking?.status) &&
    Boolean(booking?.driver_id) &&
    Number(booking?.pickup_charge) > 0 &&
    Number(booking?.extra_pickup_distance_km) > 0 &&
    (!booking?.pickup_charge_accepted || booking?.pickup_charge_accepted === 0 || booking?.pickup_charge_accepted === '0')

  // Poll Live Tracking Data every 3 seconds
  const fetchLiveTracking = useCallback(async () => {
    if (!bookingId) return
    try {
      const res = await bookingsAPI.liveTracking(bookingId)
      if (res.data?.status === 'success') {
        const b = res.data.booking
        setBooking(b)
        setTrackingData(res.data)

        if (['completed', 'TRIP_COMPLETED'].includes(b?.status)) {
          clearInterval(pollTimerRef.current)
          setShowRatingModal(true)
        } else if (['cancelled', 'CANCELLED'].includes(b?.status)) {
          clearInterval(pollTimerRef.current)
          if (!isCancelledAlertShownRef.current) {
            isCancelledAlertShownRef.current = true
            Alert.alert(
              'Ride Cancelled',
              'Driver has cancelled this ride. Returning to Home screen.',
              [
                { text: 'OK', onPress: returnToCustomerHome }
              ],
              { cancelable: false }
            )
          }
        }
      }
    } catch (err) {
      console.warn('Live tracking poll failed:', err)
    } finally {
      setLoading(false)
    }
  }, [bookingId, returnToCustomerHome])

  useEffect(() => {
    fetchLiveTracking()
    pollTimerRef.current = setInterval(fetchLiveTracking, 3000)
    return () => clearInterval(pollTimerRef.current)
  }, [fetchLiveTracking])

  // Coordinates formatting
  const originCoord = {
    latitude: parseFloat(booking?.pickup_lat || trackingData?.booking?.pickup_lat || 13.0827),
    longitude: parseFloat(booking?.pickup_lng || trackingData?.booking?.pickup_lng || 80.2707),
    address: booking?.pickup_address || 'Pickup Point',
  }

  const destCoord = {
    latitude: parseFloat(booking?.dest_lat || trackingData?.booking?.dest_lat || 13.0418),
    longitude: parseFloat(booking?.dest_lng || trackingData?.booking?.dest_lng || 80.2341),
    address: booking?.dest_address || 'Destination',
  }

  // Driver Assignment and Status Evaluation
  const status = (booking?.status || trackingData?.booking?.status || 'searching').toLowerCase()
  const driver = trackingData?.driver || null
  const assignedDriverId = booking?.driver_id || driver?.id || trackingData?.booking?.driver_id || null

  // STRICT REQUIREMENT: Driver details/profile are ONLY revealed to customer once driver actually ACCEPTS!
  const isDriverAccepted = [
    'driver_accepted', 'accepted', 'waiting_pickup', 'on_the_way',
    'driver_arrived', 'driver_reached', 'pickup_reached', 'otp_verified',
    'trip_started', 'in_progress', 'trip_in_progress',
    'return_pickup', 'return_started', 'return_in_progress', 'completed'
  ].includes(status)

  const hasAssignedDriver = Boolean(
    ((assignedDriverId && Number(assignedDriverId) > 0) ||
    Boolean(driver?.name) ||
    Boolean(booking?.driver_name)) &&
    isDriverAccepted
  )

  const isDriverAssigned = Boolean(
    hasAssignedDriver &&
    isDriverAccepted &&
    status !== 'searching' &&
    status !== 'pending' &&
    status !== 'pending_driver_assignment' &&
    status !== 'driver_assigned' &&
    status !== 'cancelled'
  )
  const isDriverArrived = ['driver_arrived', 'driver_reached', 'pickup_reached'].includes(status)

  // Taxi Arrival Voice & Sound Alert
  useEffect(() => {
    if (isDriverArrived && !hasAlertedArrivalRef.current) {
      hasAlertedArrivalRef.current = true
      playCustomerTaxiReachedAlert(driverName, plateNo || vehicleModel).catch(() => {})
    }
  }, [isDriverArrived, driverName, plateNo, vehicleModel])

  const isRoundTrip = Boolean(
    Number(booking?.is_round_trip) === 1 ||
    booking?.is_round_trip === true ||
    booking?.is_round_trip === '1' ||
    (booking?.trip_type && booking.trip_type.toLowerCase().includes('round_trip')) ||
    (booking?.booking_trip_type && booking.booking_trip_type.toLowerCase().includes('round_trip')) ||
    Boolean(booking?.return_date)
  )
  const isOutstationTrip = Boolean(
    parseFloat(booking?.distance_km || 0) > 50 ||
    (booking?.trip_type && booking.trip_type.toLowerCase().includes('outstation')) ||
    (booking?.booking_trip_type && booking.booking_trip_type.toLowerCase().includes('outstation')) ||
    Boolean(booking?.is_long_trip)
  )
  const isHourly = Boolean(
    booking?.trip_sub_type === 'hourly' ||
    Number(booking?.package_hours) > 0
  )

  const isReturnPickup = status === 'return_pickup'
  const isReturnStarted = ['return_started', 'return_in_progress'].includes(status)
  const isOnwardTripStarted = ['trip_started', 'in_progress', 'trip_in_progress'].includes(status)
  const isInTripNavigation = isOnwardTripStarted || isReturnStarted
  const isCompleted = ['completed', 'trip_completed'].includes(status)
  const isDriverStartedHeading = Boolean(
    ['on_the_way', 'waiting_pickup', 'driver_arrived', 'arrived', 'driver_reached', 'pickup_reached', 'trip_started', 'in_progress', 'trip_in_progress'].includes(status) ||
    Boolean(booking?.heading_started)
  )
  const canCustomerCancel = !isDriverStartedHeading && !isInTripNavigation && !isCompleted

  // Driver Coordinates
  const hasRealDriverCoord = Boolean(
    isDriverAssigned &&
    (trackingData?.tracking?.driver_lat || trackingData?.driver?.current_lat || booking?.driver_lat)
  )
  const rawDriverLat = parseFloat(
    trackingData?.tracking?.driver_lat ||
    trackingData?.driver?.current_lat ||
    booking?.driver_lat ||
    originCoord.latitude
  )
  const rawDriverLng = parseFloat(
    trackingData?.tracking?.driver_lng ||
    trackingData?.driver?.current_lng ||
    booking?.driver_lng ||
    originCoord.longitude
  )

  const driverCoord = {
    latitude: rawDriverLat,
    longitude: rawDriverLng,
    heading: parseFloat(trackingData?.tracking?.driver_heading || 0),
  }

  // Step Tracker configuration
  const stepItems = !isDriverAssigned
    ? [
        { id: 1, label: status === 'driver_assigned' ? 'Connecting' : 'Searching' },
        { id: 2, label: 'Assigned' },
        { id: 3, label: 'Arriving' },
        { id: 4, label: 'Trip Started' },
      ]
    : (isRoundTrip && (isReturnPickup || isReturnStarted)
      ? [
          { id: 1, label: '1st Drop Done' },
          { id: 2, label: 'Return Pickup' },
          { id: 3, label: 'Returning' },
          { id: 4, label: 'Completed' },
        ]
      : [
          { id: 1, label: 'Driver Assigned' },
          { id: 2, label: 'Arriving' },
          { id: 3, label: 'On the way' },
          { id: 4, label: 'Reached' },
        ])

  let stepIndex = 1
  if (!isDriverAssigned) {
    stepIndex = 1 // Step 1 Searching/Connecting is active
  } else if (isRoundTrip && (isReturnPickup || isReturnStarted)) {
    if (isReturnPickup) stepIndex = 2
    if (isReturnStarted) stepIndex = 3
    if (isCompleted) stepIndex = 4
  } else {
    stepIndex = 1
    if (['driver_accepted', 'accepted'].includes(status)) stepIndex = 1
    if (status === 'on_the_way' || (isDriverAssigned && !isDriverArrived && !isInTripNavigation)) stepIndex = 2
    if (isDriverArrived) stepIndex = 3
    if (isInTripNavigation) stepIndex = 4
  }

  // Update Route Polyline based on Trip Phase
  // 1. Unassigned: Route from Pickup -> Destination
  // 2. Driver Assigned (Approaching): Driver -> Customer Pickup
  // 3. Trip in progress: Driver -> Destination
  // 4. Return leg: Driver/Drop -> Original Pickup
  useEffect(() => {
    (async () => {
      let start = originCoord
      let end = destCoord
      let waypoints = []

      // Extract uncompleted waypoints from booking.stops
      let rawStops = []
      try {
        rawStops = booking?.stops ? (typeof booking.stops === 'string' ? JSON.parse(booking.stops) : booking.stops) : []
        if (!Array.isArray(rawStops)) rawStops = []
      } catch {
        rawStops = []
      }
      const uncompletedStops = rawStops.filter(s => !s.completed)

      if (isDriverAssigned) {
        if (isRoundTrip && isReturnStarted) {
          start = hasRealDriverCoord ? driverCoord : destCoord
          end = originCoord
        } else if (isRoundTrip && isReturnPickup) {
          start = hasRealDriverCoord ? driverCoord : destCoord
          end = destCoord
        } else if (isInTripNavigation) {
          start = hasRealDriverCoord ? driverCoord : originCoord
          end = destCoord
          waypoints = uncompletedStops
        } else {
          // Driver approaching customer pickup
          start = hasRealDriverCoord ? driverCoord : originCoord
          end = originCoord
        }
      } else {
        // Preview before driver assignment
        waypoints = uncompletedStops
      }
      setBookingWaypoints(waypoints)

      if (start?.latitude && end?.latitude) {
        try {
          const res = await fetchRouteDirections(start, end, waypoints)
          if (res.coordinates?.length > 0) {
            setRouteCoordinates(res.coordinates)
            const dist = res.distanceKm || calculateDistanceKm(start.latitude, start.longitude, end.latitude, end.longitude)
            const dur = res.durationMins || Math.round(dist * 2.5)
            setRouteDistanceKm(dist)
            setRouteDurationMins(dur)

            // Dynamic turn instruction
            if (isRoundTrip && isReturnStarted) {
              setNextTurnInstruction(`Returning to starting point: ${originCoord.address?.split(',')?.[0] || 'Original location'}`)
            } else if (isRoundTrip && isReturnPickup) {
              setNextTurnInstruction(`Driver picking up for return at: ${destCoord.address?.split(',')?.[0] || 'Drop location'}`)
            } else if (isInTripNavigation && uncompletedStops.length > 0) {
              setNextTurnInstruction(`Heading to Via Stop: ${uncompletedStops[0].address?.split(',')?.[0] || 'Intermediate location'}`)
            } else if (isInTripNavigation) {
              setNextTurnInstruction(`Turn right onto ${destCoord.address?.split(',')?.[0] || 'destination road'}`)
            } else if (isDriverAssigned) {
              setNextTurnInstruction(`Heading to pickup: ${originCoord.address?.split(',')?.[0] || 'Pickup location'}`)
            } else {
              setNextTurnInstruction(`Route: ${originCoord.address?.split(',')?.[0] || 'Pickup'} to ${destCoord.address?.split(',')?.[0] || 'Destination'}`)
            }
          }
        } catch {}
      }
    })()
  }, [driverCoord.latitude, driverCoord.longitude, status, isDriverAssigned, hasRealDriverCoord, isInTripNavigation, isReturnPickup, isReturnStarted, isRoundTrip, booking?.stops])

  // Recenter Map Viewport
  const handleRecenter = () => {
    if (!mapRef.current) return
    const points = []
    if (isDriverAssigned && hasRealDriverCoord) {
      points.push(driverCoord)
    }
    points.push(originCoord)
    if (destCoord?.latitude) {
      points.push(destCoord)
    }

    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: insets.top + 120, right: 60, bottom: 360, left: 60 },
      animated: true,
    })
  }

  useEffect(() => {
    const timer = setTimeout(handleRecenter, 700)
    return () => clearTimeout(timer)
  }, [status])

  // Real Driver Profile Information (Strictly real data only, NO mock fallbacks)
  const driverName = driver?.name || booking?.driver_name || ''
  const driverRating = driver?.rating || booking?.driver_rating || '5.0'
  const driverRatingCount = driver?.rating_count || booking?.driver_total_rides || 0
  const driverPhone = driver?.phone || booking?.driver_phone || ''
  const driverAvatar = resolveAssetUrl(driver?.avatar_url || driver?.avatar || booking?.driver_avatar || '')
  const vehicleName = booking?.vehicle_type_name || driver?.vehicle_type || 'Cab'
  const vehicleModel = driver?.vehicle_model || booking?.model || ''
  const vehicleColor = driver?.vehicle_color || booking?.vehicle_color || ''
  const plateNo = driver?.plate_no || booking?.plate_no || ''
  const otpCode = booking?.driver_otp || booking?.otp || ''
  const fareAmount = Math.round(parseFloat(booking?.final_fare || booking?.fare || booking?.fare_estimate || booking?.original_fare || 0))
  const tripDistanceKm = parseFloat(booking?.distance_km || trackingData?.booking?.distance_km || 0)
  const tripDurationMins = parseInt(booking?.duration_min || booking?.duration_minutes || trackingData?.booking?.duration_min || Math.round(tripDistanceKm * 2.4) || 0)

  // Share Live Trip Location
  const handleShareLocation = async () => {
    try {
      const driverInfo = isDriverAssigned && driverName ? ` Driver: ${driverName} (${plateNo || vehicleModel}).` : ''
      await Share.share({
        message: `I'm tracking my ride using CityOneTaxi! Booking #${booking?.booking_ref || bookingId}: ${destCoord.address}.${driverInfo}`,
      })
    } catch {}
  }

  // Cancel Ride - Opens Professional Cancellation Sheet (Only allowed before driver starts heading)
  const handleCancelRide = () => {
    if (isDriverStartedHeading) {
      Alert.alert(
        'Cannot Cancel Ride',
        'Your driver has already started heading to your pickup location. Please contact your driver directly.'
      )
      return
    }
    setShowCancelModal(true)
  }

  const handleConfirmCancel = async () => {
    setCancelling(true)
    const reasonObj = CUSTOMER_CANCEL_REASONS.find(r => r.id === selectedCancelReason)
    let finalReason = reasonObj?.label || 'Customer cancelled'
    if (selectedCancelReason === 'other' && customCancelText.trim()) {
      finalReason = customCancelText.trim()
    }

    try {
      const res = await bookingsAPI.cancel(bookingId, { reason: finalReason })
      if (res.data?.status === 'error') {
        Alert.alert('Notice', res.data?.message || 'Could not cancel booking.')
        setCancelling(false)
        return
      }
      clearInterval(pollTimerRef.current)
      isCancelledAlertShownRef.current = true
      setShowCancelModal(false)
      Alert.alert('Ride Cancelled', 'Your booking has been cancelled successfully.', [
        { text: 'OK', onPress: returnToCustomerHome },
      ])
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to cancel booking.')
    } finally {
      setCancelling(false)
    }
  }

  // Handle Accept Extra Pickup Charge
  const handleAcceptPickupCharge = async () => {
    setAcceptingPickup(true)
    try {
      const res = await bookingsAPI.acceptPickupCharge(bookingId)
      if (res.data?.status === 'success') {
        setBooking(prev => ({
          ...prev,
          pickup_charge_accepted: 1
        }))
        setPickupChargeDismissed(true)
        Alert.alert('Pickup Charge Accepted ✅', 'Your driver has been notified and is proceeding for pickup.')
      } else {
        Alert.alert('Error', res.data?.message || 'Could not accept pickup charge.')
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to accept pickup charge.')
    } finally {
      setAcceptingPickup(false)
    }
  }

  // Handle Decline Extra Pickup Charge (Cancels ride without penalty)
  const handleDeclinePickupCharge = () => {
    Alert.alert(
      'Cancel Ride?',
      'Since you declined the extra pickup charge, do you want to cancel this ride now without any fee?',
      [
        { text: 'Keep Ride', style: 'cancel' },
        {
          text: 'Cancel Ride',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true)
            try {
              await bookingsAPI.cancel(bookingId, { reason: 'Customer declined extra pickup charge' })
              clearInterval(pollTimerRef.current)
              isCancelledAlertShownRef.current = true
              Alert.alert('Ride Cancelled', 'Your ride has been cancelled.', [
                { text: 'OK', onPress: returnToCustomerHome }
              ])
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to cancel booking.')
            } finally {
              setCancelling(false)
            }
          }
        }
      ]
    )
  }

  // SOS Emergency Alert
  const handleSOS = () => {
    Alert.alert(
      'Emergency SOS',
      'Do you want to contact emergency helpline (112) or share emergency live tracking alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call Police (112)', style: 'destructive', onPress: () => Linking.openURL('tel:112') },
      ]
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── 1. Full Screen Interactive Map (Zero Black Screen Guaranteed) ── */}
      <UniversalRouteMap
        ref={mapRef}
        pickupCoords={originCoord}
        destCoords={destCoord}
        routeCoordinates={routeCoordinates}
        driverLocation={isDriverAssigned && hasRealDriverCoord ? { latitude: driverCoord.latitude, longitude: driverCoord.longitude, heading: driverCoord.heading } : null}
        waypoints={bookingWaypoints}
        initialRegion={{
          latitude: originCoord.latitude,
          longitude: originCoord.longitude,
          latitudeDelta: 0.035,
          longitudeDelta: 0.035,
        }}
        style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
      />

      {/* ── 2. Top Header Elements ── */}
      <SafeAreaView style={[styles.topHeaderWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        {/* Navigation Mode Banner (Stage 5 in Reference Image) */}
        {isInTripNavigation ? (
          <View style={styles.navBannerCard}>
            <View style={styles.navArrowBox}>
              <Ionicons name="arrow-redo" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.navDistanceText}>300 m</Text>
              <Text style={styles.navInstructionText} numberOfLines={1}>
                {nextTurnInstruction}
              </Text>
            </View>
            <TouchableOpacity onPress={handleRecenter} style={styles.navCloseBtn}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          /* Normal Tracking Top Bar */
          <View style={styles.trackingTopBar}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Home')}
              style={styles.floatingRoundBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.destinationPill}>
              <Ionicons name="location" size={14} color="#EF4444" />
              <Text style={styles.destinationPillText} numberOfLines={1}>
                {destCoord.address?.split(',')?.[0] || 'Destination'}
              </Text>
            </View>

            <View style={styles.liveIndicatorBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Floating Speedometer (Navigation Mode - Stage 5) */}
      {isInTripNavigation && (
        <View style={styles.floatingSpeedometer}>
          <Text style={styles.speedNumber}>{driverSpeed}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
      )}

      {/* Floating Recenter Map Button */}
      <TouchableOpacity
        style={styles.floatingRecenterFab}
        onPress={handleRecenter}
        activeOpacity={0.85}
      >
        <Ionicons name="locate-outline" size={22} color="#0F172A" />
      </TouchableOpacity>

      {/* ── 3. Modern Draggable Bottom Sheet ── */}
      <ModernBottomSheet
        snapPoints={[190, 460, SCREEN_HEIGHT * 0.82]}
        initialIndex={1}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Selected Vehicle Blue Preview Bar (Stage 2 in Reference Image) */}
          <View style={styles.selectedVehicleBanner}>
            <View style={styles.vehicleBannerLeft}>
              <Ionicons name="car-sport" size={20} color="#FFFFFF" />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.vehicleBannerTitle}>{vehicleName}</Text>
                <Text style={styles.vehicleBannerSub}>
                  {isHourly
                    ? `${booking?.package_hours || 1} Hours Package (${booking?.hourly_package_km || ((booking?.package_hours || 1) * 10)} km included)`
                    : (tripDistanceKm > 0
                      ? `${tripDistanceKm.toFixed(1)} km · ~${formatDurationHours(tripDurationMins || Math.round(tripDistanceKm * 2.4))}`
                      : (routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km · ~${formatDurationHours(routeDurationMins)}` : 'Trip Route'))}
                </Text>
              </View>
            </View>
            <Text style={styles.vehicleBannerPrice}>₹{fareAmount}</Text>
          </View>

          {/* Driver Card (when assigned) OR Searching for Driver Card (when unassigned) */}
          {isDriverAssigned ? (
            <TouchableOpacity
              style={styles.driverInfoCard}
              onPress={() => setShowDriverProfileModal(true)}
              activeOpacity={0.9}
            >
              <View style={styles.driverAvatarWrap}>
                {driverAvatar ? (
                  <Image source={{ uri: driverAvatar }} style={styles.driverAvatarImg} resizeMode="cover" />
                ) : (
                  <View style={styles.driverAvatarPlaceholder}>
                    <Text style={styles.driverAvatarLetter}>{(driverName[0] || 'D').toUpperCase()}</Text>
                  </View>
                )}
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.driverNameText}>{driverName}</Text>
                  <Ionicons name="checkmark-circle" size={15} color="#10B981" />
                </View>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.ratingValText}>{driverRating}</Text>
                  {Number(driverRatingCount) > 0 && (
                    <Text style={styles.ratingCountText}>({driverRatingCount} rides)</Text>
                  )}
                </View>
                {(plateNo || vehicleModel) ? (
                  <Text style={styles.vehiclePlateText}>
                    {[plateNo, vehicleModel].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}

                {/* Tap to view full profile badge */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                  alignSelf: 'flex-start',
                  backgroundColor: '#EFF6FF',
                  paddingHorizontal: 8,
                  paddingVertical: 2.5,
                  borderRadius: 6,
                }}>
                  <Ionicons name="shield-checkmark" size={12} color="#2563EB" />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#2563EB' }}>
                    View Driver & Vehicle Profile ›
                  </Text>
                </View>

                {/* Driver Live Proximity / Arrival ETA */}
                {!isDriverArrived && !isInTripNavigation && routeDistanceKm > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="navigate-circle" size={13} color="#D97706" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>
                      Arriving in ~{formatDurationHours(routeDurationMins)} ({routeDistanceKm.toFixed(1)} km away)
                    </Text>
                  </View>
                ) : isDriverArrived && !isInTripNavigation ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="checkmark-done-circle" size={13} color="#10B981" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>
                      Driver has reached your pickup point
                    </Text>
                  </View>
                ) : isInTripNavigation && routeDistanceKm > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="speedometer" size={13} color="#2563EB" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>
                      Heading to destination · ~{formatDurationHours(routeDurationMins)} ({routeDistanceKm.toFixed(1)} km)
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Quick Call & Message Action Buttons */}
              <View style={styles.driverActionButtons}>
                {driverPhone ? (
                  <>
                    <TouchableOpacity
                      style={styles.actionRoundBtn}
                      onPress={(e) => {
                        e.stopPropagation?.()
                        Linking.openURL(`tel:${driverPhone}`)
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={18} color="#D97706" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionRoundBtn}
                      onPress={(e) => {
                        e.stopPropagation?.()
                        Linking.openURL(`sms:${driverPhone}`)
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="chatbubble-ellipses" size={18} color="#D97706" />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.searchingDriverCard}>
              <View style={styles.searchingRadarWrap}>
                <ActivityIndicator size="small" color="#D97706" />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.searchingTitle}>
                    {status === 'driver_assigned'
                      ? 'Connecting with Driver...'
                      : (status === 'pending_driver_assignment'
                          ? 'Driver Assignment in Progress'
                          : (isOutstationTrip ? 'Driver Assignment Pending' : 'Searching for Driver...'))}
                  </Text>
                  <View style={styles.searchingPulseDot} />
                </View>
                <Text style={styles.searchingSub}>
                  {status === 'driver_assigned'
                    ? 'Driver assigned by Admin. Waiting for driver confirmation...'
                    : (status === 'pending_driver_assignment'
                        ? (isOutstationTrip
                            ? 'Admin is assigning the best category driver for your outstation trip.'
                            : 'Admin is reviewing and assigning a driver. Auto-assign will trigger if unassigned.')
                        : (isOutstationTrip
                            ? 'Admin is assigning the best category driver for your outstation trip.'
                            : 'Looking for nearby drivers. Please hold on...'))}
                </Text>
              </View>

              <View style={styles.searchingBadge}>
                <Ionicons name="radio-outline" size={14} color="#D97706" />
                <Text style={styles.searchingBadgeText}>
                  {status === 'driver_assigned' ? 'Connecting' : (status === 'pending_driver_assignment' ? 'Assigning' : 'Searching')}
                </Text>
              </View>
            </View>
          )}

          {/* Horizontal Step Tracker: Dynamic for Normal vs Round Trip vs Searching */}
          <View style={styles.horizontalStepTracker}>
            {stepItems.map((step, idx) => {
              const isPast = stepIndex > step.id
              const isCurrent = stepIndex === step.id
              return (
                <React.Fragment key={step.id}>
                  <View style={styles.stepItemWrap}>
                    <View style={[
                      styles.stepCircle,
                      isPast && styles.stepCircleActive,
                      isCurrent && (!isDriverAssigned ? styles.stepCircleSearching : styles.stepCircleActive),
                    ]}>
                      {isPast ? (
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      ) : isCurrent && !isDriverAssigned ? (
                        <ActivityIndicator size={10} color="#FFFFFF" />
                      ) : (
                        <View style={styles.stepCircleInner} />
                      )}
                    </View>
                    <Text style={[styles.stepLabel, (isPast || isCurrent) && styles.stepLabelActive]}>
                      {step.label}
                    </Text>
                  </View>
                  {idx < stepItems.length - 1 && (
                    <View style={[styles.stepLine, stepIndex > step.id && styles.stepLineActive]} />
                  )}
                </React.Fragment>
              )
            })}
          </View>

          {/* Stage 4: Driver has arrived green alert banner + Start Ride PIN (Stage 4 & 6 in Reference Image) */}
          {isDriverArrived && (
            <>
              <View style={styles.arrivedBannerWrap}>
                <View style={styles.greenCheckBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.arrivedBannerTitle}>Driver has arrived</Text>
                  <Text style={styles.arrivedBannerSub}>Please board the vehicle</Text>
                </View>
              </View>

              {!isOutstationTrip && (
                <CustomerWaitingTimerCard
                  arrivedAt={booking?.arrived_at}
                  freeWaitingMins={booking?.free_waiting_mins || 5}
                  waitingRate={booking?.waiting_charge_per_min || 2}
                  categoryName={booking?.vehicle_type_name || vehicleName || 'Cab'}
                />
              )}
            </>
          )}

          {/* Stage: Return Pickup Banner */}
          {isReturnPickup && (
            <View style={[styles.arrivedBannerWrap, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <View style={[styles.greenCheckBadge, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="repeat" size={20} color="#1D4ED8" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.arrivedBannerTitle, { color: '#1E40AF' }]}>Driver Arriving for Return Pickup</Text>
                <Text style={styles.arrivedBannerSub}>Heading to 1st drop location to pick you up for return leg</Text>
              </View>
            </View>
          )}

          {/* Prominent OTP / PIN Display (Stage 6) */}
          {Boolean(otpCode) && !isInTripNavigation && !isCompleted && !isReturnPickup && (
            <View style={styles.otpPinCard}>
              <Text style={styles.otpPinLabel}>Start your order with PIN</Text>
              <View style={styles.otpBoxesRow}>
                {String(otpCode).split('').map((digit, idx) => (
                  <View key={`otp-${idx}`} style={styles.otpBox}>
                    <Text style={styles.otpDigitText}>{digit}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Stage 5 & 6: In-Trip En Route Progress Card */}
          {isInTripNavigation && (
            <View style={styles.enRouteCard}>
              <View style={styles.enRouteHeader}>
                <View>
                  <Text style={styles.enRouteTitle}>
                    {isRoundTrip && isReturnStarted
                      ? 'Return Journey to Origin 🔁'
                      : (isRoundTrip && isReturnPickup
                        ? 'Driver Heading to Return Pickup 📍'
                        : 'En Route to Destination')}
                  </Text>
                  <Text style={styles.enRouteSub}>
                    {isRoundTrip && isReturnStarted
                      ? `Returning to ${originCoord.address?.split(',')?.[0] || 'Origin'} · ${routeDistanceKm.toFixed(1)} km`
                      : (isRoundTrip && isReturnPickup
                        ? `Picking up at ${destCoord.address?.split(',')?.[0] || 'Drop location'}`
                        : `${routeDistanceKm.toFixed(1)} km · ~${formatDurationHours(routeDurationMins)} remaining`)}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleSOS} style={styles.sosEmergencyBtn}>
                  <Text style={styles.sosEmergencyBtnText}>SOS</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Action Buttons: Share Live Location & Cancel Ride */}
          <View style={styles.actionsColumn}>
            <TouchableOpacity
              style={styles.shareLocationBtn}
              onPress={handleShareLocation}
              activeOpacity={0.88}
            >
              <Ionicons name="share-social-outline" size={18} color="#D97706" />
              <Text style={styles.shareLocationBtnText}>Share Live Location</Text>
            </TouchableOpacity>

            {canCustomerCancel && (
              <TouchableOpacity
                style={styles.cancelRideBtn}
                onPress={handleCancelRide}
                activeOpacity={0.88}
              >
                <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </ModernBottomSheet>

      {/* ── 4. Trip Completed & Rating Modal ── */}
      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContentCard}>
            <View style={styles.celebrationIconWrap}>
              <Ionicons name="checkmark-circle" size={54} color="#10B981" />
            </View>
            <Text style={styles.ratingModalTitle}>Trip Completed!</Text>
            <Text style={styles.ratingModalSub}>
              {isHourly
                ? `Hourly trip (${booking?.package_hours || 1} hrs) finished! Total Fare: ₹${fareAmount}`
                : `You have arrived at ${destCoord.address?.split(',')?.[0] || 'your destination'}. Total Fare: ₹${fareAmount}`}
            </Text>

            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginVertical: 8, width: '100%', borderWidth: 1, borderColor: '#E2E8F0' }}>
              {isHourly ? (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#64748B' }}>Base Package ({booking?.package_hours || 1} hrs)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>₹{Math.round(Number(booking?.base_package_fare || ((booking?.package_hours || 1) * (booking?.hourly_rate || 250))))}</Text>
                  </View>
                  {Number(booking?.extra_mins) > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#D97706' }}>Overtime ({booking?.extra_mins} mins)</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>+₹{Math.round(Number(booking?.extra_min_fare || 0))}</Text>
                    </View>
                  ) : null}
                  {Number(booking?.extra_km) > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#D97706' }}>Extra Distance ({Number(booking?.extra_km).toFixed(1)} km)</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>+₹{Math.round(Number(booking?.extra_km_fare || 0))}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#64748B' }}>
                      Booked Route Fare ({Number(booking?.original_distance_km || booking?.distance_km || 0).toFixed(1)} km)
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
                      ₹{Math.round(Number(booking?.original_fare || (Number(fareAmount) - Number(booking?.extra_km_fare || 0) - Number(booking?.pickup_charge || 0))))}
                    </Text>
                  </View>
                  {Number(booking?.extra_km) > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '600' }}>
                        Extra Route Distance ({Number(booking?.extra_km).toFixed(1)} km @ ₹{booking?.per_km_rate || 15}/km)
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>
                        +₹{Math.round(Number(booking?.extra_km_fare || 0))}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}

              {Number(booking?.pickup_charge) > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '600' }}>
                    Pickup Charge (Extra {booking?.extra_pickup_distance_km || ((Number(booking?.pickup_distance_km) > 2) ? (Number(booking?.pickup_distance_km) - 2).toFixed(1) : 0)} km)
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>+₹{Math.round(Number(booking?.pickup_charge))}</Text>
                </View>
              ) : null}

              {Number(booking?.waiting_charge) > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Waiting Charge ({booking?.waiting_mins || 0}m)</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>+₹{Math.round(Number(booking?.waiting_charge))}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>Total Invoice Amount</Text>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#16A34A' }}>₹{fareAmount}</Text>
              </View>

              {Number(booking?.online_paid) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: '#0284C7' }}>Paid Online (Advance)</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284C7' }}>-₹{Math.round(Number(booking?.online_paid))}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706' }}>Cash to Pay Driver</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#D97706' }}>
                  ₹{Math.round(Number(booking?.cash_pending ?? (Number(fareAmount) - Number(booking?.online_paid || 0))))}
                </Text>
              </View>

              {/* 🖨️ View & Download Official Tax Invoice Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#0F172A',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 11,
                  borderRadius: 10,
                  marginTop: 12,
                }}
                onPress={async () => {
                  try {
                    const invoiceUrl = await getInvoiceUrl(booking.id, true, booking?.booking_ref)
                    Linking.openURL(invoiceUrl)
                  } catch (e) {
                    Alert.alert('Error', 'Unable to open invoice.')
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="receipt-outline" size={17} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
                  Download / Print Tax Invoice (PDF)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Rating Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRatingScore(star)} style={{ padding: 6 }}>
                  <Ionicons
                    name={star <= ratingScore ? 'star' : 'star-outline'}
                    size={34}
                    color="#F59E0B"
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Review Description */}
            <View style={{ width: '100%', marginVertical: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 }}>
                Trip Feedback & Comments:
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 13,
                  color: '#0F172A',
                  minHeight: 70,
                  textAlignVertical: 'top',
                }}
                placeholder="Share your driving and ride experience (optional)..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={ratingComment}
                onChangeText={setRatingComment}
              />
            </View>

            <TouchableOpacity
              style={[styles.modalDoneBtn, submittingRating && { opacity: 0.7 }]}
              onPress={async () => {
                if (!booking) return
                setSubmittingRating(true)
                try {
                  await reviewsAPI.submit({
                    booking_id: booking.id,
                    reviewee_id: driver?.user_id,
                    role: 'driver',
                    rating: ratingScore,
                    comment: ratingComment.trim() || undefined,
                  })
                } catch (e) {
                  console.log('Rating submit error:', e)
                } finally {
                  setSubmittingRating(false)
                  setShowRatingModal(false)
                  Alert.alert(
                    'Trip Completed! 🎉',
                    'Thank you for your rating & feedback!\n\nYou can view and download your trip invoice anytime under "My Trips".',
                    [
                      { text: 'OK', onPress: returnToCustomerHome },
                    ],
                    { cancelable: false }
                  )
                }
              }}
              disabled={submittingRating}
            >
              {submittingRating ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.modalDoneBtnText}>Submit Rating & Review ⭐</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 10, paddingVertical: 8, alignItems: 'center' }}
              onPress={() => {
                setShowRatingModal(false)
                Alert.alert(
                  'Trip Completed! 🎉',
                  'You can view and download your trip invoice anytime under "My Trips".',
                  [
                    { text: 'OK', onPress: returnToCustomerHome },
                  ],
                  { cancelable: false }
                )
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.gray500 }}>Skip for Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 5. Professional Ride Cancellation Modal ── */}
      <Modal visible={showCancelModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { maxHeight: '88%', padding: 20 }]}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#FEF2F2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              borderWidth: 2,
              borderColor: '#FECACA',
            }}>
              <Ionicons name="alert-circle" size={32} color="#DC2626" />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', textAlign: 'center' }}>
              Cancel Your Ride?
            </Text>
            <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 14 }}>
              Please let us know the reason. This helps us improve our service.
            </Text>

            {/* Free Cancellation Guarantee Note */}
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
              marginBottom: 14,
            }}>
              <Ionicons name="shield-checkmark" size={16} color="#16A34A" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534', flex: 1 }}>
                Free Cancellation: No cancellation fee applies before trip starts.
              </Text>
            </View>

            {/* Reasons List */}
            <ScrollView style={{ width: '100%', maxHeight: 230 }} showsVerticalScrollIndicator={false}>
              {CUSTOMER_CANCEL_REASONS.map(r => {
                const isSelected = selectedCancelReason === r.id
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isSelected ? '#D97706' : '#E2E8F0',
                      backgroundColor: isSelected ? '#FFFBEB' : '#FFFFFF',
                      marginBottom: 8,
                    }}
                    onPress={() => setSelectedCancelReason(r.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={r.icon}
                      size={18}
                      color={isSelected ? '#D97706' : '#64748B'}
                      style={{ marginRight: 10 }}
                    />
                    <Text style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: isSelected ? '800' : '600',
                      color: isSelected ? '#92400E' : '#334155',
                    }}>
                      {r.label}
                    </Text>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isSelected ? '#D97706' : '#CBD5E1'}
                    />
                  </TouchableOpacity>
                )
              })}

              {selectedCancelReason === 'other' && (
                <TextInput
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    padding: 10,
                    fontSize: 13,
                    color: '#0F172A',
                    minHeight: 50,
                    marginBottom: 10,
                  }}
                  placeholder="Explain briefly (optional)..."
                  placeholderTextColor="#94A3B8"
                  value={customCancelText}
                  onChangeText={setCustomCancelText}
                  multiline
                />
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={{ width: '100%', marginTop: 14, gap: 10 }}>
              <TouchableOpacity
                style={{
                  width: '100%',
                  backgroundColor: COLORS.primary || '#FBBF24',
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...SHADOW.small,
                }}
                onPress={() => setShowCancelModal(false)}
                activeOpacity={0.88}
                disabled={cancelling}
              >
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#000000' }}>
                  Keep My Ride
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  width: '100%',
                  backgroundColor: '#FEE2E2',
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#FECACA',
                }}
                onPress={handleConfirmCancel}
                activeOpacity={0.88}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#DC2626' }}>
                    Confirm Cancellation
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 6. Extra Pickup Charge Alert Modal ── */}
      <Modal visible={hasPendingPickupCharge && !pickupChargeDismissed} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContentCard, { padding: 22, maxWidth: 360 }]}>
            <View style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: '#F5F3FF',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              borderWidth: 1,
              borderColor: '#DDD6FE'
            }}>
              <Ionicons name="location" size={30} color="#7C3AED" />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '900', color: '#1E1B4B', textAlign: 'center', marginBottom: 6 }}>
              Driver Pickup Charge Alert
            </Text>

            <Text style={{ fontSize: 13, color: '#4B5563', textAlign: 'center', lineHeight: 19, marginBottom: 16 }}>
              Your assigned driver is{' '}
              <Text style={{ fontWeight: '800', color: '#111827' }}>
                {booking?.pickup_distance_km ? `${Number(booking?.pickup_distance_km).toFixed(1)} km` : `${(2 + Number(booking?.extra_pickup_distance_km)).toFixed(1)} km`}
              </Text>{' '}
              away from your pickup location.
            </Text>

            {/* Fare Breakdown Details */}
            <View style={{
              width: '100%',
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              marginBottom: 18
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Free Pickup Radius</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#16A34A' }}>First 2 KM FREE</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Extra Arrival Distance</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F2937' }}>
                  {Number(booking?.extra_pickup_distance_km || 0).toFixed(1)} KM
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Rate Per Extra KM</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F2937' }}>
                  ₹{Math.round(Number(booking?.pickup_charge_per_km || 10))}/km
                </Text>
              </View>

              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingTop: 8,
                borderTopWidth: 1,
                borderTopColor: '#E5E7EB'
              }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>Additional Pickup Charge</Text>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#7C3AED' }}>
                  ₹{Math.round(Number(booking?.pickup_charge || 0))}
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginBottom: 16 }}>
              This charge will be added to your total trip invoice upon ride completion.
            </Text>

            {/* Actions */}
            <View style={{ width: '100%', gap: 10 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#7C3AED',
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  shadowColor: '#7C3AED',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                  elevation: 4
                }}
                onPress={handleAcceptPickupCharge}
                disabled={acceptingPickup}
              >
                {acceptingPickup ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                      Accept & Continue (₹{Math.round(Number(booking?.pickup_charge || 0))})
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#F3F4F6',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onPress={handleDeclinePickupCharge}
                disabled={acceptingPickup || cancelling}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>
                  Cancel Ride
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DRIVER & VEHICLE PROFILE MODAL ── */}
      <Modal
        visible={showDriverProfileModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDriverProfileModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: Platform.OS === 'ios' ? 36 : 24,
            maxHeight: SCREEN_HEIGHT * 0.85,
            ...SHADOW.lg,
          }}>
            {/* Top Indicator */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 14 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A' }}>Driver & Vehicle Details</Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>Verified CityOneTaxi Partner</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowDriverProfileModal(false)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Profile Card */}
              <View style={{
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                marginBottom: 16,
              }}>
                <View style={{ position: 'relative' }}>
                  <View style={{
                    width: 84,
                    height: 84,
                    borderRadius: 42,
                    overflow: 'hidden',
                    backgroundColor: '#FEF3C7',
                    borderWidth: 3,
                    borderColor: '#10B981',
                  }}>
                    {driverAvatar ? (
                      <Image source={{ uri: driverAvatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 34, fontWeight: '900', color: '#B45309' }}>
                          {(driverName[0] || 'D').toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    backgroundColor: '#10B981',
                    borderRadius: 12,
                    padding: 3,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                  }}>
                    <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
                  </View>
                </View>

                <Text style={{ fontSize: 19, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>{driverName}</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309', marginLeft: 3 }}>{driverRating}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>•</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                    {Number(driverRatingCount) > 0 ? `${driverRatingCount}+ Completed Trips` : 'Verified Partner'}
                  </Text>
                </View>
              </View>

              {/* Vehicle Card */}
              <View style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 18,
                padding: 16,
                borderWidth: 1.5,
                borderColor: '#E2E8F0',
                marginBottom: 16,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Vehicle Information</Text>
                  <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>{vehicleName || 'Standard'}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' }}>
                    <Ionicons name="car-sport" size={24} color="#0F172A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                      {[vehicleModel, vehicleColor].filter(Boolean).join(' · ') || 'Assigned Vehicle'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      Class: {vehicleName}
                    </Text>
                  </View>
                </View>

                {/* Number Plate Display */}
                {plateNo ? (
                  <View style={{
                    marginTop: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#FEF3C7',
                    borderWidth: 2,
                    borderColor: '#F59E0B',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    alignSelf: 'flex-start',
                  }}>
                    <View style={{
                      backgroundColor: '#2563EB',
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                      borderRadius: 4,
                      marginRight: 8,
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFFFFF' }}>IND</Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A', letterSpacing: 1.5 }}>
                      {plateNo.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Safety Badges */}
              <View style={{
                backgroundColor: '#ECFDF5',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: '#A7F3D0',
                marginBottom: 16,
                gap: 8,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#065F46' }}>Driver KYC & Police Background Verified</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="shield-checkmark" size={16} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#065F46' }}>Commercial Driving License & Fitness Certified</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="sparkles" size={16} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#065F46' }}>Sanitized & Clean Vehicle Guaranteed</Text>
                </View>
              </View>

              {/* Action Buttons */}
              {driverPhone ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: '#16A34A',
                      paddingVertical: 14,
                      borderRadius: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                    onPress={() => {
                      setShowDriverProfileModal(false)
                      Linking.openURL(`tel:${driverPhone}`)
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="call" size={18} color="#FFFFFF" />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Call Driver</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: '#2563EB',
                      paddingVertical: 14,
                      borderRadius: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                    onPress={() => {
                      setShowDriverProfileModal(false)
                      Linking.openURL(`sms:${driverPhone}`)
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>SMS Driver</Text>
                  </TouchableOpacity>
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

  // ── Top Header ──
  topHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 16,
  },
  trackingTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 10,
    ...SHADOW.md,
    elevation: 8,
  },
  floatingRoundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 10,
  },
  destinationPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#10B981',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Navigation Mode Banner (Stage 5 in Reference Image) ──
  navBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D', // Dark Turn-by-Turn Emerald Green
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...SHADOW.lg,
    elevation: 10,
  },
  navArrowBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDistanceText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  navInstructionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DCFCE7',
    marginTop: 2,
  },
  navCloseBtn: {
    padding: 6,
  },

  // ── Speedometer ──
  floatingSpeedometer: {
    position: 'absolute',
    left: 16,
    bottom: 490,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    ...SHADOW.md,
    elevation: 6,
    zIndex: 60,
  },
  speedNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  speedUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: -2,
  },

  // ── Recenter Floating Button ──
  floatingRecenterFab: {
    position: 'absolute',
    right: 16,
    bottom: 490,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.md,
    elevation: 8,
    zIndex: 60,
  },

  // ── Map Markers & Tooltip Bubble (Reference Image 3 & 4) ──
  pickupMarkerWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  arrivedPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  destPinWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  driverCarMarkerContainer: {
    alignItems: 'center',
  },
  carTooltipBubble: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 6,
    ...SHADOW.md,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  carTooltipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  carMarkerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F59E0B',
    ...SHADOW.md,
    elevation: 6,
  },

  // ── Bottom Sheet Vehicle Summary (Stage 2 in Reference Image) ──
  selectedVehicleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A', // Slate Noir Accent Bar
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  vehicleBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  vehicleBannerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FEF3C7',
    marginTop: 1,
  },
  vehicleBannerPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // ── Searching for Driver Card ──
  searchingDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  searchingRadarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  searchingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  searchingPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  searchingSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  searchingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  searchingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },

  // ── Driver Info Card ──
  driverInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  driverAvatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  driverAvatarImg: {
    width: '100%',
    height: '100%',
  },
  driverAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
  },
  driverAvatarLetter: {
    fontSize: 20,
    fontWeight: '900',
    color: '#B45309',
  },
  driverNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  ratingValText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  ratingCountText: {
    fontSize: 11,
    color: '#64748B',
  },
  vehiclePlateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  driverActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionRoundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Step Tracker (Stage 2) ──
  horizontalStepTracker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepItemWrap: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#F59E0B',
  },
  stepCircleSearching: {
    backgroundColor: '#D97706',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
  },
  stepCircleInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 2,
    marginBottom: 16,
  },
  stepLineActive: {
    backgroundColor: '#F59E0B',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#B45309',
    fontWeight: '800',
  },

  // ── Driver Arrived Alert (Stage 4) ──
  arrivedBannerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  greenCheckBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivedBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  arrivedBannerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },

  // ── OTP PIN Card (Stage 6) ──
  otpPinCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  otpPinLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  otpBoxesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  otpBox: {
    width: 38,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.xs,
  },
  otpDigitText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },

  // ── En Route Card (Stage 5) ──
  enRouteCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  enRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  enRouteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  enRouteSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 2,
  },
  sosEmergencyBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sosEmergencyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ── Action Buttons Column ──
  actionsColumn: {
    gap: 8,
  },
  shareLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  shareLocationBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  cancelRideBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 12,
  },
  cancelRideBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },

  // ── Modal Styles ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContentCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...SHADOW.lg,
  },
  celebrationIconWrap: {
    marginBottom: 12,
  },
  ratingModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  ratingModalSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 18,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  modalDoneBtn: {
    width: '100%',
    backgroundColor: '#FBBF24',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
  },
})
