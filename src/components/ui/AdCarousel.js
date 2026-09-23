import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  ImageBackground,
  Linking,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { adsAPI } from '../../api/api'
import { COLORS, RADIUS, SPACING } from '../../constants/theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_MARGIN = 16
const CARD_GAP = 12
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2

const PALETTES = [
  { bg: '#1E1B4B', badgeBg: 'rgba(238, 242, 255, 0.20)', badgeBorder: 'rgba(255,255,255,0.25)', badgeText: '#E0E7FF', btnText: '#1E1B4B', icon: 'sparkles' },
  { bg: '#064E3B', badgeBg: 'rgba(209, 250, 229, 0.20)', badgeBorder: 'rgba(255,255,255,0.25)', badgeText: '#A7F3D0', btnText: '#064E3B', icon: 'flash' },
  { bg: '#1E3A8A', badgeBg: 'rgba(219, 234, 254, 0.20)', badgeBorder: 'rgba(255,255,255,0.25)', badgeText: '#BFDBFE', btnText: '#1E3A8A', icon: 'shield-checkmark' },
  { bg: '#4C1D95', badgeBg: 'rgba(243, 232, 255, 0.20)', badgeBorder: 'rgba(255,255,255,0.25)', badgeText: '#E9D5FF', btnText: '#4C1D95', icon: 'gift' },
  { bg: '#78350F', badgeBg: 'rgba(254, 215, 170, 0.20)', badgeBorder: 'rgba(255,255,255,0.25)', badgeText: '#FED7AA', btnText: '#78350F', icon: 'flame' },
]

const formatCategory = (cat = '') => {
  if (!cat) return 'Special Offer'
  return cat
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

const AdCarousel = ({ ads = [], userRole = 'customer', navigation }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef(null)
  const autoSlideTimer = useRef(null)
  const resumeTimer = useRef(null)
  const isInteracting = useRef(false)

  // Filter ads strictly for active user role
  const filteredAds = (ads || []).filter(ad => {
    const aud = (ad.target_audience || 'both').toLowerCase()
    if (userRole === 'customer') return aud === 'customer' || aud === 'both'
    if (userRole === 'driver') return aud === 'driver' || aud === 'both'
    return true
  })

  // Start auto-slide (every 3.5s)
  const startAutoSlide = useCallback(() => {
    stopAutoSlide()
    if (!filteredAds || filteredAds.length <= 1) return

    autoSlideTimer.current = setInterval(() => {
      if (isInteracting.current) return

      setCurrentIndex((prevIdx) => {
        const nextIdx = (prevIdx + 1) % filteredAds.length
        try {
          flatListRef.current?.scrollToOffset({
            offset: nextIdx * (CARD_WIDTH + CARD_GAP),
            animated: true,
          })
        } catch {}
        return nextIdx
      })
    }, 3500)
  }, [filteredAds])

  const stopAutoSlide = () => {
    if (autoSlideTimer.current) clearInterval(autoSlideTimer.current)
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
  }

  useEffect(() => {
    startAutoSlide()
    return () => stopAutoSlide()
  }, [startAutoSlide])

  // Pause on user touch, resume 3.5s after interaction finishes
  const handleScrollBegin = () => {
    isInteracting.current = true
    stopAutoSlide()
  }

  const handleScrollEnd = (e) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x
    const newIdx = Math.round(contentOffsetX / (CARD_WIDTH + CARD_GAP))
    if (newIdx !== currentIndex && newIdx >= 0 && newIdx < filteredAds.length) {
      setCurrentIndex(newIdx)
    }

    isInteracting.current = false
    stopAutoSlide()
    resumeTimer.current = setTimeout(() => {
      startAutoSlide()
    }, 3500)
  }

  const handleBannerPress = (ad) => {
    adsAPI.trackClick({ ad_id: ad.id, user_role: userRole }).catch(() => {})

    const redirect = ad.redirect_url ? ad.redirect_url.trim() : ''

    if (redirect.startsWith('http://') || redirect.startsWith('https://')) {
      Linking.openURL(redirect).catch(() => Alert.alert('Error', 'Unable to open link'))
      return
    }

    if (navigation && redirect) {
      // Map standard action names
      const routeMap = {
        Booking: 'Booking',
        Book: 'Booking',
        Local: 'Booking',
        LongTrip: 'LongTrip',
        Outstation: 'LongTrip',
        SharedTrips: 'SharedTrips',
        Shared: 'SharedTrips',
        Profile: 'Profile',
        Support: 'Support',
        Help: 'Support',
        IdentityVerification: 'IdentityVerification',
        KYC: 'IdentityVerification',
        DriverHome: 'DriverHome',
        DriverProfile: 'Profile',
        Trips: 'Trips',
      }

      const targetRoute = routeMap[redirect] || redirect
      try {
        navigation.navigate(targetRoute)
        return
      } catch {}
    }

    // Default Fallback
    if (navigation) {
      if (userRole === 'customer') {
        navigation.navigate('Booking')
      } else {
        navigation.navigate('Trips')
      }
    }
  }

  if (!filteredAds || filteredAds.length === 0) return null

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={filteredAds}
        keyExtractor={(item) => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.flatListContent}
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: CARD_WIDTH + CARD_GAP,
          offset: (CARD_WIDTH + CARD_GAP) * index,
          index,
        })}
        renderItem={({ item, index }) => {
          const theme = PALETTES[index % PALETTES.length]
          const categoryTitle = formatCategory(item.category)
          const imgUrl = item.banner_image_url || item.banner_image
          const hasImage = Boolean(imgUrl)

          const renderCardContent = () => (
            <View style={styles.bannerContent}>
              {/* Top Badge Row */}
              <View style={styles.badgeRow}>
                <View style={[styles.categoryBadge, { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder }]}>
                  <Ionicons name={theme.icon} size={11} color={theme.badgeText} style={{ marginRight: 4 }} />
                  <Text style={[styles.categoryText, { color: theme.badgeText }]}>{categoryTitle}</Text>
                </View>
                <View style={styles.audiencePill}>
                  <Text style={styles.audienceTag}>
                    {item.subtitle || (item.target_audience ? item.target_audience.toUpperCase() : 'EXCLUSIVE')}
                  </Text>
                </View>
              </View>

              {/* Title & Subtitle */}
              <View style={{ marginVertical: 4 }}>
                <Text style={styles.bannerTitle} numberOfLines={1}>{item.title || 'Special Promotion'}</Text>
                <Text style={styles.bannerSub} numberOfLines={2}>
                  {item.description || 'Tap to explore exclusive partner rewards & offers.'}
                </Text>
              </View>

              {/* Bottom CTA Action Button */}
              <View style={styles.ctaRow}>
                <View style={styles.ctaBtn}>
                  <Text style={[styles.ctaBtnText, { color: theme.btnText }]}>
                    {item.cta_text || (userRole === 'customer' ? 'Claim Offer' : 'View Bonus')}
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color={theme.btnText} style={{ marginLeft: 4 }} />
                </View>
              </View>
            </View>
          )

          return (
            <TouchableOpacity
              style={[styles.bannerCard, { width: CARD_WIDTH, backgroundColor: theme.bg }]}
              onPress={() => handleBannerPress(item)}
              activeOpacity={0.92}
            >
              {hasImage ? (
                <ImageBackground
                  source={{ uri: imgUrl }}
                  style={styles.imageBackground}
                  imageStyle={styles.bannerImage}
                  resizeMode="cover"
                >
                  <View style={styles.overlayWithImage}>
                    {renderCardContent()}
                  </View>
                </ImageBackground>
              ) : (
                renderCardContent()
              )}
            </TouchableOpacity>
          )
        }}
      />

      {/* Modern Center Expanding Indicator Dots */}
      {filteredAds.length > 1 && (
        <View style={styles.paginationRow}>
          {filteredAds.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  flatListContent: {
    paddingHorizontal: CARD_MARGIN,
    gap: CARD_GAP,
  },
  bannerCard: {
    height: 160,
    borderRadius: RADIUS.xxl,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  imageBackground: {
    width: '100%',
    height: '100%',
  },
  bannerImage: {
    borderRadius: RADIUS.xxl,
  },
  overlayWithImage: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  bannerContent: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  audiencePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  audienceTag: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bannerSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 2,
    lineHeight: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  ctaBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
})

export default AdCarousel
