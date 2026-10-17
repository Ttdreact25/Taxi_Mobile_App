import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, ActivityIndicator, Alert, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { longTripAPI, uploadAPI, createUploadFormData, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import { COLORS } from '../../constants/theme'
import { Skeleton, SkeletonCard } from '../../components/common/Skeleton'

const IdentityVerificationScreen = ({ navigation }) => {
  const { user, refreshUser } = useAuth()
  const [verification, setVerification] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingField, setUploadingField] = useState(null)

  // Customer KYC Form State
  const [fullName, setFullName] = useState(user?.name || '')
  const [aadhaarNumber, setAadhaarNumber] = useState('')
  const [aadhaarFront, setAadhaarFront] = useState(null)
  const [aadhaarFrontPath, setAadhaarFrontPath] = useState(null)
  const [aadhaarBack, setAadhaarBack] = useState(null)
  const [aadhaarBackPath, setAadhaarBackPath] = useState(null)
  const [selfie, setSelfie] = useState(null)
  const [selfiePath, setSelfiePath] = useState(null)
  const [emergencyContact, setEmergencyContact] = useState('')
  const [gender, setGender] = useState('Not Specified')
  const [age, setAge] = useState('')

  useEffect(() => {
    loadVerificationStatus()
  }, [])

  const loadVerificationStatus = async () => {
    setLoading(true)
    try {
      const res = await longTripAPI.myVerification()
      if (res.data?.status === 'success' && res.data?.data) {
        const v = res.data.data
        setVerification(v)
        if (v.full_name) setFullName(v.full_name)
        if (v.aadhaar_number) setAadhaarNumber(v.aadhaar_number)
        if (v.emergency_contact) setEmergencyContact(v.emergency_contact)
        if (v.gender) setGender(v.gender)
        if (v.age) setAge(String(v.age))
        if (v.aadhaar_front_image_url || v.aadhaar_front_image || v.govt_id_doc) {
          const front = v.aadhaar_front_image_url || v.aadhaar_front_image || v.govt_id_doc
          setAadhaarFront(front)
          setAadhaarFrontPath(v.aadhaar_front_image || v.govt_id_doc || front)
        }
        if (v.aadhaar_back_image_url || v.aadhaar_back_image) {
          const back = v.aadhaar_back_image_url || v.aadhaar_back_image
          setAadhaarBack(back)
          setAadhaarBackPath(v.aadhaar_back_image || back)
        }
        if (v.selfie_image_url || v.selfie_image || v.profile_photo) {
          const s = v.selfie_image_url || v.selfie_image || v.profile_photo
          setSelfie(s)
          setSelfiePath(v.selfie_image || v.profile_photo || s)
        }
      }
    } catch (e) {
      console.log('Verification check failed', e)
    } finally {
      setLoading(false)
    }
  }

  const pickImage = async (field, useCamera = false) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        Alert.alert(
          'Permission Denied',
          `Please grant ${useCamera ? 'camera' : 'gallery'} permissions to upload documents.`
        )
        return
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: field === 'selfie' ? [1, 1] : [4, 3],
            quality: 0.7,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: field === 'selfie' ? [1, 1] : [4, 3],
            quality: 0.7,
            base64: true,
          })

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const asset = result.assets[0]
        const localUri = asset.uri

        // Immediate preview so the user sees the photo right away
        if (field === 'front') setAadhaarFront(localUri)
        if (field === 'back') setAadhaarBack(localUri)
        if (field === 'selfie') setSelfie(localUri)

        // Upload immediately to server with visual loader
        setUploadingField(field)
        try {
          const formData = createUploadFormData(localUri, {
            prefix: field === 'selfie' ? 'kyc_selfie' : `kyc_${field}`,
            type: 'kyc',
            asset: asset,
          })

          const res = await uploadAPI.upload(formData, 'kyc')
          const data = res.data || {}

          if (data.status === 'success' || data.url || data.path) {
            const serverPath = data.path || data.relative_path || data.filename || data.file_name || data.url
            const serverUrl = data.url || localUri

            if (field === 'front') {
              setAadhaarFrontPath(serverPath)
              setAadhaarFront(serverUrl)
            }
            if (field === 'back') {
              setAadhaarBackPath(serverPath)
              setAadhaarBack(serverUrl)
            }
            if (field === 'selfie') {
              setSelfiePath(serverPath)
              setSelfie(serverUrl)
            }
          } else {
            Alert.alert('Upload Error', data.message || 'Failed to upload photo to server. Please try again.')
          }
        } catch (uploadErr) {
          console.log('Direct upload error:', uploadErr)
          Alert.alert(
            'Upload Error',
            (uploadErr.message || 'Failed to upload document photo to server.') + '\nPlease try picking or capturing again.'
          )
        } finally {
          setUploadingField(null)
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image: ' + e.message)
      setUploadingField(null)
    }
  }

  const uploadImageIfLocal = async (uri, type = 'kyc', prefix = 'kyc') => {
    if (!uri || typeof uri !== 'string') return ''
    if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('uploads/') || uri.startsWith('kyc/')) {
      return uri
    }
    try {
      const formData = createUploadFormData(uri, {
        prefix: prefix,
        type: type,
      })

      const res = await uploadAPI.upload(formData, type)
      if (res.data?.status === 'success' || res.data?.url || res.data?.path) {
        return res.data.path || res.data.relative_path || res.data.filename || res.data.url
      }
      if (res.data?.message) {
        throw new Error(res.data.message)
      }
    } catch (err) {
      console.log('Upload error in uploadImageIfLocal:', err)
      throw err
    }
    throw new Error('Upload failed without server response')
  }

  const handleSubmit = async () => {
    if (uploadingField) {
      Alert.alert('Uploading in Progress', 'Please wait until the photo finishes uploading before submitting.')
      return
    }

    const cleanName = fullName.trim()
    const cleanAadhaar = aadhaarNumber.replace(/\s+/g, '')

    if (!cleanName) {
      Alert.alert('Name Required', 'Please enter your Full Name matching your Aadhaar card.')
      return
    }

    if (!cleanAadhaar || cleanAadhaar.length < 12) {
      Alert.alert('Aadhaar Number Required', 'Please enter your valid 12-digit Aadhaar card number.')
      return
    }

    const frontDoc = aadhaarFrontPath || aadhaarFront
    if (!frontDoc) {
      Alert.alert('Aadhaar Front Required', 'Please upload or capture the Front photo of your Aadhaar card.')
      return
    }

    const selfieDoc = selfiePath || selfie
    if (!selfieDoc) {
      Alert.alert('Live Selfie Required', 'Please capture a clear live selfie photo for facial verification.')
      return
    }

    setSubmitting(true)
    try {
      let uploadedFront = frontDoc
      if (typeof uploadedFront === 'string' && (uploadedFront.startsWith('file://') || uploadedFront.startsWith('content://'))) {
        try {
          uploadedFront = await uploadImageIfLocal(uploadedFront, 'kyc', 'kyc_front')
        } catch (uErr) {
          setSubmitting(false)
          Alert.alert('Upload Error', 'Could not upload Aadhaar front photo: ' + (uErr.message || 'Network error') + '. Please re-select the photo.')
          return
        }
      }

      let uploadedBack = aadhaarBackPath || aadhaarBack || ''
      if (typeof uploadedBack === 'string' && (uploadedBack.startsWith('file://') || uploadedBack.startsWith('content://'))) {
        try {
          uploadedBack = await uploadImageIfLocal(uploadedBack, 'kyc', 'kyc_back')
        } catch (uErr) {
          console.log('Optional back image upload skipped:', uErr)
          uploadedBack = ''
        }
      }

      let uploadedSelfie = selfieDoc
      if (typeof uploadedSelfie === 'string' && (uploadedSelfie.startsWith('file://') || uploadedSelfie.startsWith('content://'))) {
        try {
          uploadedSelfie = await uploadImageIfLocal(uploadedSelfie, 'kyc', 'kyc_selfie')
        } catch (uErr) {
          setSubmitting(false)
          Alert.alert('Upload Error', 'Could not upload Selfie photo: ' + (uErr.message || 'Network error') + '. Please re-take the selfie.')
          return
        }
      }

      const payload = {
        full_name: cleanName,
        aadhaar_number: cleanAadhaar,
        aadhaar_no: cleanAadhaar,
        aadhaar_front_image: uploadedFront,
        govt_id_doc: uploadedFront,
        aadhaar_front: uploadedFront,
        aadhaar_back_image: uploadedBack || '',
        aadhaar_back: uploadedBack || '',
        govt_id_back: uploadedBack || '',
        selfie_image: uploadedSelfie,
        profile_photo: uploadedSelfie,
        selfie_doc: uploadedSelfie,
        selfie: uploadedSelfie,
        avatar: uploadedSelfie,
        emergency_contact: emergencyContact.trim(),
        gender: gender,
        age: age ? parseInt(age, 10) : null,
      }

      const res = await longTripAPI.submitVerification(payload)

      if (res.data?.status === 'success') {
        await refreshUser()
        await loadVerificationStatus()
        Alert.alert(
          'KYC Submitted Successfully 🎉',
          'Your Aadhaar details and selfie have been submitted to Admin for verification. Once approved, you will be authorized to book and join Shared Trips.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        )
      } else {
        Alert.alert('Submission Error', res.data?.message || 'Failed to submit verification.')
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Network error while submitting KYC.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9' }} />
          <Text style={styles.headerTitle}>Identity Verification</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Skeleton height={80} borderRadius={16} style={{ marginBottom: 16 }} />
          <SkeletonCard lines={3} style={{ marginBottom: 16 }} />
          <SkeletonCard lines={2} style={{ marginBottom: 16 }} />
          <Skeleton height={140} borderRadius={12} style={{ marginBottom: 16 }} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  const isVerified = verification?.verification_status === 'verified'
  const isPending  = verification?.verification_status === 'pending'
  const isRejected = verification?.verification_status === 'rejected'

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Customer Aadhaar KYC</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadVerificationStatus} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        {isVerified && (
          <View style={[styles.statusCard, styles.verifiedCard]}>
            <View style={styles.statusIconWrapVerified}>
              <Ionicons name="checkmark-circle" size={36} color="#10B981" />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitleVerified}>KYC Verified ✓</Text>
              <Text style={styles.statusDesc}>
                Your Aadhaar card and selfie have been verified and approved by Admin. You are fully authorized to book and join 50/50 Shared Long Trips!
              </Text>
              <Text style={styles.aadhaarBadge}>
                Aadhaar: **** **** {verification?.aadhaar_number?.slice(-4) || 'XXXX'}
              </Text>
            </View>
          </View>
        )}

        {isPending && (
          <View style={[styles.statusCard, styles.pendingCard]}>
            <View style={styles.statusIconWrapPending}>
              <Ionicons name="time" size={36} color="#F59E0B" />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitlePending}>KYC Under Admin Review ⏳</Text>
              <Text style={styles.statusDesc}>
                Your KYC submission is currently being reviewed by Admin. Verification is typically completed within 15 minutes. Once approved, you can immediately join Shared Trips.
              </Text>
            </View>
          </View>
        )}

        {isRejected && (
          <View style={[styles.statusCard, styles.rejectedCard]}>
            <View style={styles.statusIconWrapRejected}>
              <Ionicons name="alert-circle" size={36} color="#EF4444" />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitleRejected}>KYC Verification Rejected ❌</Text>
              <Text style={styles.statusDesc}>
                {verification?.rejection_reason || 'Uploaded document photos did not meet safety verification standards. Please upload clear, unblurred photos below.'}
              </Text>
            </View>
          </View>
        )}

        {/* Requirements Banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoBannerIconWrap}>
            <Ionicons name="shield-checkmark" size={22} color="#D97706" />
          </View>
          <Text style={styles.infoBannerText}>
            Aadhaar KYC identity verification is required for 50/50 Shared Long Trips to ensure complete passenger safety and verified profiles.
          </Text>
        </View>

        {/* Verification Form (Shown if not verified) */}
        {!isVerified && (
          <View style={styles.formContainer}>
            <Text style={styles.sectionHeader}>Passenger Identification</Text>

            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name (as per Aadhaar Card)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={COLORS.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter full legal name"
                  placeholderTextColor={COLORS.gray400}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>
            </View>

            {/* 12-Digit Aadhaar Number */}
            <View style={[styles.inputGroup, { marginTop: 12 }]}>
              <Text style={styles.label}>12-Digit Aadhaar Number</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="card-outline" size={18} color={COLORS.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1234 5678 9012"
                  placeholderTextColor={COLORS.gray400}
                  keyboardType="numeric"
                  maxLength={14}
                  value={aadhaarNumber}
                  onChangeText={setAadhaarNumber}
                />
              </View>
            </View>

            {/* Emergency Contact */}
            <View style={[styles.inputGroup, { marginTop: 12 }]}>
              <Text style={styles.label}>Emergency Contact Number (Optional)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={18} color={COLORS.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 9876543210"
                  placeholderTextColor={COLORS.gray400}
                  keyboardType="phone-pad"
                  maxLength={12}
                  value={emergencyContact}
                  onChangeText={setEmergencyContact}
                />
              </View>
            </View>

            {/* Gender Selection */}
            <View style={[styles.inputGroup, { marginTop: 12 }]}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.genderRow}>
                {['Male', 'Female', 'Other'].map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderChip, gender === g && styles.genderChipActive]}
                    onPress={() => setGender(g)}
                  >
                    <Text style={[styles.genderChipText, gender === g && styles.genderChipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Upload Documents Section */}
            <Text style={[styles.sectionHeader, { marginTop: 22 }]}>Required KYC Photos (3 Photos)</Text>

            {/* 1. Live Selfie / Facial Photo */}
            <View style={styles.docUploadCard}>
              <View style={styles.docHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.docTitle}>1. Live Selfie Photo</Text>
                  <Text style={styles.docSubtitle}>Clear facial photo for passenger profile verification</Text>
                </View>
                {uploadingField === 'selfie' ? (
                  <View style={styles.uploadingBadge}>
                    <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 4 }} />
                    <Text style={styles.uploadingBadgeText}>Uploading...</Text>
                  </View>
                ) : (
                  (selfie || selfiePath) && <Text style={styles.attachedBadge}>Attached ✓</Text>
                )}
              </View>
              {uploadingField === 'selfie' ? (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.uploadingBoxText}>Uploading selfie to server...</Text>
                </View>
              ) : selfie ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: resolveAssetUrl(selfie) }} style={styles.docPreview} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => { setSelfie(null); setSelfiePath(null) }}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity style={[styles.uploadBtn, styles.cameraBtn, { flex: 1 }]} onPress={() => pickImage('selfie', true)}>
                    <Ionicons name="camera" size={18} color={COLORS.primary} />
                    <Text style={[styles.uploadBtnText, { color: COLORS.primary, fontWeight: '700' }]}>Take Live Selfie</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadBtn, { flex: 1 }]} onPress={() => pickImage('selfie', false)}>
                    <Ionicons name="images-outline" size={18} color={COLORS.dark} />
                    <Text style={styles.uploadBtnText}>Choose Photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 2. Aadhaar Front */}
            <View style={styles.docUploadCard}>
              <View style={styles.docHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.docTitle}>2. Aadhaar Card (Front Side)</Text>
                  <Text style={styles.docSubtitle}>Showing your photo, name and Aadhaar number</Text>
                </View>
                {uploadingField === 'front' ? (
                  <View style={styles.uploadingBadge}>
                    <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 4 }} />
                    <Text style={styles.uploadingBadgeText}>Uploading...</Text>
                  </View>
                ) : (
                  (aadhaarFront || aadhaarFrontPath) && <Text style={styles.attachedBadge}>Attached ✓</Text>
                )}
              </View>
              {uploadingField === 'front' ? (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.uploadingBoxText}>Uploading front image to server...</Text>
                </View>
              ) : aadhaarFront ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: resolveAssetUrl(aadhaarFront) }} style={styles.docPreview} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => { setAadhaarFront(null); setAadhaarFrontPath(null) }}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage('front', false)}>
                    <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.uploadBtnText}>Upload from Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadBtn, styles.cameraBtn]} onPress={() => pickImage('front', true)}>
                    <Ionicons name="camera-outline" size={16} color={COLORS.dark} />
                    <Text style={[styles.uploadBtnText, { color: COLORS.dark }]}>Take Photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 3. Aadhaar Back */}
            <View style={styles.docUploadCard}>
              <View style={styles.docHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.docTitle}>3. Aadhaar Card (Back Side)</Text>
                  <Text style={styles.docSubtitle}>Showing address & barcode</Text>
                </View>
                {uploadingField === 'back' ? (
                  <View style={styles.uploadingBadge}>
                    <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 4 }} />
                    <Text style={styles.uploadingBadgeText}>Uploading...</Text>
                  </View>
                ) : (
                  (aadhaarBack || aadhaarBackPath) && <Text style={styles.attachedBadge}>Attached ✓</Text>
                )}
              </View>
              {uploadingField === 'back' ? (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.uploadingBoxText}>Uploading back image to server...</Text>
                </View>
              ) : aadhaarBack ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: resolveAssetUrl(aadhaarBack) }} style={styles.docPreview} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => { setAadhaarBack(null); setAadhaarBackPath(null) }}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage('back', false)}>
                    <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.uploadBtnText}>Upload from Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadBtn, styles.cameraBtn]} onPress={() => pickImage('back', true)}>
                    <Ionicons name="camera-outline" size={16} color={COLORS.dark} />
                    <Text style={[styles.uploadBtnText, { color: COLORS.dark }]}>Take Photo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, (submitting || !!uploadingField) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting || !!uploadingField}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Submit KYC for Admin Approval</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginHorizontal: 8,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusInfo: {
    flex: 1,
  },
  verifiedCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusIconWrapVerified: {
    marginRight: 12,
    marginTop: 2,
  },
  statusTitleVerified: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  statusDesc: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 4,
    lineHeight: 18,
  },
  aadhaarBadge: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pendingCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusIconWrapPending: {
    marginRight: 12,
    marginTop: 2,
  },
  statusTitlePending: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  rejectedCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusIconWrapRejected: {
    marginRight: 12,
    marginTop: 2,
  },
  statusTitleRejected: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  infoBannerIconWrap: {
    marginRight: 10,
    marginTop: 2,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  genderChipActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  genderChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  genderChipTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  docUploadCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  docSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  attachedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  previewWrap: {
    position: 'relative',
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  docPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  uploadBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 10,
  },
  cameraBtn: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  uploadBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  uploadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  uploadingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  uploadingBox: {
    height: 120,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
  },
  uploadingBoxText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
})

export default IdentityVerificationScreen
