import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Share, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import { vehicleTypesAPI, bookingsAPI, adsAPI, notifAPI, customerAPI, couponsAPI, resolveAssetUrl } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import AdCarousel from '../../components/ui/AdCarousel'

const COUPON_COLORS = [
  { bg: '#7C3AED', color: '#FFFFFF' },
  { bg: '#059669', color: '#FFFFFF' },
  { bg: '#EA580C', color: '#FFFFFF' },
  { bg: '#2563EB', color: '#FFFFFF' },
  { bg: '#DB2777', color: '#FFFFFF' },
  { bg: '#4F46E5', color: '#FFFFFF' },
]

const HomeScreen = ({ navigation }) => {
  const { user } = useAuth()
  const [types,            setTypes]            = useState([])
  const [activeBooking,    setActiveBooking]    = useState(null)
  const [recentTrips,      setRecentTrips]      = useState([])
  const [ads,              setAds]              = useState([])
  const [coupons,          setCoupons]          = useState([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [upcomingBooking,  setUpcomingBooking]  = useState(null)
  const [savedPlaces,      setSavedPlaces]      = useState([])
  const [loading,          setLoading]          = useState(true)

  const getPlaceIcon = (name = '', type = '') => {
    const n = `${name} ${type}`.toLowerCase()
    if (n.includes('home')) return 'home-outline'
    if (n.includes('work') || n.includes('office')) return 'briefcase-outline'
    if (n.includes('airport') || n.includes('flight') || n.includes('plane')) return 'airplane-outline'
    if (n.includes('station') || n.includes('rail') || n.includes('train')) return 'train-outline'
    return 'location-outline'
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [typeRes, tripRes, adsRes, notifRes, savedRes, couponRes] = await Promise.allSettled([
        vehicleTypesAPI.list(),
        bookingsAPI.myTrips({ per_page: 3 }),
        adsAPI.list({ target_audience: 'customer' }),
        notifAPI.list(),
        customerAPI.getSavedLocations(),
        couponsAPI.active(),
      ])

      if (typeRes.status === 'fulfilled') setTypes(typeRes.value.data?.types || [])
      if (adsRes.status === 'fulfilled') setAds(adsRes.value.data?.ads || [])
      if (couponRes.status === 'fulfilled') setCoupons(couponRes.value.data?.coupons || [])
      if (notifRes.status === 'fulfilled') setUnreadNotifCount(notifRes.value.data?.unread || 0)
      
      if (savedRes.status === 'fulfilled') {
        const list = savedRes.value.data?.saved_locations || savedRes.value.data?.locations || []
        const mapped = list.map(item => ({
          id: String(item.id),
          icon: getPlaceIcon(item.location_name, item.icon_type),
          label: item.location_name || 'Saved Place',
          custom_label: item.custom_label || null,
          address: item.address || item.location_name,
          coords: (item.latitude && item.longitude) ? { lat: parseFloat(item.latitude), lng: parseFloat(item.longitude) } : null,
          is_home: Boolean(item.is_home),
          is_work: Boolean(item.is_work),
        }))
        setSavedPlaces(mapped)
      }

      if (tripRes.status === 'fulfilled') {
        const trips = tripRes.value.data?.bookings || []
        const active = trips.find(t => ['searching', 'accepted', 'arrived', 'in_progress', 'driver_assigned', 'driver_arrived', 'trip_started'].includes(t.status))
        const upcoming = trips.find(t => t.status === 'scheduled')
        setActiveBooking(active || null)
        setUpcomingBooking(upcoming || null)
        setRecentTrips(trips.filter(t => t.status === 'completed').slice(0, 2))
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  const handleSelectSavedPlace = (p) => {
    navigation.navigate('Booking', {
      destination: p.address,
      destName: p.label,
      destCoords: p.coords || null,
      autoFocusDest: false,
    })
  }

  const handleShareReferral = async () => {
    try {
      await Share.share({
        message: `Join me on CityDropTaxi for reliable, safe and comfortable rides! Download the app now.`
      })
    } catch {}
  }

  const handleSOS = () => {
    Alert.alert(
      'Emergency SOS Triggered',
      'Calling emergency helpline 112 and sharing live location with your emergency contacts.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Call 112', style: 'destructive', onPress: () => Alert.alert('SOS Sent', 'Control room notified!') }
      ]
    )
  }

  const handleAdClick = (ad) => {
    adsAPI.trackClick({ ad_id: ad.id, user_role: 'customer' }).catch(() => {})
    if (ad.redirect_url) {
      navigation.navigate(ad.redirect_url)
    } else {
      navigation.navigate('Booking')
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* 1. Brand & Greeting Header Bar */}
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <View style={styles.brandBadge}>
                <Ionicons name="car" size={14} color={COLORS.white} />
                <Text style={styles.brandBadgeText}>CityDropTaxi</Text>
              </View>
              <View style={styles.cityPill}>
                <Ionicons name="location" size={10} color={COLORS.success} />
                <Text style={styles.cityPillText}>Live in Tamil Nadu</Text>
              </View>
            </View>
            <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'Rider'} 👋</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.textPrimary} />
              {unreadNotifCount > 0 && <View style={styles.notifBadge} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={[styles.avatar, { overflow: 'hidden' }]}>
              {resolveAssetUrl(user?.avatar_url || user?.avatar) ? (
                <Image
                  source={{ uri: resolveAssetUrl(user?.avatar_url || user?.avatar) }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarText}>{(user?.name?.[0] || 'U').toUpperCase()}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Uber-Style Elevated "Where to?" Search Card */}
        <TouchableOpacity style={styles.searchCard} onPress={() => navigation.navigate('Booking', { autoFocusDest: true })} activeOpacity={0.9}>
          <View style={styles.searchInner}>
            <View style={styles.searchIconWrap}>
              <Ionicons name="search" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.searchPlaceholder}>Where to?</Text>
              <Text style={styles.searchSub}>Tap to enter drop location</Text>
            </View>
            <View style={styles.nowPill}>
              <Ionicons name="time" size={12} color={COLORS.textPrimary} />
              <Text style={styles.nowPillText}>Now</Text>
              <Ionicons name="chevron-down" size={12} color={COLORS.gray500} />
            </View>
          </View>
        </TouchableOpacity>

        {/* 3. Dynamic Admin Advertisements Auto-Sliding Carousel (Uber/Rapido Premium Style) */}
        {ads.length > 0 ? (
          <View style={{ marginHorizontal: -SPACING.lg, marginBottom: 8 }}>
            <AdCarousel ads={ads} userRole="customer" navigation={navigation} />
          </View>
        ) : (
          <TouchableOpacity style={styles.heroBanner} onPress={() => navigation.navigate('Booking')} activeOpacity={0.88}>
            <View style={{ flex: 1 }}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>⚡ INSTANT RIDE</Text>
              </View>
              <Text style={styles.heroTitle}>Get 50% Off Your First Ride</Text>
              <Text style={styles.heroSub}>Use code <Text style={{ fontWeight: '800', color: COLORS.secondary }}>FIRST50</Text> at checkout</Text>
            </View>
            <View style={styles.heroAction}>
              <Text style={styles.heroActionText}>Book Now</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        )}

        {/* 4. Ride Services Grid (2x2 High-End Cards) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ride Services</Text>
        </View>
        <View style={styles.servicesGrid}>
          {[
            {
              id: 'local',
              icon: 'car-sport',
              title: 'Local Cab',
              sub: 'City & Daily Rides',
              tag: '⚡ Instant',
              tagBg: '#EFF6FF',
              tagColor: '#2563EB',
              iconBg: '#DBEAFE',
              iconColor: '#2563EB',
              action: () => navigation.navigate('Booking'),
            },
            {
              id: 'long',
              icon: 'calendar',
              title: 'Outstation',
              sub: '≥ 130 km Intercity',
              tag: '🛣️ Scheduled',
              tagBg: '#F5F3FF',
              tagColor: '#7C3AED',
              iconBg: '#EDE9FE',
              iconColor: '#7C3AED',
              action: () => navigation.navigate('LongTrip'),
            },
            {
              id: 'shared',
              icon: 'people',
              title: 'Shared 50/50',
              sub: 'Split Long Trips',
              tag: '💰 Save 50%',
              tagBg: '#ECFDF5',
              tagColor: '#059669',
              iconBg: '#D1FAE5',
              iconColor: '#059669',
              action: () => navigation.navigate('SharedTrips'),
            },
            {
              id: 'kyc',
              icon: 'shield-checkmark',
              title: 'Aadhaar KYC',
              sub: 'Govt ID Proof',
              tag: '🛡️ Safety Pass',
              tagBg: '#FFFBEB',
              tagColor: '#D97706',
              iconBg: '#FEF3C7',
              iconColor: '#D97706',
              action: () => navigation.navigate('IdentityVerification'),
            },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.serviceCard}
              onPress={item.action}
              activeOpacity={0.85}
            >
              <View style={styles.serviceTopRow}>
                <View style={[styles.serviceIconWrap, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={22} color={item.iconColor} />
                </View>
                <View style={[styles.serviceTag, { backgroundColor: item.tagBg }]}>
                  <Text style={[styles.serviceTagText, { color: item.tagColor }]}>{item.tag}</Text>
                </View>
              </View>
              <Text style={styles.serviceTitle}>{item.title}</Text>
              <Text style={styles.serviceSub}>{item.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick Utility Actions Row */}
        <View style={styles.utilityRow}>
          {[
            {
              icon: 'time-outline',
              label: 'My Trips',
              action: () => navigation.navigate('Trips')
            },
            {
              icon: 'pricetag-outline',
              label: 'Coupons',
              action: () => {
                if (coupons.length > 0) {
                  const list = coupons.map(c => `• ${c.code}: ${c.description || (c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `Flat ₹${c.discount_value} OFF`)}`).join('\n')
                  Alert.alert('Active Offers & Coupons 🏷️', `Available promo codes from Admin:\n\n${list}\n\nTap "Apply Code" on any offer card to use it!`)
                } else {
                  Alert.alert('Offers & Coupons', 'No active promo codes right now. Stay tuned for new offers from admin!')
                }
              }
            },
            {
              icon: 'headset-outline',
              label: '24x7 Help',
              action: () => navigation.navigate('Support')
            },
            {
              icon: 'shield-outline',
              label: 'Safety SOS',
              action: handleSOS
            },
          ].map((u, i) => (
            <TouchableOpacity key={i} style={styles.utilityChip} onPress={u.action} activeOpacity={0.8}>
              <Ionicons name={u.icon} size={16} color={COLORS.text} />
              <Text style={styles.utilityLabel}>{u.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 5. Upcoming Ride / Active Booking Card */}
        {activeBooking && (
          <View style={styles.activeWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Ride Status</Text>
              <View style={[styles.livePulseTag, activeBooking.status === 'driver_arrived' && { backgroundColor: '#FEF3C7' }]}>
                <View style={[styles.pulseDot, activeBooking.status === 'driver_arrived' && { backgroundColor: '#D97706' }]} />
                <Text style={[styles.livePulseText, activeBooking.status === 'driver_arrived' && { color: '#B45309' }]}>
                  {activeBooking.status === 'driver_arrived' ? 'DRIVER ARRIVED' : 'LIVE'}
                </Text>
              </View>
            </View>
            <View style={[styles.activeCard, activeBooking.status === 'driver_arrived' && { borderColor: '#F59E0B', borderWidth: 2 }]}>
              <View style={styles.activeHeader}>
                <View>
                  <Text style={styles.activeRef}>{activeBooking.booking_ref}</Text>
                  <Text style={[styles.activeStatus, activeBooking.status === 'driver_arrived' ? { color: '#D97706' } : (['trip_started', 'in_progress'].includes(activeBooking.status) ? { color: '#059669' } : {})]}>
                    {activeBooking.status === 'driver_arrived' ? 'DRIVER AT PICKUP' : (['trip_started', 'in_progress'].includes(activeBooking.status) ? 'BOARDED ✓ IN PROGRESS' : activeBooking.status?.replace(/_/g, ' ').toUpperCase())}
                  </Text>
                </View>
                <Text style={styles.activeFare}>₹{Math.round(activeBooking.final_fare || activeBooking.fare_estimate || 0)}</Text>
              </View>

              {/* Start OTP Highlight Alert when Driver Arrives */}
              {activeBooking.status === 'driver_arrived' && (
                <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, marginVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#FDE68A' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="key" size={18} color="#B45309" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>Share Ride Start PIN:</Text>
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#78350F', letterSpacing: 4 }}>
                    {activeBooking.driver_otp || '••••'}
                  </Text>
                </View>
              )}

              <Text style={styles.activeRoute} numberOfLines={1}>📍 {activeBooking.pickup_address} → {activeBooking.dest_address}</Text>
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={() => navigation.navigate('BookingTrack', { bookingId: activeBooking.id })}
              >
                <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
                <Text style={styles.trackBtnText}>Track Live Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Upcoming Scheduled Booking Card */}
        {upcomingBooking && !activeBooking && (
          <View style={styles.activeWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📅 Upcoming Scheduled Ride</Text>
              <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#7C3AED' }}>SCHEDULED</Text>
              </View>
            </View>
            <View style={[styles.activeCard, { borderColor: '#DDD6FE', borderWidth: 1.5 }]}>
              <View style={styles.activeHeader}>
                <View>
                  <Text style={styles.activeRef}>{upcomingBooking.booking_ref}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '700', marginTop: 2 }}>
                    {upcomingBooking.scheduled_date || 'Today'} at {upcomingBooking.scheduled_time?.substring(0, 5) || '08:30'}
                  </Text>
                </View>
                <Text style={styles.activeFare}>₹{Math.round(upcomingBooking.final_fare || upcomingBooking.fare_estimate || 0)}</Text>
              </View>
              <Text style={styles.activeRoute} numberOfLines={1}>📍 {upcomingBooking.pickup_address} → {upcomingBooking.dest_address}</Text>
              <TouchableOpacity
                style={[styles.trackBtn, { backgroundColor: '#7C3AED' }]}
                onPress={() => navigation.navigate('Trips')}
              >
                <Text style={styles.trackBtnText}>View Scheduled Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 6. Admin Offers & Coupons (Dynamic from DB) */}
        {coupons.length > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Exclusive Offers & Promo Codes</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScrollContent}>
              {coupons.map((c, i) => {
                const colorSet = COUPON_COLORS[i % COUPON_COLORS.length]
                const discountDesc = c.description || (c.discount_type === 'percent'
                  ? `${c.discount_value}% OFF${c.max_discount ? ` up to ₹${c.max_discount}` : ''}`
                  : `Flat ₹${c.discount_value} OFF`)
                const minFareNote = c.min_fare > 0 ? `Min fare ₹${Math.round(c.min_fare)}` : 'On all rides'

                return (
                  <View key={c.id || i} style={[styles.couponCard, { backgroundColor: colorSet.bg }]}>
                    <View style={styles.couponTag}>
                      <Ionicons name="pricetag" size={13} color={colorSet.color} />
                      <Text style={[styles.couponCode, { color: colorSet.color }]}>{c.code}</Text>
                    </View>
                    <View style={{ marginVertical: 4 }}>
                      <Text style={[styles.couponDesc, { color: colorSet.color }]} numberOfLines={2}>{discountDesc}</Text>
                      <Text style={[styles.couponSubDesc, { color: colorSet.color }]}>{minFareNote}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.applyBtn}
                      onPress={() => navigation.navigate('Booking', { coupon: c.code })}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.applyBtnText}>Apply Code</Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* 7. Saved Places */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Saved Destinations</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SavedPlaces')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
              {savedPlaces.length > 0 ? 'Manage Places →' : '+ Add Place'}
            </Text>
          </TouchableOpacity>
        </View>
        {savedPlaces.length > 0 ? (
          <View style={styles.savedGrid}>
            {savedPlaces.map((p, i) => (
              <TouchableOpacity
                key={p.id || i}
                style={styles.savedChip}
                onPress={() => handleSelectSavedPlace(p)}
                activeOpacity={0.8}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: p.is_home ? '#ECFDF5' : (p.is_work ? '#F5F3FF' : '#EEF2FF'),
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <Ionicons
                    name={p.icon}
                    size={18}
                    color={p.is_home ? '#10B981' : (p.is_work ? '#7C3AED' : COLORS.primary)}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.savedLabel}>{p.label}</Text>
                    {p.custom_label ? (
                      <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.gray700 }}>{p.custom_label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.savedAddr} numberOfLines={1}>{p.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.gray400} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={{
            backgroundColor: COLORS.white,
            borderRadius: RADIUS.xl,
            padding: 18,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderStyle: 'dashed',
            alignItems: 'center',
            marginBottom: SPACING.md,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray700, marginBottom: 4 }}>
              No saved destinations yet
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.gray500, textAlign: 'center', marginBottom: 12 }}>
              Save Home, Work, Airport, or Station for 1-tap bookings.
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: COLORS.primary,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: RADIUS.md,
              }}
              onPress={() => navigation.navigate('SavedPlaces')}
            >
              <Ionicons name="add-circle" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
              <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800' }}>+ Add Location</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 8. Available Ride Categories */}
        {types.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Ride Categories</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScrollContent}>
              {types.map((t) => {
                const n = (t.name || '').toLowerCase()
                let iconName = 'car-sport'
                if (n.includes('scoot')) iconName = 'bicycle'
                else if (n.includes('bike') || n.includes('moto')) iconName = 'bicycle'
                else if (n.includes('auto') || n.includes('rick')) iconName = 'flash'
                else if (n.includes('7') || n.includes('van') || n.includes('seat')) iconName = 'bus'
                else if (n.includes('mini') || n.includes('3')) iconName = 'car-sport'

                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.categoryCard}
                    onPress={() => navigation.navigate('Booking', { vehicleTypeId: t.id, vehicleTypeName: t.name })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.categoryIconWrap}>
                      <Ionicons name={iconName} size={28} color={COLORS.primary} />
                    </View>
                    <Text style={styles.categoryName}>{t.name}</Text>
                    <Text style={styles.categoryFare}>From ₹{Number(t.base_fare || 0).toFixed(0)}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </>
        )}

        {/* 9. Safety Features */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Safety & Protection Shield</Text>
        </View>
        <View style={styles.safetyCard}>
          <View style={styles.safetyRow}>
            <Ionicons name="shield-checkmark" size={24} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.safetyTitle}>24/7 Safety Assistance</Text>
              <Text style={styles.safetySub}>All rides monitored with GPS tracking & verified drivers</Text>
            </View>
          </View>
          <View style={styles.safetyDivider} />
          <View style={styles.safetyButtons}>
            <TouchableOpacity style={styles.safetySubBtn} onPress={handleSOS}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={[styles.safetySubText, { color: '#EF4444' }]}>Emergency SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.safetySubBtn} onPress={() => Alert.alert('Share Status', 'Share ride link active!')}>
              <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
              <Text style={styles.safetySubText}>Share Trip Status</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 10. Recent Trips */}
        {recentTrips.length > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Trips</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Trips')}>
                <Text style={styles.seeAll}>View All →</Text>
              </TouchableOpacity>
            </View>
            {recentTrips.map(trip => (
              <View key={trip.id} style={styles.recentTripCard}>
                <View style={styles.tripRow}>
                  <View style={styles.tripIcon}>
                    <Ionicons name="location" size={18} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripDest} numberOfLines={1}>{trip.dest_address}</Text>
                    <Text style={styles.tripDate}>{trip.completed_at ? new Date(trip.completed_at).toLocaleDateString('en-IN') : 'Recent'}</Text>
                  </View>
                  <Text style={styles.tripPrice}>₹{trip.final_fare}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 11. Invite Friends Banner */}
        <View style={styles.referralCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.refTitle}>Invite Friends</Text>
            <Text style={styles.refSub}>Share CityDropTaxi with your friends & family</Text>
          </View>
          <TouchableOpacity style={styles.refBtn} onPress={handleShareReferral}>
            <Text style={styles.refBtnText}>Invite</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.background },
  scrollContent:    { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SPACING.md, paddingBottom: SPACING.md },
  brandRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  brandBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  brandBadgeText:   { color: COLORS.white, fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  cityPill:         { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.successLight, paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#A7F3D0' },
  cityPillText:     { color: COLORS.successDark, fontSize: 10, fontWeight: '800' },
  greeting:         { fontSize: FONTS.sizes.xl, fontWeight: '900', color: COLORS.textPrimary },
  subGreeting:      { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  headerIcons:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn:          { width: 40, height: 40, borderRadius: RADIUS.lg, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm, borderWidth: 1, borderColor: COLORS.gray200 },
  notifBadge:       { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  avatar:           { width: 42, height: 42, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm, borderWidth: 2, borderColor: COLORS.primaryLight },
  avatarText:       { color: COLORS.white, fontWeight: '800', fontSize: FONTS.sizes.base },
  
  // Search Card
  searchCard:       { marginBottom: SPACING.lg, ...SHADOW.md },
  searchInner:      { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, paddingHorizontal: 14, height: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: COLORS.primaryLight },
  searchIconWrap:   { width: 38, height: 38, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  searchPlaceholder:{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  searchSub:        { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  nowPill:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  nowPillText:      { fontSize: 11, fontWeight: '800', color: COLORS.textPrimary },

  // Hero Promo Banner
  heroBanner:       { backgroundColor: COLORS.primary, borderRadius: RADIUS.xxl, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl, ...SHADOW.md },
  heroBadge:        { backgroundColor: COLORS.secondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm, alignSelf: 'flex-start', marginBottom: 6 },
  heroBadgeText:    { color: '#1E293B', fontSize: 10, fontWeight: '800' },
  heroTitle:        { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.white },
  heroSub:          { fontSize: FONTS.sizes.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroAction:       { backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.lg, flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroActionText:   { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '800' },

  // Section
  sectionHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm, marginTop: SPACING.xs },
  sectionTitle:     { fontSize: FONTS.sizes.sm, fontWeight: '800', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  seeAll:           { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.primary },

  // Services 2x2 Grid
  servicesGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: SPACING.md },
  serviceCard:      { width: '48%', backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.gray100, ...SHADOW.sm },
  serviceTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  serviceIconWrap:  { width: 42, height: 42, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  serviceTag:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm },
  serviceTagText:   { fontSize: 9, fontWeight: '800' },
  serviceTitle:     { fontSize: FONTS.sizes.sm, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  serviceSub:       { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },

  // Utility Actions Row
  utilityRow:       { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  utilityChip:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.gray100, ...SHADOW.sm },
  utilityLabel:     { fontSize: 11, fontWeight: '700', color: COLORS.text },

  // Active Ride
  activeWrap:       { marginBottom: SPACING.lg },
  livePulseTag:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  pulseDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  livePulseText:    { fontSize: 10, fontWeight: '800', color: '#EF4444' },
  activeCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: '#FECACA', ...SHADOW.sm },
  activeHeader:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  activeRef:        { fontSize: FONTS.sizes.xs, fontWeight: '800', color: COLORS.primary, fontFamily: 'monospace' },
  activeStatus:     { fontSize: 10, fontWeight: '800', color: '#EF4444', marginTop: 2 },
  activeFare:       { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text },
  activeRoute:      { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginBottom: 12 },
  trackBtn:         { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  trackBtnText:     { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.xs },

  // Horizontal Scroll
  hScrollContent:   { paddingRight: SPACING.lg, gap: 12, marginBottom: SPACING.lg },

  // Coupon Card
  couponCard:       { width: 160, borderRadius: RADIUS.xl, padding: SPACING.md, justifyContent: 'space-between', minHeight: 110, ...SHADOW.sm },
  couponTag:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  couponCode:       { fontSize: FONTS.sizes.xs, fontWeight: '800' },
  couponDesc:       { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  couponSubDesc:    { fontSize: 10, opacity: 0.9, marginTop: 2, fontWeight: '500' },
  applyBtn:         { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: RADIUS.sm, paddingVertical: 4, alignItems: 'center', marginTop: 4 },
  applyBtnText:     { color: COLORS.white, fontSize: 10, fontWeight: '700' },

  // Saved Places
  savedGrid:        { gap: 8, marginBottom: SPACING.lg },
  savedChip:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, ...SHADOW.sm },
  savedLabel:       { fontSize: FONTS.sizes.xs, fontWeight: '800', color: COLORS.text },
  savedAddr:        { fontSize: 11, color: COLORS.textMuted },

  // Ride Category Card
  categoryCard:     { width: 100, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.gray100, ...SHADOW.sm },
  categoryIconWrap: { width: 48, height: 48, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  categoryName:     { fontSize: FONTS.sizes.xs, fontWeight: '800', color: COLORS.text },
  categoryFare:     { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },

  // Safety Card
  safetyCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm },
  safetyRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  safetyTitle:      { fontSize: FONTS.sizes.xs, fontWeight: '800', color: COLORS.text },
  safetySub:        { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  safetyDivider:    { height: 1, backgroundColor: COLORS.gray100, marginVertical: 12 },
  safetyButtons:    { flexDirection: 'row', justifyContent: 'space-between' },
  safetySubBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  safetySubText:    { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Recent Trip Card
  recentTripCard:   { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: 8, ...SHADOW.sm },
  tripRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  tripIcon:         { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tripDest:         { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.text },
  tripDate:         { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  tripPrice:        { fontSize: FONTS.sizes.xs, fontWeight: '800', color: COLORS.text },
  rebookBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, paddingVertical: 6 },
  rebookText:       { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Wallet Card
  walletCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg, ...SHADOW.sm },
  walletLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletLabel:      { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  walletBal:        { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text },
  topUpBtn:         { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.lg },
  topUpText:        { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.xs },

  // Referral Card
  referralCard:     { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: RADIUS.xl, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...SHADOW.sm },
  refTitle:         { fontSize: FONTS.sizes.xs, fontWeight: '800', color: '#92400E' },
  refSub:           { fontSize: 11, color: '#B45309', marginTop: 2 },
  refBtn:           { backgroundColor: COLORS.secondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.lg },
  refBtnText:       { color: '#1E293B', fontWeight: '800', fontSize: FONTS.sizes.xs },
})

export default HomeScreen
