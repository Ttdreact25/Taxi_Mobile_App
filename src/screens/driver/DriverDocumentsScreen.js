import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, ActivityIndicator, Alert, Platform, RefreshControl, Modal, PanResponder,
  Linking
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { driverAPI, longTripAPI, uploadAPI, settingsAPI, createUploadFormData, resolveAssetUrl } from '../../api/api'
import { COLORS } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import { WebView } from 'react-native-webview'

// ── Interactive Professional Finger Drawing Pad for Driver's Manual Digital Signature ──
const DigitalSignaturePad = ({
  signatureValue,
  onSignatureChange,
  onUploadPhoto,
  onDrawingStart,
  onDrawingEnd,
}) => {
  const [strokes, setStrokes] = useState([])
  const [activeMode, setActiveMode] = useState('draw') // 'draw' | 'upload'
  const [padWidth, setPadWidth] = useState(340)
  const [padHeight, setPadHeight] = useState(190)
  const [isCurrentlyDrawing, setIsCurrentlyDrawing] = useState(false)

  const padWidthRef = useRef(340)
  const padHeightRef = useRef(190)
  const isDrawing = useRef(false)
  const currentStroke = useRef([])
  const allStrokesRef = useRef([])

  const onDrawingStartRef = useRef(onDrawingStart)
  const onDrawingEndRef = useRef(onDrawingEnd)
  const onSignatureChangeRef = useRef(onSignatureChange)

  useEffect(() => {
    onDrawingStartRef.current = onDrawingStart
    onDrawingEndRef.current = onDrawingEnd
    onSignatureChangeRef.current = onSignatureChange
  })

  const exportSvgSignature = (strokeList) => {
    if (!strokeList || strokeList.length === 0) return
    let pathData = ''
    strokeList.forEach(seg => {
      if (!seg || seg.length === 0) return
      if (seg.length === 1) {
        pathData += ` M ${seg[0].x} ${seg[0].y} L ${seg[0].x + 0.5} ${seg[0].y}`
        return
      }
      pathData += ` M ${seg[0].x} ${seg[0].y}`
      for (let i = 1; i < seg.length; i++) {
        pathData += ` L ${seg[i].x} ${seg[i].y}`
      }
    })
    if (pathData.trim()) {
      const curW = padWidthRef.current || 340
      const curH = padHeightRef.current || 190
      const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${curW}" height="${curH}" viewBox="0 0 ${curW} ${curH}"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="${pathData}" stroke="#0F172A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`
      const svgDataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgMarkup)
      onSignatureChangeRef.current?.(svgDataUri)
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        isDrawing.current = true
        setIsCurrentlyDrawing(true)
        onDrawingStartRef.current?.()
        const { locationX, locationY } = evt.nativeEvent
        const maxW = padWidthRef.current || 340
        const maxH = padHeightRef.current || 190
        const clampedX = Math.max(2, Math.min(maxW - 2, Math.round(locationX)))
        const clampedY = Math.max(2, Math.min(maxH - 2, Math.round(locationY)))
        const pt = { x: clampedX, y: clampedY }
        currentStroke.current = [pt]
        const updated = [...allStrokesRef.current, currentStroke.current]
        allStrokesRef.current = updated
        setStrokes(updated)
      },
      onPanResponderMove: (evt) => {
        if (!isDrawing.current) return
        const { locationX, locationY } = evt.nativeEvent
        const maxW = padWidthRef.current || 340
        const maxH = padHeightRef.current || 190
        const clampedX = Math.max(2, Math.min(maxW - 2, Math.round(locationX)))
        const clampedY = Math.max(2, Math.min(maxH - 2, Math.round(locationY)))

        const cur = currentStroke.current
        if (cur.length > 0) {
          const last = cur[cur.length - 1]
          const dx = clampedX - last.x
          const dy = clampedY - last.y
          // Ignore micro-movements < 2px to avoid jitter and redundant points
          if (dx * dx + dy * dy < 4) return
        }

        const pt = { x: clampedX, y: clampedY }
        cur.push(pt)
        const updated = [...allStrokesRef.current]
        updated[updated.length - 1] = [...cur]
        allStrokesRef.current = updated
        setStrokes(updated)
      },
      onPanResponderRelease: () => {
        isDrawing.current = false
        setIsCurrentlyDrawing(false)
        onDrawingEndRef.current?.()
        exportSvgSignature(allStrokesRef.current)
      },
      onPanResponderTerminate: () => {
        isDrawing.current = false
        setIsCurrentlyDrawing(false)
        onDrawingEndRef.current?.()
        exportSvgSignature(allStrokesRef.current)
      },
    })
  ).current

  const clearSignature = () => {
    currentStroke.current = []
    allStrokesRef.current = []
    setStrokes([])
    onSignatureChangeRef.current?.('')
  }

  const hasDrawn = strokes.length > 0 && strokes.some(s => s && s.length > 0)
  const hasExistingSig = Boolean(signatureValue)
  const isSigned = hasDrawn || hasExistingSig

  return (
    <View style={styles.sigContainer}>
      {/* 1. Mode Selector Tabs */}
      <View style={styles.sigModeSelector}>
        <TouchableOpacity
          style={[styles.sigModeTab, activeMode === 'draw' && styles.sigModeTabActive]}
          onPress={() => setActiveMode('draw')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={activeMode === 'draw' ? '#7C3AED' : '#64748B'}
          />
          <Text style={[styles.sigModeTabText, activeMode === 'draw' && styles.sigModeTabTextActive]}>
            Draw on Screen
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sigModeTab, activeMode === 'upload' && styles.sigModeTabActive]}
          onPress={() => {
            setActiveMode('upload')
            if (!hasExistingSig) onUploadPhoto()
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="camera-outline"
            size={16}
            color={activeMode === 'upload' ? '#7C3AED' : '#64748B'}
          />
          <Text style={[styles.sigModeTabText, activeMode === 'upload' && styles.sigModeTabTextActive]}>
            Upload Paper Scan
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. Drawing Mode or Upload Mode */}
      {activeMode === 'draw' ? (
        <View style={styles.sigPadWrapper}>
          <View
            style={[
              styles.sigPad,
              isCurrentlyDrawing && styles.sigPadActiveBorder
            ]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout
              if (width > 50) {
                setPadWidth(Math.round(width))
                padWidthRef.current = Math.round(width)
              }
              if (height > 50) {
                setPadHeight(Math.round(height))
                padHeightRef.current = Math.round(height)
              }
            }}
          >
            {/* ── Layer 1: Visual Elements (strictly pointerEvents="none" so touches NEVER get hijacked) ── */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Corner Decorative Document Registration Markers */}
              <View style={styles.sigCornerTL} />
              <View style={styles.sigCornerTR} />
              <View style={styles.sigCornerBL} />
              <View style={styles.sigCornerBR} />

              {/* If user hasn't drawn anything new and has an existing signature image */}
              {!hasDrawn && hasExistingSig ? (
                <View style={styles.sigExistingWrapper}>
                  {signatureValue && (signatureValue.includes('.svg') || signatureValue.startsWith('data:image/svg+xml')) ? (
                    <WebView
                      originWhitelist={['*']}
                      source={{
                        html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><style>body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}img{max-width:90%;max-height:85%;object-fit:contain;}</style></head><body><img src="${signatureValue}" /></body></html>`
                      }}
                      style={styles.sigPreviewImg}
                      scrollEnabled={false}
                    />
                  ) : (
                    <Image
                      source={{ uri: signatureValue }}
                      style={styles.sigPreviewImg}
                      resizeMode="contain"
                    />
                  )}
                  <View style={styles.sigSavedBadge}>
                    <Ionicons name="shield-checkmark" size={12} color="#059669" />
                    <Text style={styles.sigSavedBadgeText}>Saved Signature</Text>
                  </View>
                </View>
              ) : null}

              {/* Signature Guideline Line */}
              <View style={styles.sigGuidelineRow}>
                <View style={styles.sigXMarkWrap}>
                  <Text style={styles.sigXMark}>✕</Text>
                </View>
                <View style={styles.sigGuidelineDashed} />
                <Text style={styles.sigGuidelineLabel}>Sign on the line</Text>
              </View>

              {/* Watermark Helper when empty */}
              {!hasDrawn && !hasExistingSig && (
                <View style={styles.sigWatermark}>
                  <View style={styles.sigWatermarkIconCircle}>
                    <Ionicons name="pencil" size={20} color="#7C3AED" />
                  </View>
                  <Text style={styles.sigWatermarkTitle}>Sign with your finger here</Text>
                  <Text style={styles.sigWatermarkSub}>Draw smoothly inside this box</Text>
                </View>
              )}

              {/* Smooth Ink Strokes Rendering */}
              {strokes.map((stroke, strokeIdx) => (
                <React.Fragment key={`stroke-${strokeIdx}`}>
                  {stroke && stroke.map((pt, i) => {
                    if (i === 0) {
                      return (
                        <View
                          key={`cap-${strokeIdx}-${i}`}
                          style={[styles.sigInkCap, { left: pt.x - 2, top: pt.y - 2 }]}
                        />
                      )
                    }
                    const p0 = stroke[i - 1]
                    const dx = pt.x - p0.x
                    const dy = pt.y - p0.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < 0.5) return null
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
                    const midX = (p0.x + pt.x) / 2
                    const midY = (p0.y + pt.y) / 2
                    return (
                      <React.Fragment key={`seg-${strokeIdx}-${i}`}>
                        <View
                          style={[
                            styles.sigInkLine,
                            {
                              left: midX - dist / 2,
                              top: midY - 1.75,
                              width: dist,
                              transform: [{ rotate: `${angle}deg` }],
                            }
                          ]}
                        />
                        <View
                          style={[styles.sigInkCap, { left: pt.x - 2, top: pt.y - 2 }]}
                        />
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </View>

            {/* ── Layer 2: Dedicated Transparent Touch Responder Overlay (NO child nodes, 100% stable coordinates) ── */}
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent', zIndex: 999 }]}
              collapsable={false}
              {...panResponder.panHandlers}
            />
          </View>

          {/* Action Toolbar */}
          <View style={styles.sigToolbar}>
            <TouchableOpacity
              style={styles.sigBtnClear}
              onPress={clearSignature}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={14} color="#EF4444" />
              <Text style={styles.sigBtnClearText}>Clear / Redo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sigBtnUploadQuick}
              onPress={onUploadPhoto}
              activeOpacity={0.7}
            >
              <Ionicons name="camera-outline" size={14} color="#2563EB" />
              <Text style={styles.sigBtnUploadQuickText}>Upload Photo</Text>
            </TouchableOpacity>

            <View style={[styles.sigStatusBadge, isSigned ? styles.sigStatusBadgeSigned : styles.sigStatusBadgePending]}>
              <Ionicons
                name={isSigned ? "checkmark-circle" : "ellipse-outline"}
                size={13}
                color={isSigned ? "#059669" : "#94A3B8"}
              />
              <Text style={[styles.sigStatusBadgeText, isSigned ? { color: '#059669' } : { color: '#64748B' }]}>
                {isSigned ? 'Signed ✓' : 'Unsigned'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        /* Upload Scan Mode */
        <View style={styles.sigUploadContainer}>
          {hasExistingSig ? (
            <View style={styles.sigUploadedPreviewCard}>
              {signatureValue && (signatureValue.includes('.svg') || signatureValue.startsWith('data:image/svg+xml')) ? (
                <WebView
                  originWhitelist={['*']}
                  source={{
                    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><style>body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}img{max-width:90%;max-height:85%;object-fit:contain;}</style></head><body><img src="${signatureValue}" /></body></html>`
                  }}
                  style={styles.sigUploadedImg}
                  scrollEnabled={false}
                />
              ) : (
                <Image
                  source={{ uri: signatureValue }}
                  style={styles.sigUploadedImg}
                  resizeMode="contain"
                />
              )}
              <View style={styles.sigUploadedActionsRow}>
                <TouchableOpacity
                  style={[styles.sigToolBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                  onPress={onUploadPhoto}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={15} color="#059669" />
                  <Text style={[styles.sigToolBtnText, { color: '#059669' }]}>Change Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sigToolBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
                  onPress={clearSignature}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={15} color="#DC2626" />
                  <Text style={[styles.sigToolBtnText, { color: '#DC2626' }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.sigUploadDropzone}
              onPress={onUploadPhoto}
              activeOpacity={0.85}
            >
              <View style={styles.sigUploadIconCircle}>
                <Ionicons name="cloud-upload" size={26} color="#7C3AED" />
              </View>
              <Text style={styles.sigUploadTitle}>Upload Signature on Paper</Text>
              <Text style={styles.sigUploadDesc}>
                Sign on a blank white paper and take a clear photo or choose from gallery
              </Text>
              <View style={styles.sigUploadActionPill}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
                <Text style={styles.sigUploadActionPillText}>Take Photo / Choose Image</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Compliance / Security Note */}
      <View style={styles.sigSecurityNoteRow}>
        <Ionicons name="shield-checkmark" size={12} color="#7C3AED" />
        <Text style={styles.sigSecurityNoteText}>
          Your digital signature is legally encrypted and used solely for partner onboarding verification.
        </Text>
      </View>
    </View>
  )
}

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
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const scrollViewRef = useRef(null)
  const [kycPolicyInfo, setKycPolicyInfo] = useState({
    policy: '',
    address: '',
    phone: '',
  })

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
    rc_expiry: '',
    permit_image: '',
    permit_url: '',
    permit_expiry: '',
    insurance_image: '',
    insurance_url: '',
    insurance_expiry: '',
    vehicle_photo: '',
    vehicle_photo_url: '',
    police_verification_image: '',
    police_verification_url: '',
    profile_selfie: '',
    profile_selfie_url: '',
    avatar: '',
    avatar_url: '',
    signature_image: '',
    signature_url: '',
    car_images: [],
    car_image_1: '',
    car_image_1_url: '',
    car_image_2: '',
    car_image_2_url: '',
    car_image_3: '',
    car_image_3_url: '',
    car_image_4: '',
    car_image_4_url: '',
    car_image_5: '',
    car_image_5_url: '',
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

      // Extract KYC Policy, Hub Address and Helpline from response or system_settings
      let pol = d.kyc_policy || drvRes?.data?.kyc_policy || ''
      let addr = d.kyc_address || drvRes?.data?.kyc_address || ''
      let ph = d.kyc_phone || drvRes?.data?.kyc_phone || ''

      if (!pol || !addr || !ph) {
        try {
          const sysRes = await settingsAPI.getAll()
          const s = sysRes?.data?.settings || {}
          if (!pol) pol = s.driver_kyc_policy || ''
          if (!addr) addr = s.driver_kyc_address || ''
          if (!ph) ph = s.driver_kyc_phone || ''
        } catch (e) {}
      }

      setKycPolicyInfo({
        policy: pol || "1. Upload clear photos of your original Driving License and Vehicle RC Book.\n2. All documents must be clearly legible and currently valid.\n3. Documents will be reviewed and verified by Admin CRM within 24 hours.\n4. For any assistance, contact our official verification hub address or helpline.",
        address: addr || "No. 12, Anna Salai, Near Mount Road Metro, Chennai, Tamil Nadu - 600002",
        phone: ph || "+91 98765 43210",
      })

      // Strict Driver KYC check:
      // A driver only has KYC approved if their commercial fleet docs (driving license or RC book) are actually present.
      const hasDriverKycDocs = Boolean(
        d.license_front_image || d.license_front_url ||
        d.license_back_image || d.license_back_url ||
        d.aadhaar_front_image || d.aadhaar_front_url ||
        d.rc_book_image || d.rc_book_url
      )

      let rawVerif = (d.verification_status || 'unsubmitted').toLowerCase()
      const isExplicitlyApproved = (d.approval_status || '').toLowerCase() === 'approved' || rawVerif === 'approved' || rawVerif === 'verified'

      // If no driver documents have been submitted and admin hasn't approved, status cannot be approved
      if (!isExplicitlyApproved && !hasDriverKycDocs && (rawVerif === 'approved' || rawVerif === 'verified')) {
        rawVerif = 'unsubmitted'
      }

      const drvVerif = isExplicitlyApproved
        ? 'approved'
        : (rawVerif === 'rejected' ? 'rejected' : (rawVerif === 'pending' ? 'pending' : 'unsubmitted'))

      if (d.policy_accepted || drvVerif === 'approved' || drvVerif === 'pending') {
        setPolicyAccepted(true)
      }

      const merged = {
        ...d,
        approval_status: isExplicitlyApproved ? 'approved' : (d.approval_status || 'pending'),
        verification_status: drvVerif,
        rejection_reason: isExplicitlyApproved ? null : (d.rejection_reason || null),
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
        rc_expiry: merged.rc_expiry || prev.rc_expiry || '',
        permit_image: merged.permit_image || prev.permit_image || '',
        permit_url: merged.permit_url || prev.permit_url || '',
        permit_expiry: merged.permit_expiry || prev.permit_expiry || '',
        insurance_image: merged.insurance_image || prev.insurance_image,
        insurance_url: merged.insurance_url || prev.insurance_url,
        insurance_expiry: merged.insurance_expiry || prev.insurance_expiry || '',
        vehicle_photo: merged.vehicle_photo || merged.car_image_1 || (Array.isArray(merged.car_images) ? merged.car_images[0] : '') || prev.vehicle_photo,
        vehicle_photo_url: merged.vehicle_photo_url || merged.car_image_1_url || (Array.isArray(merged.car_image_urls) ? merged.car_image_urls[0] : '') || prev.vehicle_photo_url,
        police_verification_image: merged.police_verification_image || prev.police_verification_image,
        police_verification_url: merged.police_verification_url || prev.police_verification_url,
        profile_selfie: merged.profile_selfie || prev.profile_selfie,
        profile_selfie_url: merged.profile_selfie_url || prev.profile_selfie_url,
        avatar: merged.avatar || prev.avatar,
        avatar_url: merged.profile_photo_url || merged.avatar_url || prev.avatar_url,
        signature_image: merged.signature_image || merged.signature || prev.signature_image || '',
        signature_url: merged.signature_url || merged.signature_image_url || merged.signature_image || prev.signature_url || '',
        car_images: merged.car_images || prev.car_images || [],
        car_image_1: merged.car_image_1 || (Array.isArray(merged.car_images) ? merged.car_images[0] : '') || prev.car_image_1 || '',
        car_image_1_url: merged.car_image_1_url || (Array.isArray(merged.car_image_urls) ? merged.car_image_urls[0] : '') || prev.car_image_1_url || '',
        car_image_2: merged.car_image_2 || (Array.isArray(merged.car_images) ? merged.car_images[1] : '') || prev.car_image_2 || '',
        car_image_2_url: merged.car_image_2_url || (Array.isArray(merged.car_image_urls) ? merged.car_image_urls[1] : '') || prev.car_image_2_url || '',
        car_image_3: merged.car_image_3 || (Array.isArray(merged.car_images) ? merged.car_images[2] : '') || prev.car_image_3 || '',
        car_image_3_url: merged.car_image_3_url || (Array.isArray(merged.car_image_urls) ? merged.car_image_urls[2] : '') || prev.car_image_3_url || '',
        car_image_4: merged.car_image_4 || (Array.isArray(merged.car_images) ? merged.car_images[3] : '') || prev.car_image_4 || '',
        car_image_4_url: merged.car_image_4_url || (Array.isArray(merged.car_image_urls) ? merged.car_image_urls[3] : '') || prev.car_image_4_url || '',
        car_image_5: merged.car_image_5 || (Array.isArray(merged.car_images) ? merged.car_images[4] : '') || prev.car_image_5 || '',
        car_image_5_url: merged.car_image_5_url || (Array.isArray(merged.car_image_urls) ? merged.car_image_urls[4] : '') || prev.car_image_5_url || '',
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

      const isAvatarOrSelfie = fieldKey === 'avatar' || fieldKey === 'profile_selfie'
      const options = {
        mediaTypes: ['images'],
        allowsEditing: isAvatarOrSelfie,
        aspect: isAvatarOrSelfie ? [1, 1] : undefined,
        quality: 0.7,
        base64: true,
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setUploadingField(fieldKey)
        const localUri = result.assets[0].uri
        const formData = createUploadFormData(localUri, {
          prefix: fieldKey,
          type: 'kyc',
          asset: result.assets[0],
        })

        const uploadRes = await uploadAPI.upload(formData, 'kyc')
        const data = uploadRes.data || {}

        if (data.status === 'success' || data.url || data.path) {
          const relativePath = data.path || data.filename || data.file_name || data.relative_path || data.url
          const fullUrl = data.url || localUri

          let urlKey = `${fieldKey}_url`
          if (fieldKey === 'signature_image') {
            urlKey = 'signature_url'
          } else if (fieldKey.endsWith('_image')) {
            urlKey = fieldKey.replace('_image', '_url')
          }

          setForm(prev => {
            const next = {
              ...prev,
              [fieldKey]: relativePath,
              [urlKey]: fullUrl,
              [`${fieldKey}_url`]: fullUrl,
            }
            if (fieldKey === 'car_image_1' || fieldKey === 'vehicle_photo') {
              next.vehicle_photo = relativePath
              next.vehicle_photo_url = fullUrl
              next.car_image_1 = relativePath
              next.car_image_1_url = fullUrl
            }
            if (fieldKey === 'signature_image') {
              next.signature_image = relativePath
              next.signature_url = fullUrl
              next.signature = relativePath
            }
            return next
          })

          Alert.alert('Photo Attached ✓', 'Photo attached successfully! Tap "Submit Documents for Verification" below to save.')
        } else {
          Alert.alert('Upload Failed', data.message || 'Server rejected file upload. Please try again.')
        }
      }
    } catch (err) {
      console.log('Driver document upload error:', err)
      const errorMsg = err?.message || 'Failed to upload photo.'
      Alert.alert(
        'Upload Error',
        `${errorMsg}\n\nPlease check connection or try again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => performImageCapture(useCamera) }
        ]
      )
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

  const isExplicitlyApproved = Boolean(
    (profile?.approval_status || '').toLowerCase() === 'approved' ||
    (profile?.approval_status || '').toLowerCase() === 'verified' ||
    (profile?.verification_status || '').toLowerCase() === 'approved' ||
    (profile?.verification_status || '').toLowerCase() === 'verified' ||
    (profile?.kyc_status || '').toLowerCase() === 'approved' ||
    (profile?.kyc_status || '').toLowerCase() === 'verified'
  )

  const isApproved = Boolean(
    isExplicitlyApproved &&
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

    // ── 1. MANDATORY POLICY ACCEPTANCE CHECK ───────────────────
    if (!policyAccepted) {
      Alert.alert(
        'Policy Acceptance Required',
        'Please read the Driver KYC Policy paragraph at the top and check "I have read and agree to this Policy" before submitting your documents.',
        [
          {
            text: 'Read Policy Now',
            onPress: () => {
              scrollViewRef.current?.scrollTo?.({ y: 0, animated: true })
            }
          }
        ]
      )
      return
    }

    // ── 2. MANDATORY DETAILS & DOCUMENTS (ALL REQUIRED) ────────
    // Driving License Number
    if (!form.license_no || !form.license_no.trim()) {
      Alert.alert('Missing Driving License', 'Please enter your Driving License Number (e.g. TN-01-2024-1234567).')
      return
    }

    // Driving License Expiry
    if (!form.license_expiry || !form.license_expiry.trim()) {
      Alert.alert('License Expiry Date Required', 'Please enter your Driving License Expiry Date (YYYY-MM-DD).')
      return
    }

    // Driving License Front Photo
    if (!form.license_front_image && !form.license_front_url && !profile?.license_front_image && !profile?.license_front_url) {
      Alert.alert('Driving License (Front) Required', 'Please attach a clear photo of your Driving License (Front side).')
      return
    }

    // Driving License Back Photo
    if (!form.license_back_image && !form.license_back_url && !profile?.license_back_image && !profile?.license_back_url) {
      Alert.alert('Driving License (Back) Required', 'Please attach a clear photo of your Driving License (Back side).')
      return
    }

    // Aadhaar Number
    if (!form.aadhaar_no || !form.aadhaar_no.trim()) {
      Alert.alert('Aadhaar Number Required', 'Please enter your 12-digit Aadhaar Card Number.')
      return
    }

    // Aadhaar Front Photo
    if (!form.aadhaar_front_image && !form.aadhaar_front_url && !profile?.aadhaar_front_image && !profile?.aadhaar_front_url) {
      Alert.alert('Aadhaar Card (Front) Required', 'Please attach a clear photo of your Aadhaar Card (Front side).')
      return
    }

    // Aadhaar Back Photo
    if (!form.aadhaar_back_image && !form.aadhaar_back_url && !profile?.aadhaar_back_image && !profile?.aadhaar_back_url) {
      Alert.alert('Aadhaar Card (Back) Required', 'Please attach a clear photo of your Aadhaar Card (Back side).')
      return
    }

    // RC Book Front Photo
    if (!form.rc_book_image && !form.rc_book_url && !profile?.rc_book_image && !profile?.rc_book_url) {
      Alert.alert('RC Book (Front) Required', 'Please attach a clear photo of your Vehicle RC Book (Front side).')
      return
    }

    // RC Book Back Photo
    if (!form.rc_back_image && !form.rc_back_url && !profile?.rc_back_image && !profile?.rc_back_url) {
      Alert.alert('RC Book (Back) Required', 'Please attach a clear photo of your Vehicle RC Book (Back side).')
      return
    }

    // Commercial Taxi Permit Photo
    if (!form.permit_image && !form.permit_url && !profile?.permit_image && !profile?.permit_url) {
      Alert.alert('Commercial Taxi Permit Photo Required', 'Please upload or capture a clear photo of your Commercial Taxi Permit.')
      return
    }

    // Commercial Taxi Permit Expiry Date
    if (!form.permit_expiry || !form.permit_expiry.trim()) {
      Alert.alert('Permit Expiry Date Required', 'Please enter your Commercial Taxi Permit Expiry Date (YYYY-MM-DD).')
      return
    }

    // Vehicle Insurance Photo
    if (!form.insurance_image && !form.insurance_url && !profile?.insurance_image && !profile?.insurance_url) {
      Alert.alert('Vehicle Insurance Photo Required', 'Please attach a clear photo of your valid Vehicle Insurance certificate.')
      return
    }

    // Vehicle Insurance Expiry Date
    if (!form.insurance_expiry || !form.insurance_expiry.trim()) {
      Alert.alert('Insurance Expiry Date Required', 'Please enter your Vehicle Insurance Expiry Date (YYYY-MM-DD).')
      return
    }

    // Driver Profile Photo or Live Selfie
    const hasProfilePhoto = Boolean(
      form.profile_selfie || form.profile_selfie_url ||
      form.avatar || form.avatar_url ||
      profile?.profile_selfie || profile?.profile_selfie_url ||
      profile?.profile_photo || profile?.avatar
    )
    if (!hasProfilePhoto) {
      Alert.alert('Profile Photo / Selfie Required', 'Please capture or upload your official Driver Profile Photo or Biometric Selfie.')
      return
    }

    // 5 Vehicle Inspection Photos
    const carPhotosCount = [form.car_image_1, form.car_image_2, form.car_image_3, form.car_image_4, form.car_image_5].filter(Boolean).length
    if (carPhotosCount < 5) {
      Alert.alert('5 Vehicle Inspection Photos Required', `Please capture all 5 vehicle inspection photos (${carPhotosCount}/5 added). All 5 angles (Front, Rear, Left, Right, Interior) are mandatory.`)
      return
    }

    // Digital Signature
    if (!form.signature_image && !form.signature_url && !profile?.signature_image && !profile?.signature_url) {
      Alert.alert('Digital Signature Required', 'Please draw your digital signature or upload your signature photo before submitting.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        policy_accepted: 1,
        kyc_policy_agreed: 1,
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
        rc_expiry: (form.rc_expiry || '').trim(),
        permit_image: form.permit_image,
        permit_url: form.permit_url,
        permit_expiry: form.permit_expiry.trim(),
        insurance_image: form.insurance_image,
        insurance_url: form.insurance_url,
        insurance_expiry: form.insurance_expiry.trim(),
        vehicle_photo: form.vehicle_photo || form.car_image_1 || '',
        vehicle_photo_url: form.vehicle_photo_url || form.car_image_1_url || '',
        car_images: [form.car_image_1 || form.vehicle_photo, form.car_image_2, form.car_image_3, form.car_image_4, form.car_image_5].filter(Boolean),
        car_image_1: form.car_image_1 || form.vehicle_photo || '',
        car_image_2: form.car_image_2 || '',
        car_image_3: form.car_image_3 || '',
        car_image_4: form.car_image_4 || '',
        car_image_5: form.car_image_5 || '',
        signature_image: form.signature_image || form.signature_url || '',
        signature: form.signature_image || form.signature_url || '',
        digital_signature: form.signature_image || form.signature_url || '',
        police_verification_image: form.police_verification_image,
        police_verification_url: form.police_verification_url,
        profile_selfie: form.profile_selfie,
        profile_selfie_url: form.profile_selfie_url,
        selfie_image: form.profile_selfie || form.avatar,
        avatar: form.avatar,
        avatar_url: form.avatar_url,
      }

      // Submit to both driver and customer verification endpoints
      const results = await Promise.allSettled([
        driverAPI.submitDocuments(payload),
        longTripAPI?.submitVerification ? longTripAPI.submitVerification(payload) : Promise.resolve()
      ])

      const driverResult = results[0]
      if (driverResult.status === 'rejected') {
        const longTripResult = results[1]
        if (longTripResult.status === 'rejected') {
          throw driverResult.reason || new Error('Failed to submit documents. Please try again.')
        }
      }

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
      iconColor: '#D97706',
      bgColor: '#FEF3C7',
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
      id: 'permit',
      title: 'Commercial Taxi Permit',
      subtitle: 'Official state / transport permit certificate',
      uri: getImageUri(profile?.permit_url || form.permit_url, profile?.permit_image || form.permit_image),
      icon: 'ribbon-outline',
      iconColor: '#7C3AED',
      bgColor: '#F5F3FF',
    },
    {
      id: 'insurance',
      title: 'Vehicle Insurance Policy',
      subtitle: 'Active commercial comprehensive cover',
      uri: getImageUri(profile?.insurance_url || form.insurance_url, profile?.insurance_image || form.insurance_image),
      icon: 'shield-checkmark',
      iconColor: '#D97706',
      bgColor: '#FFF8E7',
    },
    {
      id: 'car_image_1',
      title: 'Car Inspection (1/5 Front)',
      subtitle: 'Front bumper, hood & number plate view',
      uri: getImageUri(profile?.car_image_1_url || form.car_image_1_url, profile?.car_image_1 || form.car_image_1),
      icon: 'car-sport-outline',
      iconColor: '#0284C7',
      bgColor: '#E0F2FE',
    },
    {
      id: 'car_image_2',
      title: 'Car Inspection (2/5 Rear)',
      subtitle: 'Rear trunk & tail lights view',
      uri: getImageUri(profile?.car_image_2_url || form.car_image_2_url, profile?.car_image_2 || form.car_image_2),
      icon: 'car-sport-outline',
      iconColor: '#0284C7',
      bgColor: '#E0F2FE',
    },
    {
      id: 'car_image_3',
      title: 'Car Inspection (3/5 Left Side)',
      subtitle: 'Driver side doors & body panels',
      uri: getImageUri(profile?.car_image_3_url || form.car_image_3_url, profile?.car_image_3 || form.car_image_3),
      icon: 'car-sport-outline',
      iconColor: '#0284C7',
      bgColor: '#E0F2FE',
    },
    {
      id: 'car_image_4',
      title: 'Car Inspection (4/5 Right Side)',
      subtitle: 'Passenger side doors & body panels',
      uri: getImageUri(profile?.car_image_4_url || form.car_image_4_url, profile?.car_image_4 || form.car_image_4),
      icon: 'car-sport-outline',
      iconColor: '#0284C7',
      bgColor: '#E0F2FE',
    },
    {
      id: 'car_image_5',
      title: 'Car Inspection (5/5 Interior)',
      subtitle: 'Dashboard, front & rear passenger seats',
      uri: getImageUri(profile?.car_image_5_url || form.car_image_5_url, profile?.car_image_5 || form.car_image_5),
      icon: 'sparkles-outline',
      iconColor: '#0284C7',
      bgColor: '#E0F2FE',
    },
    {
      id: 'digital_signature',
      title: "Driver's Digital Signature",
      subtitle: 'Legally binding signed authorization',
      uri: getImageUri(profile?.signature_url || profile?.signature_image_url || form.signature_url, form.signature_image || profile?.signature_image),
      icon: 'pencil-outline',
      iconColor: '#7C3AED',
      bgColor: '#F5F3FF',
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
        ref={scrollViewRef}
        scrollEnabled={scrollEnabled}
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
        {/* ── TOP: DRIVER KYC POLICY & GUIDELINES (ADMIN CONFIGURED) ── */}
        <View style={styles.policyCard}>
          <View style={styles.policyHeaderRow}>
            <View style={styles.policyIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.policyCardTitle}>Driver Verification Policy & Rules</Text>
              <Text style={styles.policyCardSub}>Official Commercial Partner Compliance Guidelines</Text>
            </View>
            <View style={styles.policyOfficialBadge}>
              <Text style={styles.policyOfficialBadgeText}>OFFICIAL</Text>
            </View>
          </View>

          {/* Formatted Guidelines Body Text */}
          <View style={styles.policyBodyWrap}>
            <Text style={styles.policyText}>
              {kycPolicyInfo.policy || '1. Please upload valid Commercial Driving License, RC Book, Insurance & Selfie.\n2. All documents are reviewed and approved by the Admin team.'}
            </Text>
          </View>

          {/* Verification Hub Address & Driver Helpline Phone */}
          <View style={styles.policyMetaContainer}>
            {/* Hub Address */}
            <View style={styles.policyMetaItem}>
              <View style={[styles.policyMetaIconCircle, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="location" size={15} color="#4F46E5" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.policyMetaLabel}>VERIFICATION HUB ADDRESS:</Text>
                <Text style={styles.policyAddressValue}>
                  {kycPolicyInfo.address || 'No. 12, Anna Salai, Near Mount Road Metro, Chennai, Tamil Nadu - 600002'}
                </Text>
              </View>
            </View>

            {/* Helpline Phone Number */}
            <View style={styles.policyMetaItem}>
              <View style={[styles.policyMetaIconCircle, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="call" size={15} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.policyMetaLabel}>DRIVER SUPPORT HELPLINE:</Text>
                <Text style={styles.policyPhoneValue}>
                  {kycPolicyInfo.phone || '+91 98765 43210'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.policyCallBtn}
                activeOpacity={0.8}
                onPress={() => {
                  const num = (kycPolicyInfo.phone || '+919876543210').replace(/\s+/g, '')
                  Linking.openURL(`tel:${num}`).catch(() => {
                    Alert.alert('Phone Call', `Helpline number: ${kycPolicyInfo.phone}`)
                  })
                }}
              >
                <Ionicons name="call" size={12} color="#FFFFFF" />
                <Text style={styles.policyCallBtnText}>Call</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Interactive Policy Read & Acceptance Box */}
          {!isReadOnlyMode && (
            <TouchableOpacity
              style={[
                styles.policyAcceptBox,
                policyAccepted && styles.policyAcceptBoxActive
              ]}
              activeOpacity={0.85}
              onPress={() => setPolicyAccepted(!policyAccepted)}
            >
              <View style={[
                styles.policyCheckbox,
                policyAccepted && styles.policyCheckboxActive
              ]}>
                {policyAccepted && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[
                  styles.policyAcceptTitle,
                  policyAccepted && { color: '#047857' }
                ]}>
                  I have read and agree to this Policy
                </Text>
                <Text style={styles.policyAcceptSub}>
                  I confirm that I have read and agree to all verification terms *
                </Text>
              </View>
              <View style={[
                styles.policyStatusPill,
                policyAccepted ? styles.policyStatusPillActive : styles.policyStatusPillPending
              ]}>
                <Text style={[
                  styles.policyStatusPillText,
                  policyAccepted ? { color: '#047857' } : { color: '#B45309' }
                ]}>
                  {policyAccepted ? '✓ ACCEPTED' : 'MANDATORY *'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

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
          <View style={[styles.statusBanner, { backgroundColor: '#FFF8E7', borderColor: '#FDE68A' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: '#D97706' }]}>
              <Ionicons name="document-attach" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.statusBannerTitle, { color: '#0F172A' }]}> KYC Submission Required</Text>
                <View style={[styles.approvedPill, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.approvedPillText, { color: '#B45309' }]}>ONE-TIME UPLOAD</Text>
                </View>
              </View>
              <Text style={[styles.statusBannerDesc, { color: '#475569' }]}>
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
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#D97706" />
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
                {Boolean(profile?.permit_expiry || form.permit_expiry) && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Permit Expiry Date:</Text>
                    <Text style={styles.infoValue}>{profile?.permit_expiry || form.permit_expiry}</Text>
                  </View>
                )}
                {Boolean(profile?.insurance_expiry || form.insurance_expiry) && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Insurance Expiry Date:</Text>
                    <Text style={styles.infoValue}>{profile?.insurance_expiry || form.insurance_expiry}</Text>
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

            {/* Document Verification Cards */}
            <Text style={styles.sectionHeaderTitle}>Submitted Identification Documents ({readOnlyDocs.length} Slots)</Text>
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
                  backgroundColor: isRejected ? '#DC2626' : (isApproved ? '#059669' : COLORS.primary), 
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
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="person-circle" size={20} color="#D97706" />
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
                              <Ionicons name="camera-reverse" size={20} color="#D97706" />
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
                  <Text style={styles.inputLabel}>License Expiry Date * (YYYY-MM-DD)</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={18} color="#059669" style={{ marginRight: 8 }} />
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

            {/* ── 5. COMMERCIAL VEHICLE PERMIT ──────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="ribbon" size={20} color="#7C3AED" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>5. Commercial Taxi Permit *</Text>
                  <Text style={styles.cardSub}>Valid transport permit document & expiration date</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={styles.photoGrid}>
                  {/* Permit Photo */}
                  <TouchableOpacity
                    style={[styles.uploadTile, { width: '100%' }]}
                    onPress={() => handlePickImage('permit_image')}
                    activeOpacity={0.8}
                  >
                    {form.permit_url || form.permit_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.permit_url, form.permit_image) }} style={styles.previewImg} />
                        <View style={[styles.previewTag, { backgroundColor: '#7C3AED' }]}><Text style={styles.previewTagText}>PERMIT DOC ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'permit_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#F5F3FF' }]}>
                              <Ionicons name="ribbon-outline" size={18} color="#7C3AED" />
                            </View>
                            <Text style={styles.placeholderTitle}>Commercial Permit Document</Text>
                            <Text style={styles.placeholderSub}>Tap to Capture / Upload</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Permit Expiry Date Input */}
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>Permit Expiry Date * (YYYY-MM-DD)</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={18} color="#7C3AED" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.textInputInner}
                      placeholder="e.g. 2028-12-31"
                      placeholderTextColor="#94A3B8"
                      value={form.permit_expiry}
                      onChangeText={(val) => setForm(prev => ({ ...prev, permit_expiry: val }))}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* ── 6. VEHICLE INSURANCE & VEHICLE PHOTO ────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>6. Insurance Policy & Details *</Text>
                  <Text style={styles.cardSub}>Commercial insurance policy document & expiration date</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={styles.photoGrid}>
                  {/* Insurance */}
                  <TouchableOpacity
                    style={[styles.uploadTile, { width: '100%' }]}
                    onPress={() => handlePickImage('insurance_image')}
                    activeOpacity={0.8}
                  >
                    {form.insurance_url || form.insurance_image ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.insurance_url, form.insurance_image) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>INSURANCE POLICY ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'insurance_image' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#FEF3C7' }]}>
                              <Ionicons name="shield-checkmark" size={18} color="#D97706" />
                            </View>
                            <Text style={styles.placeholderTitle}>Insurance Policy Document</Text>
                            <Text style={styles.placeholderSub}>Upload Policy Certificate Scan</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Insurance Expiry Date Input */}
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>Vehicle Insurance Expiry Date * (YYYY-MM-DD)</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="calendar-outline" size={18} color="#D97706" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.textInputInner}
                      placeholder="e.g. 2026-11-30"
                      placeholderTextColor="#94A3B8"
                      value={form.insurance_expiry}
                      onChangeText={(val) => setForm(prev => ({ ...prev, insurance_expiry: val }))}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* ── 7. 5 VEHICLE INSPECTION PHOTOS ─────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="car-sport" size={20} color="#0284C7" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.cardTitle}>7. Vehicle Photos (5 Angles) *</Text>
                    <View style={styles.badgeCountPill}>
                      <Text style={styles.badgeCountText}>
                        {[form.car_image_1, form.car_image_2, form.car_image_3, form.car_image_4, form.car_image_5].filter(Boolean).length}/5 Added
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardSub}>Front, Rear, Left, Right & Interior cabin inspection</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={styles.photoGrid}>
                  {/* Photo 1: Front */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('car_image_1')}
                    activeOpacity={0.8}
                  >
                    {form.car_image_1_url || form.car_image_1 ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.car_image_1_url, form.car_image_1) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>1. FRONT ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'car_image_1' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#E0F2FE' }]}>
                              <Ionicons name="car-sport" size={18} color="#0284C7" />
                            </View>
                            <Text style={styles.placeholderTitle}>1. Front View</Text>
                            <Text style={styles.placeholderSub}>Bumper & Plate</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Photo 2: Rear */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('car_image_2')}
                    activeOpacity={0.8}
                  >
                    {form.car_image_2_url || form.car_image_2 ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.car_image_2_url, form.car_image_2) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>2. REAR ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'car_image_2' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#E0F2FE' }]}>
                              <Ionicons name="car-sport" size={18} color="#0284C7" />
                            </View>
                            <Text style={styles.placeholderTitle}>2. Rear View</Text>
                            <Text style={styles.placeholderSub}>Trunk & Lights</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={[styles.photoGrid, { marginTop: 10 }]}>
                  {/* Photo 3: Left */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('car_image_3')}
                    activeOpacity={0.8}
                  >
                    {form.car_image_3_url || form.car_image_3 ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.car_image_3_url, form.car_image_3) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>3. LEFT SIDE ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'car_image_3' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#E0F2FE' }]}>
                              <Ionicons name="car" size={18} color="#0284C7" />
                            </View>
                            <Text style={styles.placeholderTitle}>3. Left Side</Text>
                            <Text style={styles.placeholderSub}>Driver Doors</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Photo 4: Right */}
                  <TouchableOpacity
                    style={styles.uploadTile}
                    onPress={() => handlePickImage('car_image_4')}
                    activeOpacity={0.8}
                  >
                    {form.car_image_4_url || form.car_image_4 ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: getImageUri(form.car_image_4_url, form.car_image_4) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>4. RIGHT SIDE ✓</Text></View>
                      </View>
                    ) : (
                      <View style={styles.placeholderWrap}>
                        {uploadingField === 'car_image_4' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#E0F2FE' }]}>
                              <Ionicons name="car" size={18} color="#0284C7" />
                            </View>
                            <Text style={styles.placeholderTitle}>4. Right Side</Text>
                            <Text style={styles.placeholderSub}>Passenger Doors</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Photo 5: Interior */}
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.uploadTile, { width: '100%' }]}
                    onPress={() => handlePickImage('car_image_5')}
                    activeOpacity={0.8}
                  >
                    {form.car_image_5_url || form.car_image_5 ? (
                      <View style={[styles.previewWrap, { height: 130 }]}>
                        <Image source={{ uri: getImageUri(form.car_image_5_url, form.car_image_5) }} style={styles.previewImg} />
                        <View style={styles.previewTag}><Text style={styles.previewTagText}>5. CABIN / INTERIOR ✓</Text></View>
                      </View>
                    ) : (
                      <View style={[styles.placeholderWrap, { height: 110 }]}>
                        {uploadingField === 'car_image_5' ? (
                          <ActivityIndicator color={COLORS.primary} />
                        ) : (
                          <>
                            <View style={[styles.tileIconCircle, { backgroundColor: '#E0F2FE' }]}>
                              <Ionicons name="sparkles" size={18} color="#0284C7" />
                            </View>
                            <Text style={styles.placeholderTitle}>5. Cabin & Seats Interior</Text>
                            <Text style={styles.placeholderSub}>Dashboard, Clean Seats & Interior view</Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── 8. DRIVER DIGITAL SIGNATURE ────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="pencil" size={20} color="#7C3AED" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardTitle}>8. Driver Digital Signature *</Text>
                  <Text style={styles.cardSub}>Sign below with your finger or upload signature paper scan</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <DigitalSignaturePad
                  signatureValue={form.signature_url || form.signature_image || profile?.signature_url || profile?.signature_image_url || profile?.signature_image}
                  onSignatureChange={(sigDataUri) => {
                    setForm(prev => ({
                      ...prev,
                      signature_image: sigDataUri,
                      signature_url: sigDataUri,
                      signature: sigDataUri,
                    }))
                  }}
                  onDrawingStart={() => setScrollEnabled(false)}
                  onDrawingEnd={() => setScrollEnabled(true)}
                  onUploadPhoto={() => handlePickImage('signature_image')}
                />
              </View>
            </View>

            {/* ── MANDATORY POLICY CONFIRMATION BEFORE SUBMIT ──────────── */}
            <TouchableOpacity
              style={[
                styles.bottomPolicyConsentCard,
                policyAccepted ? styles.bottomPolicyConsentCardActive : styles.bottomPolicyConsentCardError
              ]}
              activeOpacity={0.85}
              onPress={() => setPolicyAccepted(!policyAccepted)}
            >
              <View style={[
                styles.policyCheckbox,
                policyAccepted && styles.policyCheckboxActive
              ]}>
                {policyAccepted && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.bottomConsentTitle}>
                  Mandatory KYC Policy Declaration *
                </Text>
                <Text style={styles.bottomConsentDesc}>
                  I confirm that I have read the complete Driver KYC Policy paragraph at the top, and all submitted details & document photos are 100% genuine and valid.
                </Text>
                <Text style={styles.bottomConsentTamil}>
                  All information provided is authentic and verifiable under transport compliance regulations.
                </Text>
              </View>
              <View style={[
                styles.policyStatusPill,
                policyAccepted ? styles.policyStatusPillActive : styles.policyStatusPillPending
              ]}>
                <Text style={[
                  styles.policyStatusPillText,
                  policyAccepted ? { color: '#047857' } : { color: '#B45309' }
                ]}>
                  {policyAccepted ? '✓ AGREED' : 'CHECK TO SUBMIT'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* ── SUBMIT BUTTON ───────────────────────────────────────── */}
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
                <Ionicons name="close" size={20} color="#0F172A" />
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
                  <Ionicons name="camera-reverse" size={20} color="#D97706" />
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
                <View style={[styles.modalOptionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="camera" size={24} color="#D97706" />
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
    backgroundColor: '#FEF3C7',
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
    backgroundColor: '#F1F5F9',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#FEF3C7',
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
  badgeCountPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  badgeCountText: {
    color: '#0284C7',
    fontSize: 10,
    fontWeight: '800',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: COLORS.primaryDark,
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
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  lightboxCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  lightboxTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  lightboxCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImg: {
    width: '100%',
    height: 380,
    marginVertical: 12,
  },
  lightboxDoneBtn: {
    backgroundColor: COLORS.primary,
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
    backgroundColor: '#FEF3C7',
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

  // ── Digital Signature Pad Professional Styles ─────────────────
  sigContainer: {
    width: '100%',
  },
  sigModeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  sigModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },
  sigModeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sigModeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  sigModeTabTextActive: {
    fontWeight: '800',
    color: '#7C3AED',
  },
  sigPadWrapper: {
    width: '100%',
  },
  sigPad: {
    width: '100%',
    height: 190,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sigPadActiveBorder: {
    borderColor: '#7C3AED',
  },
  sigCornerTL: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#CBD5E1',
  },
  sigCornerTR: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: '#CBD5E1',
  },
  sigCornerBL: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#CBD5E1',
  },
  sigCornerBR: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: '#CBD5E1',
  },
  sigExistingWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigPreviewImg: {
    width: '90%',
    height: '75%',
  },
  sigSavedBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  sigSavedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  sigInkLine: {
    position: 'absolute',
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#0F172A',
  },
  sigInkCap: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0F172A',
  },
  sigGuidelineRow: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sigXMarkWrap: {
    width: 18,
    alignItems: 'center',
  },
  sigXMark: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94A3B8',
  },
  sigGuidelineDashed: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  sigGuidelineLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  sigWatermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigWatermarkIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  sigWatermarkTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  sigWatermarkSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  sigToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  sigBtnClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  sigBtnClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  sigBtnUploadQuick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  sigBtnUploadQuickText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  sigStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  sigStatusBadgeSigned: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  sigStatusBadgePending: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  sigStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sigUploadContainer: {
    width: '100%',
  },
  sigUploadedPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    alignItems: 'center',
  },
  sigUploadedImg: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  sigUploadedActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    width: '100%',
    justifyContent: 'center',
  },
  sigToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  sigToolBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sigUploadDropzone: {
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigUploadIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sigUploadTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  sigUploadDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    maxWidth: 260,
  },
  sigUploadActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  sigUploadActionPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sigSecurityNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  sigSecurityNoteText: {
    fontSize: 10,
    color: '#64748B',
    flex: 1,
    lineHeight: 14,
  },

  // ── Driver KYC Policy & Office Guidelines Styles ──
  policyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  policyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  policyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  policyCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  policyCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#6366F1',
    marginTop: 1,
  },
  policyOfficialBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#C7D2FE',
  },
  policyOfficialBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  policyBodyWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 12,
    marginBottom: 10,
  },
  policyText: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 20,
    letterSpacing: 0.1,
    textAlign: 'left',
  },
  policyMetaContainer: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  policyMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  policyMetaIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  policyAddressValue: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 1,
    lineHeight: 16,
  },
  policyPhoneValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    marginTop: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  policyCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  policyCallBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Policy Read & Acceptance Checkbox Styles ──
  policyAcceptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 11,
    marginTop: 10,
  },
  policyAcceptBoxActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  policyCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyCheckboxActive: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  policyAcceptTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  policyAcceptSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  policyStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 6,
  },
  policyStatusPillActive: {
    backgroundColor: '#D1FAE5',
  },
  policyStatusPillPending: {
    backgroundColor: '#FEF3C7',
  },
  policyStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Bottom consent declaration before submit
  bottomPolicyConsentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 13,
    marginTop: 14,
    marginBottom: 6,
  },
  bottomPolicyConsentCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
  },
  bottomPolicyConsentCardError: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  bottomConsentTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  bottomConsentDesc: {
    fontSize: 11,
    color: '#334155',
    marginTop: 3,
    lineHeight: 16,
  },
  bottomConsentTamil: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 15,
  },
})
