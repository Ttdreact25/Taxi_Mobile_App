import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { reviewsAPI, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import { SkeletonList } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'
import { formatDateDisplay } from '../../utils/formatters'

const STAR_FILTERS = [
  { id: 'all', label: 'All Reviews' },
  { id: '5',   label: '⭐⭐⭐⭐⭐ (5)' },
  { id: '4',   label: '⭐⭐⭐⭐ (4)' },
  { id: '3',   label: '3 Stars & Below' },
]

const DriverReviewsScreen = ({ navigation, route }) => {
  const { user } = useAuth()
  const initialReviews = route.params?.reviews || []
  const [reviews, setReviews] = useState(initialReviews)
  const [loading, setLoading] = useState(initialReviews.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('all')

  const loadReviews = useCallback(async (isPull = false) => {
    if (!isPull && reviews.length === 0) setLoading(true)
    try {
      if (user?.id) {
        const res = await reviewsAPI.listForUser(user.id, 'driver')
        const list = res.data?.reviews || []
        setReviews(Array.isArray(list) ? list : [])
      }
    } catch (err) {
      console.warn('Failed to fetch driver reviews:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, reviews.length])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  // Aggregate stats
  const totalReviews = reviews.length
  const avgRating = totalReviews > 0
    ? (reviews.reduce((acc, r) => acc + Number(r.rating || 5), 0) / totalReviews).toFixed(1)
    : '5.0'
  const fiveStarsCount = reviews.filter(r => Number(r.rating) === 5).length
  const fiveStarPercent = totalReviews > 0 ? Math.round((fiveStarsCount / totalReviews) * 100) : 100

  // Filtered reviews
  const filteredReviews = reviews.filter(r => {
    const stars = Number(r.rating || 5)
    if (filter === '5') return stars === 5
    if (filter === '4') return stars === 4
    if (filter === '3') return stars <= 3
    return true
  })

  const renderReviewItem = ({ item }) => {
    const stars = Math.min(5, Math.max(1, Math.round(Number(item.rating) || 5)))

    return (
      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={styles.avatarWrap}>
              {resolveAssetUrl(item.reviewer_avatar) ? (
                <Image source={{ uri: resolveAssetUrl(item.reviewer_avatar) }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>
                  {((item.reviewer_name || 'C')?.[0] || 'C').toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.custName} numberOfLines={1}>{item.reviewer_name || 'Passenger'}</Text>
              <Text style={styles.bookingRef}>{item.booking_ref || `Trip #${item.booking_id}`}</Text>
            </View>
          </View>
          <View style={styles.starBadgePill}>
            <Ionicons name="star" size={13} color="#F59E0B" />
            <Text style={styles.starBadgeText}>{Number(item.rating || 5).toFixed(1)}</Text>
          </View>
        </View>

        {item.comment ? (
          <View style={styles.commentBox}>
            <Text style={styles.commentText}>"{item.comment}"</Text>
          </View>
        ) : (
          <View style={styles.commentBox}>
            <Text style={[styles.commentText, { fontStyle: 'italic', color: '#94A3B8' }]}>
              Rated {item.rating} stars for a smooth and safe trip
            </Text>
          </View>
        )}

        <View style={styles.reviewFooter}>
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
            {item.created_at ? formatDateDisplay(item.created_at) : 'Recently'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Our Reviews</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{totalReviews}</Text>
        </View>
      </View>

      {/* Hero Summary Card */}
      <View style={styles.heroSummaryCard}>
        <View style={styles.heroScoreLeft}>
          <Text style={styles.heroScoreNum}>{avgRating}</Text>
          <View style={{ flexDirection: 'row', gap: 2, marginVertical: 3 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <Ionicons
                key={s}
                name={s <= Math.round(Number(avgRating)) ? "star" : "star-outline"}
                size={16}
                color="#F59E0B"
              />
            ))}
          </View>
          <Text style={styles.heroTotalReviewsText}>Based on {totalReviews} reviews</Text>
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.heroStatsRight}>
          <View style={styles.heroMetricRow}>
            <Ionicons name="ribbon-outline" size={16} color="#10B981" />
            <Text style={styles.heroMetricLbl}>5-Star Rating Rate:</Text>
            <Text style={styles.heroMetricVal}>{fiveStarPercent}%</Text>
          </View>
          <View style={styles.heroMetricRow}>
            <Ionicons name="thumbs-up-outline" size={16} color="#3B82F6" />
            <Text style={styles.heroMetricLbl}>5-Star Rides:</Text>
            <Text style={styles.heroMetricVal}>{fiveStarsCount} Trips</Text>
          </View>
          <View style={styles.heroMetricRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#7C3AED" />
            <Text style={styles.heroMetricLbl}>Passenger Trust:</Text>
            <Text style={styles.heroMetricVal}>Excellent</Text>
          </View>
        </View>
      </View>

      {/* Star Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {STAR_FILTERS.map(f => {
            const active = filter === f.id
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Review List */}
      {loading ? (
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={filteredReviews}
          keyExtractor={(item, idx) => String(item.id || idx)}
          renderItem={renderReviewItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadReviews(true)
              }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="star-outline"
              title="No Reviews in this Category"
              subtitle="Passenger feedback and ratings will appear here as you complete trips."
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
  countPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },

  // Hero Summary
  heroSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#FEF08A',
    ...SHADOW.small,
  },
  heroScoreLeft: {
    alignItems: 'center',
    paddingRight: 16,
  },
  heroScoreNum: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
  },
  heroTotalReviewsText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E2E8F0',
    marginRight: 16,
  },
  heroStatsRight: {
    flex: 1,
    gap: 8,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroMetricLbl: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  heroMetricVal: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '800',
  },

  // Filters
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
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },

  // List
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.small,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  custName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  bookingRef: {
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
  commentBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  commentText: {
    fontSize: 13,
    color: '#78350F',
    fontWeight: '600',
    lineHeight: 18,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
})

export default DriverReviewsScreen
