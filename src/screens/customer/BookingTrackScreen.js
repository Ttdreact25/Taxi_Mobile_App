import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Linking, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { bookingsAPI, resolveAssetUrl } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import LiveTripMap from '../../components/common/LiveTripMap'

const STATUS_LABELS = {
  searching:        { label: '🔍 Searching for nearby driver...', color: COLORS.info, pulse: true },
  SEARCHING_DRIVER: { label: '🔍 Searching for nearby driver...', color: COLORS.info, pulse: true },
  driver_assigned:  { label: '🚗 Driver Assigned — On the way to pickup', color: COLORS.warning, pulse: false },
  DRIVER_ACCEPTED:  { label: '🚗 Driver Assigned — On the way to pickup', color: COLORS.warning, pulse: false },
  driver_arrived:   { label: '📍 Driver Has Arrived at Pickup', color: COLORS.secondary, pulse: false },
  PICKUP_REACHED:   { label: '📍 Driver Has Arrived at Pickup', color: COLORS.secondary, pulse: false },
  trip_started:     { label: '🚀 Trip Started — Heading to destination', color: COLORS.primary, pulse: false },
  in_progress:      { label: '🚀 Trip in Progress — Heading to destination', color: COLORS.primary, pulse: false },
  TRIP_STARTED:     { label: '🚀 Trip Started — Heading to destination', color: COLORS.primary, pulse: false },
  completed:        { label: '✅ Trip Completed!', color: COLORS.success, pulse: false },
  TRIP_COMPLETED:   { label: '✅ Trip Completed!', color: COLORS.success, pulse: false },
  cancelled:        { label: '❌ Booking Cancelled', color: COLORS.error, pulse: false },
  CANCELLED:        { label: '❌ Booking Cancelled', color: COLORS.error, pulse: false },
}

const BookingTrackScreen = ({ route, navigation }) => {
  const { bookingId } = route.params || {}
  const [booking, setBooking] = useState(null)
  const [trackingData, setTrackingData] = useState(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef(null)

  const load = async () => {
    try {
      const res = await bookingsAPI.liveTracking(bookingId)
      if (res.data?.status === 'success') {
        setTrackingData(res.data)
        const b = res.data.booking
        setBooking(b)
        if (['completed', 'cancelled'].includes(b?.status)) {
          clearInterval(pollRef.current)
        }
      }
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 3000) // poll live tracking every 3 seconds
    return () => clearInterval(pollRef.current)
  }, [bookingId])

  const cancelRide = async () => {
    Alert.alert('Cancel Ride?', 'Are you sure you want to cancel this booking?', [
      { text: 'No, Keep Ride', style: 'cancel' },
      {
        text: 'Yes, Cancel Ride', style: 'destructive',
        onPress: async () => {
          try {
            await bookingsAPI.cancel(bookingId, { reason: 'Customer cancelled' })
            if (pollRef.current) clearInterval(pollRef.current)
            Alert.alert('Ride Cancelled', 'Your cab booking has been cancelled.', [
              { text: 'OK', onPress: () => navigation.navigate('Home') }
            ])
          } catch {
            Alert.alert('Error', 'Cancellation failed. Please try again.')
          }
        }
      }
    ])
  }

  const statusInfo = STATUS_LABELS[booking?.status] || STATUS_LABELS.searching
  const driver = trackingData?.driver || null
  const driverPhone = driver?.phone || booking?.driver_phone || ''
  const driverAvatar = resolveAssetUrl(driver?.avatar_url || driver?.avatar || booking?.driver_avatar || '')

  // Coordinates formatting for Live Directions Map
  const originCoord = {
    latitude: parseFloat(booking?.pickup_lat || trackingData?.booking?.pickup_lat || 12.9716),
    longitude: parseFloat(booking?.pickup_lng || trackingData?.booking?.pickup_lng || 77.5946),
    address: booking?.pickup_address,
  }

  const destCoord = {
    latitude: parseFloat(booking?.dest_lat || trackingData?.booking?.dest_lat || 12.9716),
    longitude: parseFloat(booking?.dest_lng || trackingData?.booking?.dest_lng || 77.5946),
    address: booking?.dest_address,
  }

  const driverLat = parseFloat(trackingData?.tracking?.driver_lat || trackingData?.driver?.current_lat || booking?.driver_lat || 0)
  const driverLng = parseFloat(trackingData?.tracking?.driver_lng || trackingData?.driver?.current_lng || booking?.driver_lng || 0)

  const driverCoord = driverLat && driverLng ? {
    latitude: driverLat,
    longitude: driverLng,
    heading: parseFloat(trackingData?.tracking?.driver_heading || 0),
    speed: parseFloat(trackingData?.tracking?.driver_speed || 0),
  } : null

  const waypoints = (() => {
    const rawStops = booking?.stops ? (typeof booking.stops === 'string' ? JSON.parse(booking.stops) : booking.stops) : []
    return rawStops.map(s => ({
      latitude: parseFloat(s.lat || 0),
      longitude: parseFloat(s.lng || 0),
      address: s.address,
      name: s.name,
    }))
  })()

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Ride</Text>
        <TouchableOpacity onPress={load} style={styles.back}>
          <Ionicons name="refresh" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading && !booking ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading booking info...</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '15', borderColor: statusInfo.color + '40' }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {['searching', 'SEARCHING_DRIVER'].includes(booking?.status)
                ? `🔍 Searching for nearby ${booking?.vehicle_type_name || 'driver'}s...`
                : statusInfo.label}
            </Text>
          </View>

          {/* Interactive Live Route Direction Map */}
          {Boolean(originCoord.latitude && destCoord.latitude) && (
            <View style={{ marginBottom: SPACING.md }}>
              <LiveTripMap
                origin={originCoord}
                destination={destCoord}
                driverLocation={driverCoord}
                waypoints={waypoints}
                role="customer"
                status={booking?.status}
                driverInfo={driver}
                height={260}
                showNavigationButton={false}
              />
            </View>
          )}

          {/* Assigned Driver & OTP Card (Shown as soon as Driver Accepts) */}
          {(driver || booking?.driver_id || booking?.driver_name) ? (
            <View style={styles.driverSectionCard}>
              <View style={styles.driverTopRow}>
                <View style={[styles.driverAvatar, { overflow: 'hidden' }]}>
                  {driverAvatar ? (
                    <Image
                      source={{ uri: driverAvatar }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.driverAvatarText}>{((driver?.name || booking?.driver_name)?.[0] || 'D').toUpperCase()}</Text>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.driverName}>{driver?.name || booking?.driver_name || 'Assigned Driver'}</Text>
                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  </View>
                  <Text style={styles.driverDetail}>
                    {driver?.vehicle_make || booking?.make || 'Cab'} {driver?.vehicle_model || booking?.model} · {driver?.color || 'White'}
                  </Text>
                  <Text style={styles.plateNumber}>
                    {driver?.plate_no || booking?.plate_no || 'TN 01 AB 1234'}
                  </Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={styles.rating}>{driver?.rating || booking?.driver_rating || '5.0'}</Text>
                    {trackingData?.tracking?.dist_remaining_km !== undefined && (
                      <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700', marginLeft: 8 }}>
                        • {Number(trackingData.tracking.dist_remaining_km).toFixed(1)} KM away ({trackingData.tracking.eta_mins || 3} mins)
                      </Text>
                    )}
                  </View>
                </View>

                {/* Call & Chat buttons */}
                {driverPhone ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.actionCircleBtn}
                      onPress={() => Linking.openURL(`sms:${driverPhone}`)}
                    >
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionCircleBtn, { backgroundColor: '#059669' }]}
                      onPress={() => Linking.openURL(`tel:${driverPhone}`)}
                    >
                      <Ionicons name="call" size={18} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {/* Ride Start PIN Box */}
              {booking?.driver_otp && !['trip_started', 'in_progress', 'completed'].includes(booking?.status) ? (
                <View style={styles.otpBanner}>
                  <View style={styles.otpLeft}>
                    <Ionicons name="key" size={18} color="#D97706" />
                    <View>
                      <Text style={styles.otpHeading}>Ride Start PIN</Text>
                      <Text style={styles.otpSub}>Share with driver upon arrival</Text>
                    </View>
                  </View>
                  <View style={styles.otpBadge}>
                    <Text style={styles.otpCode}>{booking.driver_otp}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Route Info Card */}
          <View style={styles.card}>
            <Text style={styles.ref}>{booking?.booking_ref}</Text>
            <View style={styles.routeRow}>
              <View style={styles.dot} />
              <Text style={styles.routeText} numberOfLines={1}>Pickup: {booking?.pickup_address}</Text>
            </View>
            
            {/* Intermediate Stops */}
            {(() => {
              const rawStops = booking?.stops ? (typeof booking.stops === 'string' ? JSON.parse(booking.stops) : booking.stops) : []
              const currIdx = booking?.current_stop_index || 0
              return rawStops.map((st, i) => (
                <View key={i} style={styles.routeRow}>
                  <Ionicons name={currIdx > i ? "checkmark-circle" : "location-outline"} size={14} color={currIdx > i ? "#059669" : "#D97706"} />
                  <Text style={[styles.routeText, { color: currIdx > i ? '#059669' : '#D97706' }]} numberOfLines={1}>
                    Stop {i + 1}: {st.address} {currIdx > i ? '✓ Completed' : (currIdx === i ? '📍 Active Target' : '')}
                  </Text>
                </View>
              ))
            })()}

            <View style={styles.routeRow}>
              <Ionicons name="location" size={14} color={COLORS.error} />
              <Text style={styles.routeText} numberOfLines={1}>Drop: {booking?.dest_address}</Text>
            </View>
          </View>

          {/* Fare Summary */}
          <View style={styles.fareRow}>
            <View>
              <Text style={styles.fareLabel}>Estimated Fare</Text>
              <Text style={styles.fare}>₹{booking?.final_fare || booking?.fare_estimate || '—'}</Text>
            </View>
            <View>
              <Text style={styles.fareLabel}>Payment</Text>
              <Text style={styles.payMethod}>{booking?.payment_method?.toUpperCase() || 'CASH'}</Text>
            </View>
            <View>
              <Text style={styles.fareLabel}>Distance</Text>
              <Text style={styles.payMethod}>{booking?.distance_km || '—'} km</Text>
            </View>
          </View>

          {/* Cancel Button */}
          {['searching', 'driver_assigned'].includes(booking?.status) && (
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelRide} activeOpacity={0.85}>
              <Ionicons name="close-circle" size={18} color={COLORS.error} />
              <Text style={styles.cancelText}>Cancel Ride</Text>
            </TouchableOpacity>
          )}

          {/* Completed or Cancelled State */}
          {booking?.status === 'completed' && (
            <TouchableOpacity style={styles.bookAgainBtn} onPress={() => navigation.navigate('Home')} activeOpacity={0.85}>
              <Ionicons name="home" size={18} color={COLORS.white} />
              <Text style={styles.bookAgainText}>Back to Home</Text>
            </TouchableOpacity>
          )}

          {booking?.status === 'cancelled' && (
            <TouchableOpacity style={[styles.bookAgainBtn, { backgroundColor: COLORS.primary }]} onPress={() => navigation.navigate('Booking')} activeOpacity={0.85}>
              <Ionicons name="car-sport" size={18} color={COLORS.white} />
              <Text style={styles.bookAgainText}>Book a New Ride</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  back: { width: 38, height: 38, borderRadius: RADIUS.lg, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  loadingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  statusBanner: { borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1.5, alignItems: 'center' },
  statusText: { fontSize: FONTS.sizes.base, fontWeight: '700' },
  driverSectionCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.md, borderWidth: 1, borderColor: '#E2E8F0' },
  driverTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  driverAvatarText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.xl },
  driverName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  driverDetail: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 1 },
  plateNumber: { fontSize: FONTS.sizes.xs, fontWeight: '800', color: COLORS.primary, marginTop: 2, letterSpacing: 0.5 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rating: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.text },
  actionCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  otpBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEF3C7', paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: RADIUS.lg, marginTop: 14, borderWidth: 1, borderColor: '#FDE68A' },
  otpLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otpHeading: { fontSize: FONTS.sizes.xs, fontWeight: '800', color: '#92400E' },
  otpSub: { fontSize: 10, color: '#B45309' },
  otpBadge: { backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.md },
  otpCode: { fontSize: 16, fontWeight: '900', color: COLORS.white, letterSpacing: 2 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.sm },
  ref: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.primary, fontFamily: 'monospace', marginBottom: SPACING.md },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.success },
  routeText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '500' },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.sm },
  fareLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginBottom: 4 },
  fare: { fontSize: FONTS.sizes.xl, fontWeight: '700', color: COLORS.primary },
  payMethod: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, height: 50, borderRadius: RADIUS.xl, borderWidth: 2, borderColor: COLORS.error, backgroundColor: COLORS.errorLight, marginTop: 6 },
  cancelText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.error },
  bookAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, height: 50, borderRadius: RADIUS.xl, backgroundColor: COLORS.primary, ...SHADOW.lg, marginTop: 6 },
  bookAgainText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.white },
})

export default BookingTrackScreen
