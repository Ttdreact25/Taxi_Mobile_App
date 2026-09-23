import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Modal,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { driverAPI } from '../../api/api'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const STATUS_CONFIG = {
  driver_assigned: { label: 'Assigned',    color: '#F59E0B', bg: '#FEF3C7' },
  driver_accepted: { label: 'Accepted',    color: '#10B981', bg: '#D1FAE5' },
  waiting_pickup:  { label: 'Waiting',     color: '#6366F1', bg: '#EEF2FF' },
  driver_arrived:  { label: 'Arrived',     color: '#F97316', bg: '#FFEDD5' },
  trip_started:    { label: 'In Progress', color: '#7C3AED', bg: '#EDE9FE' },
  in_progress:     { label: 'In Progress', color: '#7C3AED', bg: '#EDE9FE' },
  completed:       { label: 'Completed',   color: '#10B981', bg: '#ECFDF5' },
  cancelled:       { label: 'Cancelled',   color: '#EF4444', bg: '#FEE2E2' },
}

const FILTERS = [
  { id: 'all',         label: 'All Trips' },
  { id: 'upcoming',    label: 'Upcoming' },
  { id: 'in_progress', label: 'Current' },
  { id: 'completed',   label: 'Completed' },
  { id: 'cancelled',   label: 'Cancelled' },
]

const formatDuration = (totalMinutes) => {
  const m = Math.round(parseFloat(totalMinutes))
  if (isNaN(m) || m <= 0) return null
  const hrs = Math.floor(m / 60)
  const mins = m % 60
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`
  if (hrs > 0) return `${hrs} hr`
  return `${mins} min`
}

const DriverTripsScreen = ({ navigation }) => {
  const [trips, setTrips] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState(null)

  const loadTrips = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true)
    try {
      const res = await driverAPI.myTrips({ status: filter, per_page: 50 })
      const list = res.data?.bookings || res.data?.trips || []
      setTrips(list)
    } catch {
      setTrips([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filter])

  useEffect(() => {
    loadTrips()
  }, [loadTrips])

  useFocusEffect(
    useCallback(() => {
      loadTrips(true)
    }, [loadTrips])
  )

  const renderTripItem = ({ item }) => {
    const statusCfg = STATUS_CONFIG[item.status] || { label: item.status?.replace(/_/g, ' ') || 'Trip', color: COLORS.gray600, bg: '#F1F5F9' }
    const fare = Math.round(item.final_fare || item.fare_estimate || 0)
    const dur = formatDuration(item.duration_minutes)

    return (
      <TouchableOpacity
        style={styles.tripCard}
        onPress={() => setSelectedTrip(item)}
        activeOpacity={0.85}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.bookingRef}>{item.booking_ref}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
              {item.trip_type && (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{item.trip_type.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.fareText}>₹{fare}</Text>
            <Text style={styles.dateText}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
            </Text>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.custRow}>
          <Ionicons name="person-circle-outline" size={16} color={COLORS.gray600} />
          <Text style={styles.custNameText}>{item.customer_name || 'Passenger'}</Text>
          {item.customer_phone ? (
            <Text style={styles.custPhoneText}>· {item.customer_phone}</Text>
          ) : null}
        </View>

        {/* Route */}
        <View style={styles.routeBox}>
          <View style={styles.routeItem}>
            <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.routeAddr} numberOfLines={1}>{item.pickup_address}</Text>
          </View>
          <View style={styles.routeItem}>
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.routeAddr} numberOfLines={1}>{item.dest_address}</Text>
          </View>
        </View>

        {/* Footer info */}
        <View style={styles.cardFooter}>
          <Text style={styles.footerInfoText}>
            {item.distance_km ? `📏 ${item.distance_km} KM` : ''} {dur ? `· ⏱ ${dur}` : ''}
          </Text>
          <Text style={styles.viewDetailText}>View Details →</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trip History</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => loadTrips()}>
          <Ionicons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {FILTERS.map(f => {
            const active = filter === f.id
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.id)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Trip List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading trips...</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.listContent}
          renderItem={renderTripItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadTrips(true)
              }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="car-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Trips Found</Text>
              <Text style={styles.emptySub}>
                {filter === 'all' ? 'You have no trips recorded yet. Go online to accept rides!' : `No ${filter.replace(/_/g, ' ')} trips found.`}
              </Text>
            </View>
          }
        />
      )}

      {/* Trip Detail Modal */}
      <Modal
        visible={Boolean(selectedTrip)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedTrip(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Trip Summary</Text>
              <TouchableOpacity onPress={() => setSelectedTrip(null)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            {selectedTrip && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetRefRow}>
                  <Text style={styles.sheetRefText}>{selectedTrip.booking_ref}</Text>
                  <Text style={styles.sheetFareText}>₹{Math.round(selectedTrip.final_fare || selectedTrip.fare_estimate || 0)}</Text>
                </View>

                {/* Customer Details */}
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>CUSTOMER DETAILS</Text>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Customer Name</Text>
                    <Text style={styles.sheetValue}>{selectedTrip.customer_name || 'Passenger'}</Text>
                  </View>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Phone Number</Text>
                    <Text style={styles.sheetValue}>{selectedTrip.customer_phone || '—'}</Text>
                  </View>
                </View>

                {/* Route Information */}
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>ROUTE DETAILS</Text>
                  <View style={styles.routeBox}>
                    <View style={styles.routeItem}>
                      <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.routeAddr}>{selectedTrip.pickup_address}</Text>
                    </View>
                    <View style={styles.routeItem}>
                      <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.routeAddr}>{selectedTrip.dest_address}</Text>
                    </View>
                  </View>
                </View>

                {/* Payment & Distance */}
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>BILLING & STATS</Text>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Distance</Text>
                    <Text style={styles.sheetValue}>{selectedTrip.distance_km ? `${selectedTrip.distance_km} KM` : '—'}</Text>
                  </View>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Payment Status</Text>
                    <Text style={[styles.sheetValue, { color: selectedTrip.payment_status === 'paid' ? '#10B981' : '#F59E0B', fontWeight: '800' }]}>
                      {selectedTrip.payment_status?.toUpperCase() || 'PENDING'}
                    </Text>
                  </View>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Payment Method</Text>
                    <Text style={[styles.sheetValue, { textTransform: 'uppercase' }]}>{selectedTrip.payment_method || 'CASH'}</Text>
                  </View>
                </View>

                {/* Actions */}
                {selectedTrip.customer_phone ? (
                  <TouchableOpacity
                    style={styles.callRiderBtn}
                    onPress={() => Linking.openURL(`tel:${selectedTrip.customer_phone}`)}
                  >
                    <Ionicons name="call" size={18} color={COLORS.white} />
                    <Text style={styles.callRiderText}>Call Customer</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
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
  filterBar: {
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  filterTextActive: {
    color: COLORS.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bookingRef: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  typeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.gray600,
  },
  fareText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  dateText: {
    fontSize: 10,
    color: COLORS.gray500,
    marginTop: 2,
  },
  custRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  custNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  custPhoneText: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  routeBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: RADIUS.lg,
    gap: 6,
    marginBottom: 10,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  routeAddr: {
    flex: 1,
    fontSize: 12,
    color: COLORS.gray700,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerInfoText: {
    fontSize: 11,
    color: COLORS.gray500,
    fontWeight: '600',
  },
  viewDetailText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetRefText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  sheetFareText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  sheetSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    padding: 12,
    marginBottom: 12,
  },
  sheetSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.gray500,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sheetLabel: {
    fontSize: 12,
    color: COLORS.gray600,
  },
  sheetValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  callRiderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: RADIUS.xl,
    marginTop: 8,
    marginBottom: 20,
  },
  callRiderText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
})

export default DriverTripsScreen
