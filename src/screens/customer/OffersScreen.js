import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Clipboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useAuth } from '../../context/AuthContext'
import { couponsAPI, bookingsAPI } from '../../api/api'

export default function OffersScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [coupons, setCoupons] = useState([])
  const [appliedCode, setAppliedCode] = useState(null)
  const [userCity, setUserCity] = useState('')

  const loadCoupons = useCallback(async () => {
    try {
      // 1. Detect user's current city
      let detectedCity = user?.city || ''
      let locationParams = {}

      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getLastKnownPositionAsync().catch(() => null)
            || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
          if (loc?.coords) {
            const rev = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            })
            const city = rev?.[0]?.city || rev?.[0]?.subregion || rev?.[0]?.district || ''
            if (city) detectedCity = city
            locationParams = {
              city: detectedCity,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            }
          }
        }
      } catch (locErr) {}

      if (detectedCity) {
        setUserCity(detectedCity)
        locationParams.city = detectedCity
      }

      // 2. Fetch coupons and customer trip history in parallel
      const [res, tripsRes] = await Promise.allSettled([
        couponsAPI.active(locationParams),
        bookingsAPI.myTrips({ per_page: 50 }),
      ])

      let rawCoupons = []
      if (res.status === 'fulfilled' && (res.value?.data?.status === 'success' || Array.isArray(res.value?.data?.coupons))) {
        rawCoupons = res.value.data?.coupons || []
      }

      // 3. Collect all coupons already used in user's past bookings (1-time use rule)
      const usedCodes = new Set()
      const usedIds = new Set()
      if (tripsRes.status === 'fulfilled') {
        const trips = tripsRes.value?.data?.bookings || tripsRes.value?.data?.trips || []
        trips.forEach(t => {
          if (t.status !== 'cancelled') {
            if (t.coupon_id) usedIds.add(Number(t.coupon_id))
            if (t.coupon_code) usedCodes.add(String(t.coupon_code).toUpperCase().trim())
          }
        })
      }

      // 4. Strict City Filter on frontend:
      // If a coupon is assigned to Madurai (or any city), ONLY users in that city can see it!
      const currentCityLower = (detectedCity || '').toLowerCase().trim()
      const filteredByCity = rawCoupons.filter(c => {
        if (!c.city_name && (!c.city_id || Number(c.city_id) === 0)) {
          return true // Global / All-cities coupon
        }
        if (!currentCityLower) {
          return false // If user location is unknown, hide city-specific coupons
        }
        const cCityLower = String(c.city_name || '').toLowerCase().trim()
        return currentCityLower.includes(cCityLower) || cCityLower.includes(currentCityLower)
      })

      const processedCoupons = filteredByCity.map(c => {
        const isUsed = Boolean(
          c.is_used ||
          c.is_disabled ||
          usedIds.has(Number(c.id)) ||
          usedCodes.has(String(c.code).toUpperCase().trim())
        )
        return {
          ...c,
          is_used: isUsed,
          is_disabled: isUsed,
        }
      })

      setCoupons(processedCoupons)
    } catch (err) {
      // silent fallback
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.city])

  useFocusEffect(
    useCallback(() => {
      loadCoupons()
    }, [loadCoupons])
  )

  const onRefresh = () => {
    setRefreshing(true)
    loadCoupons()
  }

  const handleApplyCoupon = (code) => {
    setAppliedCode(code)
    try {
      Clipboard.setString(code)
    } catch (e) {}

    setTimeout(() => {
      navigation.navigate('Booking', { coupon: code })
    }, 250)
  }

  const formatExpiry = (dateStr) => {
    if (!dateStr) return null
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return null
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return null
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFC700" />

      {/* ── Sleek Professional Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.tagBadge}>
              <Ionicons name="pricetag" size={13} color="#0F172A" />
              <Text style={styles.tagBadgeText}>EXCLUSIVE DEALS</Text>
            </View>
            <Text style={styles.headerTitle}>Offers & Coupons</Text>
            <Text style={styles.headerSubtitle}>
              Apply promo codes at booking for instant fare discounts
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={18} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {coupons.length > 0 && (
          <View style={styles.countRow}>
            <View style={styles.countPill}>
              <View style={styles.activeDot} />
              <Text style={styles.countPillText}>{coupons.length} Active Codes Available</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Body Content ── */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#D97706" />
          <Text style={styles.loadingText}>Fetching available coupons...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#D97706']} />
          }
        >
          {coupons.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="ticket-outline" size={42} color="#D97706" />
              </View>
              <Text style={styles.emptyTitle}>No Promo Codes Right Now</Text>
              <Text style={styles.emptySubtitle}>
                Check back soon! Exclusive discounts and special festival codes will appear here as soon as admin adds them.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('Booking')}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyBtnText}>Book a Ride</Text>
                <Ionicons name="arrow-forward" size={15} color="#0F172A" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.couponsList}>
              {coupons.map((c, idx) => {
                const discountTitle =
                  c.discount_type === 'percent'
                    ? `${parseFloat(c.discount_value)}% OFF`
                    : `Flat ₹${Math.round(parseFloat(c.discount_value || 0))} OFF`

                const isUsed = Boolean(c.is_used || c.is_disabled)
                const isApplied = appliedCode === c.code
                const expiryText = formatExpiry(c.expiry_date)
                const minFare = parseFloat(c.min_fare || 0)
                const maxDiscount = parseFloat(c.max_discount || 0)

                return (
                  <View
                    key={c.id || `coupon-${idx}`}
                    style={[
                      styles.ticketCard,
                      isUsed && styles.ticketCardDisabled,
                    ]}
                  >
                    {/* Left Cutout Circle */}
                    <View style={styles.cutoutLeft} />
                    {/* Right Cutout Circle */}
                    <View style={styles.cutoutRight} />

                    {/* Card Top Section: Title, Description & Verified/Used Badge */}
                    <View style={styles.ticketTopSection}>
                      <View style={styles.ticketHeaderRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.discountTitle, isUsed && { color: '#64748B' }]}>
                            {discountTitle}
                          </Text>
                          <Text style={[styles.ticketDescription, isUsed && { color: '#94A3B8' }]} numberOfLines={2}>
                            {c.description || 'Special fare discount for your upcoming ride'}
                          </Text>
                        </View>

                        {isUsed ? (
                          <View style={styles.usedBadge}>
                            <Ionicons name="checkmark-done-circle" size={13} color="#64748B" />
                            <Text style={styles.usedBadgeText}>ALREADY USED</Text>
                          </View>
                        ) : (
                          <View style={styles.verifiedBadge}>
                            <Ionicons name="shield-checkmark" size={13} color="#059669" />
                            <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                          </View>
                        )}
                      </View>

                      {/* Conditions Pill Row */}
                      <View style={styles.conditionsRow}>
                        {minFare > 0 && (
                          <View style={styles.conditionPill}>
                            <Ionicons name="information-circle-outline" size={12} color="#64748B" />
                            <Text style={styles.conditionPillText}>Min. ride ₹{minFare}</Text>
                          </View>
                        )}
                        {maxDiscount > 0 && c.discount_type === 'percent' && (
                          <View style={styles.conditionPill}>
                            <Ionicons name="sparkles-outline" size={12} color="#64748B" />
                            <Text style={styles.conditionPillText}>Max. saving ₹{maxDiscount}</Text>
                          </View>
                        )}
                        {c.city_name && (
                          <View style={styles.conditionPill}>
                            <Ionicons name="location-outline" size={12} color="#64748B" />
                            <Text style={styles.conditionPillText}>{c.city_name} only</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Perforated Dashed Divider */}
                    <View style={styles.dashedDivider} />

                    {/* Card Bottom Section: Code Tag & Apply Button */}
                    <View style={styles.ticketBottomSection}>
                      <View style={[styles.codeTag, isUsed && styles.codeTagDisabled]}>
                        <Ionicons name="pricetag" size={13} color={isUsed ? '#94A3B8' : '#D97706'} />
                        <Text style={[styles.codeTagText, isUsed && styles.codeTagTextDisabled]} selectable={!isUsed}>
                          {c.code}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.applyBtn,
                          isApplied && styles.applyBtnSuccess,
                          isUsed && styles.applyBtnDisabled,
                        ]}
                        disabled={isUsed}
                        onPress={isUsed ? null : () => handleApplyCoupon(c.code)}
                        activeOpacity={isUsed ? 1 : 0.82}
                      >
                        <Text
                          style={[
                            styles.applyBtnText,
                            isApplied && styles.applyBtnSuccessText,
                            isUsed && styles.applyBtnDisabledText,
                          ]}
                        >
                          {isUsed ? 'Already Used' : (isApplied ? 'Applied ✓' : 'Apply to Ride')}
                        </Text>
                        <Ionicons
                          name={isUsed ? 'lock-closed' : (isApplied ? 'checkmark-circle' : 'arrow-forward')}
                          size={14}
                          color={isUsed ? '#94A3B8' : (isApplied ? '#FFFFFF' : '#0F172A')}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Expiry / Validity Footer Line */}
                    <View style={styles.ticketFooterRow}>
                      <Ionicons
                        name={isUsed ? 'information-circle-outline' : 'time-outline'}
                        size={12}
                        color="#94A3B8"
                      />
                      <Text style={[styles.expiryText, isUsed && { color: '#94A3B8', fontWeight: '700' }]}>
                        {isUsed
                          ? 'Redeemed on your previous ride • Offer valid once per user'
                          : (expiryText ? `Valid until ${expiryText}` : 'Active & ready to apply at booking')}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // ── Header ──
  header: {
    backgroundColor: '#FFC700',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 17,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  countRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  countPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── Scroll Content ──
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },

  // ── Loading ──
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },

  // ── Empty State ──
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFC700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ── Coupons List ──
  couponsList: {
    gap: 14,
  },

  // ── Ticket / Voucher Card ──
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // Circular Cutouts on the sides
  cutoutLeft: {
    position: 'absolute',
    left: -8,
    top: '56%',
    marginTop: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    zIndex: 2,
  },
  cutoutRight: {
    position: 'absolute',
    right: -8,
    top: '56%',
    marginTop: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    zIndex: 2,
  },

  // Card Top Section
  ticketTopSection: {
    padding: 16,
    paddingBottom: 12,
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  discountTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 3,
  },
  ticketDescription: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 17,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },

  // Conditions
  conditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  conditionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  conditionPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  // Dashed Divider
  dashedDivider: {
    borderWidth: 0.8,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginHorizontal: 12,
  },

  // Card Bottom Section
  ticketBottomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  codeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    borderStyle: 'dashed',
  },
  codeTagText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 1.2,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFC700',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  applyBtnSuccess: {
    backgroundColor: '#059669',
  },
  applyBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  applyBtnSuccessText: {
    color: '#FFFFFF',
  },

  // Footer Line
  ticketFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  expiryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // ── Disabled / Used State Styles ──
  ticketCardDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.72,
  },
  usedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  usedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  codeTagDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  codeTagTextDisabled: {
    color: '#64748B',
  },
  applyBtnDisabled: {
    backgroundColor: '#E2E8F0',
    elevation: 0,
    shadowOpacity: 0,
  },
  applyBtnDisabledText: {
    color: '#94A3B8',
    fontWeight: '700',
  },
})
