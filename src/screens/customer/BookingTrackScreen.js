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
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps'
import { bookingsAPI, resolveAssetUrl } from '../../api/api'
import { fetchRouteDirections, calculateDistanceKm, calculateBearing } from '../../services/directionService'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import ModernBottomSheet from '../../components/common/ModernBottomSheet'

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

  // UI Modals
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedCancelReason, setSelectedCancelReason] = useState(CUSTOMER_CANCEL_REASONS[0].id)
  const [customCancelText, setCustomCancelText] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const isCancelledAlertShownRef = useRef(false)

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
            Alert.alert('Booking Cancelled', 'This ride has been cancelled.', [
              { text: 'OK', onPress: () => navigation.navigate('Home') }
            ])
          }
        }
      }
    } catch (err) {
      console.warn('Live tracking poll failed:', err)
    } finally {
      setLoading(false)
    }
  }, [bookingId])

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

  const isAssignedStatus = [
    'driver_assigned', 'driver_accepted', 'accepted', 'driver_arrived',
    'driver_reached', 'pickup_reached', 'trip_started', 'in_progress', 'trip_in_progress',
    'return_pickup', 'return_started', 'return_in_progress'
  ].includes(status)

  const hasAssignedDriver = Boolean(
    (assignedDriverId && Number(assignedDriverId) > 0) ||
    Boolean(driver?.name) ||
    Boolean(booking?.driver_name) ||
    isAssignedStatus
  )

  const isDriverAssigned = Boolean(
    hasAssignedDriver &&
    status !== 'searching' &&
    status !== 'pending' &&
    status !== 'pending_driver_assignment' &&
    status !== 'cancelled'
  )
  const isDriverArrived = ['driver_arrived', 'driver_reached', 'pickup_reached'].includes(status)

  const isRoundTrip = Boolean(
    Number(booking?.is_round_trip) === 1 ||
    booking?.is_round_trip === true ||
    booking?.is_round_trip === '1' ||
    (booking?.trip_type && booking.trip_type.toLowerCase().includes('round_trip')) ||
    (booking?.booking_trip_type && booking.booking_trip_type.toLowerCase().includes('round_trip')) ||
    Boolean(booking?.return_date)
  )
  const isOutstationTrip = Boolean(
    parseFloat(booking?.distance_km || 0) > 130 ||
    (booking?.trip_type && booking.trip_type.toLowerCase().includes('outstation')) ||
    (booking?.booking_trip_type && booking.booking_trip_type.toLowerCase().includes('outstation')) ||
    Boolean(booking?.is_long_trip)
  )

  const isReturnPickup = status === 'return_pickup'
  const isReturnStarted = ['return_started', 'return_in_progress'].includes(status)
  const isOnwardTripStarted = ['trip_started', 'in_progress', 'trip_in_progress'].includes(status)
  const isInTripNavigation = isOnwardTripStarted || isReturnStarted
  const isCompleted = ['completed', 'trip_completed'].includes(status)

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
        { id: 1, label: 'Searching' },
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
    stepIndex = 1 // Step 1 Searching is active
  } else if (isRoundTrip && (isReturnPickup || isReturnStarted)) {
    if (isReturnPickup) stepIndex = 2
    if (isReturnStarted) stepIndex = 3
    if (isCompleted) stepIndex = 4
  } else {
    stepIndex = 1
    if (['driver_assigned', 'driver_accepted', 'accepted'].includes(status)) stepIndex = 1
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
        } else {
          // Driver approaching customer pickup
          start = hasRealDriverCoord ? driverCoord : originCoord
          end = originCoord
        }
      }

      if (start?.latitude && end?.latitude) {
        try {
          const res = await fetchRouteDirections(start, end)
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
  }, [driverCoord.latitude, driverCoord.longitude, status, isDriverAssigned, hasRealDriverCoord, isInTripNavigation, isReturnPickup, isReturnStarted, isRoundTrip])

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
        message: `I'm tracking my ride using CityDropTaxi! Booking #${booking?.booking_ref || bookingId}: ${destCoord.address}.${driverInfo}`,
      })
    } catch {}
  }

  // Cancel Ride
  // Cancel Ride - Opens Professional Cancellation Sheet
  const handleCancelRide = () => {
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
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ])
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to cancel booking.')
    } finally {
      setCancelling(false)
    }
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

      {/* ── 1. Full Screen Interactive Map ── */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
        initialRegion={{
          latitude: originCoord.latitude,
          longitude: originCoord.longitude,
          latitudeDelta: 0.035,
          longitudeDelta: 0.035,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {/* Route Polyline (Vibrant Blue) */}
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

        {/* Pickup Pin with Ripple */}
        <Marker coordinate={originCoord} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.pickupMarkerWrap}>
            {(!isDriverAssigned || isDriverArrived) && <View style={styles.arrivedPulseRing} />}
            <View style={styles.pickupMarkerDot} />
          </View>
        </Marker>

        {/* Searching Radar Ring on Pickup Point when Driver Not Yet Assigned */}
        {!isDriverAssigned && (
          <Circle
            center={originCoord}
            radius={350}
            strokeColor="rgba(245, 158, 11, 0.45)"
            fillColor="rgba(245, 158, 11, 0.12)"
          />
        )}

        {/* Destination Pin */}
        <Marker coordinate={destCoord} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.destPinWrap}>
            <Ionicons name="location" size={32} color="#EF4444" />
          </View>
        </Marker>

        {/* Moving Driver Car Marker with Floating Tooltip Bubble (Only when driver is assigned & real location available) */}
        {isDriverAssigned && hasRealDriverCoord && (
          <Marker
            coordinate={driverCoord}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={driverCoord.heading}
          >
            <View style={styles.driverCarMarkerContainer}>
              {/* Tooltip Bubble above car marker (Matching Reference Image 3 & 4) */}
              <View style={styles.carTooltipBubble}>
                <Text style={styles.carTooltipText}>
                  {isRoundTrip && isReturnStarted
                    ? `Returning to origin · ${routeDistanceKm.toFixed(1)} km · ~${formatDurationHours(routeDurationMins)}`
                    : (isRoundTrip && isReturnPickup
                      ? `Driver arriving for return pickup · ${routeDistanceKm.toFixed(1)} km`
                      : (isDriverArrived
                        ? 'Driver arrived'
                        : isInTripNavigation
                        ? `On the way · ${routeDistanceKm.toFixed(1)} km · ~${formatDurationHours(routeDurationMins)}`
                        : `Driver is on the way · ${routeDistanceKm.toFixed(1)} km · ~${formatDurationHours(routeDurationMins)}`))}
                </Text>
              </View>
              <View style={styles.carMarkerCircle}>
                <Ionicons name="car-sport" size={20} color="#0F172A" />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

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
                  {tripDistanceKm > 0
                    ? `${tripDistanceKm.toFixed(1)} km · ~${formatDurationHours(tripDurationMins || Math.round(tripDistanceKm * 2.4))}`
                    : (routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km · ~${formatDurationHours(routeDurationMins)}` : 'Trip Route')}
                </Text>
              </View>
            </View>
            <Text style={styles.vehicleBannerPrice}>₹{fareAmount}</Text>
          </View>

          {/* Driver Card (when assigned) OR Searching for Driver Card (when unassigned) */}
          {isDriverAssigned ? (
            <View style={styles.driverInfoCard}>
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
                    <Text style={styles.ratingCountText}>({driverRatingCount})</Text>
                  )}
                </View>
                {(plateNo || vehicleModel) ? (
                  <Text style={styles.vehiclePlateText}>
                    {[plateNo, vehicleModel].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}

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
                      onPress={() => Linking.openURL(`tel:${driverPhone}`)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={18} color="#D97706" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionRoundBtn}
                      onPress={() => Linking.openURL(`sms:${driverPhone}`)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="chatbubble-ellipses" size={18} color="#D97706" />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.searchingDriverCard}>
              <View style={styles.searchingRadarWrap}>
                <ActivityIndicator size="small" color="#D97706" />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.searchingTitle}>
                    {isOutstationTrip ? 'Driver Assignment Pending' : 'Searching for Driver...'}
                  </Text>
                  <View style={styles.searchingPulseDot} />
                </View>
                <Text style={styles.searchingSub}>
                  {isOutstationTrip
                    ? 'Admin is assigning the best category driver for your outstation trip.'
                    : 'Looking for nearby drivers. Please hold on...'}
                </Text>
              </View>

              <View style={styles.searchingBadge}>
                <Ionicons name="radio-outline" size={14} color="#D97706" />
                <Text style={styles.searchingBadgeText}>Searching</Text>
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
            <View style={styles.arrivedBannerWrap}>
              <View style={styles.greenCheckBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.arrivedBannerTitle}>Driver has arrived</Text>
                <Text style={styles.arrivedBannerSub}>Please board the vehicle</Text>
              </View>
            </View>
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

            {!isInTripNavigation && !isCompleted && (
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
              You have arrived at {destCoord.address?.split(',')?.[0] || 'your destination'}. Total Fare: ₹{fareAmount}
            </Text>

            {/* Rating Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRatingScore(star)} style={{ padding: 4 }}>
                  <Ionicons
                    name={star <= ratingScore ? 'star' : 'star-outline'}
                    size={32}
                    color="#F59E0B"
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => {
                setShowRatingModal(false)
                navigation.navigate('Home')
              }}
            >
              <Text style={styles.modalDoneBtnText}>Done · Back to Home</Text>
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
