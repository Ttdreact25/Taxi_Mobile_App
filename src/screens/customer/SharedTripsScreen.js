import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, Platform, Image, RefreshControl
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../../constants/theme'
import { longTripAPI, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { SkeletonList } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'
import { formatTime12Hr, formatDateDisplay } from '../../utils/formatters'

export default function SharedTripsScreen({ navigation }) {
  const { user } = useAuth()
  const isSubmittingRef = useRef(false)
  const chatScrollRef = useRef(null)
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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

  // Live Chat state
  const [activeChatReq, setActiveChatReq] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const [chatModalVisible, setChatModalVisible] = useState(false)

  const loadTrips = useCallback(async () => {
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
      setRefreshing(false)
    }
  }, [selectedDate])

  const loadVerification = async () => {
    try {
      const res = await longTripAPI.myVerification()
      if (res.data?.status === 'success') {
        setVerificationStatus(res.data.data?.status || res.data.verification?.status || 'none')
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

  const onRefresh = () => {
    setRefreshing(true)
    loadTrips()
    loadVerification()
    loadMyRequests()
  }

  // Real-time Chat Polling when chat modal is open
  useEffect(() => {
    if (!chatModalVisible || !activeChatReq) return
    const interval = setInterval(async () => {
      try {
        const res = await longTripAPI.getChats(activeChatReq.id)
        if (res.data?.status === 'success') {
          const msgs = res.data.messages || res.data.data?.messages || res.data.chats || []
          setChatMessages(msgs)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [chatModalVisible, activeChatReq])

  const openChatModal = async (req) => {
    setActiveChatReq(req)
    setChatModalVisible(true)
    setLoadingChat(true)
    try {
      const res = await longTripAPI.getChats(req.id)
      if (res.data?.status === 'success') {
        const msgs = res.data.messages || res.data.data?.messages || res.data.chats || []
        setChatMessages(msgs)
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
      setChatMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          message: msg,
          sender_id: user?.id,
          sender_name: user?.name || 'You',
          created_at: new Date().toISOString()
        }
      ])
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to send message.')
    }
  }

  const handleOpenJoin = (trip) => {
    if (verificationStatus !== 'verified') {
      Alert.alert(
        'Identity Verification Required 🛡️',
        'Complete Identity Verification (Aadhaar + Selfie) before joining a Shared Trip. Your verification must be approved by Admin.',
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
      pickup_address: trip.pickup_address || '',
      dest_address: trip.dest_address || '',
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
          'Your request has been submitted! Once Admin approves the request, live discussion chat will open with the host rider.'
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
          onPress={() => navigation.navigate('Booking', { tripMode: 'outstation' })}
          style={styles.scheduleBtn}
        >
          <Ionicons name="add" size={14} color="#7C3AED" />
          <Text style={styles.scheduleBtnText}>Publish Ride</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Verification Alert Banner if not verified */}
        {verificationStatus !== 'verified' && (
          <TouchableOpacity
            style={styles.verifyBanner}
            onPress={() => navigation.navigate('IdentityVerification')}
            activeOpacity={0.85}
          >
            <Ionicons name="shield-checkmark" size={22} color="#D97706" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.verifyBannerTitle}>Aadhaar KYC Verification Required 🛡️</Text>
              <Text style={styles.verifyBannerText}>
                Complete identity verification (Govt ID + Selfie) to join or publish shared trips. Tap here to submit.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D97706" />
          </TouchableOpacity>
        )}

        {/* Active Join Requests & Discussions */}
        {myRequests.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbubbles" size={16} color="#7C3AED" />
                <Text style={styles.sectionTitle}>Shared Trip Requests & Chat</Text>
              </View>
              <Text style={styles.badgeCount}>{myRequests.length} Active</Text>
            </View>

            {myRequests.map(req => {
              const isHost = Number(req.host_customer_id) === Number(user?.id)
              const otherName = isHost ? (req.requester_name || 'Passenger') : (req.host_name || 'Host Rider')
              const canChat = req.admin_status === 'approved' && (Number(req.chat_enabled) === 1 || req.status === 'in_discussion')
              const isAdminPending = !canChat && (req.admin_status === 'pending' || req.status === 'pending_admin' || !req.admin_status)

              return (
                <View key={req.id} style={styles.reqCard}>
                  <View style={styles.reqHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.reqCode}>{req.trip_code || `REQ-#${req.id}`}</Text>
                      <View style={[styles.roleBadge, { backgroundColor: isHost ? '#FEF3C7' : '#EDE9FE' }]}>
                        <Text style={[styles.roleBadgeText, { color: isHost ? '#B45309' : '#7C3AED' }]}>
                          {isHost ? 'Your Ride (Host)' : 'You Requested'}
                        </Text>
                      </View>
                    </View>

                    <Text style={[
                      styles.reqStatus,
                      canChat ? styles.statusGreen :
                      isAdminPending ? styles.statusAmber : styles.statusBlue
                    ]}>
                      {canChat ? 'Chat Active ✓' :
                       isAdminPending ? 'Pending Admin' :
                       req.admin_status === 'approved' ? 'Admin Approved' : req.status}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 6, gap: 10 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, overflow: 'hidden', borderWidth: 1.5, borderColor: isHost ? '#FCD34D' : '#C4B5FD', backgroundColor: '#F8FAFC' }}>
                      <Image
                        source={{ uri: isHost ? (resolveAssetUrl(req.requester_avatar_url || req.requester_photo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName)}&background=7C3AED&color=fff&size=80&bold=true`) : (resolveAssetUrl(req.host_avatar_url || req.host_avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherName)}&background=D97706&color=fff&size=80&bold=true`) }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqRoute} numberOfLines={1}>
                        👤 {otherName}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                        📍 {req.pickup_address || req.host_pickup} → {req.dest_address || req.host_dest}
                      </Text>
                      <Text style={styles.reqDate}>
                        📅 {req.pickup_date} • Split Fare: ₹{Math.round(req.total_passenger_fare || req.shared_fare || 0)}
                      </Text>
                    </View>
                  </View>

                  {/* Chat Action Button */}
                  <View style={{ marginTop: 10 }}>
                    {canChat ? (
                      <TouchableOpacity
                        style={styles.openChatBtn}
                        onPress={() => openChatModal(req)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="chatbubble-ellipses" size={16} color="white" />
                        <Text style={styles.openChatBtnText}>Chat with {otherName}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.pendingAdminBox}>
                        <Ionicons name="shield-outline" size={16} color="#D97706" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#92400E' }}>
                            Admin Verification In Progress ⏳
                          </Text>
                          <Text style={styles.pendingAdminText}>
                            Admin is currently verifying this join request. Once Admin reviews & accepts, live chat with {otherName} will unlock automatically!
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* Available Shared Trips Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 }}>
          <Text style={styles.sectionTitle}>Available Shared Rides</Text>
          <TouchableOpacity onPress={onRefresh} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="refresh" size={14} color="#7C3AED" />
            <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '700' }}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <SkeletonList count={3} height={180} />
        ) : trips.length === 0 ? (
          <EmptyState
            icon="car-sport-outline"
            title="No Shared Trips Found"
            subtitle="No other passenger has published a shared ride right now. You can book an outstation ride and enable sharing!"
            buttonText="+ Book & Share Ride"
            onPress={() => navigation.navigate('Booking', { tripMode: 'outstation' })}
          />
        ) : (
          trips.map(trip => {
            const isMyOwnTrip = Number(trip.host_customer_id) === Number(user?.id)
            const splitFare = Math.round(Number(trip.final_fare || 0) / 2)
            const remainingSeats = Math.max(1, (trip.max_passengers || 4) - (trip.passenger_count || 1))
            const host = trip.host_profile || {}
            const hostName = trip.host_full_name || trip.host_name || host.name || host.full_name || 'Rider'
            const hostPhoto = trip.host_avatar || trip.host_photo || host.profile_photo || host.avatar_url
            const isHostVerified = Boolean(trip.is_verified || host.is_verified)
            const hostRating = trip.host_rating || host.rating || 5.0
            const completedTripsCount = trip.completed_trips ?? host.completed_trips ?? 0
            const hostGender = host.gender || trip.host_gender || 'Co-Rider'
            const hostAvatarUri = resolveAssetUrl(hostPhoto) || `https://ui-avatars.com/api/?name=${encodeURIComponent(hostName)}&background=7C3AED&color=fff&size=128&bold=true`

            return (
              <View key={trip.id} style={styles.tripCard}>
                {/* Top Badge & Fare */}
                <View style={styles.tripTopRow}>
                  <View style={styles.sharedBadge}>
                    <Ionicons name="people" size={12} color="#7C3AED" />
                    <Text style={styles.sharedBadgeText}>50/50 SHARED RIDE</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.splitFare}>₹{splitFare}</Text>
                    <Text style={styles.origFare}>Total: ₹{Math.round(trip.original_fare || trip.final_fare)}</Text>
                  </View>
                </View>

                {/* Host Profile */}
                <View style={styles.hostProfileRow}>
                  <View style={styles.hostAvatar}>
                    <Image
                      source={{ uri: hostAvatarUri }}
                      style={{ width: '100%', height: '100%', borderRadius: 23 }}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.hostName}>{hostName} {isMyOwnTrip && '(You)'}</Text>
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
                    <Text style={styles.specVal}>{formatDateDisplay(trip.pickup_date)} @ {formatTime12Hr(trip.pickup_time)}</Text>
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
                    <Text style={styles.specLabel}>Seats</Text>
                    <Text style={[styles.specVal, { color: '#16A34A' }]}>{remainingSeats} Available</Text>
                  </View>
                </View>

                {/* Action Button */}
                {isMyOwnTrip ? (
                  <View style={styles.ownTripBadge}>
                    <Ionicons name="checkmark-done-circle" size={16} color="#7C3AED" />
                    <Text style={styles.ownTripBadgeText}>Your Published Ride (Waiting for Co-Riders)</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleOpenJoin(trip)}
                    style={styles.joinBtn}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.joinBtnText}>Join Trip & Split Fare</Text>
                    <Ionicons name="arrow-forward" size={16} color="white" />
                  </TouchableOpacity>
                )}
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Join Modal */}
      <Modal visible={joinModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Request to Join Shared Trip</Text>
              <TouchableOpacity onPress={() => setJoinModalVisible(false)}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Confirm your boarding & drop points. Route must align with the primary corridor.
            </Text>

            <View style={{ marginVertical: 12 }}>
              <Text style={styles.inputLabel}>Your Boarding Address</Text>
              <TextInput
                style={styles.input}
                value={joinForm.pickup_address}
                onChangeText={t => { setJoinForm({ ...joinForm, pickup_address: t }); setValidationResult(null); }}
                placeholder="Enter pickup point"
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>Your Drop Address</Text>
              <TextInput
                style={styles.input}
                value={joinForm.dest_address}
                onChangeText={t => { setJoinForm({ ...joinForm, dest_address: t }); setValidationResult(null); }}
                placeholder="Enter drop point"
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
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  Chat with {Number(activeChatReq?.host_customer_id) === Number(user?.id) ? (activeChatReq?.requester_name || 'Passenger') : (activeChatReq?.host_name || 'Host Rider')}
                </Text>
                <Text style={styles.modalSub}>
                  {activeChatReq?.trip_code ? `Trip Code: ${activeChatReq.trip_code}` : 'Live Co-Rider Discussion'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Chat Messages */}
            <ScrollView
              ref={chatScrollRef}
              style={{ maxHeight: 280, minHeight: 140, marginVertical: 8, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10 }}
              onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {loadingChat ? (
                <ActivityIndicator size="small" color="#7C3AED" style={{ padding: 20 }} />
              ) : chatMessages.length === 0 ? (
                <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                  <Ionicons name="chatbubbles-outline" size={28} color="#CBD5E1" />
                  <Text style={{ textAlign: 'center', color: '#94A3B8', marginTop: 8, fontSize: 12 }}>
                    No messages yet. Say hello to discuss pickup spot and luggage!
                  </Text>
                </View>
              ) : (
                chatMessages.map((m, i) => {
                  const isMe = Number(m.sender_id) === Number(user?.id)
                  return (
                    <View
                      key={m.id || i}
                      style={{
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        backgroundColor: isMe ? '#7C3AED' : '#FFFFFF',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 14,
                        borderBottomRightRadius: isMe ? 2 : 14,
                        borderBottomLeftRadius: isMe ? 14 : 2,
                        marginVertical: 4,
                        maxWidth: '82%',
                        borderWidth: isMe ? 0 : 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      {!isMe && (
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', marginBottom: 2 }}>
                          {m.sender_name || 'Co-Rider'}
                        </Text>
                      )}
                      <Text style={{ fontSize: 13, color: isMe ? '#FFFFFF' : '#0F172A', fontWeight: '500' }}>
                        {m.message}
                      </Text>
                    </View>
                  )
                })
              )}
            </ScrollView>

            {/* Chat Input */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <TextInput
                style={[styles.input, { flex: 1, paddingVertical: 10 }]}
                placeholder="Type message to co-rider..."
                placeholderTextColor="#94A3B8"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendChatMessage}
              />
              <TouchableOpacity
                onPress={handleSendChatMessage}
                style={{ backgroundColor: '#7C3AED', width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.8}
              >
                <Ionicons name="send" size={17} color="white" />
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
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE'
  },
  scheduleBtnText: { color: '#7C3AED', fontSize: 11, fontWeight: '800' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  verifyBanner: {
    flexDirection: 'row', backgroundColor: '#FEF3C7', padding: 12, borderRadius: 14,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: 14, alignItems: 'center'
  },
  verifyBannerTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  verifyBannerText: { fontSize: 11, color: '#B45309', marginTop: 2 },
  sectionCard: {
    backgroundColor: '#FAF5FF', padding: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E9D5FF', marginBottom: 16
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  badgeCount: { fontSize: 11, fontWeight: '800', color: '#7C3AED', backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reqCard: { backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
  reqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reqCode: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '800', color: '#7C3AED' },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, fontWeight: '800' },
  reqStatus: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusGreen: { backgroundColor: '#DCFCE7', color: '#16A34A' },
  statusAmber: { backgroundColor: '#FEF3C7', color: '#D97706' },
  statusBlue: { backgroundColor: '#EDE9FE', color: '#7C3AED' },
  reqRoute: { fontSize: 12, color: '#334155', fontWeight: '600' },
  reqDate: { fontSize: 11, color: '#64748B', marginTop: 3 },
  openChatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#7C3AED', paddingVertical: 9, borderRadius: 8
  },
  openChatBtnText: { color: 'white', fontWeight: '800', fontSize: 12 },
  pendingAdminBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A'
  },
  pendingAdminText: { fontSize: 11, color: '#B45309', fontWeight: '600', flex: 1 },
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
  hostAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DDD6FE',
    overflow: 'hidden'
  },
  hostAvatarText: { color: '#7C3AED', fontWeight: '900', fontSize: 16 },
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
  ownTripBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F1F5F9', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1'
  },
  ownTripBadgeText: { color: '#64748B', fontWeight: '800', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: 'white', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  modalSub: { fontSize: 11, color: '#64748B', marginVertical: 4, lineHeight: 16 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12 },
  modalCancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  modalSubmitBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center' },
  modalSubmitText: { fontSize: 12, fontWeight: '800', color: 'white' },
})
