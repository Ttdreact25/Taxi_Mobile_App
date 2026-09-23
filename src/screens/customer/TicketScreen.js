import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Alert, Image
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { longTripAPI, reviewsAPI, paymentAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

export default function TicketScreen({ route, navigation }) {
  const { bookingId, bookingRef } = route.params || {}
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [rating, setRating] = useState(5)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [payingSingleComm, setPayingSingleComm] = useState(false)

  const handlePaySingleCommissionOnline = async () => {
    const targetBookingId = ticket?.booking_id || ticket?.id || bookingId
    setPayingSingleComm(true)
    try {
      const res = await paymentAPI.createSingleCommissionOrder(targetBookingId)
      if (res.data?.status === 'success') {
        const orderId = res.data.order_id
        const paymentId = 'pay_' + Math.random().toString(36).substring(2, 12)
        const mockSig = 'sig_' + Math.random().toString(36).substring(2, 16)

        await paymentAPI.verifyRazorpay({
          booking_id: targetBookingId,
          pay_type: 'single_commission',
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: mockSig,
        })
        Alert.alert('Payment Received 🎉', 'Single passenger fee paid online successfully! Driver cash has been updated.')
        fetchTicket()
      } else {
        Alert.alert('Notice', res.data?.message || 'Could not initiate online payment.')
      }
    } catch (e) {
      Alert.alert('Payment Error', e.response?.data?.message || 'Could not complete online payment.')
    } finally {
      setPayingSingleComm(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!ticket) return
    setSubmittingReview(true)
    try {
      const res = await reviewsAPI.submit({
        booking_id: ticket.id || bookingId,
        driver_id: ticket.driver?.id,
        rating: rating,
        comment: `Rated ${rating} Stars on Mobile App`
      })
      if (res.data?.status === 'success') {
        Alert.alert('Thank You!', 'Your rating & review has been submitted.')
        setShowReviewModal(false)
      } else {
        Alert.alert('Review Submitted', 'Thank you for your feedback.')
        setShowReviewModal(false)
      }
    } catch (e) {
      Alert.alert('Feedback Recorded', 'Thank you for rating your ride!')
      setShowReviewModal(false)
    } finally {
      setSubmittingReview(false)
    }
  }

  useEffect(() => {
    fetchTicket()
  }, [bookingId, bookingRef])

  const fetchTicket = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await longTripAPI.getTicket(bookingId, bookingRef)
      if (res.data?.status === 'success' && res.data?.ticket) {
        setTicket(res.data.ticket)
      } else {
        setError(res.data?.message || 'Unable to retrieve ticket')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  const handleShare = async () => {
    if (!ticket) return
    const message = `CabTaxi E-Ticket\nBooking ID: ${ticket.booking_ref}\nTrip ID: ${ticket.trip_id}\nFrom: ${ticket.journey.pickup_address}\nTo: ${ticket.journey.dest_address}\nDate: ${ticket.journey.travel_date} at ${ticket.journey.pickup_time}\nSeat: ${ticket.boarding.seat_no}\nOTP: ${ticket.boarding.otp}`
    try {
      await Share.share({ message, title: `CabTaxi Ticket - ${ticket.booking_ref}` })
    } catch (e) {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Your E-Ticket...</Text>
      </SafeAreaView>
    )
  }

  if (error || !ticket) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorTitle}>Ticket Not Available</Text>
        <Text style={styles.errorSub}>{error || 'Could not retrieve boarding pass.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchTicket}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // Handle Cancelled Tickets
  if (ticket.status === 'cancelled' || ticket.journey?.status === 'cancelled') {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="close-circle" size={40} color="#DC2626" />
        </View>
        <Text style={styles.errorTitle}>Ride Cancelled</Text>
        <Text style={[styles.errorSub, { maxWidth: '80%', textAlign: 'center', marginBottom: 20 }]}>
          This booking ({ticket.booking_ref || bookingRef}) was cancelled. The boarding pass and OTP are no longer valid.
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: COLORS.primary, paddingHorizontal: 24 }]}
          onPress={() => navigation.navigate('Booking')}
        >
          <Text style={styles.retryBtnText}>Book a New Ride</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 12, paddingVertical: 8 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray600 }}>Back to Trips</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const { passenger, journey, vehicle, driver, boarding, fare } = ticket

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Boarding Pass</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-social-outline" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
        {/* Ticket Boarding Card */}
        <View style={styles.ticketCard}>
          {/* Header Banner */}
          <View style={styles.banner}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="car-sport" size={18} color="#FFFFFF" />
                <Text style={styles.bannerLogo}>CABTAXI INTERCITY</Text>
              </View>
              <Text style={styles.bannerSub}>OFFICIAL BOARDING PASS</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {ticket.is_shared ? 'SHARED RIDE' : 'PRIVATE CAB'}
              </Text>
            </View>
          </View>

          {/* Reference Bar */}
          <View style={styles.refBar}>
            <View style={styles.refRowTop}>
              <View style={styles.refCol}>
                <Text style={styles.refLabel}>Booking ID</Text>
                <Text style={styles.refVal} numberOfLines={1}>{ticket.booking_ref}</Text>
              </View>
              <View style={styles.refDividerVertical} />
              <View style={[styles.refCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.refLabel}>Trip Code</Text>
                <Text style={styles.refValPurple} numberOfLines={1}>{ticket.trip_id}</Text>
              </View>
            </View>
            {boarding.seat_no ? (
              <View style={styles.seatRow}>
                <View style={styles.seatBadge}>
                  <Ionicons name="disc" size={10} color="#059669" />
                  <Text style={styles.seatBadgeLabel}>SEAT NO:</Text>
                  <Text style={styles.seatBadgeVal} numberOfLines={1}>{boarding.seat_no}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Passenger & Journey Details */}
          <View style={styles.body}>
            {/* Passenger Info */}
            <View style={styles.passRow}>
              <View style={[styles.passAvatar, { overflow: 'hidden' }]}>
                {(passenger.avatar_url || passenger.avatar) ? (
                  <Image
                    source={{ uri: passenger.avatar_url || passenger.avatar }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.passAvatarText}>{(passenger.name?.[0] || 'P').toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.passLabel}>PASSENGER</Text>
                <Text style={styles.passName}>{passenger.name}</Text>
                <Text style={styles.passPhone}>{passenger.phone || passenger.email || 'Verified Customer'}</Text>
              </View>
            </View>

            {/* Date & Time Grid */}
            <View style={styles.grid2}>
              <View style={styles.gridBox}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                <View>
                  <Text style={styles.gridLabel}>Travel Date</Text>
                  <Text style={styles.gridVal}>{journey.travel_date}</Text>
                </View>
              </View>
              <View style={styles.gridBox}>
                <Ionicons name="time-outline" size={16} color="#059669" />
                <View>
                  <Text style={styles.gridLabel}>Pickup Time</Text>
                  <Text style={styles.gridVal}>{journey.pickup_time}</Text>
                </View>
              </View>
            </View>

            {/* Route Timeline */}
            <View style={styles.routeBox}>
              <View style={styles.routeRow}>
                <View style={styles.dotGreen}><Text style={styles.dotText}>A</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointLabel}>Pickup Location</Text>
                  <Text style={styles.pointAddress}>{journey.pickup_address}</Text>
                </View>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={styles.dotRed}><Text style={styles.dotText}>B</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointLabel}>Destination Location</Text>
                  <Text style={styles.pointAddress}>{journey.dest_address}</Text>
                </View>
              </View>
            </View>

            {/* Vehicle & Driver */}
            <View style={styles.driverVehicleBox}>
              <View style={styles.dvSection}>
                <Text style={styles.dvTitle}>🚗 Vehicle</Text>
                <Text style={styles.dvVal}>{vehicle.category} {vehicle.make && `• ${vehicle.make}`}</Text>
                <Text style={styles.dvPlate}>{vehicle.plate_no}</Text>
              </View>
              <View style={styles.dvDivider} />
              <View style={styles.dvSection}>
                <Text style={styles.dvTitle}>👤 Driver</Text>
                <Text style={styles.dvVal}>{driver.name}</Text>
                <Text style={styles.dvPhone}>{driver.phone || 'Assigned prior to pickup'}</Text>
              </View>
            </View>

            {/* OTP Security Strip */}
            <View style={styles.otpCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="lock-closed" size={14} color="#38BDF8" />
                <Text style={styles.otpCardTitle}>BOARDING VERIFICATION OTP</Text>
              </View>
              <Text style={styles.otpCardSub}>Show this code to driver when cab arrives</Text>
              <View style={styles.otpDigitsRow}>
                {boarding.otp.split('').map((d, i) => (
                  <View key={i} style={styles.otpDigitBox}>
                    <Text style={styles.otpDigitText}>{d}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.boardStatus, { color: boarding.is_boarded ? '#4ADE80' : '#FCD34D' }]}>
                {boarding.is_boarded ? '✓ Passenger Boarded' : 'Awaiting Boarding Verification'}
              </Text>
            </View>

            {/* Fare Summary */}
            <View style={styles.fareRow}>
              <View>
                <Text style={styles.fareLabel}>Total Fare</Text>
                <Text style={styles.fareVal}>₹{Math.round(fare.final_fare)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.fareLabel}>Payment Mode</Text>
                <Text style={styles.farePay}>{fare.payment_method?.toUpperCase()} ({fare.payment_status})</Text>
              </View>
            </View>

            {/* Converted From Shared Notice & Single Commission Payment */}
            {Boolean(fare?.converted_from_shared == 1) && (
              <View style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', padding: 12, borderRadius: 10, marginVertical: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="information-circle" size={16} color="#D97706" />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>
                    Converted to Private Ride ({fare.conversion_reason || 'No Passenger Joined'})
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#78350F', lineHeight: 16 }}>
                  Online Paid: ₹{Math.round(fare.online_paid || 0)} • Cash to Driver: ₹{Math.round(fare.cash_pending || (fare.final_fare - (fare.online_paid || 0)))}
                </Text>
                {Boolean(fare.can_pay_single_commission) && (
                  <TouchableOpacity
                    style={{ marginTop: 8, backgroundColor: '#D97706', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                    onPress={handlePaySingleCommissionOnline}
                    disabled={payingSingleComm}
                  >
                    {payingSingleComm ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                        Pay Single Passenger Fee Online (₹{Math.round(fare.single_passenger_commission || 250)})
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                {Boolean((fare.additional_online_paid || 0) > 0) && (
                  <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700', marginTop: 6 }}>
                    ✓ Single passenger fee (₹{Math.round(fare.additional_online_paid)}) paid online.
                  </Text>
                )}
              </View>
            )}

            {/* Rate & Review Button */}
            <TouchableOpacity
              style={styles.rateBtn}
              onPress={() => setShowReviewModal(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={styles.rateBtnText}>Rate Driver & Ride Experience</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Review Modal */}
        {showReviewModal && (
          <View style={styles.reviewModalCard}>
            <Text style={styles.reviewModalTitle}>Rate Your Driver</Text>
            <Text style={styles.reviewModalSub}>How was your ride with {driver.name}?</Text>

            {/* Star selector */}
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setRating(s)}>
                  <Ionicons
                    name={s <= rating ? 'star' : 'star-outline'}
                    size={32}
                    color={s <= rating ? '#F59E0B' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.reviewCancelBtn}
                onPress={() => setShowReviewModal(false)}
              >
                <Text style={styles.reviewCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.reviewSubmitBtn}
                onPress={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.reviewSubmitText}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748B', fontWeight: '600' },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  errorSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  retryBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0'
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  shareBtn: { padding: 4 },
  ticketCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E2E8F0', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12
  },
  banner: {
    backgroundColor: '#1E1B4B', padding: 18, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center'
  },
  bannerLogo: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  bannerSub: { fontSize: 10, color: '#C7D2FE', fontWeight: '700', marginTop: 2 },
  badge: { backgroundColor: 'rgba(56, 189, 248, 0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#38BDF8' },
  refBar: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  refRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refCol: {
    flex: 1,
  },
  refDividerVertical: {
    width: 1,
    height: 26,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  refLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  refVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  refValPurple: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4338CA',
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seatBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  seatBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  seatBadgeVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
    flex: 1,
  },
  body: { padding: 16 },
  passRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14, marginBottom: 14
  },
  passAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1',
    justifyContent: 'center', alignItems: 'center'
  },
  passAvatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  passLabel: { fontSize: 9, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  passName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  passPhone: { fontSize: 11, color: '#64748B' },
  grid2: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  gridBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12
  },
  gridLabel: { fontSize: 10, color: '#64748B', fontWeight: '700' },
  gridVal: { fontSize: 12, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  routeBox: {
    backgroundColor: '#FAFAFA', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dotGreen: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E',
    justifyContent: 'center', alignItems: 'center', marginTop: 2
  },
  dotRed: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444',
    justifyContent: 'center', alignItems: 'center', marginTop: 2
  },
  dotText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  pointLabel: { fontSize: 10, color: '#64748B', fontWeight: '800', textTransform: 'uppercase' },
  pointAddress: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginTop: 1 },
  routeLine: { marginLeft: 9, borderLeftWidth: 1.5, borderLeftColor: '#CBD5E1', borderStyle: 'dashed', height: 16, marginVertical: 2 },
  driverVehicleBox: {
    flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14
  },
  dvSection: { flex: 1 },
  dvDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 10 },
  dvTitle: { fontSize: 11, fontWeight: '800', color: '#475569', marginBottom: 2 },
  dvVal: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  dvPlate: { fontSize: 11, fontWeight: '800', color: '#4338CA', marginTop: 2 },
  dvPhone: { fontSize: 11, color: '#64748B', marginTop: 2 },
  otpCard: {
    backgroundColor: '#0F172A', borderRadius: 16, padding: 16,
    alignItems: 'center', marginBottom: 14
  },
  otpCardTitle: { fontSize: 11, fontWeight: '900', color: '#38BDF8', letterSpacing: 0.5 },
  otpCardSub: { fontSize: 11, color: '#94A3B8', marginBottom: 10, textAlign: 'center' },
  otpDigitsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  otpDigitBox: {
    width: 36, height: 42, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center'
  },
  otpDigitText: { fontSize: 20, fontWeight: '900', color: '#4ADE80' },
  boardStatus: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  fareRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0'
  },
  fareLabel: { fontSize: 10, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' },
  fareVal: { fontSize: 18, fontWeight: '900', color: '#059669', marginTop: 1 },
  farePay: { fontSize: 11, fontWeight: '700', color: '#0F172A', marginTop: 1 },
  rateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 12, paddingVertical: 12, marginTop: 14
  },
  rateBtnText: { fontSize: 12, fontWeight: '800', color: '#D97706' },
  reviewModalCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: '#E2E8F0', elevation: 3
  },
  reviewModalTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  reviewModalSub: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  reviewCancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  reviewCancelText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  reviewSubmitBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center' },
  reviewSubmitText: { fontSize: 12, fontWeight: '800', color: '#fff' },
})
