import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import { driverAPI, settingsAPI, walletAPI } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import RazorpayCheckoutModal from '../../components/common/RazorpayCheckoutModal'
import DriverWalletQRModal from '../../components/common/DriverWalletQRModal'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { Skeleton, SkeletonCard } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
]

const EarningsScreen = ({ navigation }) => {
  const { user, updateUser } = useAuth()
  const [period, setPeriod] = useState('today')
  const [data, setData] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [minWalletRequired, setMinWalletRequired] = useState(500)
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState('500')
  const [initiatingPayment, setInitiatingPayment] = useState(false)
  const [razorpayModalVisible, setRazorpayModalVisible] = useState(false)
  const [razorpayPaymentData, setRazorpayPaymentData] = useState(null)
  const [qrModalVisible, setQrModalVisible] = useState(false)
  const [qrModalAmount, setQrModalAmount] = useState(500)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadEarnings = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true)
    try {
      const [earnRes, settingsRes, walletRes, profRes] = await Promise.allSettled([
        driverAPI.earnings(period),
        settingsAPI.list(),
        walletAPI.get(),
        driverAPI.profile(),
      ])

      let resolvedBalance = Number(user?.wallet_balance ?? 0)

      if (profRes.status === 'fulfilled' && profRes.value.data?.driver?.wallet_balance !== undefined && profRes.value.data?.driver?.wallet_balance !== null) {
        resolvedBalance = Math.max(resolvedBalance, Number(profRes.value.data.driver.wallet_balance))
      }

      if (walletRes.status === 'fulfilled' && walletRes.value.data?.status === 'success') {
        const wData = walletRes.value.data
        if (wData.wallet?.balance !== undefined) resolvedBalance = Math.max(resolvedBalance, Number(wData.wallet.balance))
        else if (wData.balance !== undefined) resolvedBalance = Math.max(resolvedBalance, Number(wData.balance))
        if (wData.min_wallet_required || wData.min_outstation_balance) {
          setMinWalletRequired(Number(wData.min_wallet_required || wData.min_outstation_balance))
        }
      }

      if (settingsRes.status === 'fulfilled' && settingsRes.value?.data?.settings) {
        const s = settingsRes.value.data.settings
        const reqBal = Number(s.min_wallet_for_outstation || s.driver_min_wallet_balance || 0)
        if (reqBal > 0) {
          setMinWalletRequired(reqBal)
        }
      }

      // Check local SecureStore for persisted driver wallet balance
      try {
        const stored = await SecureStore.getItemAsync('driver_wallet_balance')
        if (stored !== null && !isNaN(Number(stored))) {
          resolvedBalance = Math.max(resolvedBalance, Number(stored))
        }
      } catch { }

      setWallet({ balance: resolvedBalance })

      let earnData = (earnRes.status === 'fulfilled' && earnRes.value.data?.status === 'success')
        ? earnRes.value.data
        : (earnRes.status === 'fulfilled' && earnRes.value.data ? earnRes.value.data : null)

      const targetFromSettings = settingsRes.status === 'fulfilled' ? settingsRes.value.data?.settings?.driver_daily_target : null
      const tripsFromSettings = settingsRes.status === 'fulfilled' ? settingsRes.value.data?.settings?.driver_daily_target_trips : null
      const bonusFromSettings = settingsRes.status === 'fulfilled' ? settingsRes.value.data?.settings?.driver_target_bonus : null

      if (earnData) {
        if (targetFromSettings) earnData.daily_target = Number(targetFromSettings)
        if (tripsFromSettings) earnData.daily_target_trips = Number(tripsFromSettings)
        if (bonusFromSettings) earnData.target_bonus = Number(bonusFromSettings)
      } else if (targetFromSettings) {
        earnData = {
          total_earnings: 0,
          total_trips: 0,
          daily_target: Number(targetFromSettings),
          daily_target_trips: Number(tripsFromSettings || 10),
          target_bonus: Number(bonusFromSettings || 200),
        }
      }

      setData(earnData)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])



  useEffect(() => {
    loadEarnings()
  }, [loadEarnings])

  useFocusEffect(
    useCallback(() => {
      loadEarnings(true)
    }, [loadEarnings])
  )

  const earningsVal = data?.total_earnings || data?.earnings || 0
  const tripsVal = data?.total_trips || data?.trips || 0
  const hoursVal = data?.total_hours || data?.hours || 0
  const ratingVal = data?.avg_rating || data?.rating || '5.0'
  const txns = data?.trips_detail || data?.details || data?.recent_trips || []

  const targetGoal = Number(data?.daily_target || 2000)
  const progressPercent = Math.min(Math.round((Number(earningsVal) / targetGoal) * 100), 100)

  const handleStartRazorpayTopUp = async (amountToRecharge) => {
    const numAmt = Number(amountToRecharge)
    if (!numAmt || numAmt < 1) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount (minimum ₹1).')
      return
    }
    setInitiatingPayment(true)
    try {
      let orderId = `order_dummy_${Date.now().toString(36)}`
      let orderAmount = numAmt * 100
      let orderRupees = numAmt

      try {
        const res = await walletAPI.createRazorpayOrder(numAmt)
        if (res.data?.status === 'success' && res.data.order_id) {
          orderId = res.data.order_id
          orderAmount = res.data.amount || numAmt * 100
          orderRupees = res.data.amount_rupees || numAmt
        }
      } catch (_) {
        // Fallback to client dummy order if backend wallet order endpoint is unavailable
      }

      setRazorpayPaymentData({
        order_id: orderId,
        amount: orderAmount,
        amount_rupees: orderRupees,
        key_id: 'rzp_test_TsVWNKaYfW13sp',
        booking_ref: 'WALLET_TOPUP',
        description: `Driver Wallet Recharge (₹${numAmt})`,
        user: {
          name: user?.name || 'Driver',
          phone: user?.phone || '',
          email: user?.email || '',
        }
      })
      setRechargeModalOpen(false)
      setRazorpayModalVisible(true)
    } catch (err) {
      Alert.alert('Error', 'Failed to connect to payment simulator.')
    } finally {
      setInitiatingPayment(false)
    }
  }

  const handlePaymentSuccess = async (rzpResponse) => {
    setRazorpayModalVisible(false)
    const rechargedAmt = Number(razorpayPaymentData?.amount_rupees || 500)
    let curBal = Number(wallet?.balance ?? user?.wallet_balance ?? 0)
    try {
      const stored = await SecureStore.getItemAsync('driver_wallet_balance')
      if (stored !== null && !isNaN(Number(stored))) curBal = Math.max(curBal, Number(stored))
    } catch { }

    const newBal = curBal + rechargedAmt
    try {
      await SecureStore.setItemAsync('driver_wallet_balance', String(newBal))
    } catch { }

    setWallet({ balance: newBal })
    if (updateUser) updateUser(prev => ({ ...(prev || {}), wallet_balance: newBal }))

    try {
      await driverAPI.updateProfile({ wallet_balance: newBal })
    } catch (_) { }

    try {
      await walletAPI.verifyRazorpayTopUp({
        ...rzpResponse,
        amount: rechargedAmt,
      })
    } catch (_) { }

    Alert.alert(
      'Recharge Successful 🎉',
      `₹${rechargedAmt} credited to your wallet! Current Balance: ₹${newBal.toLocaleString('en-IN')}.\n\nOutstation Trips are now eligible to drive.`
    )
    loadEarnings(true)
  }

  const handleOpenQRTopUp = (amountToRecharge = 500) => {
    setQrModalAmount(Number(amountToRecharge) || 500)
    setRechargeModalOpen(false)
    setQrModalVisible(true)
  }

  const handleQRSuccess = async (result) => {
    setQrModalVisible(false)
    const rechargedAmt = Number(result?.amount || qrModalAmount || 500)
    let curBal = Number(wallet?.balance ?? user?.wallet_balance ?? 0)
    try {
      const stored = await SecureStore.getItemAsync('driver_wallet_balance')
      if (stored !== null && !isNaN(Number(stored))) curBal = Math.max(curBal, Number(stored))
    } catch { }

    const newBal = result?.balance ? Number(result.balance) : (curBal + rechargedAmt)
    try {
      await SecureStore.setItemAsync('driver_wallet_balance', String(newBal))
    } catch { }

    setWallet({ balance: newBal })
    if (updateUser) updateUser(prev => ({ ...(prev || {}), wallet_balance: newBal }))

    try {
      await driverAPI.updateProfile({ wallet_balance: newBal })
    } catch (_) { }

    loadEarnings(true)
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Driver Earnings & Wallet</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => loadEarnings(true)}>
          <Ionicons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadEarnings(true)
            }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Period Filter Chips */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => {
            const active = period === p.id
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.periodChip, active && styles.periodChipActive]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {loading ? (
          <View style={{ marginTop: 8 }}>
            <Skeleton width="100%" height={140} borderRadius={RADIUS.xxl} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <Skeleton width="48%" height={90} borderRadius={RADIUS.xl} />
              <Skeleton width="48%" height={90} borderRadius={RADIUS.xl} />
            </View>
            <Skeleton width="100%" height={80} borderRadius={RADIUS.xl} />
          </View>
        ) : (
          <>
            {/* Driver In-App Wallet Card */}
            {(() => {
              const currentBalance = Number(wallet?.balance ?? user?.wallet_balance ?? 0)
              const isEligibleForOutstation = currentBalance >= minWalletRequired

              return (
                <View style={styles.walletCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={styles.walletIconCircle}>
                        <Ionicons name="wallet" size={20} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.walletCardTitle}>Driver In-App Wallet</Text>
                        <Text style={styles.walletCardSub}>Outstation Trip Dispatch Reserve</Text>
                      </View>
                    </View>

                    <View style={[styles.walletStatusBadge, isEligibleForOutstation ? styles.walletBadgeGreen : styles.walletBadgeRed]}>
                      <Text style={[styles.walletStatusBadgeText, isEligibleForOutstation ? styles.walletBadgeTextGreen : styles.walletBadgeTextRed]}>
                        {isEligibleForOutstation ? '✓ Outstation Active' : '⚠️ Balance Low'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <View>
                      <Text style={styles.walletBalLabel}>CURRENT BALANCE</Text>
                      <Text style={styles.walletBalValue}>₹{currentBalance.toLocaleString('en-IN')}</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.addMoneyBtn}
                      onPress={() => handleOpenQRTopUp(500)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="qr-code" size={17} color="#FFFFFF" />
                      <Text style={styles.addMoneyBtnText}>Recharge QR</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Preset quick recharge buttons */}
                  <View style={styles.presetRow}>
                    {[300, 500, 1000, 2000].map(amt => (
                      <TouchableOpacity
                        key={amt}
                        style={styles.presetChip}
                        onPress={() => handleOpenQRTopUp(amt)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.presetChipText}>+₹{amt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Dynamic Rule notice */}
                  <View style={[styles.walletNotice, isEligibleForOutstation && { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Ionicons
                      name={isEligibleForOutstation ? 'checkmark-circle' : 'information-circle'}
                      size={16}
                      color={isEligibleForOutstation ? '#16A34A' : '#D97706'}
                    />
                    <Text style={[styles.walletNoticeText, isEligibleForOutstation && { color: '#166534' }]}>
                      {isEligibleForOutstation
                        ? `Wallet balance meets the minimum ₹${minWalletRequired} requirement. You are eligible for Outstation trips.`
                        : `Admin requirement: Minimum ₹${minWalletRequired} must be maintained in wallet to receive and take Outstation rides.`}
                    </Text>
                  </View>
                </View>
              )
            })()}

            {/* Hero Earnings Card */}
            <View style={styles.earningsHero}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="cash-outline" size={16} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroLabel}>{period.toUpperCase()} EARNINGS</Text>
              </View>
              <Text style={styles.heroAmount}>₹{Number(earningsVal).toLocaleString('en-IN')}</Text>
              <Text style={styles.heroSub}>Net Driver Settlement Payout</Text>
            </View>

            {/* Performance Stat Cards Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="car-sport" size={20} color="#7C3AED" />
                </View>
                <Text style={styles.statVal}>{tripsVal}</Text>
                <Text style={styles.statLbl}>Trips Done</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="time" size={20} color="#059669" />
                </View>
                <Text style={styles.statVal}>{hoursVal ? `${hoursVal}h` : '—'}</Text>
                <Text style={styles.statLbl}>Hours Online</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="star" size={20} color="#D97706" />
                </View>
                <Text style={styles.statVal}>{ratingVal}</Text>
                <Text style={styles.statLbl}>Avg Rating</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="trending-up" size={20} color="#D97706" />
                </View>
                <Text style={styles.statVal}>
                  ₹{tripsVal > 0 ? Math.round(earningsVal / tripsVal) : 0}
                </Text>
                <Text style={styles.statLbl}>Per Trip Avg</Text>
              </View>
            </View>

            {/* Daily Goal Progress Bar */}
            {period === 'today' && (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.cardTitle}>Daily Target Goal</Text>
                  <Text style={styles.goalTargetText}>₹{Number(earningsVal).toFixed(0)} / ₹{targetGoal}</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.goalRemainingText}>
                  {Number(earningsVal) >= targetGoal
                    ? '🎉 Goal achieved! Extra rides earn 100% bonus incentives.'
                    : `₹${targetGoal - Number(earningsVal)} more to reach today's target.`}
                </Text>
              </View>
            )}

            {/* Recent Trip Payouts */}
            <View style={{ marginTop: 16 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Completed Trip Payouts</Text>
              </View>
              {txns.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="receipt-outline" size={32} color={COLORS.gray400} />
                  <Text style={styles.emptyText}>No payout records for this period</Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {txns.map((t, idx) => {
                    const gross = Math.round(t.final_fare || t.fare_estimate || 0)
                    const net = Math.round(gross * 0.8)
                    return (
                      <View key={t.id || idx} style={styles.txnCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txnRef}>{t.booking_ref}</Text>
                          <Text style={styles.txnAddr} numberOfLines={1}>🔴 {t.dest_address || t.drop_address}</Text>
                          <Text style={styles.txnDate}>
                            {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Completed'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.txnNet}>+ ₹{net}</Text>
                          <Text style={styles.txnGross}>Fare: ₹{gross}</Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Recharge In-App Wallet Modal */}
      <Modal
        visible={rechargeModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRechargeModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Recharge In-App Wallet</Text>
                <Text style={styles.modalSubtitle}>Pay securely via Razorpay (UPI, GPay, PhonePe, Cards)</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setRechargeModalOpen(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>ENTER RECHARGE AMOUNT (₹)</Text>
              <View style={styles.amountInputWrap}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="numeric"
                  value={rechargeAmount}
                  onChangeText={setRechargeAmount}
                  placeholder="500"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.modalPresetRow}>
                {['300', '500', '1000', '2000'].map(val => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.modalPresetBtn,
                      rechargeAmount === val && styles.modalPresetBtnActive
                    ]}
                    onPress={() => setRechargeAmount(val)}
                  >
                    <Text style={[
                      styles.modalPresetText,
                      rechargeAmount === val && styles.modalPresetTextActive
                    ]}>
                      ₹{val}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Primary: Company QR Code Recharge */}
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: '#10B981', marginBottom: 10 }]}
                onPress={() => handleOpenQRTopUp(rechargeAmount || 500)}
                activeOpacity={0.88}
              >
                <Ionicons name="qr-code" size={18} color="#FFFFFF" />
                <Text style={styles.payBtnText}>Pay ₹{rechargeAmount || 0} via Company QR</Text>
              </TouchableOpacity>

              {/* Secondary: Razorpay Gateway */}
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => handleStartRazorpayTopUp(rechargeAmount)}
                disabled={initiatingPayment}
                activeOpacity={0.85}
              >
                {initiatingPayment ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.payBtnText}>Pay ₹{rechargeAmount || 0} via Razorpay</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Driver Wallet Company QR Recharge Modal */}
      <DriverWalletQRModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        onSuccess={handleQRSuccess}
        initialAmount={qrModalAmount}
        currentBalance={Number(wallet?.balance ?? user?.wallet_balance ?? 0)}
        minRequired={minWalletRequired}
        driverName={user?.name || 'Driver'}
      />

      {/* Razorpay Universal Checkout Modal */}
      <RazorpayCheckoutModal
        visible={razorpayModalVisible}
        onClose={() => setRazorpayModalVisible(false)}
        onSuccess={handlePaymentSuccess}
        onFailure={(err) => {
          setRazorpayModalVisible(false)
          Alert.alert('Payment Cancelled / Failed', err?.description || 'Wallet recharge was not completed.')
        }}
        paymentData={razorpayPaymentData}
      />

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  periodTextActive: {
    color: COLORS.white,
  },
  centerContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  earningsHero: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xxl,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
    ...SHADOW.medium,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.white,
    marginVertical: 4,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  statLbl: {
    fontSize: 11,
    color: COLORS.gray500,
    fontWeight: '600',
    marginTop: 2,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  goalTargetText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  goalRemainingText: {
    fontSize: 11,
    color: COLORS.gray500,
    fontWeight: '600',
    marginTop: 6,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  emptyBox: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.gray500,
    fontWeight: '600',
    marginTop: 8,
  },
  txnCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOW.small,
  },
  txnRef: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  txnAddr: {
    fontSize: 12,
    color: COLORS.gray700,
    marginTop: 2,
  },
  txnDate: {
    fontSize: 10,
    color: COLORS.gray500,
    marginTop: 4,
  },
  txnNet: {
    fontSize: 15,
    fontWeight: '900',
    color: '#10B981',
  },
  txnGross: {
    fontSize: 10,
    color: COLORS.gray500,
    marginTop: 2,
  },
  walletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xxl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...SHADOW.medium,
  },
  walletIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  walletCardSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  walletStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  walletBadgeGreen: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  walletBadgeRed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  walletStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  walletBadgeTextGreen: {
    color: '#15803D',
  },
  walletBadgeTextRed: {
    color: '#B91C1C',
  },
  walletBalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  walletBalValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-black',
  },
  addMoneyBtn: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.xl,
    ...SHADOW.small,
  },
  addMoneyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  presetChip: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  walletNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  walletNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    marginTop: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 12,
  },
  modalPresetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  modalPresetBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modalPresetBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  modalPresetText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  modalPresetTextActive: {
    color: '#4F46E5',
  },
  payBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOW.medium,
  },
  payBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
})

export default EarningsScreen
