import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { driverAPI } from '../../api/api'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all',   label: 'All Time' },
]

const EarningsScreen = ({ navigation }) => {
  const [period, setPeriod] = useState('today')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadEarnings = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true)
    try {
      const res = await driverAPI.earnings(period)
      setData(res.data)
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

  const targetGoal = 2000
  const progressPercent = Math.min(Math.round((Number(earningsVal) / targetGoal) * 100), 100)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Driver Earnings</Text>
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
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Calculating earnings...</Text>
          </View>
        ) : (
          <>
            {/* Hero Earnings Card */}
            <View style={styles.earningsHero}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="wallet-outline" size={16} color="rgba(255,255,255,0.85)" />
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
                <View style={[styles.statIconWrap, { backgroundColor: '#DBEAFE' }]}>
                  <Ionicons name="trending-up" size={20} color="#2563EB" />
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
})

export default EarningsScreen
