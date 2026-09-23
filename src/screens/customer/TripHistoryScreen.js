import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { bookingsAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const STATUS_CONFIG = {
  scheduled:        { label: 'Scheduled',          color: '#7C3AED', bg: '#EDE9FE' },
  waiting_driver:   { label: 'Waiting for Driver', color: '#2563EB', bg: '#DBEAFE' },
  searching:        { label: 'Searching Driver',   color: '#2563EB', bg: '#DBEAFE' },
  driver_assigned:  { label: 'Driver Assigned',    color: '#D97706', bg: '#FEF3C7' },
  driver_arrived:   { label: 'On the Way',         color: '#EA580C', bg: '#FFEDD5' },
  trip_started:     { label: 'Trip Started',       color: '#4F46E5', bg: '#E0E7FF' },
  in_progress:      { label: 'Trip Started',       color: '#4F46E5', bg: '#E0E7FF' },
  completed:        { label: 'Completed',          color: '#16A34A', bg: '#DCFCE7' },
  cancelled:        { label: 'Cancelled',          color: '#DC2626', bg: '#FEE2E2' },
}

export default function TripHistoryScreen({ navigation }) {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async (refresh = false) => {
    if (!refresh) setLoading(true)
    try {
      const res = await bookingsAPI.myTrips({ per_page: 50 })
      setTrips(res.data?.bookings || [])
    } catch {
      setTrips([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load(true) }

  // Extract Upcoming Scheduled Trips (Strictly Exclude Cancelled & Completed)
  const upcomingTrips = trips.filter(t =>
    t.status !== 'cancelled' &&
    t.status !== 'completed' &&
    (
      ['scheduled', 'waiting_driver'].includes(t.status) ||
      (t.scheduled_date && t.scheduled_date >= new Date().toISOString().split('T')[0])
    )
  )

  const filteredTrips = trips.filter(t => {
    if (filter === 'all') return true
    if (filter === 'scheduled') return t.status === 'scheduled' && t.status !== 'cancelled'
    if (filter === 'in_progress') return ['searching', 'driver_assigned', 'driver_arrived', 'trip_started', 'in_progress'].includes(t.status)
    return t.status === filter
  })

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <TouchableOpacity onPress={() => navigation.navigate('LongTrip')} style={styles.scheduleHeaderBtn}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.scheduleHeaderBtnText}>+ Schedule Ride</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* ── UPCOMING TRIPS SECTION ─────────────────────────────── */}
        {upcomingTrips.length > 0 && (
          <View style={{ marginBottom: 18 }}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Upcoming Scheduled Trips</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{upcomingTrips.length} Active</Text>
              </View>
            </View>

            {upcomingTrips.map(trip => {
              const conf = STATUS_CONFIG[trip.status] || { label: trip.status, color: '#64748B', bg: '#F1F5F9' }
              return (
                <View key={trip.id} style={styles.upcomingCard}>
                  <View style={styles.upcomingTop}>
                    <Text style={styles.upcomingRef}>{trip.booking_ref}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: conf.bg }]}>
                      <Text style={[styles.statusText, { color: conf.color }]}>{conf.label}</Text>
                    </View>
                  </View>

                  <View style={styles.upcomingRouteBox}>
                    <View style={styles.routeRow}>
                      <View style={styles.dotGreen} />
                      <Text style={styles.routeText} numberOfLines={1}>{trip.pickup_address}</Text>
                    </View>
                    <View style={styles.routeRow}>
                      <Ionicons name="location" size={12} color={COLORS.primary} />
                      <Text style={styles.routeText} numberOfLines={1}>{trip.dest_address}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
                      <Text style={styles.metaText}>{trip.scheduled_date || 'Today'}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color={COLORS.primary} />
                      <Text style={styles.metaText}>{trip.scheduled_time?.substring(0, 5) || '08:30'}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="car-outline" size={13} color={COLORS.primary} />
                      <Text style={styles.metaText}>{trip.vehicle_type_name || 'Vehicle'}</Text>
                    </View>
                    <Text style={styles.fareHighlight}>₹{Math.round(trip.final_fare || trip.fare_estimate || 0)}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1, backgroundColor: '#EEF2FF', paddingVertical: 8, borderRadius: 8,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#C7D2FE'
                      }}
                      onPress={() => navigation.navigate('Ticket', { bookingId: trip.id, bookingRef: trip.booking_ref })}
                    >
                      <Ionicons name="receipt-outline" size={14} color="#4338CA" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#4338CA' }}>View Ticket & OTP</Text>
                    </TouchableOpacity>

                    {['driver_assigned', 'driver_arrived', 'trip_started', 'in_progress'].includes(trip.status) && (
                      <TouchableOpacity
                        style={[styles.trackActionBtn, { flex: 1, marginTop: 0 }]}
                        onPress={() => navigation.navigate('BookingTrack', { bookingId: trip.id })}
                      >
                        <Ionicons name="navigate" size={14} color="#FFFFFF" />
                        <Text style={styles.trackActionBtnText}>Track Live</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* Filter Chips */}
        <View style={styles.filtersRow}>
          {['all', 'scheduled', 'completed', 'cancelled'].map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* All / Past Trips List */}
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : filteredTrips.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="car-outline" size={44} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No trips found</Text>
            <Text style={styles.emptySub}>Your ride history will appear here.</Text>
          </View>
        ) : (
          filteredTrips.map(item => {
            const conf = STATUS_CONFIG[item.status] || { label: item.status, color: '#64748B', bg: '#F1F5F9' }
            return (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.upcomingTop}>
                  <Text style={styles.historyRef}>{item.booking_ref}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: conf.bg }]}>
                    <Text style={[styles.statusText, { color: conf.color }]}>{conf.label}</Text>
                  </View>
                </View>

                <View style={{ marginVertical: 6, gap: 4 }}>
                  <View style={styles.routeRow}>
                    <View style={styles.dotGreen} />
                    <Text style={styles.historyRouteText} numberOfLines={1}>{item.pickup_address}</Text>
                  </View>
                  <View style={styles.routeRow}>
                    <Ionicons name="location" size={12} color={COLORS.primary} />
                    <Text style={styles.historyRouteText} numberOfLines={1}>{item.dest_address}</Text>
                  </View>
                </View>

                <View style={styles.historyBottom}>
                  <Text style={styles.historyDate}>{item.scheduled_date || item.created_at?.substring(0, 10)}</Text>
                  <Text style={styles.historyFare}>₹{Math.round(item.final_fare || item.fare_estimate || 0)}</Text>
                </View>

                {item.status === 'cancelled' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="close-circle" size={16} color="#DC2626" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>Cancelled Ride</Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 }}
                      onPress={() => navigation.navigate('Booking')}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Book New</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#F8FAFC', paddingVertical: 8, borderRadius: 8, marginTop: 8,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E8F0'
                    }}
                    onPress={() => navigation.navigate('Ticket', { bookingId: item.id, bookingRef: item.booking_ref })}
                  >
                    <Ionicons name="receipt-outline" size={14} color="#334155" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>View Ticket & Details</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0'
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  scheduleHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8
  },
  scheduleHeaderBtnText: { fontSize: 11.5, fontWeight: '800', color: COLORS.primary },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  countBadge: { backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  upcomingCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: '#DDD6FE', marginBottom: 10,
    shadowColor: COLORS.primary, shadowOpacity: 0.06, shadowOffset: { width: 0, height: 4 }, elevation: 2
  },
  upcomingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  upcomingRef: { fontSize: 12, fontWeight: '800', color: COLORS.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  upcomingRouteBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 10, gap: 6 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotGreen: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' },
  routeText: { fontSize: 12, fontWeight: '700', color: '#0F172A', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  fareHighlight: { fontSize: 14, fontWeight: '900', color: '#10B981' },
  trackActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, marginTop: 10
  },
  trackActionBtnText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },
  filtersRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 11.5, fontWeight: '700', color: '#64748B' },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  historyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8
  },
  historyRef: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  historyRouteText: { fontSize: 11.5, color: '#334155', flex: 1 },
  historyBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  historyDate: { fontSize: 11, color: '#94A3B8' },
  historyFare: { fontSize: 13, fontWeight: '900', color: '#10B981' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 10 },
  emptySub: { fontSize: 12, color: '#64748B', marginTop: 2 }
})
