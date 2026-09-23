import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { driverAPI, authAPI, uploadAPI, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const DriverProfileScreen = ({ navigation }) => {
  const { user, logout, updateUser, deleteAccount } = useAuth()
  const [driver, setDriver] = useState(null)
  const [loading, setLoading] = useState(true)

  // Photo Upload State
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Edit Profile Modal State
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [licenseNo, setLicenseNo] = useState('')

  // Change Password Modal State
  const [pwModalVisible, setPwModalVisible] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  const loadProfile = useCallback(async () => {
    try {
      const res = await driverAPI.profile()
      if (res.data?.driver || res.data) {
        const d = res.data.driver || res.data
        setDriver(d)
        setName(d.name || user?.name || '')
        setEmail(d.email || user?.email || '')
        setPhone(d.phone || user?.phone || '')
        setVehicleNo(d.plate_no || d.vehicle_no || '')
        setVehicleModel(d.vehicle_model || (d.make ? `${d.make} ${d.model}` : ''))
        setLicenseNo(d.license_no || '')
      }
    } catch {}
    finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  useFocusEffect(
    useCallback(() => {
      loadProfile()
    }, [loadProfile])
  )

  // Photo Action Bottom Sheet Modal State
  const [photoModalVisible, setPhotoModalVisible] = useState(false)

  // Capture or Pick Photo
  const capturePhoto = async (useCamera) => {
    setPhotoModalVisible(false)
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          `Please grant access to your ${useCamera ? 'camera' : 'photo library'} to update your driver profile photo.`
        )
        return
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })

      if (result.canceled || !result.assets || !result.assets[0]?.uri) return
      uploadPhoto(result.assets[0].uri)
    } catch (err) {
      Alert.alert('Error', 'Could not open image picker: ' + err.message)
    }
  }

  // Upload Photo to Backend
  const uploadPhoto = async (localUri) => {
    setUploadingPhoto(true)
    try {
      const filename = localUri.split('/').pop() || `driver_profile_${Date.now()}.jpg`
      const match = /\.(\w+)$/.exec(filename)
      const ext = match ? match[1].toLowerCase() : 'jpg'
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

      const formData = new FormData()
      formData.append('file', {
        uri: Platform.OS === 'android' ? localUri : localUri.replace('file://', ''),
        name: filename,
        type: mimeType,
      })
      formData.append('type', 'profile')

      const uploadRes = await uploadAPI.upload(formData, 'profile')
      if (uploadRes.data?.status === 'success') {
        const newUrl = uploadRes.data.url || uploadRes.data.avatar_url
        if (uploadRes.data.user) {
          updateUser(uploadRes.data.user)
        } else {
          updateUser(prev => ({
            ...prev,
            avatar: uploadRes.data.path || newUrl,
            avatar_url: newUrl,
          }))
        }
        setDriver(prev => ({
          ...prev,
          avatar: uploadRes.data.path || newUrl,
          avatar_url: newUrl,
        }))
        Alert.alert('Success 🎉', 'Driver profile photo updated successfully!')
        loadProfile()
      } else {
        Alert.alert('Upload Failed', uploadRes.data?.message || 'Could not upload photo.')
      }
    } catch {
      Alert.alert(
        'Upload Error',
        'Failed to upload image. Would you like to retry?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => uploadPhoto(localUri) }
        ]
      )
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Remove Photo
  const handleRemovePhoto = async () => {
    setPhotoModalVisible(false)
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove your driver profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUploadingPhoto(true)
            try {
              const res = await uploadAPI.removeAvatar()
              if (res.data?.status === 'success') {
                if (res.data.user) {
                  updateUser(res.data.user)
                } else {
                  updateUser(prev => ({ ...prev, avatar: null, avatar_url: null }))
                }
                setDriver(prev => ({ ...prev, avatar: null, avatar_url: null }))
                Alert.alert('Photo Removed', 'Your profile photo has been removed.')
              } else {
                Alert.alert('Error', res.data?.message || 'Could not remove photo')
              }
            } catch {
              Alert.alert('Error', 'Failed to remove profile photo.')
            } finally {
              setUploadingPhoto(false)
            }
          }
        }
      ]
    )
  }

  // Save Profile Info
  const handleSaveProfile = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Validation', 'Name and Phone number are required.')
      return
    }
    setSavingProfile(true)
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        license_no: licenseNo.trim(),
        vehicle_no: vehicleNo.trim(),
        vehicle_model: vehicleModel.trim(),
      }
      const res = await authAPI.updateProfile(payload)
      if (res.data?.status === 'success') {
        updateUser(prev => ({ ...prev, ...payload }))
        Alert.alert('Success', 'Profile details updated!')
        setEditModalVisible(false)
        loadProfile()
      } else {
        Alert.alert('Update Failed', res.data?.message || 'Could not save profile.')
      }
    } catch {
      Alert.alert('Error', 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  // Change Password
  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      Alert.alert('Validation', 'Please enter your current and new password.')
      return
    }
    if (newPw !== confirmPw) {
      Alert.alert('Validation', 'New passwords do not match.')
      return
    }
    if (newPw.length < 6) {
      Alert.alert('Validation', 'New password must be at least 6 characters.')
      return
    }

    setSavingPw(true)
    try {
      const res = await authAPI.changePassword({
        current_password: currentPw,
        new_password: newPw,
      })
      if (res.data?.status === 'success') {
        Alert.alert('Success', 'Password changed successfully!')
        setPwModalVisible(false)
        setCurrentPw('')
        setNewPw('')
        setConfirmPw('')
      } else {
        Alert.alert('Failed', res.data?.message || 'Could not update password.')
      }
    } catch {
      Alert.alert('Error', 'Password change failed.')
    } finally {
      setSavingPw(false)
    }
  }

  // Sign Out
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of driver mode?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout }
    ])
  }

  // Delete Driver Account (Google Play Compliance)
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Driver Account',
      'Permanently delete your CityDropTaxi Driver Partner account? All your personal details, KYC verification documents, and vehicle records will be permanently removed. Active trips must be completed before deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Are you sure you want to permanently erase your driver account? This action is irreversible.',
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
                        Alert.alert('Account Deleted', 'Your driver account has been deleted.')
                      } else {
                        Alert.alert('Cannot Delete Account', res.data?.message || 'Failed to delete account. Ensure no trips are active.')
                      }
                    } catch (err) {
                      Alert.alert('Error', err.response?.data?.message || err.message || 'Failed to delete driver account.')
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

  const avatarUri = resolveAssetUrl(driver?.avatar_url || user?.avatar_url || driver?.avatar || user?.avatar)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Driver Profile</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => setEditModalVisible(true)}>
          <Ionicons name="create-outline" size={16} color={COLORS.primary} style={{ marginRight: 4 }} />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card Banner */}
        <View style={styles.profileHero}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={() => setPhotoModalVisible(true)}
            activeOpacity={0.85}
            disabled={uploadingPhoto}
          >
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarText}>{(driver?.name?.[0] || user?.name?.[0] || 'D').toUpperCase()}</Text>
              )}
              {uploadingPhoto && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}
            </View>
            <View style={styles.cameraIconBtn}>
              <Ionicons name="camera" size={14} color={COLORS.white} />
            </View>
          </TouchableOpacity>

          <Text style={styles.driverNameText}>{driver?.name || user?.name || 'Driver Partner'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            {(Boolean(driver?.approval_status === 'approved' && driver?.verification_status === 'approved' && (driver?.license_front_image || driver?.license_front_url))) ? (
              <View style={[styles.verifiedBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Ionicons name="checkmark-circle" size={12} color="#059669" />
                <Text style={[styles.verifiedText, { color: '#059669' }]}>Verified Driver Partner</Text>
              </View>
            ) : ((driver?.approval_status || '').toLowerCase() === 'rejected' || (driver?.verification_status || '').toLowerCase() === 'rejected') ? (
              <TouchableOpacity
                style={[styles.verifiedBadge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                onPress={() => navigation.navigate('DriverDocuments')}
              >
                <Ionicons name="alert-circle" size={12} color="#DC2626" />
                <Text style={[styles.verifiedText, { color: '#DC2626' }]}>KYC Rejected (Tap to Re-Upload)</Text>
              </TouchableOpacity>
            ) : (driver?.license_front_image || driver?.verification_status === 'pending') ? (
              <TouchableOpacity
                style={[styles.verifiedBadge, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                onPress={() => navigation.navigate('DriverDocuments')}
              >
                <Ionicons name="time" size={12} color="#D97706" />
                <Text style={[styles.verifiedText, { color: '#D97706' }]}>⏳ Under Admin Review</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.verifiedBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                onPress={() => navigation.navigate('DriverDocuments')}
              >
                <Ionicons name="document-text" size={12} color="#2563EB" />
                <Text style={[styles.verifiedText, { color: '#2563EB' }]}> KYC Submission Required</Text>
              </TouchableOpacity>
            )}
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingPillText}>{driver?.rating || '5.0'} Rating</Text>
            </View>
          </View>
          <Text style={styles.driverIdText}>PARTNER ID: #DRV-{driver?.id || user?.id || '—'}</Text>
        </View>

        {/* Vehicle & Partner Details Card */}
        <Text style={styles.sectionTitle}>Vehicle & Registration Details</Text>
        <View style={styles.card}>
          {[
            ['License Number', driver?.license_no || '—'],
            ['Vehicle Type', driver?.vehicle_type || 'Cab / Sedan'],
            ['Plate / Registration', driver?.plate_no || driver?.vehicle_no || '—'],
            ['Vehicle Model', driver?.vehicle_model || (driver?.make ? `${driver.make} ${driver.model}` : 'Standard Cab')],
            ['Operational City', driver?.city_name || 'All Cities'],
            ['Approval Status', (driver?.approval_status || 'PENDING').toUpperCase()],
          ].map(([label, val], idx) => (
            <View key={idx} style={[styles.detailRow, idx < 5 && styles.rowBorder]}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={[styles.detailValue, label === 'Approval Status' && {
                color: val === 'APPROVED' ? '#10B981' : (val === 'REJECTED' ? '#EF4444' : '#F59E0B'),
                fontWeight: '800'
              }]}>
                {val}
              </Text>
            </View>
          ))}
        </View>

        {/* Partner Management Navigation */}
        <Text style={styles.sectionTitle}>Partner Management</Text>
        <View style={styles.card}>
          {/* 1. Dedicated KYC Verification Menu Row */}
          <TouchableOpacity
            style={[styles.menuRow, styles.rowBorder]}
            onPress={() => navigation.navigate('DriverDocuments')}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>KYC Verification & Documents</Text>
              <Text style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>
                {Boolean(driver?.approval_status === 'approved' && driver?.verification_status === 'approved')
                  ? 'All 10 documents verified'
                  : ((driver?.approval_status || '').toLowerCase() === 'rejected' || (driver?.verification_status || '').toLowerCase() === 'rejected')
                  ? 'Correction required · Tap to re-upload'
                  : (driver?.license_front_image || driver?.verification_status === 'pending')
                  ? '10 documents in Admin review'
                  : 'Action required · Submit government IDs'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[
                styles.approvedPill,
                {
                  backgroundColor: Boolean(driver?.approval_status === 'approved' && driver?.verification_status === 'approved')
                    ? '#D1FAE5'
                    : ((driver?.approval_status || '').toLowerCase() === 'rejected' || (driver?.verification_status || '').toLowerCase() === 'rejected')
                    ? '#FEE2E2'
                    : (driver?.license_front_image || driver?.verification_status === 'pending')
                    ? '#FEF3C7'
                    : '#DBEAFE'
                }
              ]}>
                <Text style={[
                  styles.approvedPillText,
                  {
                    color: Boolean(driver?.approval_status === 'approved' && driver?.verification_status === 'approved')
                      ? '#059669'
                      : ((driver?.approval_status || '').toLowerCase() === 'rejected' || (driver?.verification_status || '').toLowerCase() === 'rejected')
                      ? '#DC2626'
                      : (driver?.license_front_image || driver?.verification_status === 'pending')
                      ? '#B45309'
                      : '#1D4ED8'
                  }
                ]}>
                  {Boolean(driver?.approval_status === 'approved' && driver?.verification_status === 'approved')
                    ? 'VERIFIED'
                    : ((driver?.approval_status || '').toLowerCase() === 'rejected' || (driver?.verification_status || '').toLowerCase() === 'rejected')
                    ? 'REJECTED'
                    : (driver?.license_front_image || driver?.verification_status === 'pending')
                    ? 'IN REVIEW'
                    : 'SUBMIT KYC'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.gray400} />
            </View>
          </TouchableOpacity>

          {[
            { icon: 'cash-outline', label: 'Earnings & Payout Settlements', color: '#10B981', action: () => navigation.navigate('Earnings') },
            { icon: 'key-outline', label: 'Change Security Password', color: '#6366F1', action: () => setPwModalVisible(true) },
            { icon: 'notifications-outline', label: 'Broadcast Alerts & Notifications', color: '#2563EB', action: () => navigation.navigate('DriverNotifications') },
            { icon: 'headset-outline', label: 'Help, Safety & 24x7 SOS Support', color: '#EA580C', action: () => navigation.navigate('DriverSupport') },
            { icon: 'document-text-outline', label: 'Privacy Policy', color: '#0284C7', action: () => navigation.navigate('PrivacyPolicy') },
            { icon: 'newspaper-outline', label: 'Terms & Conditions', color: '#64748B', action: () => navigation.navigate('Terms') },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={[styles.menuRow, idx < 5 && styles.rowBorder]} onPress={item.action} activeOpacity={0.8}>
              <View style={[styles.menuIconWrap, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.gray400} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>Sign Out of Driver Account</Text>
        </TouchableOpacity>

        {/* Delete Driver Account (Google Play Compliance) */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={15} color="#EF4444" />
          <Text style={styles.deleteText}>Delete Driver Account & Erase Records</Text>
        </TouchableOpacity>

        <Text style={styles.appVer}>CabTaxi Driver Partner Platform · Secure 256-Bit SSL</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Profile Information</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>FULL NAME *</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" />

              <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />

              <Text style={styles.fieldLabel}>PHONE NUMBER *</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />

              <Text style={styles.fieldLabel}>VEHICLE PLATE NUMBER</Text>
              <TextInput style={styles.input} value={vehicleNo} onChangeText={setVehicleNo} placeholder="e.g. KA-01-AB-1234" />

              <Text style={styles.fieldLabel}>VEHICLE MODEL / MAKE</Text>
              <TextInput style={styles.input} value={vehicleModel} onChangeText={setVehicleModel} placeholder="e.g. Maruti Swift Dzire" />

              <Text style={styles.fieldLabel}>DRIVING LICENSE NUMBER</Text>
              <TextInput style={styles.input} value={licenseNo} onChangeText={setLicenseNo} placeholder="License number" />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 20 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, savingProfile && { opacity: 0.7 }]} onPress={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={pwModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPwModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Change Security Password</Text>
            <Text style={styles.dialogSub}>Enter current password and choose a new secure password:</Text>

            <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
            <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw} secureTextEntry placeholder="••••••••" />

            <Text style={styles.fieldLabel}>NEW PASSWORD (MIN 6 CHARS)</Text>
            <TextInput style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="••••••••" />

            <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput style={styles.input} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry placeholder="••••••••" />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPwModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, savingPw && { opacity: 0.7 }]} onPress={handleChangePassword} disabled={savingPw}>
                {savingPw ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveBtnText}>Update Password</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Driver Profile Photo Action Bottom Sheet Modal */}
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
            <Text style={styles.actionSheetTitle}>Driver Profile Photo</Text>
            <Text style={styles.actionSheetSub}>Update or manage your verified driver photo</Text>

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
                  <Text style={styles.actionOptionSub}>Capture a live driver photo using camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </TouchableOpacity>

              {/* Option 2: Choose from Gallery */}
              <TouchableOpacity
                style={styles.actionOption}
                onPress={() => capturePhoto(false)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="images" size={20} color="#0284C7" />
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
                    <Text style={styles.actionOptionSub}>Reset to default partner initial avatar</Text>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHero: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xxl,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...SHADOW.small,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.white,
  },
  cameraIconBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNameText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  driverIdText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gray500,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...SHADOW.small,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 14,
    borderRadius: RADIUS.xl,
    marginTop: 6,
    marginBottom: 8,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.error,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 16,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  appVer: {
    fontSize: 11,
    color: COLORS.gray400,
    textAlign: 'center',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.gray600,
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
  dialogCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: RADIUS.xxl,
    padding: 20,
    ...SHADOW.large,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  dialogSub: {
    fontSize: 12,
    color: COLORS.gray500,
    marginBottom: 10,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xxl,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  actionSheetSub: {
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  actionList: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.xl,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionOptionText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  actionOptionSub: {
    fontSize: 11,
    color: COLORS.gray500,
    marginTop: 1,
  },
  sheetCancelBtn: {
    height: 48,
    borderRadius: RADIUS.xl,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.gray700,
  },
})

export default DriverProfileScreen
