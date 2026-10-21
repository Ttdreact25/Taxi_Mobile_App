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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { notifAPI } from '../../api/api'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { SkeletonList } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'

const FILTERS = [
  { id: 'all',    label: 'All Broadcasts', icon: 'megaphone-outline',   activeIcon: 'megaphone' },
  { id: 'unread', label: 'Unread Only',    icon: 'mail-unread-outline', activeIcon: 'mail-unread' },
]

const DriverNotifScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadNotifications = useCallback(async (isPull = false) => {
    if (!isPull) setLoading(true)
    try {
      const res = await notifAPI.list(false)
      const rawNotifs = res.data?.notifications || res.data?.data?.notifications || res.data?.data || []

      // Filter strictly: Keep ONLY Admin Broadcasts and Official Announcements
      const broadcastNotifs = (Array.isArray(rawNotifs) ? rawNotifs : []).filter(n => {
        const text = `${n.title || ''} ${n.body || ''} ${n.type || ''}`.toLowerCase()
        // Strictly exclude internal transactional noise
        if (
          text.includes('otp') ||
          text.includes('kyc') ||
          text.includes('registration') ||
          text.includes('dispatch') ||
          text.includes('pickup alert') ||
          text.includes('booking') ||
          text.includes('completed')
        ) {
          return false
        }
        return (
          n.type === 'broadcast' ||
          n.type === 'admin_broadcast' ||
          text.includes('broadcast') ||
          text.includes('announcement') ||
          text.includes('notice') ||
          text.includes('admin')
        )
      })

      // Sort newest first
      broadcastNotifs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      setNotifications(broadcastNotifs)
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useFocusEffect(
    useCallback(() => {
      loadNotifications(true)
    }, [loadNotifications])
  )

  const handleMarkRead = async (id) => {
    try {
      await notifAPI.markRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
    } catch {}
  }

  const handleMarkAllRead = async () => {
    try {
      await notifAPI.markRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
      Alert.alert('Done', 'All broadcasts marked as read.')
    } catch {}
  }

  const filteredNotifs = notifications.filter(n => {
    if (filter === 'unread') {
      return Number(n.is_read) === 0 || !n.is_read
    }
    return true
  })

  const unreadCount = notifications.filter(n => Number(n.is_read) === 0 || !n.is_read).length

  const renderItem = ({ item }) => {
    const isUnread = Number(item.is_read) === 0 || !item.is_read
    const createdDate = item.created_at ? new Date(item.created_at) : null
    const formattedDate = createdDate
      ? createdDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Today'
    const formattedTime = createdDate
      ? createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : ''

    return (
      <TouchableOpacity
        style={[styles.card, isUnread ? styles.cardUnread : styles.cardRead]}
        onPress={() => handleMarkRead(item.id)}
        activeOpacity={0.88}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <View style={styles.badgeWrap}>
              <Ionicons name="megaphone" size={13} color="#B45309" />
              <Text style={styles.badgeText}>ADMIN BROADCAST</Text>
            </View>
            {isUnread && (
              <View style={styles.newBadgeWrap}>
                <View style={styles.newDot} />
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={styles.dateText}>
            {formattedDate} {formattedTime ? `• ${formattedTime}` : ''}
          </Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={[styles.title, isUnread && styles.titleBold]}>
            {item.title || 'Official Announcement'}
          </Text>
        </View>

        <Text style={styles.bodyText}>
          {item.body || item.message || ''}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.senderWrap}>
            <Ionicons name="shield-checkmark" size={13} color="#10B981" />
            <Text style={styles.senderText}>CityOne Taxi Admin Official</Text>
          </View>
          {isUnread ? (
            <TouchableOpacity
              style={styles.markReadBtn}
              onPress={() => handleMarkRead(item.id)}
            >
              <Ionicons name="checkmark" size={13} color="#0284C7" />
              <Text style={styles.markReadText}>Mark read</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.readIndicator}>
              <Ionicons name="checkmark-done" size={14} color="#94A3B8" />
              <Text style={styles.readText}>Read</Text>
            </View>
          )}
        </View>
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
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Driver Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0 ? `${unreadCount} new broadcast${unreadCount > 1 ? 's' : ''}` : 'Official Admin Broadcasts'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead} title="Mark all read">
            <Ionicons name="checkmark-done" size={18} color="#B45309" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {FILTERS.map(f => {
            const active = filter === f.id
            const count = f.id === 'unread' ? unreadCount : notifications.length
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={active ? f.activeIcon : f.icon}
                  size={15}
                  color={active ? '#0F172A' : '#64748B'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label} {count > 0 ? `(${count})` : ''}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Broadcasts List */}
      {loading ? (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
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
              icon="megaphone-outline"
              title="No Broadcasts Right Now"
              subtitle={
                filter === 'unread'
                  ? 'All admin announcements have been marked as read.'
                  : 'When CityOne Taxi Admin broadcasts updates or notices to drivers, they will appear here.'
              }
              actionLabel="Return to Dashboard"
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
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  markAllBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  filterBar: {
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  cardUnread: {
    backgroundColor: '#FFFDF7',
    borderColor: '#FCD34D',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  cardRead: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.4,
  },
  newBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  newDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  dateText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  titleRow: {
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 21,
  },
  titleBold: {
    fontWeight: '900',
    color: '#0F172A',
  },
  bodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  senderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  senderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
  },
  markReadText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  readIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  readText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
})

export default DriverNotifScreen
