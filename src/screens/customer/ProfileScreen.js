import { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Image, Modal, TextInput, ActivityIndicator, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useAuth } from '../../context/AuthContext'
import { authAPI, customerAPI, uploadAPI, createUploadFormData, resolveAssetUrl } from '../../api/api'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const ProfileScreen = ({ navigation }) => {
  const { user, logout, updateUser, refreshUser, deleteAccount } = useAuth()

  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stats, setStats] = useState({
    total_bookings: user?.total_bookings || 0,
    completed_trips: user?.completed_trips || 0,
    rating: user?.rating || 5.0,
  })

  // Edit Profile Modal State
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [savingProfile, setSavingProfile] = useState(false)

  // Password Modal State
  const [pwModalVisible, setPwModalVisible] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // Sync state when user changes
  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setEmail(user.email || '')
      setPhone(user.phone || '')
    }
  }, [user])

  // Load fresh profile details & stats from backend
  const loadProfile = async () => {
    try {
      const res = await customerAPI.getProfile()
      if (res.data?.status === 'success' && res.data.user) {
        updateUser(res.data.user)
        if (res.data.stats) {
          setStats(res.data.stats)
        }
      }
    } catch (e) {
      console.log('Failed to fetch profile in mobile:', e)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  // Photo Action Bottom Sheet Modal State
  const [photoModalVisible, setPhotoModalVisible] = useState(false)

  const capturePhoto = async (useCamera) => {
    setPhotoModalVisible(false)
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          `Please allow access to your ${useCamera ? 'camera' : 'photo library'} to update your profile photo.`
        )
        return
      }

      const imageOptions = {
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(imageOptions)
        : await ImagePicker.launchImageLibraryAsync({
            ...imageOptions,
            mediaTypes: ['images'],
          })

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        uploadPhoto(result.assets[0].uri, result.assets[0])
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open image picker: ' + err.message)
    }
  }

  const uploadPhoto = async (localUri, asset = null) => {
    setUploading(true)
    try {
      const formData = createUploadFormData(localUri, {
        prefix: 'customer_profile',
        type: 'profile',
        asset: asset,
      })

      const res = await uploadAPI.upload(formData, 'profile')
      if (res.data?.status === 'success') {
        const newUrl = res.data.url || res.data.avatar_url
        if (res.data.user) {
          updateUser(res.data.user)
        } else {
          updateUser(prev => ({
            ...prev,
            avatar: res.data.path || newUrl,
            avatar_url: newUrl
          }))
        }
        Alert.alert('Success 🎉', 'Profile photo updated successfully!')
      } else {
        Alert.alert('Upload Failed', res.data?.message || 'Could not upload photo')
      }
    } catch (err) {
      console.log('Customer profile photo upload error:', err)
      const errorMsg = err?.message || 'Failed to upload image.'
      Alert.alert(
        'Upload Error',
        `${errorMsg}\n\nWould you like to retry?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => uploadPhoto(localUri, asset) }
        ]
      )
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = async () => {
    setPhotoModalVisible(false)
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove your profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUploading(true)
            try {
              const res = await uploadAPI.removeAvatar()
              if (res.data?.status === 'success') {
                if (res.data.user) {
                  updateUser(res.data.user)
                } else {
                  updateUser(prev => ({ ...prev, avatar: null, avatar_url: null }))
                }
                Alert.alert('Photo Removed', 'Your profile photo has been removed.')
              } else {
                Alert.alert('Error', res.data?.message || 'Could not remove photo')
              }
            } catch {
              Alert.alert('Error', 'Failed to remove profile photo.')
            } finally {
              setUploading(false)
            }
          }
        }
      ]
    )
  }

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter your name.')
    }
    setSavingProfile(true)
    try {
      const res = await authAPI.updateProfile({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim()
      })
      if (res.data?.status === 'success') {
        if (res.data.user) {
          updateUser(res.data.user)
        } else {
          updateUser(prev => ({ ...prev, name: name.trim(), email: email.trim(), phone: phone.trim() }))
        }
        Alert.alert('Success', 'Profile details updated successfully!')
        setEditModalVisible(false)
      } else {
        Alert.alert('Error', res.data?.message || 'Update failed')
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      Alert.alert('Error', 'Please fill in all password fields.')
      return
    }
    if (newPw !== confirmPw) {
      Alert.alert('Error', 'New passwords do not match.')
      return
    }
    if (newPw.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.')
      return
    }

    setSavingPw(true)
    try {
      const res = await authAPI.changePassword({
        current_password: currentPw,
        new_password: newPw
      })
      if (res.data?.status === 'success') {
        Alert.alert('Success', 'Password changed successfully!')
        setPwModalVisible(false)
        setCurrentPw('')
        setNewPw('')
        setConfirmPw('')
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to change password')
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update password')
    } finally {
      setSavingPw(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout }
    ])
  }

  // Google Play Compliant In-App Account Deletion
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your CityOneTaxi account? All your personal details, profile data, and saved locations will be deleted or permanently anonymized.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Are you absolutely certain? This action is permanent and cannot be undone. Any active ride must be completed before deletion.',
              [
                { text: 'Keep My Account', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    setLoading(true)
                    try {
                      const res = await deleteAccount()
                      if (res.data?.status === 'success') {
                        Alert.alert('Account Deleted', 'Your account has been deleted successfully.')
                      } else {
                        Alert.alert('Cannot Delete Account', res.data?.message || 'Failed to delete account. Ensure you have no active trips.')
                      }
                    } catch (err) {
                      Alert.alert('Error', err.response?.data?.message || err.message || 'Failed to delete account.')
                    } finally {
                      setLoading(false)
                    }
                  }
                }
              ]
            )
          }
        }
      ]
    )
  }

  const avatarUri = resolveAssetUrl(user?.avatar_url || user?.avatar)

  const menuItems = [
    { icon: 'person-circle-outline', label: 'Customer Identity KYC', color: '#059669', onPress: () => navigation.navigate('IdentityVerification') },
    { icon: 'bookmark-outline', label: 'Saved Destinations', color: '#10B981', onPress: () => navigation.navigate('SavedPlaces') },
    { icon: 'create-outline', label: 'Edit Profile Information', color: '#7C3AED', onPress: () => setEditModalVisible(true) },
    { icon: 'time-outline', label: 'My Trip History', color: '#D97706', onPress: () => navigation.navigate('TripsList') },
    { icon: 'key-outline', label: 'Change Security Password', color: '#B45309', onPress: () => setPwModalVisible(true) },
    { icon: 'notifications-outline', label: 'Notifications & Alerts', color: '#D97706', onPress: () => navigation.navigate('Notifications') },
    { icon: 'help-buoy-outline', label: 'Help & 24x7 Support', color: '#EA580C', onPress: () => navigation.navigate('Support') },
    { icon: 'document-text-outline', label: 'Privacy Policy', color: '#D97706', onPress: () => navigation.navigate('PrivacyPolicy') },
    { icon: 'newspaper-outline', label: 'Terms & Conditions', color: '#64748B', onPress: () => navigation.navigate('Terms') },
    { icon: 'lock-closed-outline', label: 'Safety Guarantee', color: '#475569', onPress: () => Alert.alert('Safety Guarantee', 'All rides are monitored with live 24/7 GPS Fleet Tracking, SOS Emergency triggers & Verified Drivers.') },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl }}>
        
        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          <View style={styles.cardTopAccent} />

          {/* Large Luxury Embossed Watermark */}
          <Image
            source={require('../../../assets/cityonetaxi_badge.png')}
            style={styles.watermarkLogo}
            resizeMode="contain"
            pointerEvents="none"
          />

          {/* Customer Brand & ID Header */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardBrandBadge}>
              <Image
                source={require('../../../assets/cityonetaxi_badge.png')}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.cardBrandName}>
                  CITYONE <Text style={{ color: '#D97706' }}>TAXI</Text>
                </Text>
                <Text style={styles.cardBrandTier}>PRIVILEGE PASSENGER</Text>
              </View>
            </View>
            <View style={styles.idBadge}>
              <Ionicons name="finger-print" size={12} color="#D97706" />
              <Text style={styles.idText}>ID: {user?.id ? `CUST-${user.id}` : '—'}</Text>
            </View>
          </View>

          {/* Avatar Container with Upload Icon */}
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={() => setPhotoModalVisible(true)}
            activeOpacity={0.85}
            disabled={uploading}
          >
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.avatarText}>{(user?.name?.[0] || 'U').toUpperCase()}</Text>
                )}
                {uploading && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
              </View>
            </View>

            {/* Photo Edit Floating Trigger */}
            <View style={styles.cameraBtn}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.name}>{user?.name || 'Customer'}</Text>

          <View style={styles.contactRow}>
            {Boolean(user?.phone) && (
              <View style={styles.contactChip}>
                <Ionicons name="call-outline" size={11} color="#64748B" />
                <Text style={styles.contactChipText}>{user.phone}</Text>
              </View>
            )}
            {Boolean(user?.email) && (
              <View style={styles.contactChip}>
                <Ionicons name="mail-outline" size={11} color="#64748B" />
                <Text style={styles.contactChipText}>{user.email}</Text>
              </View>
            )}
          </View>

          {/* Verified Status Badge */}
          {(() => {
            const isKycVerified = user?.is_verified && user?.verification_status === 'verified'
            const isKycPending  = user?.verification_status === 'pending'
            const isKycRejected = user?.verification_status === 'rejected'

            return (
              <TouchableOpacity
                style={[
                  styles.verifiedBadge,
                  isKycVerified ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' } :
                  isKycPending ? { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' } :
                  isKycRejected ? { backgroundColor: '#FEF2F2', borderColor: '#FECACA' } :
                  { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }
                ]}
                onPress={() => navigation.navigate('IdentityVerification')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isKycVerified ? 'checkmark-circle' : isKycPending ? 'time' : isKycRejected ? 'alert-circle' : 'shield-outline'}
                  size={14}
                  color={isKycVerified ? '#15803D' : isKycPending ? '#B45309' : isKycRejected ? '#DC2626' : '#64748B'}
                />
                <Text style={[
                  styles.verifiedText,
                  { color: isKycVerified ? '#15803D' : isKycPending ? '#B45309' : isKycRejected ? '#DC2626' : '#64748B' }
                ]}>
                  {isKycVerified ? 'KYC Verified Customer ✓' :
                   isKycPending ? 'KYC In Review ⏳' :
                   isKycRejected ? 'KYC Rejected ❌ (Re-upload)' : 'KYC Not Verified (Tap to Upload)'}
                </Text>
              </TouchableOpacity>
            )
          })()}
        </View>

        {/* Customer Dynamic Stats Bar */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="time" size={18} color="#7C3AED" />
            <Text style={styles.statVal}>
              {stats.completed_trips || stats.total_bookings || user?.completed_trips || 0}
            </Text>
            <Text style={styles.statLbl}>Trips Taken</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="star" size={18} color="#F59E0B" />
            <Text style={styles.statVal}>
              {stats.rating || user?.rating || '5.0'} ★
            </Text>
            <Text style={styles.statLbl}>Rider Rating</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="shield-checkmark" size={18} color="#10B981" />
            <Text style={styles.statVal}>Active</Text>
            <Text style={styles.statLbl}>Safety Guard</Text>
          </View>
        </View>

        {/* Professional Navigation Menu */}
        <View style={styles.card}>
          {menuItems.map((m, i) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < menuItems.length - 1 && styles.menuBorder]} onPress={m.onPress} activeOpacity={0.85}>
              <View style={[styles.menuIcon, { backgroundColor: m.color + '15' }]}>
                <Ionicons name={m.icon} size={20} color={m.color} />
              </View>
              <Text style={styles.menuLabel}>{m.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Sign Out of Account</Text>
        </TouchableOpacity>

        {/* Permanently Delete Account (Google Play Compliance) */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={15} color="#EF4444" />
          <Text style={styles.deleteText}>Delete Account & Erase Personal Data</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
          <Image
            source={require('../../../assets/cityonetaxi_badge.png')}
            style={{ width: 44, height: 44, marginBottom: 8 }}
            resizeMode="contain"
          />
          <Text style={styles.appVer}>CityOneTaxi Customer App v1.0.0 · 256-Bit SSL Secured</Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your Full Name"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Your Email"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mobile Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Mobile Number"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleSaveProfile}
              disabled={savingProfile}
              activeOpacity={0.85}
            >
              {savingProfile ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Save Profile Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={pwModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPwModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                value={currentPw}
                onChangeText={setCurrentPw}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPw}
                onChangeText={setNewPw}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={COLORS.gray400}
              />
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleChangePassword}
              disabled={savingPw}
              activeOpacity={0.85}
            >
              {savingPw ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Profile Photo Action Bottom Sheet Modal */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPhotoModalVisible(false)}
        >
          <View style={styles.actionSheetContent}>
            <View style={styles.sheetHandle} />
            <Text style={styles.actionSheetTitle}>Profile Photo</Text>
            <Text style={styles.actionSheetSub}>Update or manage your account photo</Text>

            <View style={styles.actionList}>
              {/* Option 1: Take Photo */}
              <TouchableOpacity
                style={styles.actionOption}
                onPress={() => capturePhoto(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="camera" size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionOptionText}>Take Photo</Text>
                  <Text style={styles.actionOptionSub}>Capture a new picture using camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              {/* Option 2: Choose from Gallery */}
              <TouchableOpacity
                style={styles.actionOption}
                onPress={() => capturePhoto(false)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="images" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionOptionText}>Choose from Gallery</Text>
                  <Text style={styles.actionOptionSub}>Select an existing image from photos</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              {/* Option 3: Remove Photo */}
              {Boolean(avatarUri) && (
                <TouchableOpacity
                  style={[styles.actionOption, { borderBottomWidth: 0 }]}
                  onPress={handleRemovePhoto}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconWrap, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionOptionText, { color: COLORS.error }]}>Remove Photo</Text>
                    <Text style={styles.actionOptionSub}>Reset to default name letter avatar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setPhotoModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: COLORS.background },
  profileCard:           { backgroundColor: COLORS.white, borderRadius: 24, padding: 18, alignItems: 'center', marginVertical: 14, ...SHADOW.md, borderWidth: 1.5, borderColor: '#FDE68A', position: 'relative', overflow: 'hidden' },
  cardTopAccent:         { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#FFC700' },
  watermarkLogo:         { position: 'absolute', right: -35, bottom: -35, width: 220, height: 220, opacity: 0.08, transform: [{ rotate: '-12deg' }] },
  cardHeaderRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cardBrandBadge:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardBrandName:         { fontSize: 13, fontWeight: '900', color: '#0F172A', letterSpacing: 0.6 },
  cardBrandTier:         { fontSize: 8.5, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },
  idBadge:               { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  idText:                { fontSize: 11, fontWeight: '800', color: '#B45309', letterSpacing: 0.5 },
  avatarWrapper:         { position: 'relative', width: 92, height: 92, marginBottom: 10 },
  avatarRing:            { width: 92, height: 92, borderRadius: 46, padding: 3, backgroundColor: '#FFFBEB', borderWidth: 2, borderColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', ...SHADOW.sm },
  avatar:                { width: '100%', height: '100%', borderRadius: 43, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:             { width: '100%', height: '100%' },
  avatarText:            { fontSize: 34, fontWeight: '900', color: '#FFC700' },
  avatarLoadingOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cameraBtn:             { position: 'absolute', bottom: 1, right: 1, width: 28, height: 28, borderRadius: 14, backgroundColor: '#D97706', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white, ...SHADOW.sm },
  name:                  { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: 0.3 },
  contactRow:            { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  contactChip:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  contactChipText:       { fontSize: 11, fontWeight: '600', color: '#475569' },
  verifiedBadge:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: SPACING.md },
  verifiedText:          { fontSize: 12, fontWeight: '800', color: '#15803D' },
  statsRow:              { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  statBox:               { flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.gray200, ...SHADOW.xs },
  statVal:               { fontSize: 15, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  statLbl:               { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginTop: 2 },
  card:                  { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm, borderWidth: 1, borderColor: COLORS.gray200 },
  menuItem:              { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  menuBorder:            { borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  menuIcon:              { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  menuLabel:             { flex: 1, fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  logoutBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, height: 50, borderRadius: RADIUS.xl, backgroundColor: COLORS.errorLight, borderWidth: 1, borderColor: COLORS.error + '30' },
  logoutText:            { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.error },
  deleteBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, marginTop: 12, borderRadius: RADIUS.lg, backgroundColor: 'transparent' },
  deleteText:            { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  appVer:                { textAlign: 'center', color: COLORS.textLight, fontSize: FONTS.sizes.xs, marginTop: SPACING.xl },

  modalOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:          { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: SPACING.xxxl },
  modalHeader:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle:            { fontSize: 18, fontWeight: '900', color: COLORS.text },
  inputGroup:            { marginBottom: SPACING.md },
  inputLabel:            { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 6 },
  input:                 { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: COLORS.gray200, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text },
  primaryBtn:            { backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md, ...SHADOW.sm },
  primaryBtnText:        { color: COLORS.white, fontSize: 15, fontWeight: '800' },

  actionSheetContent:    { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xxl },
  sheetHandle:           { width: 38, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  actionSheetTitle:      { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary, textAlign: 'center' },
  actionSheetSub:        { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 2, marginBottom: 16 },
  actionList:            { backgroundColor: '#F8FAFC', borderRadius: RADIUS.xl, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 },
  actionOption:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12 },
  actionIconWrap:        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  actionOptionText:      { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary },
  actionOptionSub:       { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  sheetCancelBtn:        { height: 48, borderRadius: RADIUS.xl, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  sheetCancelText:       { fontSize: 14, fontWeight: '800', color: COLORS.gray700 },
})

export default ProfileScreen
