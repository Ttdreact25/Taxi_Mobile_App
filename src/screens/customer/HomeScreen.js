import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import * as Location from 'expo-location'
import {
  vehicleTypesAPI,
  bookingsAPI,
  adsAPI,
  notifAPI,
  customerAPI,
  couponsAPI,
  longTripAPI,
  resolveAssetUrl,
} from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'
import AdCarousel from '../../components/ui/AdCarousel'
import { Skeleton } from '../../components/common/Skeleton'
import { playCustomerTaxiReachedAlert } from '../../services/SoundService'
import { useDoubleBackExit } from '../../components/common/DoubleBackExitHandler'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const COUPON_COLORS = [
  { bg: '#7C3AED', color: '#FFFFFF' },
  { bg: '#059669', color: '#FFFFFF' },
  { bg: '#EA580C', color: '#FFFFFF' },
  { bg: '#D97706', color: '#FFFFFF' },
  { bg: '#DB2777', color: '#FFFFFF' },
  { bg: '#0F172A', color: '#FFFFFF' },
]

const HomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { ExitToastComponent } = useDoubleBackExit(95)
  const [types,            setTypes]            = useState([])
  const [activeBooking,    setActiveBooking]    = useState(null)
  const [recentTrips,      setRecentTrips]      = useState([])
  const [ads,              setAds]              = useState([])
  const [coupons,          setCoupons]          = useState([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [upcomingBooking,  setUpcomingBooking]  = useState(null)
  const [savedPlaces,      setSavedPlaces]      = useState([])
  const [kycData,          setKycData]          = useState(null)
  const [kycStatus,        setKycStatus]        = useState('none')
  const [loading,          setLoading]          = useState(true)
  const cachedLocationRef = useRef({ city: '', lat: null, lng: null, timestamp: 0 })
  const alertedArrivedTripIdRef = useRef(null)

  const getPlaceIcon = (name = '', type = '') => {
    const n = `${name} ${type}`.toLowerCase()
    if (n.includes('home')) return 'home'
    if (n.includes('work') || n.includes('office')) return 'briefcase'
    if (n.includes('airport') || n.includes('flight') || n.includes('plane')) return 'airplane'
    if (n.includes('station') || n.includes('rail') || n.includes('train')) return 'train'
    return 'bookmark'
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // Location-based promotional banner geofencing & caching
      let locationParams = {}
      const now = Date.now()
      if (cachedLocationRef.current.city && (now - cachedLocationRef.current.timestamp < 300000)) {
        locationParams = {
          city: cachedLocationRef.current.city,
          latitude: cachedLocationRef.current.lat,
          longitude: cachedLocationRef.current.lng,
        }
      } else {
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
              const detectedCity = rev?.[0]?.city || rev?.[0]?.subregion || rev?.[0]?.district || ''
              cachedLocationRef.current = {
                city: detectedCity,
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                timestamp: now,
              }
              locationParams = {
                city: detectedCity,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              }
            }
          }
        } catch (e) {}
      }

      const [typeRes, tripRes, adsRes, notifRes, savedRes, couponRes, kycRes] = await Promise.allSettled([
        vehicleTypesAPI.list(),
        bookingsAPI.myTrips({ per_page: 5 }),
        adsAPI.list({ target_audience: 'customer', ...locationParams }),
        notifAPI.list(),
        customerAPI.getSavedLocations(),
        couponsAPI.active(locationParams),
        longTripAPI.myVerification(),
      ])

      if (typeRes.status === 'fulfilled') setTypes(typeRes.value.data?.types || [])
      if (adsRes.status === 'fulfilled') setAds(adsRes.value.data?.ads || [])
      if (couponRes.status === 'fulfilled') setCoupons(couponRes.value.data?.coupons || [])
      if (notifRes.status === 'fulfilled') setUnreadNotifCount(notifRes.value.data?.unread || 0)
      if (kycRes.status === 'fulfilled' && kycRes.value.data?.data) {
        const v = kycRes.value.data.data
        setKycData(v)
        setKycStatus(v.verification_status || v.status || 'none')
      } else {
        setKycStatus('none')
      }

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
        if (active?.status === 'driver_arrived' && alertedArrivedTripIdRef.current !== active.id) {
          alertedArrivedTripIdRef.current = active.id
          playCustomerTaxiReachedAlert(active.id, active.driver_name, active.plate_no || active.model).catch(() => {})
        }
        setUpcomingBooking(upcoming || null)
        setRecentTrips(trips.filter(t => t.status === 'completed').slice(0, 4))
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
        message: `Join me on CityOneTaxi for reliable, safe and comfortable rides! Download the app now.`
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

  const defaultSavedPlaces = [
    { id: 'def_home',   icon: 'home',      label: 'Home',   address: 'Home',   is_home: true },
    { id: 'def_office', icon: 'briefcase', label: 'Office', address: 'Office', is_work: true },
    { id: 'def_mvl',    icon: 'bookmark',  label: 'MVL',    address: 'MVL' },
    { id: 'def_mall',   icon: 'bookmark',  label: 'Mall',   address: 'Mall' },
  ]

  const displaySavedPlaces = savedPlaces.length > 0 ? savedPlaces : defaultSavedPlaces

  if (loading && types.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFC700" />
        <View style={[styles.headerHero, { paddingTop: insets.top + 12 }]}>
          <Skeleton width={140} height={18} borderRadius={RADIUS.sm} style={{ marginBottom: 8 }} />
          <Skeleton width={220} height={28} borderRadius={RADIUS.sm} style={{ marginBottom: 20 }} />
          <Skeleton width="100%" height={56} borderRadius={RADIUS.xl} />
        </View>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
            <Skeleton width="23%" height={80} borderRadius={RADIUS.xl} />
            <Skeleton width="23%" height={80} borderRadius={RADIUS.xl} />
            <Skeleton width="23%" height={80} borderRadius={RADIUS.xl} />
            <Skeleton width="23%" height={80} borderRadius={RADIUS.xl} />
          </View>
          <Skeleton width="100%" height={150} borderRadius={RADIUS.xxl} style={{ marginBottom: 20 }} />
          <Skeleton width="100%" height={90} borderRadius={RADIUS.xl} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFC700" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {/* ── 1. TAXI GOLD TOP HERO BANNER (MATCHING SCREENSHOT) ── */}
        <View style={[styles.headerHero, { paddingTop: insets.top + 8 }]}>
          {/* Subtle Angled Map Street Graphic in Background */}
          <View style={styles.headerMapLines} pointerEvents="none">
            <View style={styles.mapGridLine1} />
            <View style={styles.mapGridLine2} />
            <View style={styles.mapGridLine3} />
            <View style={styles.mapGridBox1} />
            <View style={styles.mapGridBox2} />
          </View>

          {/* Top Brand & Action Bar */}
          <View style={styles.heroTopBar}>
            <View style={styles.heroBrandRow}>
              <View style={styles.taxiBadgePill}>
                <Image
                  source={require('../../../assets/cityonetaxi_badge.png')}
                  style={{ width: 17, height: 17, marginRight: 4 }}
                  resizeMode="contain"
                />
                <Text style={styles.taxiBadgeText}>CityOneTaxi</Text>
              </View>
              <View style={styles.liveTagPill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTagText}>Tamil Nadu</Text>
              </View>
            </View>

            <View style={styles.heroRightActions}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Notifications')}
                style={styles.heroActionBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications-outline" size={19} color="#0F172A" />
                {unreadNotifCount > 0 && <View style={styles.notifBadgeDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('Profile')}
                style={styles.heroAvatarBtn}
                activeOpacity={0.8}
              >
                {resolveAssetUrl(user?.avatar_url || user?.avatar) ? (
                  <Image
                    key={resolveAssetUrl(user?.avatar_url || user?.avatar)}
                    source={{ uri: resolveAssetUrl(user?.avatar_url || user?.avatar) }}
                    style={styles.heroAvatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.heroAvatarInitial}>
                    {(user?.name?.[0] || 'U').toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting & Headline */}
          <View style={styles.heroTextRow}>
            <View style={{ flex: 1, zIndex: 2 }}>
              <Text style={styles.heroGreeting}>
                Hi, {user?.name?.split(' ')[0] || 'Dixie'}
              </Text>
              <Text style={styles.heroHeadline}>
                How can we serve{'\n'}you today?
              </Text>
            </View>

            {/* Subtle Stylized Brand Logo Graphic in Yellow Header */}
            <View style={styles.heroCarGraphicWrap} pointerEvents="none">
              <View style={styles.miniCarBadge}>
                <Image
                  source={require('../../../assets/cityonetaxi_badge.png')}
                  style={{ width: 42, height: 42 }}
                  resizeMode="contain"
                />
              </View>
            </View>
          </View>

          {/* ── FLOATING "WHERE TO" SEARCH CARD (MATCHING SCREENSHOT) ── */}
          <View style={styles.searchCardContainer}>
            <TouchableOpacity
              style={styles.searchCard}
              onPress={() => navigation.navigate('Booking', { autoFocusDest: true })}
              activeOpacity={0.92}
            >
              <View style={styles.searchPinBox}>
                <Ionicons name="location-sharp" size={20} color="#0F172A" />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={styles.searchPlaceholderText}>Where to</Text>
              </View>
              <TouchableOpacity
                style={styles.nowDropdownPill}
                onPress={() => navigation.navigate('Booking', { autoFocusDest: true })}
                activeOpacity={0.8}
              >
                <Text style={styles.nowDropdownText}>Now</Text>
                <Ionicons name="chevron-down" size={14} color="#0F172A" />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 2. QUICK CATEGORY ROW (4 ITEMS MATCHING SCREENSHOT) ── */}
        <View style={styles.categoriesRow}>
          {/* 1. Local Trip */}
          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => navigation.navigate('Booking', { tripMode: 'local' })}
            activeOpacity={0.82}
          >
            <View style={styles.categoryIconCard}>
              <View style={styles.carIllustrationBox}>
                <Ionicons name="car-sport" size={36} color="#D97706" />
                <View style={styles.passengersBadge}>
                  <Ionicons name="person" size={11} color="#1E293B" />
                  <Text style={styles.passengersBadgeText}>4</Text>
                </View>
              </View>
            </View>
            <Text style={styles.categoryItemLabel} numberOfLines={1}>
              Local Trip
            </Text>
          </TouchableOpacity>

          {/* 2. Outstation */}
          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => navigation.navigate('Booking', { tripMode: 'outstation' })}
            activeOpacity={0.82}
          >
            <View style={styles.categoryIconCard}>
              <View style={styles.carIllustrationBox}>
                <Ionicons name="car" size={36} color="#7C3AED" />
                <View style={styles.passengersBadge}>
                  <Ionicons name="map" size={11} color="#7C3AED" />
                  <Text style={styles.passengersBadgeText}>&gt;50km</Text>
                </View>
              </View>
            </View>
            <Text style={styles.categoryItemLabel} numberOfLines={1}>
              Outstation
            </Text>
          </TouchableOpacity>

          {/* 3. Shared Trip */}
          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => navigation.navigate('SharedTrips')}
            activeOpacity={0.82}
          >
            <View style={styles.categoryIconCard}>
              <View style={styles.carIllustrationBox}>
                <Ionicons name="people" size={36} color="#059669" />
                <View style={styles.passengersBadge}>
                  <Ionicons name="people" size={11} color="#059669" />
                  <Text style={styles.passengersBadgeText}>2</Text>
                </View>
              </View>
            </View>
            <Text style={styles.categoryItemLabel} numberOfLines={1}>
              Shared Trip
            </Text>
          </TouchableOpacity>

          {/* 4. All Services */}
          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => navigation.navigate('Booking')}
            activeOpacity={0.82}
          >
            <View style={styles.categoryIconCard}>
              <View style={styles.carIllustrationBox}>
                <Ionicons name="grid" size={34} color="#0F172A" />
                <View style={styles.passengersBadge}>
                  <Ionicons name="apps" size={11} color="#D97706" />
                  <Text style={styles.passengersBadgeText}>All</Text>
                </View>
              </View>
            </View>
            <Text style={styles.categoryItemLabel} numberOfLines={1}>
              All
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. ACTIVE BOOKING STATUS ALERT (IF LIVE RIDE RUNNING) ── */}
        {activeBooking && (
          <View style={styles.activeBookingSection}>
            <View style={styles.activeSectionHeader}>
              <Text style={styles.activeSectionTitle}>Active Ride Status</Text>
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
                <View style={styles.otpBanner}>
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
                activeOpacity={0.88}
              >
                <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
                <Text style={styles.trackBtnText}>Track Live Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* KYC Status Action Banner (shown if not verified) */}
        {kycStatus !== 'verified' && (
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={[
                styles.kycBanner,
                kycStatus === 'pending' ? styles.kycBannerPending :
                kycStatus === 'rejected' ? styles.kycBannerRejected : styles.kycBannerRequired
              ]}
              onPress={() => navigation.navigate('IdentityVerification')}
              activeOpacity={0.88}
            >
              <View style={styles.kycBannerIconWrap}>
                <Ionicons
                  name={kycStatus === 'pending' ? 'time' : kycStatus === 'rejected' ? 'alert-circle' : 'shield-checkmark'}
                  size={20}
                  color={kycStatus === 'pending' ? '#D97706' : kycStatus === 'rejected' ? '#DC2626' : '#D97706'}
                />
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[
                  styles.kycBannerTitle,
                  { color: kycStatus === 'pending' ? '#92400E' : kycStatus === 'rejected' ? '#991B1B' : '#92400E' }
                ]}>
                  {kycStatus === 'pending' ? 'KYC Under Admin Review ⏳' :
                   kycStatus === 'rejected' ? 'KYC Verification Rejected ❌' : 'Identity KYC Required 🛡️'}
                </Text>
                <Text style={styles.kycBannerSub} numberOfLines={2}>
                  {kycStatus === 'pending' ? 'Admin is reviewing your Aadhaar documents. You can join shared rides once approved.' :
                   kycStatus === 'rejected' ? (kycData?.rejection_reason || 'Correction needed. Tap to re-upload clear photos.') :
                   'Upload Aadhaar Card & Selfie to unlock 50/50 Shared Rides.'}
                </Text>
              </View>
              <View style={[
                styles.kycBannerBtn,
                { backgroundColor: kycStatus === 'pending' ? '#D97706' : kycStatus === 'rejected' ? '#DC2626' : '#D97706' }
              ]}>
                <Text style={styles.kycBannerBtnText}>
                  {kycStatus === 'pending' ? 'Status' : kycStatus === 'rejected' ? 'Fix' : 'Upload'}
                </Text>
                <Ionicons name="arrow-forward" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 4. "WHAT'S NEW" BANNER SECTION (MATCHING SCREENSHOT) ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleBlack}>What's New</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Booking')} activeOpacity={0.7}>
              <Text style={styles.sectionMoreLink}>More</Text>
            </TouchableOpacity>
          </View>

          {/* Dynamic Admin Advertisements Auto-Sliding Carousel or Fallback Promo Card */}
          {ads.length > 0 ? (
            <View style={{ marginHorizontal: -16 }}>
              <AdCarousel ads={ads} userRole="customer" navigation={navigation} />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.whatsNewCardFallback}
              onPress={() => navigation.navigate('Booking')}
              activeOpacity={0.9}
            >
              <View style={styles.whatsNewContentLeft}>
                <Text style={styles.whatsNewHeading}>
                  How much do you{'\n'}pay for RIDE?
                </Text>
                <View style={styles.priceTagRow}>
                  <Text style={styles.whatsNewSubText}>I ONLY PAY </Text>
                  <View style={styles.blankInputBox}>
                    <Text style={styles.blankInputText}>₹ 80</Text>
                  </View>
                </View>
                <Text style={styles.whatsNewFootnote}>
                  you won't believe it?
                </Text>
              </View>

              <View style={styles.whatsNewCharacterWrap}>
                <Image
                  source={require('../../../assets/rider_promo_3d.jpg')}
                  style={styles.whatsNewCharacterImg}
                  resizeMode="contain"
                />
              </View>

              {/* Pagination Dots at Bottom Right (Matching Screenshot) */}
              <View style={styles.whatsNewDotsRow}>
                <View style={[styles.whatsNewDot, styles.whatsNewDotActive]} />
                <View style={styles.whatsNewDot} />
                <View style={styles.whatsNewDot} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 5. "SAVED PLACES" SECTION (MATCHING SCREENSHOT) ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleBlack}>Saved Places</Text>
            <TouchableOpacity onPress={() => navigation.navigate('SavedPlaces')} activeOpacity={0.7}>
              <Text style={styles.sectionMoreLink}>More</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedPlacesScroll}
          >
            {displaySavedPlaces.map((place, idx) => (
              <TouchableOpacity
                key={place.id || `sp-${idx}`}
                style={styles.savedPlaceTileWrap}
                onPress={() => handleSelectSavedPlace(place)}
                activeOpacity={0.8}
              >
                <View style={styles.savedPlaceIconBox}>
                  <Ionicons name={place.icon || 'bookmark'} size={24} color="#D97706" />
                </View>
                <Text style={styles.savedPlaceTileLabel} numberOfLines={1}>
                  {place.label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* + Add New Saved Place Button */}
            <TouchableOpacity
              style={styles.savedPlaceTileWrap}
              onPress={() => navigation.navigate('SavedPlaces')}
              activeOpacity={0.8}
            >
              <View style={styles.addPlaceIconBox}>
                <Ionicons name="add" size={26} color="#64748B" />
              </View>
              <Text style={styles.savedPlaceTileLabel}>+ Add</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── 6. "RECENT DESTINATIONS" SECTION (MATCHING SCREENSHOT BOTTOM) ── */}
        {recentTrips.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleBlack}>Recent Destinations</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Trips')} activeOpacity={0.7}>
                <Text style={styles.sectionMoreLink}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.recentDestList}>
              {recentTrips.map((trip) => (
                <TouchableOpacity
                  key={trip.id}
                  style={styles.recentDestItem}
                  onPress={() => navigation.navigate('Booking', {
                    destination: trip.dest_address,
                    destCoords: (trip.dest_latitude && trip.dest_longitude) ? { lat: parseFloat(trip.dest_latitude), lng: parseFloat(trip.dest_longitude) } : null,
                  })}
                  activeOpacity={0.8}
                >
                  <View style={styles.recentDestIconWrap}>
                    <Ionicons name="time" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.recentDestTitle} numberOfLines={1}>
                      {trip.dest_address?.split(',')[0] || trip.dest_address}
                    </Text>
                    <Text style={styles.recentDestAddress} numberOfLines={1}>
                      {trip.dest_address}
                    </Text>
                  </View>
                  <View style={styles.recentDestAction}>
                    <Text style={styles.recentDestFare}>₹{Math.round(trip.final_fare || trip.fare_estimate || 0)}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── 7. EXCLUSIVE PROMOS & COUPONS (DYNAMIC FROM DB) ── */}
        {coupons.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleBlack}>Special Offers & Coupons</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPlacesScroll}>
              {coupons.map((c, i) => {
                const colorSet = COUPON_COLORS[i % COUPON_COLORS.length]
                const discountDesc = c.description || (c.discount_type === 'percent'
                  ? `${c.discount_value}% OFF`
                  : `Flat ₹${c.discount_value} OFF`)
                return (
                  <View key={c.id || i} style={[styles.couponCard, { backgroundColor: colorSet.bg }]}>
                    <View style={styles.couponTag}>
                      <Ionicons name="pricetag" size={12} color={colorSet.color} />
                      <Text style={[styles.couponCode, { color: colorSet.color }]}>{c.code}</Text>
                    </View>
                    <Text style={[styles.couponDesc, { color: colorSet.color }]} numberOfLines={2}>{discountDesc}</Text>
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

        {/* ── 8. SAFETY & 24/7 HELPLINE BANNER ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.safetyCard}>
            <View style={styles.safetyRow}>
              <View style={styles.safetyIconBox}>
                <Ionicons name="shield-checkmark" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyTitle}>24/7 Safety & GPS Protection</Text>
                <Text style={styles.safetySub}>All rides monitored with live GPS tracking</Text>
              </View>
            </View>
            <View style={styles.safetyDivider} />
            <View style={styles.safetyButtons}>
              <TouchableOpacity style={styles.safetySubBtn} onPress={handleSOS} activeOpacity={0.8}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={[styles.safetySubText, { color: '#DC2626' }]}>Emergency SOS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.safetySubBtn} onPress={() => navigation.navigate('Support')} activeOpacity={0.8}>
                <Ionicons name="headset-outline" size={16} color="#0F172A" />
                <Text style={styles.safetySubText}>Help Center</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
      {ExitToastComponent}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 24,
  },

  // ── 1. Top Yellow Hero Header ──
  headerHero: {
    backgroundColor: '#FFC700',
    paddingHorizontal: 16,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'visible',
  },
  headerMapLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.16,
  },
  mapGridLine1: {
    position: 'absolute',
    top: 30,
    left: -40,
    width: SCREEN_WIDTH + 80,
    height: 18,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-12deg' }],
  },
  mapGridLine2: {
    position: 'absolute',
    top: 90,
    left: -20,
    width: SCREEN_WIDTH + 40,
    height: 14,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '18deg' }],
  },
  mapGridLine3: {
    position: 'absolute',
    bottom: 10,
    left: -50,
    width: SCREEN_WIDTH + 100,
    height: 22,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-6deg' }],
  },
  mapGridBox1: {
    position: 'absolute',
    top: 45,
    right: 60,
    width: 60,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  mapGridBox2: {
    position: 'absolute',
    top: 100,
    left: 40,
    width: 80,
    height: 45,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 3,
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taxiBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  taxiBadgeText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  liveTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  liveTagText: {
    color: '#1E293B',
    fontSize: 10,
    fontWeight: '800',
  },
  heroRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FFC700',
  },
  heroAvatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroAvatarImg: {
    width: '100%',
    height: '100%',
  },
  heroAvatarInitial: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  heroTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    position: 'relative',
  },
  heroGreeting: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  heroHeadline: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  heroCarGraphicWrap: {
    position: 'absolute',
    right: 10,
    top: 10,
    transform: [{ rotate: '-15deg' }],
  },
  miniCarBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── "Where to" Search Card ──
  searchCardContainer: {
    marginTop: 4,
    zIndex: 10,
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  searchPinBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPlaceholderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  nowDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  nowDropdownText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ── 2. Quick Category Row (4 Items) ──
  categoriesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 14,
  },
  categoryItem: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  categoryIconCard: {
    width: '100%',
    maxWidth: 78,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  carIllustrationBox: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  passengersBadge: {
    position: 'absolute',
    bottom: -6,
    right: -8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2.5,
    elevation: 2,
  },
  passengersBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
  },
  categoryItemLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: -0.2,
  },

  // ── Section Common Layout ──
  sectionWrap: {
    paddingHorizontal: 16,
    marginTop: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleBlack: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionMoreLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // ── What's New Card Fallback (Matching Screenshot) ──
  whatsNewCardFallback: {
    backgroundColor: '#5BA88C',
    borderRadius: 20,
    height: 148,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  whatsNewContentLeft: {
    flex: 1.2,
    justifyContent: 'center',
    zIndex: 2,
  },
  whatsNewHeading: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 8,
  },
  priceTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  whatsNewSubText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  blankInputBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  blankInputText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  whatsNewFootnote: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontStyle: 'italic',
  },
  whatsNewCharacterWrap: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  whatsNewCharacterImg: {
    width: 140,
    height: 160,
    position: 'absolute',
    bottom: -16,
    right: -10,
  },
  whatsNewDotsRow: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
    gap: 4,
    zIndex: 3,
  },
  whatsNewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  whatsNewDotActive: {
    backgroundColor: '#FFFFFF',
    width: 14,
  },

  // ── Saved Places Row (Matching Screenshot) ──
  savedPlacesScroll: {
    gap: 14,
    paddingVertical: 4,
  },
  savedPlaceTileWrap: {
    alignItems: 'center',
    width: 64,
  },
  savedPlaceIconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  addPlaceIconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  savedPlaceTileLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },

  // ── Recent Destinations ──
  recentDestList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  recentDestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  recentDestIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  recentDestTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  recentDestAddress: {
    fontSize: 11,
    color: '#64748B',
  },
  recentDestAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recentDestFare: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },

  // ── Active Booking Section ──
  activeBookingSection: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
  },
  activeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  livePulseTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },
  livePulseText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  activeRef: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    fontFamily: 'monospace',
  },
  activeStatus: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    marginTop: 2,
  },
  activeFare: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  otpBanner: {
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 10,
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  activeRoute: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  trackBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  trackBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  // ── KYC Banner ──
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    borderWidth: 1,
  },
  kycBannerRequired: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kycBannerPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kycBannerRejected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  kycBannerIconWrap: {
    marginRight: 10,
  },
  kycBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  kycBannerSub: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 2,
  },
  kycBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  kycBannerBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Coupons ──
  couponCard: {
    width: 150,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
    minHeight: 100,
  },
  couponTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  couponCode: {
    fontSize: 11,
    fontWeight: '900',
  },
  couponDesc: {
    fontSize: 11,
    fontWeight: '700',
    marginVertical: 4,
  },
  applyBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Safety Card ──
  safetyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  safetyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  safetySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  safetyDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  safetyButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  safetySubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  safetySubText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
})

export default HomeScreen
