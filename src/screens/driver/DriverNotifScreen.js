import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { notifAPI } from '../../api/api'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const FILTERS = [
  { id: 'all',      label: 'All Broadcasts' },
  { id: 'unread',   label: 'Unread' },
  { id: 'trip',     label: 'Trips & Dispatches' },
  { id: 'payment',  label: 'Earnings & Payouts' },
  { id: 'system',   label: 'System & KYC' },
]

const DriverNotifScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadNotifications = useCallback(async (isPull = false) => {
    if (!isPull) setLoading(true)
    try {
      const res = await notifAPI.list(filter === 'unread')
      const list = res.data?.notifications || res.data?.data?.notifications || res.data?.data || []
      setNotifications(list)
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filter])

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
      Alert.alert('Done', 'All notifications marked as read.')
    } catch {}
  }

  const handleDeleteNotif = async (id) => {
    try {
      await notifAPI.delete(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch {}
  }

  const filteredNotifs = notifications.filter(n => {
    if (filter === 'unread') return n.is_read == 0 || !n.is_read
    if (filter === 'trip') return n.type === 'trip' || n.type === 'booking' || n.title?.toLowerCase().includes('trip')
    if (filter === 'payment') return n.type === 'payment' || n.title?.toLowerCase().includes('payment') || n.title?.toLowerCase().includes('earning')
    if (filter === 'system') return n.type === 'system' || n.type === 'kyc' || n.title?.toLowerCase().includes('verification')
    return true
  })

  const getNotifIconConfig = (type = '', title = '') => {
    const t = `${type} ${title}`.toLowerCase()
    if (t.includes('payment') || t.includes('earning') || t.includes('settlement')) {
      return { icon: 'cash', color: '#10B981', bg: '#D1FAE5' }
    }
    if (t.includes('cancel') || t.includes('reject') || t.includes('alert')) {
      return { icon: 'alert-circle', color: '#EF4444', bg: '#FEE2E2' }
    }
    if (t.includes('scheduled') || t.includes('time') || t.includes('reminder')) {
      return { icon: 'time', color: '#F59E0B', bg: '#FEF3C7' }
    }
    if (t.includes('kyc') || t.includes('document') || t.includes('verified')) {
      return { icon: 'shield-checkmark', color: '#6366F1', bg: '#EEF2FF' }
    }
    return { icon: 'car-sport', color: '#7C3AED', bg: '#EDE9FE' }
  }

  const renderItem = ({ item }) => {
    const isUnread = item.is_read == 0 || !item.is_read
    const iconCfg = getNotifIconConfig(item.type, item.title)

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
              {item.title || 'Dispatch Alert'}
            </Text>
            <Text style={styles.timeText}>
              {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
            </Text>
          </View>
          <Text style={styles.notifMessage} numberOfLines={3}>{item.message}</Text>
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
        <Text style={styles.headerTitle}>Notification Center</Text>
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
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading notifications...</Text>
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
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptyDesc}>
                {filter === 'unread'
                  ? 'All caught up! You have no unread notifications.'
                  : 'Real-time ride dispatches, customer updates, and earnings alerts will appear here.'}
              </Text>
            </View>
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
    backgroundColor: '#EEF2FF',
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
    gap: 10,
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
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  notifCardUnread: {
    backgroundColor: '#F8FAFF',
    borderColor: '#C7D2FE',
  },
  notifCardRead: {
    backgroundColor: COLORS.white,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 13,
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
    fontSize: 12,
    color: COLORS.gray600,
    lineHeight: 17,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 8,
    marginTop: 6,
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
  emptyDesc: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 18,
  },
})

export default DriverNotifScreen
