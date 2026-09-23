import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Platform, Image
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../../constants/theme'
import { longTripAPI } from '../../api/api'

export default function SharedTripsScreen({ navigation }) {
  const isSubmittingRef = useRef(false)
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState('')
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [myRequests, setMyRequests] = useState([])

  // Join modal state
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [joinModalVisible, setJoinModalVisible] = useState(false)
  const [joinForm, setJoinForm] = useState({
    pickup_address: '',
    dest_address: '',
  })
  const [validatingRoute, setValidatingRoute] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [submittingJoin, setSubmittingJoin] = useState(false)

  const loadTrips = useCallback(async () => {
    setLoading(true)
    try {
      const res = await longTripAPI.searchShared({
        pickup_date: selectedDate || undefined
      })
      if (res.data?.status === 'success') {
        setTrips(res.data.shared_trips || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  const loadVerification = async () => {
    try {
      const res = await longTripAPI.myVerification()
      if (res.data?.status === 'success') {
        setVerificationStatus(res.data.verification?.status || 'none')
      }
    } catch {}
  }

  const loadMyRequests = async () => {
    try {
      const res = await longTripAPI.getJoinRequests()
      if (res.data?.status === 'success') {
        setMyRequests(res.data.requests || [])
      }
    } catch {}
  }

  useEffect(() => {
    loadTrips()
    loadVerification()
    loadMyRequests()
  }, [loadTrips])

  const handleOpenJoin = (trip) => {
    if (verificationStatus !== 'verified') {
      Alert.alert(
        'Identity Verification Required',
        'Complete Identity Verification before joining a Shared Trip. Your Government ID proof and selfie must be verified by Admin.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify Identity', onPress: () => navigation.navigate('IdentityVerification') }
        ]
      )
      return
    }

    setSelectedTrip(trip)
    setValidationResult(null)
    setJoinForm({
      pickup_address: trip.pickup_address,
      dest_address: trip.dest_address,
    })
    setJoinModalVisible(true)
  }

  const handleValidateRoute = async () => {
    if (!selectedTrip || !joinForm.pickup_address.trim() || !joinForm.dest_address.trim()) return
    setValidatingRoute(true)
    setValidationResult(null)
    try {
      const res = await longTripAPI.validateJoinRoute({
        long_trip_id: selectedTrip.id,
        pickup_address: joinForm.pickup_address.trim(),
        dest_address: joinForm.dest_address.trim()
      })
      if (res.data?.status === 'success') {
        setValidationResult(res.data)
      } else {
        setValidationResult({
          is_compatible: false,
          message: res.data?.message || 'Route is not compatible with host corridor.'
        })
      }
    } catch (err) {
      setValidationResult({
        is_compatible: false,
        message: err.response?.data?.message || 'Detour exceeds allowable corridor threshold.'
      })
    } finally {
      setValidatingRoute(false)
    }
  }

  const [activeChatReq, setActiveChatReq] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const [chatModalVisible, setChatModalVisible] = useState(false)

  const openChatModal = async (req) => {
    setActiveChatReq(req)
    setChatModalVisible(true)
    setLoadingChat(true)
    try {
      const res = await longTripAPI.getChats(req.id)
      if (res.data?.status === 'success') {
        setChatMessages(res.data.data?.chats || res.data.chats || [])
      }
    } catch (e) {
      console.log('Chat load failed', e)
    } finally {
      setLoadingChat(false)
    }
  }

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !activeChatReq) return
    const msg = chatInput.trim()
    setChatInput('')
    try {
      await longTripAPI.sendChat({
        request_id: activeChatReq.id,
        message: msg,
      })
      setChatMessages(prev => [...prev, { id: Date.now(), message: msg, sender_type: 'passenger', created_at: new Date().toISOString() }])
    } catch (e) {
      Alert.alert('Error', 'Failed to send message.')
    }
  }

  const handleSendJoinRequest = async () => {
    if (!selectedTrip) return
    if (!joinForm.pickup_address.trim() || !joinForm.dest_address.trim()) {
      Alert.alert('Missing Field', 'Please provide your pickup and drop address.')
      return
    }
    if (isSubmittingRef.current || submittingJoin) return
    isSubmittingRef.current = true
    setSubmittingJoin(true)
    try {
      const res = await longTripAPI.requestJoin({
        long_trip_id: selectedTrip.id,
        pickup_address: joinForm.pickup_address.trim(),
        dest_address: joinForm.dest_address.trim(),
      })
      if (res.data?.status === 'success') {
        setJoinForm({ pickup_address: '', dest_address: '' })
        setJoinModalVisible(false)
        loadMyRequests()
        Alert.alert(
          'Join Request Submitted 🎉',
          'Your join request has been sent to Admin for verification. Once approved, you can chat with the host to discuss pickup details.'
        )
      } else {
        isSubmittingRef.current = false
        Alert.alert('Request Failed', res.data?.message || 'Unable to submit request')
      }
    } catch (err) {
      isSubmittingRef.current = false
      Alert.alert('Error', err.response?.data?.message || 'Failed to submit join request')
    } finally {
      setSubmittingJoin(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Available Shared Trips</Text>
          <Text style={styles.headerSub}>Split long trip fares 50/50 with verified riders</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('LongTrip')}
          style={styles.scheduleBtn}
        >
          <Text style={styles.scheduleBtnText}>+ Outstation</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Verification Alert Banner if not verified */}
        {verificationStatus !== 'verified' && (
          <View style={styles.verifyBanner}>
            <Ionicons name="shield-checkmark" size={22} color="#D97706" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.verifyBannerTitle}>Identity Verification Required</Text>
              <Text style={styles.verifyBannerText}>
                Complete identity verification (Govt ID + Selfie) before joining any shared ride.
              </Text>
            </View>
          </View>
        )}

        {/* Active Join Requests */}
        {myRequests.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>My Join Requests</Text>
              <Text style={styles.badgeCount}>{myRequests.length} Active</Text>
            </View>
            {myRequests.map(req => (
              <TouchableOpacity
                key={req.id}
                style={styles.reqCard}
                onPress={() => openChatModal(req)}
                activeOpacity={0.8}
              >
                <View style={styles.reqHeader}>
                  <Text style={styles.reqCode}>{req.trip_code || `REQ-#${req.id}`}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[
                      styles.reqStatus,
                      req.status === 'in_discussion' ? styles.statusGreen :
                      req.status === 'pending_host' ? styles.statusAmber : styles.statusBlue
                    ]}>
                      {req.status === 'in_discussion' ? 'Discussion Open' :
                       req.status === 'pending_host' ? 'Host Reviewing' : 'Admin Verifying'}
                    </Text>
                    <Ionicons name="chatbubbles" size={14} color="#7C3AED" />
                  </View>
                </View>
                <Text style={styles.reqRoute}>📍 {req.host_pickup} → {req.host_dest}</Text>
                <Text style={styles.reqDate}>
                  📅 {req.pickup_date} • Split Fare: ₹{Math.round(req.total_passenger_fare || req.shared_fare || 0)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Trips List */}
        <Text style={[styles.sectionTitle, { marginVertical: 12 }]}>Explore Shared Corridors</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
        ) : trips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="car-sport-outline" size={48} color={COLORS.gray400} />
            <Text style={styles.emptyTitle}>No Shared Trips Available</Text>
            <Text style={styles.emptyText}>
              No scheduled long trips found. Schedule an outstation ride and share it from My Trips!
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('LongTrip')}
              style={styles.emptyBtn}
            >
              <Text style={styles.emptyBtnText}>Schedule Outstation Ride</Text>
            </TouchableOpacity>
          </View>
        ) : (
          trips.map(trip => {
            const splitFare = Math.round(Number(trip.final_fare || 0) / 2)
            const remainingSeats = Math.max(1, (trip.max_passengers || 4) - (trip.passenger_count || 1))
            const host = trip.host_profile || {}
            const hostName = trip.host_full_name || trip.host_name || host.name || host.full_name || 'Rider'
            const hostPhoto = trip.host_avatar || trip.host_photo || host.profile_photo || host.avatar_url
            const isHostVerified = Boolean(trip.is_verified || host.is_verified)
            const hostRating = trip.host_rating || host.rating || 5.0
            const completedTripsCount = trip.completed_trips ?? host.completed_trips ?? 0
            const hostGender = host.gender || trip.host_gender || 'Co-Rider'

            return (
              <View key={trip.id} style={styles.tripCard}>
                {/* Top Badge & Fare */}
                <View style={styles.tripTopRow}>
                  <View style={styles.sharedBadge}>
                    <Ionicons name="people" size={12} color="#7C3AED" />
                    <Text style={styles.sharedBadgeText}>SHARED TRIP</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.splitFare}>₹{splitFare}</Text>
                    <Text style={styles.origFare}>Orig: ₹{Math.round(trip.original_fare || trip.final_fare)}</Text>
                  </View>
                </View>

                {/* Safe Host Profile */}
                <View style={styles.hostProfileRow}>
                  <View style={[styles.hostAvatar, { overflow: 'hidden' }]}>
                    {hostPhoto ? (
                      <Image
                        source={{ uri: hostPhoto }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.hostAvatarText}>{(hostName[0] || 'R').toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.hostName}>{hostName}</Text>
                      {isHostVerified && (
                        <View style={styles.verifiedTag}>
                          <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                          <Text style={styles.verifiedTagText}>Verified</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.hostMeta}>⭐ {hostRating} • {hostGender} • {completedTripsCount} trips</Text>
                  </View>
                </View>

                {/* Route */}
                <View style={styles.routeBox}>
                  <View style={styles.routePoint}>
                    <Ionicons name="ellipse" size={10} color="#10B981" style={{ marginTop: 3 }} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={styles.routeLabel}>Boarding Location</Text>
                      <Text style={styles.routeVal}>{trip.pickup_address}</Text>
                    </View>
                  </View>
                  <View style={styles.routePoint}>
                    <Ionicons name="location" size={12} color="#7C3AED" style={{ marginTop: 2 }} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={styles.routeLabel}>Destination</Text>
                      <Text style={styles.routeVal}>{trip.dest_address}</Text>
                    </View>
                  </View>
                </View>

                {/* Trip Specs */}
                <View style={styles.specsRow}>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Date & Time</Text>
                    <Text style={styles.specVal}>{trip.pickup_date} @ {trip.pickup_time?.substring(0, 5)}</Text>
                  </View>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Distance</Text>
                    <Text style={styles.specVal}>{Math.round(trip.distance_km || 0)} KM</Text>
                  </View>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Vehicle</Text>
                    <Text style={styles.specVal}>{trip.vehicle_type_name || 'Sedan'}</Text>
                  </View>
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Available</Text>
                    <Text style={[styles.specVal, { color: '#16A34A' }]}>{remainingSeats} Seat</Text>
                  </View>
                </View>

                {/* Action */}
                <TouchableOpacity
                  onPress={() => handleOpenJoin(trip)}
                  style={styles.joinBtn}
                >
                  <Text style={styles.joinBtnText}>Join Trip & Split Fare</Text>
                  <Ionicons name="arrow-forward" size={16} color="white" />
                </TouchableOpacity>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Join Modal */}
      <Modal visible={joinModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request to Join Shared Trip</Text>
            <Text style={styles.modalSub}>
              Confirm your boarding & drop points. Route must align with the primary host corridor (max 20% detour).
            </Text>

            <View style={{ marginVertical: 12 }}>
              <Text style={styles.inputLabel}>Your Pickup Address</Text>
              <TextInput
                style={styles.input}
                value={joinForm.pickup_address}
                onChangeText={t => { setJoinForm({ ...joinForm, pickup_address: t }); setValidationResult(null); }}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Your Drop Address</Text>
              <TextInput
                style={styles.input}
                value={joinForm.dest_address}
                onChangeText={t => { setJoinForm({ ...joinForm, dest_address: t }); setValidationResult(null); }}
              />

              {/* Route Validation Action */}
              <TouchableOpacity
                onPress={handleValidateRoute}
                disabled={validatingRoute || !joinForm.pickup_address.trim() || !joinForm.dest_address.trim()}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FAF5FF', borderWidth: 1, borderColor: '#E9D5FF', padding: 8, borderRadius: 8, marginTop: 10 }}
              >
                {validatingRoute ? (
                  <ActivityIndicator size="small" color="#7C3AED" />
                ) : (
                  <>
                    <Ionicons name="compass" size={14} color="#7C3AED" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#7C3AED' }}>Check Corridor Detour Compatibility</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Validation Result Box */}
              {validationResult && (
                <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: validationResult.is_compatible ? '#DCFCE7' : '#FEE2E2', borderWidth: 1, borderColor: validationResult.is_compatible ? '#86EFAC' : '#FCA5A5' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: validationResult.is_compatible ? '#166534' : '#991B1B' }}>
                    {validationResult.is_compatible ? `✓ Corridor Matched (${validationResult.detour_km ? `+${validationResult.detour_km} km detour` : 'Direct corridor'})` : `✗ ${validationResult.message || 'Route detour too large for this trip'}`}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setJoinModalVisible(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSendJoinRequest}
                disabled={submittingJoin || isSubmittingRef.current || (validationResult && !validationResult.is_compatible)}
                style={[styles.modalSubmitBtn, (submittingJoin || isSubmittingRef.current || (validationResult && !validationResult.is_compatible)) && { opacity: 0.5 }]}
              >
                {submittingJoin ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit Join Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-App Live Chat Modal */}
      <Modal visible={chatModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.modalTitle}>Co-Rider Discussion</Text>
              <TouchableOpacity onPress={() => setChatModalVisible(false)}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Discuss route pickups, luggage, and stops in real time.</Text>

            <ScrollView style={{ maxHeight: 240, marginVertical: 10 }}>
              {loadingChat ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : chatMessages.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#94A3B8', padding: 20, fontSize: 11 }}>No messages yet. Say hello!</Text>
              ) : (
                chatMessages.map((m, i) => (
                  <View key={i} style={{
                    alignSelf: m.sender_type === 'passenger' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.sender_type === 'passenger' ? '#EDE9FE' : '#F1F5F9',
                    padding: 8,
                    borderRadius: 10,
                    marginVertical: 4,
                    maxWidth: '80%'
                  }}>
                    <Text style={{ fontSize: 12, color: '#0F172A', fontWeight: '600' }}>{m.message}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Type a message..."
                value={chatInput}
                onChangeText={setChatInput}
              />
              <TouchableOpacity
                onPress={handleSendChatMessage}
                style={{ backgroundColor: '#7C3AED', padding: 10, borderRadius: 10 }}
              >
                <Ionicons name="send" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 10
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B' },
  scheduleBtn: {
    backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE'
  },
  scheduleBtnText: { color: '#7C3AED', fontSize: 11, fontWeight: '800' },
  scrollContent: { padding: 16 },
  verifyBanner: {
    flexDirection: 'row', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 14,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: 14, alignItems: 'center'
  },
  verifyBannerTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  verifyBannerText: { fontSize: 11, color: '#B45309', marginTop: 2 },
  sectionCard: {
    backgroundColor: '#FAF5FF', padding: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E9D5FF', marginBottom: 14
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  badgeCount: { fontSize: 11, fontWeight: '800', color: '#7C3AED', backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reqCard: { backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  reqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reqCode: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '800', color: '#7C3AED' },
  reqStatus: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusGreen: { backgroundColor: '#DCFCE7', color: '#16A34A' },
  statusAmber: { backgroundColor: '#FEF3C7', color: '#D97706' },
  statusBlue: { backgroundColor: '#DBEAFE', color: '#2563EB' },
  reqRoute: { fontSize: 12, color: '#334155', fontWeight: '600' },
  reqDate: { fontSize: 11, color: '#64748B', marginTop: 2 },
  emptyCard: { backgroundColor: 'white', padding: 32, borderRadius: 18, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 10 },
  emptyText: { fontSize: 12, color: '#64748B', textAlign: 'center', marginVertical: 8, lineHeight: 18 },
  emptyBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  emptyBtnText: { color: 'white', fontSize: 12, fontWeight: '800' },
  tripCard: {
    backgroundColor: 'white', padding: 16, borderRadius: 18,
    borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2
  },
  tripTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sharedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  sharedBadgeText: { color: '#7C3AED', fontSize: 10, fontWeight: '900' },
  splitFare: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  origFare: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  hostProfileRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 12 },
  hostAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  hostAvatarText: { color: '#7C3AED', fontWeight: '900', fontSize: 15 },
  hostName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  verifiedTag: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#DCFCE7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  verifiedTagText: { fontSize: 9, fontWeight: '800', color: '#16A34A' },
  hostMeta: { fontSize: 10, color: '#64748B', marginTop: 1 },
  routeBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 12 },
  routePoint: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 3 },
  routeLabel: { fontSize: 10, color: '#64748B', fontWeight: '700' },
  routeVal: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  specsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FAF5FF', padding: 10, borderRadius: 10, marginBottom: 12 },
  specItem: { alignItems: 'center' },
  specLabel: { fontSize: 9, color: '#7C3AED', fontWeight: '700' },
  specVal: { fontSize: 11, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  joinBtn: {
    backgroundColor: '#7C3AED', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6
  },
  joinBtnText: { color: 'white', fontWeight: '800', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: 'white', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  modalSub: { fontSize: 11, color: '#64748B', marginVertical: 6, lineHeight: 16 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12 },
  modalCancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  modalSubmitBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center' },
  modalSubmitText: { fontSize: 12, fontWeight: '800', color: 'white' },
})
