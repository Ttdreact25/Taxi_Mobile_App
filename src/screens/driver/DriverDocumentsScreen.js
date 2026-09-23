import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, ActivityIndicator, Alert, Platform, RefreshControl, Modal
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { driverAPI, uploadAPI, resolveAssetUrl } from '../../api/api'
import { COLORS } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'

const DriverDocumentsScreen = ({ navigation }) => {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploadingField, setUploadingField] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [pickerModalField, setPickerModalField] = useState(null)
  const [lightboxDoc, setLightboxDoc] = useState(null)
  const [isReuploading, setIsReuploading] = useState(false)

  // Form State for KYC Upload
  const [form, setForm] = useState({
    license_no: '',
    license_expiry: '',
    aadhaar_no: '',
    license_front_image: '',
    license_front_url: '',
    license_back_image: '',
    license_back_url: '',
    aadhaar_front_image: '',
    aadhaar_front_url: '',
    aadhaar_back_image: '',
    aadhaar_back_url: '',
    rc_book_image: '',
    rc_book_url: '',
    rc_back_image: '',
    rc_back_url: '',
    insurance_image: '',
    insurance_url: '',
    vehicle_photo: '',
    vehicle_photo_url: '',
    police_verification_image: '',
    police_verification_url: '',
    profile_selfie: '',
    profile_selfie_url: '',
    avatar: '',
    avatar_url: '',
  })

  const loadDocuments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const drvRes = await driverAPI.getDocuments()
      let d = {}
      if (drvRes?.data) {
        d = drvRes.data.driver || drvRes.data.data || drvRes.data.documents || {}
      }

      // Strict Driver KYC check:
      // A driver only has KYC approved if their commercial fleet docs (driving license or RC book) are actually present.
      const hasDriverKycDocs = Boolean(
        d.license_front_image || d.license_front_url ||
        d.license_back_image || d.license_back_url ||
        d.aadhaar_front_image || d.aadhaar_front_url ||
        d.rc_book_image || d.rc_book_url
      )

      let rawVerif = (d.verification_status || 'unsubmitted').toLowerCase()
      // If no driver documents have been submitted, status cannot be approved
      if (!hasDriverKycDocs && (rawVerif === 'approved' || rawVerif === 'verified')) {
        rawVerif = 'unsubmitted'
      }

      const drvVerif = (rawVerif === 'approved' || rawVerif === 'verified')
        ? 'approved'
        : (rawVerif === 'rejected' ? 'rejected' : (rawVerif === 'pending' ? 'pending' : 'unsubmitted'))

      const merged = {
        ...d,
        approval_status: d.approval_status || 'pending',
        verification_status: drvVerif,
        rejection_reason: d.rejection_reason || null,
      }

      setProfile(merged)
      setForm(prev => ({
        license_no: merged.license_no !== undefined && merged.license_no !== null && merged.license_no !== '' ? merged.license_no : prev.license_no,
        license_expiry: merged.license_expiry || prev.license_expiry,
        aadhaar_no: merged.aadhaar_no || prev.aadhaar_no,
        license_front_image: merged.license_front_image || prev.license_front_image,
        license_front_url: merged.license_front_url || prev.license_front_url,
        license_back_image: merged.license_back_image || prev.license_back_image,
        license_back_url: merged.license_back_url || prev.license_back_url,
        aadhaar_front_image: merged.aadhaar_front_image || prev.aadhaar_front_image,
        aadhaar_front_url: merged.aadhaar_front_url || prev.aadhaar_front_url,
        aadhaar_back_image: merged.aadhaar_back_image || prev.aadhaar_back_image,
        aadhaar_back_url: merged.aadhaar_back_url || prev.aadhaar_back_url,
        rc_book_image: merged.rc_book_image || prev.rc_book_image,
        rc_book_url: merged.rc_book_url || prev.rc_book_url,
        rc_back_image: merged.rc_back_image || prev.rc_back_image,
        rc_back_url: merged.rc_back_url || prev.rc_back_url,
        insurance_image: merged.insurance_image || prev.insurance_image,
        insurance_url: merged.insurance_url || prev.insurance_url,
        vehicle_photo: merged.vehicle_photo || prev.vehicle_photo,
        vehicle_photo_url: merged.vehicle_photo_url || prev.vehicle_photo_url,
        police_verification_image: merged.police_verification_image || prev.police_verification_image,
        police_verification_url: merged.police_verification_url || prev.police_verification_url,
        profile_selfie: merged.profile_selfie || prev.profile_selfie,
        profile_selfie_url: merged.profile_selfie_url || prev.profile_selfie_url,
        avatar: merged.avatar || prev.avatar,
        avatar_url: merged.profile_photo_url || merged.avatar_url || prev.avatar_url,
      }))
    } catch (e) {
      console.log('Driver documents load error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const getImageUri = (url, path) => {
    const target = url || path
    if (!target) return null
    return resolveAssetUrl(target) || target
  }

  const handlePickImage = (fieldKey) => {
    setPickerModalField(fieldKey)
  }

  const performImageCapture = async (useCamera) => {
    const fieldKey = pickerModalField
    setPickerModalField(null)
    if (!fieldKey) return

    try {
      if (useCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync()
        if (!camPerm.granted) {
          Alert.alert('Camera Permission', 'Please allow camera access to take document photos.')
          return
        }
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!libPerm.granted) {
          Alert.alert('Gallery Permission', 'Please allow gallery access to select document photos.')
          return
        }
      }

      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)

      if (!result.canceled && result.assets[0]?.uri) {
        setUploadingField(fieldKey)
        const localUri = result.assets[0].uri
        const filename = localUri.split('/').pop() || `${fieldKey}.jpg`
        const match = /\.(\w+)$/.exec(filename)
        const mimeType = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg'

        const formData = new FormData()
        formData.append('file', {
          uri: Platform.OS === 'android' ? localUri : localUri.replace('file://', ''),
          name: filename,
          type: mimeType,
        })
        formData.append('type', 'kyc')

        const uploadRes = await uploadAPI.upload(formData, 'kyc')
        const data = uploadRes.data || {}

        if (data.status === 'success' || data.url || data.path) {
          const relativePath = data.path || data.filename || data.file_name || data.relative_path || data.url
          const fullUrl = data.url || localUri

          const urlKey = fieldKey.includes('_image')
            ? fieldKey.replace('_image', '_url')
            : `${fieldKey}_url`

          setForm(prev => ({
            ...prev,
            [fieldKey]: relativePath,
            [urlKey]: fullUrl,
          }))

          Alert.alert('Photo Attached ✓', 'Photo attached successfully! Tap "Submit Documents for Verification" below to save.')
        } else {
          Alert.alert('Upload Failed', data.message || 'Server rejected file upload. Please try again.')
        }
      }
    } catch (err) {
      console.log('Upload error', err)
      Alert.alert('Upload Error', 'Failed to upload photo. Please check internet connection and try again.')
    } finally {
      setUploadingField(null)
    }
  }

  // Live status computation:
  const hasDlDoc = Boolean(
    profile?.license_front_image || form.license_front_image || profile?.license_front_url || form.license_front_url
  )
  const hasAadhaarDoc = Boolean(
    profile?.aadhaar_front_image || form.aadhaar_front_image || profile?.aadhaar_front_url || form.aadhaar_front_url
  )
  const hasAnyDocAttached = Boolean(
    hasDlDoc || hasAadhaarDoc ||
    profile?.rc_book_image || form.rc_book_image ||
    profile?.profile_selfie || form.profile_selfie ||
    profile?.avatar || form.avatar || profile?.insurance_image || form.insurance_image
  )

  const hasUploadedDocs = Boolean(
    profile?.license_front_image || profile?.license_front_url ||
    profile?.license_back_image || profile?.license_back_url ||
    profile?.rc_book_image || profile?.rc_book_url ||
    profile?.aadhaar_front_image || profile?.aadhaar_front_url ||
    profile?.profile_selfie || profile?.profile_selfie_url
  )

  const isApproved = Boolean(
    (profile?.verification_status === 'approved' || profile?.verification_status === 'verified') &&
    hasUploadedDocs &&
    !isReuploading
  )

  const isRejected = !isApproved && Boolean(
    profile?.verification_status === 'rejected'
  )

  // Truly pending review ONLY IF documents have actually been submitted!
  const isPending = !isApproved && !isRejected && Boolean(
    (profile?.verification_status === 'pending' || profile?.verification_status === 'submitted') &&
    hasUploadedDocs &&
    !isReuploading
  )

  const isUnsubmitted = !isApproved && !isRejected && !isPending

  // Decide if screen is in read-only dashboard mode:
  // ONLY lock if approved with docs, or if full driver docs are already submitted and pending.
  const isReadOnlyMode = (isApproved || isPending) && hasUploadedDocs && !isReuploading

  const handleSubmit = async () => {
    if (isApproved && !isReuploading) {
      Alert.alert('Account Verified ✅', 'Your driver account has already been verified and approved by Admin.')
      return
    }

    if (!form.license_no.trim()) {
      Alert.alert('Missing Driving License', 'Please enter your Driving License Number (e.g. TN-01-2024-1234567)')
      return
    }

    const hasAnyDoc = Boolean(
      form.license_front_image || form.license_front_url ||
      form.aadhaar_front_image || form.aadhaar_front_url ||
      form.avatar || form.avatar_url || form.rc_book_image
    )

    if (!hasAnyDoc) {
      Alert.alert('Attach Document Photos', 'Please tap on the photo cards (Profile, DL, Aadhaar) and attach clear photos before submitting for verification.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        license_no: form.license_no.trim(),
        license_expiry: form.license_expiry.trim(),
        aadhaar_no: form.aadhaar_no.trim(),
        aadhaar_number: form.aadhaar_no.trim(),
        license_front_image: form.license_front_image,
        license_front_url: form.license_front_url,
        license_back_image: form.license_back_image,
        license_back_url: form.license_back_url,
        aadhaar_front_image: form.aadhaar_front_image,
        aadhaar_front_url: form.aadhaar_front_url,
        govt_id_doc: form.aadhaar_front_image,
        aadhaar_back_image: form.aadhaar_back_image,
        aadhaar_back_url: form.aadhaar_back_url,
        govt_id_back: form.aadhaar_back_image,
        rc_book_image: form.rc_book_image,
        rc_book_url: form.rc_book_url,
        rc_back_image: form.rc_back_image,
        rc_back_url: form.rc_back_url,
        insurance_image: form.insurance_image,
        insurance_url: form.insurance_url,
        vehicle_photo: form.vehicle_photo,
        vehicle_photo_url: form.vehicle_photo_url,
        police_verification_image: form.police_verification_image,
        police_verification_url: form.police_verification_url,
        profile_selfie: form.profile_selfie,
        profile_selfie_url: form.profile_selfie_url,
        selfie_image: form.profile_selfie || form.avatar,
        avatar: form.avatar,
        avatar_url: form.avatar_url,
      }

      // Submit to both driver and customer verification endpoints
      await Promise.allSettled([
        driverAPI.submitDocuments(payload),
        longTripAPI.submitVerification(payload)
      ])

      setProfile(prev => ({
        ...prev,
        verification_status: 'pending',
        approval_status: 'pending',
        rejection_reason: null,
        license_no: form.license_no,
        license_expiry: form.license_expiry,
        aadhaar_no: form.aadhaar_no,
        license_front_image: form.license_front_image,
        license_front_url: form.license_front_url,
        license_back_image: form.license_back_image,
        license_back_url: form.license_back_url,
        aadhaar_front_image: form.aadhaar_front_image,
        aadhaar_front_url: form.aadhaar_front_url,
      }))
      setIsReuploading(false)

      // Show confirmation
      Alert.alert(
        'Documents Submitted 🎉',
        'Your KYC documents have been submitted to Admin CRM for verification. You will be notified once approved.',
        [
          {
            text: 'OK',
            onPress: () => {
              loadDocuments(true)
            }
          }
        ],
        { cancelable: true }
      )
    } catch (err) {
      console.log('KYC Submission Error:', err)
      const errorMsg = err.response?.data?.message || err.message || 'Failed to submit documents. Please try again.'
      Alert.alert('Submission Error', errorMsg)
    } finally {
      setSubmitting(false)
    }
  }

  // Define the 10 document slots for the read-only KYC Dashboard:
  const readOnlyDocs = [
    {
      id: 'avatar',
      title: 'Driver Profile Photo',
      subtitle: 'Official partner identification photo',
      uri: getImageUri(profile?.profile_photo_url || profile?.avatar_url || form.avatar_url, profile?.avatar || form.avatar),
      icon: 'person-circle',
      iconColor: '#4F46E5',
      bgColor: '#EEF2FF',
    },
    {
      id: 'profile_selfie',
      title: 'Biometric Live Selfie',
      subtitle: 'Real-time biometric facial match',
      uri: getImageUri(profile?.profile_selfie_url || form.profile_selfie_url, profile?.profile_selfie || form.profile_selfie),
      icon: 'sparkles',
      iconColor: '#DB2777',
      bgColor: '#FDF2F8',
    },
    {
      id: 'license_front',
      title: 'Driving License (Front)',
      subtitle: 'Commercial driver badge & photo',
      uri: getImageUri(profile?.license_front_url || form.license_front_url, profile?.license_front_image || form.license_front_image),
      icon: 'card',
      iconColor: '#059669',
      bgColor: '#ECFDF5',
    },
    {
      id: 'license_back',
      title: 'Driving License (Back)',
      subtitle: 'Vehicle endorsements & address',
      uri: getImageUri(profile?.license_back_url || form.license_back_url, profile?.license_back_image || form.license_back_image),
      icon: 'card-outline',
      iconColor: '#059669',
      bgColor: '#ECFDF5',
    },
    {
      id: 'aadhaar_front',
      title: 'Aadhaar Card (Front)',
      subtitle: 'Government identity proof',
      uri: getImageUri(profile?.aadhaar_front_url || form.aadhaar_front_url, profile?.aadhaar_front_image || form.aadhaar_front_image),
      icon: 'finger-print',
      iconColor: '#EA580C',
      bgColor: '#FFF7ED',
    },
    {
      id: 'aadhaar_back',
      title: 'Aadhaar Card (Back)',
      subtitle: 'Permanent address proof',
      uri: getImageUri(profile?.aadhaar_back_url || form.aadhaar_back_url, profile?.aadhaar_back_image || form.aadhaar_back_image),
      icon: 'home',
      iconColor: '#EA580C',
      bgColor: '#FFF7ED',
    },
    {
      id: 'rc_book',
      title: 'Vehicle RC Book (Front)',
      subtitle: 'Registration Certificate front page',
      uri: getImageUri(profile?.rc_book_url || form.rc_book_url, profile?.rc_book_image || form.rc_book_image),
      icon: 'car-sport',
      iconColor: '#16A34A',
      bgColor: '#F0FDF4',
    },
    {
      id: 'rc_back',
      title: 'Vehicle RC Book (Back)',
      subtitle: 'Registration Certificate back page',
      uri: getImageUri(profile?.rc_back_url || form.rc_back_url, profile?.rc_back_image || form.rc_back_image),
      icon: 'document-text',
      iconColor: '#16A34A',
      bgColor: '#F0FDF4',
    },
    {
      id: 'insurance',
      title: 'Vehicle Insurance Policy',
      subtitle: 'Active commercial comprehensive cover',
      uri: getImageUri(profile?.insurance_url || form.insurance_url, profile?.insurance_image || form.insurance_image),
      icon: 'shield-checkmark',
      iconColor: '#2563EB',
      bgColor: '#EFF6FF',
    },
    {
      id: 'vehicle_photo',
      title: 'Vehicle Full Photo',
      subtitle: 'Commercial taxi front/side view',
      uri: getImageUri(profile?.vehicle_photo_url || form.vehicle_photo_url, profile?.vehicle_photo || form.vehicle_photo),
      icon: 'car',
      iconColor: '#2563EB',
      bgColor: '#EFF6FF',
    },
  ]

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading driver credentials & KYC...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Premium Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Driver KYC Verification</Text>
          <Text style={styles.headerSub}>
            {isReadOnlyMode ? 'Official KYC Dashboard' : 'One-Time Document Submission'}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => loadDocuments(true)} activeOpacity={0.8}>
          <Ionicons name="sync-outline" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDocuments(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── 1. STATUS BANNER ───────────────────────────────────────── */}
        {isApproved ? (
          <View style={[styles.statusBanner, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: '#059669' }]}>
              <Ionicons name="checkmark-done-circle" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.statusBannerTitle, { color: '#065F46' }]}>🟢 KYC Approved</Text>
                <View style={styles.approvedPill}>
                  <Text style={styles.approvedPillText}>VERIFIED DRIVER</Text>
                </View>
              </View>
              <Text style={[styles.statusBannerDesc, { color: '#047857' }]}>
                Verified Badge Active · Approval Confirmed by Admin CRM. All government credentials and permits are verified.
              </Text>
            </View>
          </View>
        ) : isRejected ? (
          <View style={[styles.statusBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: '#DC2626' }]}>
              <Ionicons name="alert-circle" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.statusBannerTitle, { color: '#991B1B' }]}>🔴 KYC Rejected</Text>
                <View style={[styles.approvedPill, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.approvedPillText, { color: '#DC2626' }]}>RE-UPLOAD REQUIRED</Text>
                </View>
              </View>
              <Text style={[styles.statusBannerDesc, { color: '#B91C1C', marginTop: 3 }]}>
                Reason: {profile?.rejection_reason || profile?.admin_notes || 'Some document photos were unclear or expired. Please review below and tap Re-upload.'}
              </Text>
            </View>
          </View>
        ) : isPending ? (
          <View style={[styles.statusBanner, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: '#D97706' }]}>
              <Ionicons name="hourglass-outline" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.statusBannerTitle, { color: '#92400E' }]}>🟡 KYC Submitted</Text>
                <View style={[styles.approvedPill, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.approvedPillText, { color: '#B45309' }]}>UNDER REVIEW</Text>
                </View>
              </View>
              <Text style={[styles.statusBannerDesc, { color: '#B45309' }]}>
                Waiting for Admin Verification. Your documents are safely submitted and locked from further edits.
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.statusBanner, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: '#2563EB' }]}>
              <Ionicons name="document-attach" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.statusBannerTitle, { color: '#1E40AF' }]}> KYC Submission Required</Text>
                <View style={[styles.approvedPill, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={[styles.approvedPillText, { color: '#1D4ED8' }]}>ONE-TIME UPLOAD</Text>
                </View>
              </View>
              <Text style={[styles.statusBannerDesc, { color: '#1E40AF' }]}>
                Please attach clear photos of your Profile, DL, Aadhaar, RC Book, Insurance & Vehicle to activate your driver account.
              </Text>
            </View>
          </View>
        )}

        {/* ── 2. CONDITIONAL VIEW: READ-ONLY DASHBOARD vs UPLOAD FORM ───── */}
        {isReadOnlyMode ? (
          /* ==========================================================
             READ-ONLY KYC DASHBOARD (Strict Production Rule)
             - Hide ALL upload inputs, camera buttons, file pickers.
             - Display professional image cards with View/Zoom.
             ========================================================== */
          <View>
            {/* Credentials Summary Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>Verified Credential Information</Text>
                  <Text style={styles.cardSub}>Government IDs on official fleet record</Text>
                </View>
              </View>

              <View style={{ marginTop: 12, gap: 8 }}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Driving License No:</Text>
                  <Text style={styles.infoValue}>{profile?.license_no || form.license_no || 'TN-01-2024-XXXX'}</Text>
                </View>
                {Boolean(profile?.license_expiry || form.license_expiry) && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>License Expiry Date:</Text>
                    <Text style={styles.infoValue}>{profile?.license_expiry || form.license_expiry}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Aadhaar Card No:</Text>
                  <Text style={styles.infoValue}>{profile?.aadhaar_no || form.aadhaar_no || 'XXXX-XXXX-XXXX'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Verification Status:</Text>
                  <Text style={[
                    styles.infoValue,
                    { color: isApproved ? '#059669' : (isRejected ? '#DC2626' : '#D97706'), fontWeight: '800' }
                  ]}>
                    {isApproved ? 'VERIFIED PARTNER ✓' : (isRejected ? 'REJECTED / CORRECTION NEEDED' : 'PENDING ADMIN APPROVAL ⏳')}
                  </Text>
                </View>
              </View>
            </View>

            {/* 10 Document Verification Cards */}
            <Text style={styles.sectionHeaderTitle}>Submitted Identification Documents (10 Slots)</Text>
            <View style={{ gap: 12, marginTop: 8 }}>
              {readOnlyDocs.map((doc, idx) => (
                <View key={doc.id} style={styles.readOnlyDocCard}>
                  <View style={styles.readOnlyDocHeader}>
                    <View style={[styles.docSmallIcon, { backgroundColor: doc.bgColor }]}>
                      <Ionicons name={doc.icon} size={18} color={doc.iconColor} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.readOnlyDocTitle}>{idx + 1}. {doc.title}</Text>
                      <Text style={styles.readOnlyDocSub}>{doc.subtitle}</Text>
                    </View>
                    <View style={[
                      styles.docStatusBadge,
                      {
                        backgroundColor: !doc.uri
                          ? '#F1F5F9'
                          : (isApproved ? '#ECFDF5' : (isRejected ? '#FEF2F2' : '#FFFBEB'))
                      }
                    ]}>
                      <Text style={[
                        styles.docStatusText,
                        {
                          color: !doc.uri
                            ? '#64748B'
                            : (isApproved ? '#059669' : (isRejected ? '#DC2626' : '#D97706'))
                        }
                      ]}>
                        {!doc.uri ? 'NOT ATTACHED' : (isApproved ? 'VERIFIED ✓' : (isRejected ? 'RE-UPLOAD' : 'IN REVIEW'))}
                      </Text>
                    </View>
                  </View>

                  {/* Thumbnail / Preview Area */}
                  {doc.uri ? (
                    <View style={styles.readOnlyPreviewContainer}>
                      <Image source={{ uri: doc.uri }} style={styles.readOnlyThumbImg} />
                      <TouchableOpacity
                        style={styles.zoomBtnOverlay}
                        onPress={() => setLightboxDoc({ uri: doc.uri, title: doc.title })}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="expand" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.zoomBtnText}>View / Zoom HD</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.readOnlyMissingWrap}>
                      <Ionicons name="image-outline" size={24} color="#94A3B8" />
                      <Text style={styles.readOnlyMissingText}>Document photo not attached</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Action button: Allow uploading / updating documents - Always accessible */}
            <TouchableOpacity
              style={[
                styles.submitBtn, 
                { 
                  backgroundColor: isRejected ? '#DC2626' : (isApproved ? '#2563EB' : COLORS.primary), 
                  marginTop: 16 
                }
              ]}
              onPress={() => setIsReuploading(true)}
              activeOpacity={0.85}
            >
              <Ionicons 
                name={isApproved ? "create-outline" : (isRejected ? "refresh-circle" : "cloud-upload-outline")} 
                size={22} 
                color="#FFFFFF" 
                style={{ marginRight: 8 }} 
              />
              <Text style={styles.submitBtnText}>
                {isApproved ? '✏️ Edit / Update KYC Documents' : (isRejected ? '🔄 Re-upload KYC Documents' : '📝 Upload / Update Document Photos')}
              </Text>
            </TouchableOpacity>

            {/* If Pending: Show informative locked banner */}
            {isPending && (
              <View style={[styles.lockedNoticeCard, { marginTop: 12 }]}>
                <Ionicons name="hourglass-outline" size={20} color="#D97706" style={{ marginRight: 10 }} />
                <Text style={styles.lockedNoticeText}>
                  Documents are currently under review. Tap above to add or update any missing photos.
                </Text>
              </View>
            )}

            {/* If Approved: Show Verified Driver Banner */}
            {isApproved && (
              <View style={[styles.lockedNoticeCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Ionicons name="shield-checkmark" size={20} color="#059669" style={{ marginRight: 10 }} />
                <Text style={[styles.lockedNoticeText, { color: '#065F46' }]}>
                  Your KYC verification is complete. You are an active verified driver partner.
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* ==========================================================
             ONE-TIME UPLOAD FORM MODE (For First Time or Re-upload)
             ========================================================== */
          <View>
            {isReuploading && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#DC2626' }}>Re-uploading KYC Documents</Text>
                <TouchableOpacity onPress={() => setIsReuploading(false)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── 1. DRIVER PROFILE & LIVE SELFIE ─────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="person-circle" size={20} color="#4F46E5" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>1. Profile Photo & Live Selfie *</Text>
                  <Text style={styles.cardSub}>Clear face photograph & biometric live selfie</Text>
                </View>
              </View>

              <View style={{ marginTop: 14, gap: 10 }}>
                <View style={styles.photoGrid}>
                  {/* Profile Photo */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('avatar')}
                    activeOpacity={0.8}
                  >
                    {form.avatar_url || form.avatar ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.avatar_url, form.avatar) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>PROFILE PHOTO ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'avatar' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={styles.tileIconCircle}>
                              <Ionicons name="camera-reverse" size={20} color="#4F46E5" />
                            </View>
                            <Text style={styles.placeholderTitle}>Profile Photo</Text>
                            <Text style={styles.placeholderSub}>Tap to Upload</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Selfie Verification */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('profile_selfie')}
                    activeOpacity={0.8}
                  >
                    {form.profile_selfie_url || form.profile_selfie ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.profile_selfie_url, form.profile_selfie) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>SELFIE ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'profile_selfie' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#FDF2F8' }]}>
                              <Ionicons name="sparkles" size={18} color="#DB2777" />
                            </View>
                            <Text style={styles.placeholderTitle}>Live Selfie</Text>
                            <Text style={styles.placeholderSub}>Take Selfie</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── 2. DRIVING LICENSE (DL) ────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="card-sharp" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>2. Driving License (DL) *</Text>
                  <Text style={styles.cardSub}>Valid commercial driver license credential</Text>
                </View>
              </View>

              <View style={{ marginTop: 14, gap: 12 }}>
                <View>
                  <Text style={styles.inputLabel}>Driving License Number *</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="document-text-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.textInputInner}
                      placeholder="e.g. TN-01-2024-1234567"
                      placeholderTextColor="#94A3B8"
                      value={form.license_no}
                      onChangeText={t => setForm({ ...form, license_no: t })}
                      autoCapitalize="characters"
                      editable={true}
                    />
                  </View>
                </View>

                <View>
                  <Text style={styles.inputLabel}>License Expiry Date (YYYY-MM-DD)</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.textInputInner}
                      placeholder="YYYY-MM-DD (e.g. 2030-12-31)"
                      placeholderTextColor="#94A3B8"
                      value={form.license_expiry}
                      onChangeText={t => setForm({ ...form, license_expiry: t })}
                      editable={true}
                    />
                  </View>
                </View>

                {/* DL Photo Uploads Row */}
                <View style={styles.photoGrid}>
                  {/* Front Photo */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('license_front_image')}
                    activeOpacity={0.8}
                  >
                    {form.license_front_url || form.license_front_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.license_front_url, form.license_front_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>DL FRONT ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'license_front_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#ECFDF5' }]}>
                              <Ionicons name="camera" size={18} color="#059669" />
                            </View>
                            <Text style={styles.placeholderTitle}>DL Front Photo</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Back Photo */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('license_back_image')}
                    activeOpacity={0.8}
                  >
                    {form.license_back_url || form.license_back_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.license_back_url, form.license_back_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>DL BACK ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'license_back_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#ECFDF5' }]}>
                              <Ionicons name="camera" size={18} color="#059669" />
                            </View>
                            <Text style={styles.placeholderTitle}>DL Back Photo</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── 3. AADHAAR / NATIONAL IDENTITY ─────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#FFF7ED' }]}>
                  <Ionicons name="finger-print" size={20} color="#EA580C" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>3. Aadhaar / National ID Card *</Text>
                  <Text style={styles.cardSub}>Government proof of identity & permanent address</Text>
                </View>
              </View>

              <View style={{ marginTop: 14, gap: 12 }}>
                <View>
                  <Text style={styles.inputLabel}>Aadhaar Number (12 Digits)</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="shield-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.textInputInner}
                      placeholder="XXXX-XXXX-XXXX"
                      placeholderTextColor="#94A3B8"
                      value={form.aadhaar_no}
                      onChangeText={t => setForm({ ...form, aadhaar_no: t })}
                      keyboardType="numeric"
                      editable={true}
                    />
                  </View>
                </View>

                {/* Aadhaar Photos Row */}
                <View style={styles.photoGrid}>
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('aadhaar_front_image')}
                    activeOpacity={0.8}
                  >
                    {form.aadhaar_front_url || form.aadhaar_front_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.aadhaar_front_url, form.aadhaar_front_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>AADHAAR FRONT ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'aadhaar_front_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#FFF7ED' }]}>
                              <Ionicons name="image" size={18} color="#EA580C" />
                            </View>
                            <Text style={styles.placeholderTitle}>Aadhaar Front</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('aadhaar_back_image')}
                    activeOpacity={0.8}
                  >
                    {form.aadhaar_back_url || form.aadhaar_back_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.aadhaar_back_url, form.aadhaar_back_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>AADHAAR BACK ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'aadhaar_back_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#FFF7ED' }]}>
                              <Ionicons name="image" size={18} color="#EA580C" />
                            </View>
                            <Text style={styles.placeholderTitle}>Aadhaar Back</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── 4. VEHICLE RC BOOK (FRONT & BACK) ───────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="car-sport" size={20} color="#16A34A" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>4. Vehicle Registration (RC Book) *</Text>
                  <Text style={styles.cardSub}>Registration Certificate (Front & Back Pages)</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={styles.photoGrid}>
                  {/* RC Front */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('rc_book_image')}
                    activeOpacity={0.8}
                  >
                    {form.rc_book_url || form.rc_book_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.rc_book_url, form.rc_book_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>RC FRONT ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'rc_book_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#F0FDF4' }]}>
                              <Ionicons name="document-text" size={18} color="#16A34A" />
                            </View>
                            <Text style={styles.placeholderTitle}>RC Book (Front)</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* RC Back */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('rc_back_image')}
                    activeOpacity={0.8}
                  >
                    {form.rc_back_url || form.rc_back_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.rc_back_url, form.rc_back_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>RC BACK ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'rc_back_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#F0FDF4' }]}>
                              <Ionicons name="document-text" size={18} color="#16A34A" />
                            </View>
                            <Text style={styles.placeholderTitle}>RC Book (Back)</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── 5. VEHICLE INSURANCE & VEHICLE PHOTO ────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>5. Insurance & Vehicle Photo *</Text>
                  <Text style={styles.cardSub}>Commercial insurance policy & full vehicle photo</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={styles.photoGrid}>
                  {/* Insurance */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('insurance_image')}
                    activeOpacity={0.8}
                  >
                    {form.insurance_url || form.insurance_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.insurance_url, form.insurance_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>INSURANCE ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'insurance_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#EFF6FF' }]}>
                              <Ionicons name="shield-checkmark" size={18} color="#2563EB" />
                            </View>
                            <Text style={styles.placeholderTitle}>Insurance Policy</Text>
                            <Text style={styles.placeholderSub}>Upload Policy Scan</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Vehicle Photo */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('vehicle_photo')}
                    activeOpacity={0.8}
                  >
                    {form.vehicle_photo_url || form.vehicle_photo ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.vehicle_photo_url, form.vehicle_photo) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>VEHICLE PHOTO ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'vehicle_photo' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#EFF6FF' }]}>
                              <Ionicons name="car" size={18} color="#2563EB" />
                            </View>
                            <Text style={styles.placeholderTitle}>Vehicle Photo</Text>
                            <Text style={styles.placeholderSub}>Front / Side View</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── 6. SUBMIT BUTTON ───────────────────────────────────── */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                submitting && { backgroundColor: '#94A3B8' }
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Submit Documents for Verification</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Help & Safety Footer */}
        <View style={styles.helpBox}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" />
          <Text style={styles.helpText}>
            All credentials are encrypted and reviewed by the Safety Compliance team. Need help? Call 1800-CAB-TAXI.
          </Text>
        </View>
      </ScrollView>

      {/* ── LIGHTBOX ZOOM MODAL ─────────────────────────────────────── */}
      <Modal
        visible={Boolean(lightboxDoc)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLightboxDoc(null)}
      >
        <TouchableOpacity
          style={styles.lightboxOverlay}
          activeOpacity={1}
          onPress={() => setLightboxDoc(null)}
        >
          <View style={styles.lightboxCard} onStartShouldSetResponder={() => true}>
            <View style={styles.lightboxHeader}>
              <Text style={styles.lightboxTitle} numberOfLines={1}>{lightboxDoc?.title}</Text>
              <TouchableOpacity
                style={styles.lightboxCloseBtn}
                onPress={() => setLightboxDoc(null)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {lightboxDoc?.uri ? (
              <Image
                source={{ uri: lightboxDoc.uri }}
                style={styles.lightboxImg}
                resizeMode="contain"
              />
            ) : null}
            <TouchableOpacity
              style={styles.lightboxDoneBtn}
              onPress={() => setLightboxDoc(null)}
            >
              <Text style={styles.lightboxDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── CUSTOM MODERN BOTTOM SHEET MODAL PICKER ─────────────────── */}
      <Modal
        visible={Boolean(pickerModalField)}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPickerModalField(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerModalField(null)}
        >
          <View style={styles.modalSheetCard} onStartShouldSetResponder={() => true}>
            {/* Modal Handle Bar */}
            <View style={styles.modalHandleBar} />

            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.modalHeaderIconWrap}>
                  <Ionicons name="camera-reverse" size={20} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.modalSheetTitle}>Attach Document Photo</Text>
                  <Text style={styles.modalSheetSub}>Select high-resolution camera or gallery</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPickerModalField(null)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Modal Options */}
            <View style={{ marginTop: 16, gap: 12 }}>
              <TouchableOpacity
                style={styles.modalOptionCard}
                onPress={() => performImageCapture(true)}
                activeOpacity={0.75}
              >
                <View style={[styles.modalOptionIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="camera" size={24} color="#2563EB" />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.modalOptionTitle}>Take Photo (Camera)</Text>
                  <Text style={styles.modalOptionDesc}>Capture clear photo using device camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalOptionCard}
                onPress={() => performImageCapture(false)}
                activeOpacity={0.75}
              >
                <View style={[styles.modalOptionIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="images" size={24} color="#059669" />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.modalOptionTitle}>Choose from Gallery</Text>
                  <Text style={styles.modalOptionDesc}>Select clear photo from device storage</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setPickerModalField(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

export default DriverDocumentsScreen

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 44,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    elevation: 1,
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusBannerDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
    fontWeight: '500',
  },
  approvedPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  approvedPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 6,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  readOnlyDocCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  readOnlyDocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  docSmallIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readOnlyDocTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  readOnlyDocSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  docStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  docStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  readOnlyPreviewContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  readOnlyThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  zoomBtnOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  zoomBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  readOnlyMissingWrap: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  readOnlyMissingText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  lockedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#92400E',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  textInputInner: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  photoGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadTile: {
    flex: 1,
    height: 125,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  tileIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  placeholderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
    textAlign: 'center',
  },
  placeholderSub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  previewWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewTag: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    right: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  previewTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 6,
  },
  helpText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    lineHeight: 16,
    fontWeight: '500',
  },
  // Lightbox Modal
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    overflow: 'hidden',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  lightboxTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  lightboxCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImg: {
    width: '100%',
    height: 380,
    marginVertical: 12,
  },
  lightboxDoneBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  // Modern Picker Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSheetSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalOptionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalOptionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCancelBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
})
