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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { paymentAPI } from '../../api/api'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const DriverPaymentScreen = ({ navigation, route }) => {
  const { bookingId } = route.params || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [driverQR, setDriverQR] = useState(null)
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
      } else {
        Alert.alert('Error', res.data?.message || 'Could not confirm QR payment.')
      }
    } catch {
      Alert.alert('Error', 'Payment confirmation failed.')
    } finally {
      setConfirming(false)
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
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Trip Fare</Text>
            <Text style={styles.detailValue}>₹{totalFare}</Text>
          </View>
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
          onPress={() => navigation.navigate('DashboardHome')}
        >
          <Text style={styles.doneBtnText}>
            {isPaid ? 'Done & Return to Dashboard' : 'Skip / Return to Dashboard'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#EEF2FF',
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
})

export default DriverPaymentScreen
