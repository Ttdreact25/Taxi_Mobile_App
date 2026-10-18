import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Alert,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { notifAPI, reviewsAPI, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { SkeletonList } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'

const FILTERS = [
  { id: 'all',       label: 'All Updates' },
  { id: 'bookings',  label: '🚖 Bookings' },
  { id: 'completed', label: '✅ Completed Trips' },
  { id: 'reviews',   label: '⭐ Customer Reviews' },
]

const DriverNotifScreen = ({ navigation }) => {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadNotifications = useCallback(async (isPull = false) => {
    if (!isPull) setLoading(true)
    try {
      const [notifRes, revRes] = await Promise.allSettled([
        notifAPI.list(false),
        user?.id ? reviewsAPI.listForUser(user.id, 'driver') : Promise.resolve({ data: { reviews: [] } })
      ])

      const rawNotifs = notifRes.status === 'fulfilled'
        ? (notifRes.value.data?.notifications || notifRes.value.data?.data?.notifications || notifRes.value.data?.data || [])
        : []

      // Filter strictly: Keep ONLY 1. Bookings, 2. Completions, and 3. Customer Reviews
      const relevantNotifs = rawNotifs.filter(n => {
        const text = `${n.title || ''} ${n.body || ''} ${n.type || ''}`.toLowerCase()
        // Strictly exclude non-trip system events
        if (text.includes('otp') || text.includes('kyc') || text.includes('registration') || text.includes('broadcast') || text.includes('support') || text.includes('payout') || text.includes('cancel')) {
          return false
        }
        const isBooking = text.includes('booking') || text.includes('assign') || text.includes('pickup alert') || text.includes('dispatch') || text.includes('new ride')
        const isCompleted = text.includes('complete') || (n.type === 'payment' && !text.includes('recharge') && !text.includes('topup'))
        const isReview = text.includes('review') || text.includes('rated') || text.includes('star')
        return isBooking || isCompleted || isReview
      })

      // Normalize reviews from reviewsAPI as rich review items
      const rawReviews = revRes.status === 'fulfilled' ? (revRes.value.data?.reviews || []) : []
      const reviewCards = rawReviews.map(r => ({
        id: `rev_${r.id}`,
        is_review: true,
        rating: Number(r.rating || 5),
        comment: r.comment || '',
        customer_name: r.reviewer_name || 'Passenger',
        customer_avatar: r.reviewer_avatar || null,
        booking_ref: r.booking_ref || `Trip #${r.booking_id}`,
        pickup_address: r.pickup_address,
        dest_address: r.dest_address,
        created_at: r.created_at,
        title: `⭐ ${r.rating}/5 Customer Rating`,
        body: r.comment || 'Passenger gave you a 5-star rating for this ride!',
        type: 'review',
        is_read: 1,
      }))

      // Combine notifications & reviews, avoiding duplicate review IDs if backend already created notif
      const combined = [...relevantNotifs, ...reviewCards]
      // Sort newest first
      combined.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

      setNotifications(combined)
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useFocusEffect(
    useCallback(() => {
      loadNotifications(true)
    }, [loadNotifications])
  )

  const handleMarkRead = async (id) => {
    if (String(id).startsWith('rev_')) return
    try {
      await notifAPI.markRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
    } catch {}
  }

  const handleMarkAllRead = async () => {
    try {
      await notifAPI.markRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
      Alert.alert('Done', 'All notifications marked as read.')
    } catch {}
  }

  const filteredNotifs = notifications.filter(n => {
    const text = `${n.title || ''} ${n.body || ''} ${n.type || ''}`.toLowerCase()
    if (filter === 'bookings') {
      return !n.is_review && (text.includes('booking') || text.includes('assign') || text.includes('ride') || text.includes('pickup alert') || text.includes('dispatch')) && !text.includes('complete')
    }
    if (filter === 'completed') {
      return !n.is_review && (text.includes('complete') || (n.type === 'payment' && !text.includes('recharge')))
    }
    if (filter === 'reviews') {
      return n.is_review || text.includes('review') || text.includes('rated') || text.includes('star')
    }
    return true
  })

  const renderItem = ({ item }) => {
    // 1. Customer Review Card Display
    if (item.is_review) {
      const stars = Math.min(5, Math.max(1, Math.round(item.rating || 5)))
      return (
        <View style={styles.reviewCard}>
          <View style={styles.reviewHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.reviewAvatarWrap}>
                {resolveAssetUrl(item.customer_avatar) ? (
                  <Image source={{ uri: resolveAssetUrl(item.customer_avatar) }} style={styles.reviewAvatarImg} />
                ) : (
                  <Text style={styles.reviewAvatarText}>{(item.customer_name?.[0] || 'C').toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewCustName} numberOfLines={1}>{item.customer_name}</Text>
                <Text style={styles.reviewRefText}>{item.booking_ref}</Text>
              </View>
            </View>
            <View style={styles.starBadgePill}>
              <Ionicons name="star" size={13} color="#F59E0B" />
              <Text style={styles.starBadgeText}>{item.rating.toFixed(1)}</Text>
            </View>
          </View>

          {item.comment ? (
            <View style={styles.reviewCommentBox}>
              <Text style={styles.reviewCommentText}>"{item.comment}"</Text>
            </View>
          ) : (
            <View style={styles.reviewCommentBox}>
              <Text style={[styles.reviewCommentText, { fontStyle: 'italic', color: '#94A3B8' }]}>Rated {item.rating} stars for a smooth journey</Text>
            </View>
          )}

          <View style={styles.reviewFooterRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <Ionicons
                  key={s}
                  name={s <= stars ? "star" : "star-outline"}
                  size={14}
                  color={s <= stars ? "#F59E0B" : "#CBD5E1"}
                />
              ))}
            </View>
            <Text style={styles.timeText}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'}
            </Text>
          </View>
        </View>
      )
    }

    // 2. Regular Booking or Completion Notification Card
    const isUnread = item.is_read == 0 || !item.is_read
    const text = `${item.title || ''} ${item.body || ''}`.toLowerCase()
    const isReviewNotif = text.includes('review') || text.includes('rated') || text.includes('star')
    const isCompleted = text.includes('complete')

    let iconCfg = { icon: 'car-sport', color: '#2563EB', bg: '#DBEAFE' }
    if (isReviewNotif) {
      iconCfg = { icon: 'star', color: '#F59E0B', bg: '#FEF3C7' }
    } else if (isCompleted) {
      iconCfg = { icon: 'checkmark-circle', color: '#16A34A', bg: '#DCFCE7' }
    }

    return (
      <TouchableOpacity
        style={[styles.notifCard, isUnread ? styles.notifCardUnread : styles.notifCardRead]}
        onPress={() => handleMarkRead(item.id)}
        activeOpacity={0.8}
      >
        <View style={[styles.iconWrap, { backgroundColor: iconCfg.bg }]}>
          <Ionicons name={iconCfg.icon} size={20} color={iconCfg.color} />
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.notifTitle, isUnread && styles.notifTitleBold]}>
              {item.title || 'Trip Dispatch Alert'}
            </Text>
            <Text style={styles.timeText}>
              {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
            </Text>
          </View>
          <Text style={styles.notifMessage} numberOfLines={3}>{item.body || item.message}</Text>
        </View>

        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Notifications</Text>
        <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
          <Ionicons name="checkmark-done" size={18} color={COLORS.primary} />
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

      {/* List */}
      {loading ? (
        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={filteredNotifs}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadNotifications(true)
              }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title="No Notifications"
              subtitle={
                filter === 'reviews'
                  ? 'No passenger reviews received yet. Passenger feedback will appear here!'
                  : filter === 'bookings'
                  ? 'No incoming booking notifications.'
                  : filter === 'completed'
                  ? 'No completed trip notifications.'
                  : 'New booking alerts and passenger reviews will appear here.'
              }
              actionLabel="Go to Dashboard"
              onAction={() => navigation.navigate('Dashboard')}
            />
          }
        />
      )}
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  markAllBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
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
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  notifCardUnread: {
    backgroundColor: '#FFFDF5',
    borderColor: '#FDE68A',
  },
  notifCardRead: {
    backgroundColor: COLORS.white,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 13.5,
    color: COLORS.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  notifTitleBold: {
    fontWeight: '900',
    color: '#0F172A',
  },
  timeText: {
    fontSize: 11,
    color: COLORS.gray500,
    marginLeft: 8,
  },
  notifMessage: {
    fontSize: 12.5,
    color: COLORS.gray600,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 8,
    marginTop: 6,
  },

  // Customer Review Card Styles
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FEF08A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reviewAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  reviewAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  reviewAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  reviewCustName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewRefText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  starBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  starBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  reviewCommentBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  reviewCommentText: {
    fontSize: 13,
    color: '#78350F',
    fontWeight: '600',
    lineHeight: 18,
  },
  reviewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
})

export default DriverNotifScreen
