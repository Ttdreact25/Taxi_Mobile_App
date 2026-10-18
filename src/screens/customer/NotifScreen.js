import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, RefreshControl
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { notifAPI } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { SkeletonList } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'

const getNotifIcon = (type) => {
  switch (type) {
    case 'booking':
      return {
        name: 'car-sport',
        color: '#2563EB',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        tag: 'RIDE UPDATE',
        tagColor: '#1D4ED8',
        tagBg: '#DBEAFE',
      }
    case 'payment':
      return {
        name: 'receipt-outline',
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        tag: 'PAYMENT RECEIPT',
        tagColor: '#047857',
        tagBg: '#D1FAE5',
      }
    case 'promo':
      return {
        name: 'gift-outline',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        tag: 'EXCLUSIVE OFFER',
        tagColor: '#B45309',
        tagBg: '#FEF3C7',
      }
    case 'support':
      return {
        name: 'headset-outline',
        color: '#4F46E5',
        bg: '#EEF2FF',
        border: '#C7D2FE',
        tag: 'SUPPORT DESK',
        tagColor: '#4338CA',
        tagBg: '#E0E7FF',
      }
    default:
      return {
        name: 'shield-checkmark-outline',
        color: '#0F172A',
        bg: '#F8FAFC',
        border: '#E2E8F0',
        tag: 'OFFICIAL NOTICE',
        tagColor: '#334155',
        tagBg: '#F1F5F9',
      }
  }
}

const NotifScreen = ({ navigation }) => {
  const [notifs,    setNotifs]    = useState([])
  const [unread,    setUnread]    = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await notifAPI.list()
      if (res.data?.status === 'success') {
        setNotifs(res.data.notifications || [])
        setUnread(res.data.unread || 0)
      }
    } catch {}
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifs()
  }, [fetchNotifs])

  const handleMarkAllRead = async () => {
    try {
      await notifAPI.markRead()
      fetchNotifs()
    } catch {
      Alert.alert('Error', 'Failed to mark all as read')
    }
  }

  const handleMarkSingleRead = async (id, isRead) => {
    if (isRead) return
    try {
      await notifAPI.markRead(id)
      fetchNotifs()
    } catch {}
  }

  const handleDeleteNotif = async (id) => {
    try {
      await notifAPI.delete(id)
      setNotifs(prev => prev.filter(n => n.id !== id))
    } catch {
      Alert.alert('Error', 'Failed to delete notification')
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unread > 0 && <Text style={styles.unreadSub}>{unread} unread message{unread > 1 ? 's' : ''}</Text>}
        </View>

        {unread > 0 ? (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Ionicons name="checkmark-done" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ paddingHorizontal: SPACING.lg, marginTop: 10 }}>
          <SkeletonList count={4} />
        </View>
      ) : !notifs.length ? (
        <EmptyState
          icon="notifications-off-outline"
          title="All Caught Up!"
          subtitle="You have no notifications or alerts at this time."
          actionLabel="Explore Rides"
          onAction={() => navigation.navigate('Booking')}
        />
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifs() }} colors={[COLORS.primary]} />}
          renderItem={({ item }) => {
            const iconObj = getNotifIcon(item.type)
            const isUnread = !item.is_read

            return (
              <TouchableOpacity
                style={[styles.card, isUnread ? styles.unreadCard : null]}
                onPress={() => handleMarkSingleRead(item.id, item.is_read)}
                activeOpacity={0.88}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.iconWrap, { backgroundColor: iconObj.bg, borderColor: iconObj.border }]}>
                    <Ionicons name={iconObj.name} size={20} color={iconObj.color} />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.cardTopRow}>
                      <View style={[styles.typeTagBadge, { backgroundColor: iconObj.tagBg }]}>
                        <Text style={[styles.typeTagText, { color: iconObj.tagColor }]}>{iconObj.tag}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteNotif(item.id)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={15} color={COLORS.gray400} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Text style={[styles.title, isUnread ? styles.unreadTitle : null]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {isUnread && <View style={styles.unreadDot} />}
                    </View>
                  </View>
                </View>

                <Text style={styles.body}>{item.body}</Text>

                <Text style={styles.date}>
                  {item.created_at ? new Date(item.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.background },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  back:          { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm },
  headerTitle:   { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text },
  unreadSub:     { fontSize: 10, color: COLORS.primary, fontWeight: '700', marginTop: 1 },
  markAllBtn:    { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  
  listContent:   { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, gap: 10 },
  card:          { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, ...SHADOW.sm, borderWidth: 1, borderColor: '#E2E8F0' },
  unreadCard:    { borderColor: '#FDE68A', backgroundColor: '#FFFDF5' },
  cardHeader:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  cardTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap:      { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  typeTagBadge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typeTagText:   { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  title:         { fontSize: 13.5, fontWeight: '700', color: COLORS.text, flex: 1 },
  unreadTitle:   { fontWeight: '800', color: '#0F172A' },
  unreadDot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary },
  deleteBtn:     { padding: 4 },
  body:          { fontSize: FONTS.sizes.xs, color: COLORS.gray700, lineHeight: 18, marginVertical: 2 },
  date:          { fontSize: 10, color: COLORS.textMuted, marginTop: 6, fontWeight: '500' },
  
  empty:         { paddingTop: 100, alignItems: 'center', gap: 8, paddingHorizontal: SPACING.xl },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:    { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text },
  emptySub:      { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, textAlign: 'center' },
})

export default NotifScreen
