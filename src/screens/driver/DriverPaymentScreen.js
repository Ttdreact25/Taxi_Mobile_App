import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  TextInput,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { paymentAPI, reviewsAPI, resolveAssetUrl, getInvoiceUrl } from '../../api/api'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const DriverPaymentScreen = ({ navigation, route }) => {
  const { bookingId } = route.params || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [driverQR, setDriverQR] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [customerRating, setCustomerRating] = useState(5)
  const [customerComment, setCustomerComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [hasReviewedCustomer, setHasReviewedCustomer] = useState(false)
  const pollRef = useRef(null)

  const loadStatus = useCallback(async (silent = false) => {
    if (!bookingId) return
    if (!silent) setLoading(true)
    try {
      const res = await paymentAPI.getStatus(bookingId)
      if (res.data?.status === 'success') {
        setData(res.data)
        if (res.data.booking?.payment_status === 'paid') {
          setConfirmed(true)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }
    } catch {}
    finally {
      if (!silent) setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    loadStatus()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadStatus])

  // Poll for QR/Online payments
  useEffect(() => {
    if (data?.booking?.payment_method !== 'cash' && data?.booking?.payment_status === 'pending') {
      pollRef.current = setInterval(() => loadStatus(true), 4000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [data?.booking?.payment_method, data?.booking?.payment_status, loadStatus])

  const handleConfirmCash = async () => {
    setConfirming(true)
    try {
      const res = await paymentAPI.confirmCash(bookingId)
      if (res.data?.status === 'success') {
        setConfirmed(true)
        Alert.alert('Payment Received 🎉', 'Cash payment confirmed! Earnings recorded in your wallet.')
        loadStatus(true)
        setTimeout(() => {
          setShowReviewModal(true)
        }, 1200)
      } else {
        Alert.alert('Error', res.data?.message || 'Could not confirm cash payment.')
      }
    } catch {
      Alert.alert('Error', 'Payment confirmation failed. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const handleConfirmQR = async () => {
    setConfirming(true)
    try {
      const res = await paymentAPI.confirmQR(bookingId)
      if (res.data?.status === 'success') {
        setConfirmed(true)
        Alert.alert('Payment Received 🎉', 'UPI QR payment confirmed! Earnings recorded.')
        loadStatus(true)
        setTimeout(() => {
          setShowReviewModal(true)
        }, 1200)
      } else {
        Alert.alert('Error', res.data?.message || 'Could not confirm QR payment.')
      }
    } catch {
      Alert.alert('Error', 'Payment confirmation failed.')
    } finally {
      setConfirming(false)
    }
  }

  const handleSubmitCustomerReview = async () => {
    const booking = data?.booking
    if (!booking) return
    setSubmittingReview(true)
    try {
      const res = await reviewsAPI.submit({
        booking_id: booking.id,
        reviewee_id: booking.customer_id,
        role: 'customer',
        rating: customerRating,
        comment: customerComment.trim() || undefined,
      })
      if (res.data?.status === 'success') {
        setHasReviewedCustomer(true)
        setShowReviewModal(false)
        Alert.alert(
          'Feedback Submitted ⭐',
          `Thank you for rating ${booking.customer_name || 'the passenger'}!`,
          [{ text: 'OK', onPress: () => navigation.navigate('DashboardHome') }]
        )
      } else {
        setShowReviewModal(false)
        navigation.navigate('DashboardHome')
      }
    } catch {
      setShowReviewModal(false)
      navigation.navigate('DashboardHome')
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading payment details...</Text>
      </SafeAreaView>
    )
  }

  if (!data?.booking) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={48} color={COLORS.error} />
        <Text style={styles.errorTitle}>Booking Not Found</Text>
        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('DashboardHome')}>
          <Text style={styles.homeBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const { booking, fare_breakdown: fare } = data
  const isPaid = (booking.payment_status === 'paid' && booking.collection_status === 'collected') || confirmed
  const method = booking.payment_method || 'cash'
  
  const totalFare = Math.round(Number(booking.final_fare || booking.fare_estimate || fare?.total || 0))
  const discountAmount = Math.round(Number(booking.discount_amount || 0))
  const onlinePaid = Math.round(Number(booking.online_paid || booking.commission_amount || 0))
  const remainingCash = Math.max(0, Math.round(Number(booking.cash_pending ?? (totalFare - onlinePaid))))
  const driverNetEarnings = remainingCash

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Collect Cash Payment</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Success Banner if Paid */}
        {isPaid ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={44} color="#10B981" />
            <Text style={styles.successTitle}>Payment Completed!</Text>
            <Text style={styles.successSub}>
              Cash of ₹{remainingCash} collected. Total fare ₹{totalFare} settled.
            </Text>
            <View style={styles.earningsPill}>
              <Text style={styles.earningsPillText}>Driver Cash Retained: ₹{remainingCash}</Text>
            </View>
          </View>
        ) : (
          /* Amount to Collect Hero */
          <View style={styles.amountHero}>
            <Text style={styles.amountLabel}>REMAINING CASH TO COLLECT</Text>
            <Text style={styles.amountValue}>₹{remainingCash}</Text>
            <View style={[styles.methodBadge, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="cash-outline" size={14} color="#D97706" />
              <Text style={[styles.methodBadgeText, { color: '#B45309', fontWeight: '800' }]}>
                COLLECT FROM CUSTOMER IN CASH
              </Text>
            </View>
          </View>
        )}

        {/* Customer & Trip Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>TRIP INFORMATION</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Booking Ref</Text>
            <Text style={styles.detailValueMono}>{booking.booking_ref}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer Name</Text>
            <Text style={styles.detailValue}>{booking.customer_name || 'Passenger'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer Phone</Text>
            <Text style={styles.detailValue}>{booking.customer_phone || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Advance Payment</Text>
            <Text style={[styles.detailValue, { color: '#10B981', fontWeight: '700' }]}>
              ₹{onlinePaid} Paid Online ✓
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Collection Status</Text>
            <Text style={[styles.detailValue, { color: isPaid ? '#10B981' : '#F59E0B', fontWeight: '800' }]}>
              {isPaid ? 'COLLECTED ✓' : 'CASH PENDING'}
            </Text>
          </View>
        </View>

        {/* Fare Breakdown Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>PAYMENT & COMMISSION BREAKDOWN</Text>
          {Boolean(booking.trip_sub_type === 'hourly' || Number(booking.package_hours) > 0) ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Hourly Package ({booking.package_hours || 1} hrs)</Text>
                <Text style={styles.detailValue}>₹{Math.round(Number(booking.base_package_fare || (booking.package_hours * (booking.hourly_rate || 250))))}</Text>
              </View>
              {Number(booking.extra_mins) > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Overtime ({booking.extra_mins} mins @ ₹{booking.extra_min_rate || 2}/min)</Text>
                  <Text style={[styles.detailValue, { color: '#D97706', fontWeight: '700' }]}>+ ₹{Math.round(Number(booking.extra_min_fare || (booking.extra_mins * (booking.extra_min_rate || 2))))}</Text>
                </View>
              )}
              {Number(booking.extra_km) > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Extra Distance ({Number(booking.extra_km).toFixed(1)} km @ ₹{booking.extra_km_rate || 15}/km)</Text>
                  <Text style={[styles.detailValue, { color: '#D97706', fontWeight: '700' }]}>+ ₹{Math.round(Number(booking.extra_km_fare || (booking.extra_km * (booking.extra_km_rate || 15))))}</Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { fontWeight: '700' }]}>Total Trip Fare</Text>
                <Text style={[styles.detailValue, { fontWeight: '800' }]}>₹{totalFare}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  Booked Route Fare ({Number(booking.original_distance_km || (Number(booking.extra_km) > 0 ? (Number(booking.distance_km) - Number(booking.extra_km)) : booking.distance_km) || 0).toFixed(1)} km)
                </Text>
                <Text style={styles.detailValue}>
                  ₹{Math.max(0, Math.round(totalFare - Number(booking.extra_km_fare || 0) - Number(booking.pickup_charge || 0) + discountAmount))}
                </Text>
              </View>
              {Number(booking.extra_km) > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    Extra Route Distance ({Number(booking.extra_km).toFixed(1)} km @ ₹{booking.extra_km_rate || booking.per_km_rate || 15}/km)
                  </Text>
                  <Text style={[styles.detailValue, { color: '#D97706', fontWeight: '700' }]}>
                    + ₹{Math.round(Number(booking.extra_km_fare))}
                  </Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { fontWeight: '700' }]}>Total Trip Fare</Text>
                <Text style={[styles.detailValue, { fontWeight: '800' }]}>₹{totalFare}</Text>
              </View>
            </>
          )}
          {Number(booking.pickup_charge) > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                Pickup Charge (Extra {booking.extra_pickup_distance_km || ((Number(booking.pickup_distance_km) > 2) ? (Number(booking.pickup_distance_km) - 2).toFixed(1) : 0)} km)
              </Text>
              <Text style={[styles.detailValue, { color: '#7C3AED', fontWeight: '700' }]}>
                + ₹{Math.round(Number(booking.pickup_charge))}
              </Text>
            </View>
          )}
          {Number(booking.waiting_charge) > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                Waiting Charge ({booking.waiting_mins || 0} mins)
              </Text>
              <Text style={[styles.detailValue, { color: '#D97706', fontWeight: '700' }]}>
                + ₹{Math.round(Number(booking.waiting_charge))}
              </Text>
            </View>
          )}
          {discountAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Coupon Discount</Text>
              <Text style={[styles.detailValue, { color: '#10B981' }]}>- ₹{discountAmount}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Already Paid Online (Advance)</Text>
            <Text style={[styles.detailValue, { color: COLORS.primary, fontWeight: '700' }]}>
              - ₹{onlinePaid}
            </Text>
          </View>
          <View style={[styles.detailRow, styles.totalRow, { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8 }]}>
            <Text style={[styles.totalLabel, { color: '#D97706', fontWeight: '800' }]}>Remaining Cash to Collect</Text>
            <Text style={[styles.totalValue, { color: '#D97706', fontSize: 18, fontWeight: '900' }]}>₹{remainingCash}</Text>
          </View>

          {/* 🖨️ View & Print Official Trip Tax Invoice */}
          <TouchableOpacity
            style={{
              backgroundColor: '#0F172A',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 11,
              borderRadius: 10,
              marginTop: 10,
            }}
            onPress={async () => {
              if (!bookingId) return
              try {
                const invoiceUrl = await getInvoiceUrl(bookingId, true)
                Linking.openURL(invoiceUrl)
              } catch {
                Alert.alert('Error', 'Unable to open invoice.')
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt-outline" size={17} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>
              View & Print Official Tax Invoice (PDF)
            </Text>
          </TouchableOpacity>
          {Boolean(booking.converted_from_shared == 1) && (
            <View style={{ backgroundColor: '#FEF3C7', padding: 8, borderRadius: 6, marginTop: 8 }}>
              <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700' }}>
                Converted from Shared Ride: {booking.conversion_reason || 'No Passenger Joined'}
              </Text>
              <Text style={{ fontSize: 10, color: '#B45309', marginTop: 2 }}>
                Customer paid ₹{onlinePaid} online. Collect exactly ₹{remainingCash} in cash.
              </Text>
            </View>
          )}
          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 8, fontStyle: 'italic' }}>
            Note: Admin commission of ₹{onlinePaid} was already collected online. You keep 100% of this ₹{remainingCash} cash.
          </Text>
        </View>

        {/* Payment Action Buttons */}
        {!isPaid && (
          <View style={{ gap: 12, marginTop: 10 }}>
            {method === 'qr' ? (
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#0891B2' }, confirming && { opacity: 0.7 }]}
                onPress={handleConfirmQR}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="qr-code" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                    <Text style={styles.confirmBtnText}>Confirm QR Payment Received (₹{remainingCash})</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#10B981' }, confirming && { opacity: 0.7 }]}
                onPress={handleConfirmCash}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="cash" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                    <Text style={styles.confirmBtnText}>Confirm Cash Received (₹{remainingCash})</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Finish / Return to Dashboard Button */}
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => {
            if (!hasReviewedCustomer && isPaid) {
              setShowReviewModal(true)
            } else {
              navigation.navigate('DashboardHome')
            }
          }}
        >
          <Text style={styles.doneBtnText}>
            {isPaid ? (hasReviewedCustomer ? 'Done & Return to Dashboard' : 'Rate Rider & Finish →') : 'Skip / Return to Dashboard'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Driver Reviews Customer Modal ── */}
      <Modal
        visible={showReviewModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowReviewModal(false)
          navigation.navigate('DashboardHome')
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reviewModalCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.starBadgeIcon}>
                <Ionicons name="star" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.reviewModalTitle}>Rate Your Passenger</Text>
              <Text style={styles.reviewModalSub}>Help build a trusted CityOneTaxi community</Text>
            </View>

            {/* Customer Snapshot */}
            <View style={styles.passengerSnapshot}>
              <View style={styles.passengerAvatar}>
                {booking?.customer_avatar ? (
                  <Image source={{ uri: resolveAssetUrl(booking.customer_avatar) }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarLetter}>
                    {((booking?.customer_name || 'P')?.[0] || 'P').toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.passengerName}>{booking?.customer_name || 'Passenger'}</Text>
                <Text style={styles.passengerBookingRef}>Trip #{booking?.booking_ref || ''}</Text>
              </View>
            </View>

            {/* Star Selector */}
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setCustomerRating(star)}
                  style={{ padding: 6 }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={star <= customerRating ? 'star' : 'star-outline'}
                    size={38}
                    color="#F59E0B"
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingDescriptor}>
              {customerRating === 5 ? '⭐⭐⭐⭐⭐ Excellent Passenger' :
               customerRating === 4 ? '⭐⭐⭐⭐ Good Passenger' :
               customerRating === 3 ? '⭐⭐⭐ Average Experience' :
               customerRating === 2 ? '⭐⭐ Below Expectations' : '⭐ Poor Experience'}
            </Text>

            {/* Feedback TextInput */}
            <View style={{ width: '100%', marginTop: 12, marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Feedback & Notes (Optional):</Text>
              <TextInput
                style={styles.reviewInput}
                placeholder="E.g., On-time at pickup, polite behavior, smooth drop-off..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={customerComment}
                onChangeText={setCustomerComment}
              />
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={[styles.submitReviewBtn, submittingReview && { opacity: 0.7 }]}
              onPress={handleSubmitCustomerReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#0F172A" style={{ marginRight: 6 }} />
                  <Text style={styles.submitReviewBtnText}>Submit Passenger Rating ⭐</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipReviewBtn}
              onPress={() => {
                setShowReviewModal(false)
                navigation.navigate('DashboardHome')
              }}
              disabled={submittingReview}
            >
              <Text style={styles.skipReviewBtnText}>Skip for Now</Text>
            </TouchableOpacity>
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 12,
  },
  homeBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  homeBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...SHADOW.small,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  amountHero: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...SHADOW.small,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gray500,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: RADIUS.xxl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 8,
    marginBottom: 4,
  },
  successSub: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '600',
    marginBottom: 12,
  },
  earningsPill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  earningsPillText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    ...SHADOW.small,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gray500,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  detailValueMono: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  totalRow: {
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    marginTop: 6,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#10B981',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: RADIUS.xl,
    ...SHADOW.small,
  },
  confirmBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '800',
  },
  onlinePendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: RADIUS.lg,
  },
  onlinePendingText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  doneBtnText: {
    fontSize: 14,
    color: COLORS.gray600,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  reviewModalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    alignItems: 'center',
    ...SHADOW.large,
  },
  reviewHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  starBadgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  reviewModalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
  },
  reviewModalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  passengerSnapshot: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  passengerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarLetter: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.white,
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  passengerBookingRef: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  ratingDescriptor: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    marginTop: 4,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  reviewInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  submitReviewBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC700',
    paddingVertical: 14,
    borderRadius: 14,
    ...SHADOW.small,
  },
  submitReviewBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  skipReviewBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  skipReviewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
})

export default DriverPaymentScreen
