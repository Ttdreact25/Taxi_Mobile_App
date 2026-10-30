import React, { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  ScrollView,
  Image,
  Linking,
  TextInput,
  Clipboard,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { walletAPI, uploadAPI, createUploadFormData } from '../../api/api'

// Official static QR image provided by business owner (Google Pay QR for vigneshbala2013@okaxis)
const ATTACHED_QR_CODE = require('../../../assets/QR_Code.jpeg')

export default function DriverWalletQRModal({
  visible,
  onClose,
  onSuccess,
  initialAmount = 500,
  currentBalance = 0,
  minRequired = 500,
  driverName = 'Driver',
}) {
  const [amount, setAmount] = useState(String(initialAmount || 500))
  const [verifying, setVerifying] = useState(false)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [utrRef, setUtrRef] = useState('')
  const [screenshotUri, setScreenshotUri] = useState(null)
  const [screenshotAsset, setScreenshotAsset] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(false)

  // Official UPI Details matching attached QR & Axis Bank account
  const upiId = 'vigneshbala2013@okaxis'
  const bankingName = 'VIGNESH B'

  const numAmount = Math.max(1, parseInt(amount, 10) || 500)
  const cleanAmount = String(numAmount)

  // Clean UPI URIs without illegal merchant chars in 'tn' to prevent Axis Bank/NPCI intent rejection
  const universalUpiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bankingName)}&am=${cleanAmount}&cu=INR&tn=WalletRecharge`
  const gpayUri = `tez://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bankingName)}&am=${cleanAmount}&cu=INR&tn=WalletRecharge`
  const phonepeUri = `phonepe://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bankingName)}&am=${cleanAmount}&cu=INR&tn=WalletRecharge`
  const paytmUri = `paytmmp://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bankingName)}&am=${cleanAmount}&cu=INR&tn=WalletRecharge`

  useEffect(() => {
    if (visible) {
      setAmount(String(initialAmount || 500))
      setCopiedUpi(false)
      setUtrRef('')
      setScreenshotUri(null)
      setScreenshotAsset(null)
      setUploadProgress(false)
      setVerifying(false)
    }
  }, [visible, initialAmount])

  if (!visible) return null

  // 1. Copy UPI ID to clipboard
  const handleCopyUPI = () => {
    try {
      Clipboard.setString(upiId)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2500)
    } catch {
      Alert.alert('UPI ID', upiId)
    }
  }

  // 2. Direct Google Pay Intent
  const handlePayWithGPay = async () => {
    try {
      const canTez = await Linking.canOpenURL(gpayUri)
      if (canTez) {
        await Linking.openURL(gpayUri)
        return
      }
    } catch {}
    handleOpenUniversalUPI()
  }

  // 3. Recommended & 100% Smooth Flow: Copy UPI ID & Open GPay directly
  const handleCopyAndOpenGPay = async () => {
    try {
      Clipboard.setString(upiId)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 3000)

      Alert.alert(
        'UPI ID Copied! 📋',
        `UPI ID: ${upiId}\n\nGoogle Pay open aagum:\n1. GPay-il "Pay UPI ID" click seiyavum\n2. Intha ID-ai paste seithu ₹${numAmount} pay seiyavum (No bank limit error!)\n3. Payment mudithu screenshot attach seiyavum.`,
        [
          {
            text: 'Open Google Pay 🚀',
            onPress: async () => {
              try {
                const gpayScheme = Platform.OS === 'android' ? 'tez://' : 'gpay://'
                const canOpen = await Linking.canOpenURL(gpayScheme)
                if (canOpen) {
                  await Linking.openURL(gpayScheme)
                } else {
                  await Linking.openURL(universalUpiUri).catch(() => {})
                }
              } catch {
                Linking.openURL(universalUpiUri).catch(() => {})
              }
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      )
    } catch {
      Alert.alert('UPI ID', upiId)
    }
  }

  // 4. Direct PhonePe Intent
  const handlePayWithPhonePe = async () => {
    try {
      const canPhonepe = await Linking.canOpenURL(phonepeUri)
      if (canPhonepe) {
        await Linking.openURL(phonepeUri)
        return
      }
    } catch {}
    handleOpenUniversalUPI()
  }

  // 5. Direct Paytm Intent
  const handlePayWithPaytm = async () => {
    try {
      const canPaytm = await Linking.canOpenURL(paytmUri)
      if (canPaytm) {
        await Linking.openURL(paytmUri)
        return
      }
    } catch {}
    handleOpenUniversalUPI()
  }

  // 6. Universal UPI Chooser
  const handleOpenUniversalUPI = async () => {
    try {
      const supported = await Linking.canOpenURL(universalUpiUri)
      if (supported) {
        await Linking.openURL(universalUpiUri)
      } else {
        await Linking.openURL(universalUpiUri).catch(() => {
          Alert.alert(
            'UPI App',
            `Google Pay, PhonePe or Paytm open aagavillai. Scan the QR code or pay manually to UPI ID:\n\n${upiId}`,
            [{ text: 'OK' }]
          )
        })
      }
    } catch {
      Alert.alert(
        'UPI ID',
        `Please open your UPI app (Google Pay / PhonePe / Paytm) and pay ₹${numAmount} to:\n\n${upiId}`,
        [{ text: 'OK' }]
      )
    }
  }

  // 7. Image Picker for Payment Screenshot
  const handlePickScreenshot = async (useCamera = false) => {
    try {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!perm.granted) {
        Alert.alert(
          'Permission Required',
          `Please grant ${useCamera ? 'camera' : 'gallery'} permission to select your payment screenshot.`
        )
        return
      }

      const options = {
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options)

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setScreenshotUri(result.assets[0].uri)
        setScreenshotAsset(result.assets[0])
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open image picker: ' + err.message)
    }
  }

  // 8. Submit Payment Proof & Credit to Driver Wallet
  const handleSubmitPayment = async () => {
    if (!screenshotUri) {
      Alert.alert(
        'Payment Screenshot Required 📸',
        'QR code-il payment mudithavudan screenshot attach seiya vendum. Screenshot upload seitha pinbu thaan wallet-il credit aagum.\n\nPlease attach your payment screenshot below.',
        [
          { text: 'Attach Screenshot', onPress: () => handlePickScreenshot(false) },
          { text: 'Cancel', style: 'cancel' }
        ]
      )
      return
    }

    if (!utrRef || !utrRef.trim() || utrRef.trim().length < 4) {
      Alert.alert(
        'UPI Reference (UTR) Required ⚠️',
        'Payment mudithavudan GPay / PhonePe / Paytm app-il kaattum 12-digit UPI Reference (UTR) number-ai kandippaaga enter seiyavum.\n\nUPI Reference enter seithaal thaan wallet-il credit aagum.'
      )
      return
    }

    setVerifying(true)
    setUploadProgress(true)

    try {
      // Step A: Upload the screenshot image
      let uploadedScreenshotPath = ''
      try {
        const formData = createUploadFormData(screenshotUri, {
          prefix: `driver_wallet_${Date.now()}`,
          type: 'payment',
          asset: screenshotAsset,
        })
        const uploadRes = await uploadAPI.upload(formData, 'payment_proof')
        if (uploadRes.data?.status === 'success' && (uploadRes.data?.url || uploadRes.data?.path)) {
          uploadedScreenshotPath = uploadRes.data?.url || uploadRes.data?.path
        }
      } catch (uploadErr) {
        console.warn('Screenshot upload warning, sending local URI fallback:', uploadErr)
      }

      setUploadProgress(false)

      // Step B: Call backend wallet confirm_qr endpoint
      const res = await walletAPI.confirmQRPayment({
        amount: numAmount,
        amount_rupees: numAmount,
        screenshot: uploadedScreenshotPath || screenshotUri,
        payment_screenshot: uploadedScreenshotPath || screenshotUri,
        utr: utrRef.trim() || undefined,
        utr_ref: utrRef.trim() || undefined,
        payment_method: 'qr',
      })

      setVerifying(false)

      if (res.data?.status === 'success') {
        const newBal = Number(res.data?.balance ?? (currentBalance + numAmount))
        Alert.alert(
          'Wallet Recharged Successfully! 🎉',
          `₹${numAmount} credited to your wallet!\n\nCurrent Balance: ₹${newBal.toLocaleString('en-IN')}\n\nOutstation Trips are eligible to drive.`,
          [{ text: 'OK' }]
        )
        if (onSuccess) {
          onSuccess({
            status: 'success',
            amount: numAmount,
            balance: newBal,
            transaction_id: res.data?.transaction_id,
            screenshot: uploadedScreenshotPath,
          })
        }
      } else {
        Alert.alert('Notice', res.data?.message || 'Could not verify wallet top-up. Please try again.')
      }
    } catch (err) {
      setVerifying(false)
      setUploadProgress(false)
      const msg = err.response?.data?.message || err.message || 'Payment submission failed. Please try again.'
      Alert.alert('Submission Error', msg)
    }
  }

  // 9. Cancel confirmation
  const handleClosePrompt = () => {
    Alert.alert(
      'Cancel Wallet Recharge? ⚠️',
      'Wallet recharge seiyaamal cancel seiya venduma?',
      [
        { text: 'No, Continue', style: 'cancel' },
        {
          text: 'Yes, Close',
          style: 'destructive',
          onPress: () => {
            if (onClose) onClose()
          },
        },
      ]
    )
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClosePrompt}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClosePrompt} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.secureBadgeRow}>
              <Ionicons name="shield-checkmark" size={13} color="#10B981" />
              <Text style={styles.secureBadgeText}>Official Company QR</Text>
            </View>
            <Text style={styles.headerTitle}>Driver Wallet Recharge</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Amount Highlight & Selection Card */}
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>SELECT RECHARGE AMOUNT (₹)</Text>
            
            <View style={styles.amountInputRow}>
              <Text style={styles.amountCurrency}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor="#64748B"
              />
            </View>

            {/* Quick Amount Chips */}
            <View style={styles.presetChipsRow}>
              {['300', '500', '1000', '2000'].map(val => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.presetChip,
                    amount === val && styles.presetChipActive
                  ]}
                  onPress={() => setAmount(val)}
                  activeOpacity={0.75}
                >
                  <Text style={[
                    styles.presetChipText,
                    amount === val && styles.presetChipTextActive
                  ]}>
                    +₹{val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.walletBalanceBadge}>
              <Ionicons name="wallet-outline" size={13} color="#38BDF8" />
              <Text style={styles.walletBalanceText}>
                Current Balance: ₹{currentBalance.toLocaleString('en-IN')} • Min. ₹{minRequired} required for Outstation
              </Text>
            </View>
          </View>

          {/* Attached Official Business QR Code Card */}
          <View style={styles.qrCard}>
            <View style={styles.qrCardHeader}>
              <Ionicons name="qr-code" size={18} color="#0F172A" />
              <Text style={styles.qrCardTitle}>Scan with GPay / Any UPI App</Text>
            </View>

            {/* Official Attached QR Code Image */}
            <View style={styles.qrImageWrapper}>
              <Image
                source={ATTACHED_QR_CODE}
                style={styles.qrImage}
                resizeMode="contain"
              />
            </View>

            {/* UPI ID display under QR */}
            <View style={styles.qrUpiRow}>
              <Text style={styles.qrUpiLabel}>UPI ID: </Text>
              <Text style={styles.qrUpiVal}>{upiId}</Text>
            </View>

            <View style={styles.bankingNameRow}>
              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              <Text style={styles.bankingNameText}>Banking Name: {bankingName}</Text>
            </View>

            {/* Supported App Badges */}
            <View style={styles.supportedAppsRow}>
              <View style={[styles.appPill, { backgroundColor: '#EFF6FF' }]}><Text style={[styles.appPillText, { color: '#1D4ED8' }]}>Google Pay</Text></View>
              <View style={[styles.appPill, { backgroundColor: '#EDE9FE' }]}><Text style={[styles.appPillText, { color: '#6D28D9' }]}>PhonePe</Text></View>
              <View style={[styles.appPill, { backgroundColor: '#E0F2FE' }]}><Text style={[styles.appPillText, { color: '#0284C7' }]}>Paytm</Text></View>
              <View style={[styles.appPill, { backgroundColor: '#DCFCE7' }]}><Text style={[styles.appPillText, { color: '#166534' }]}>BHIM</Text></View>
            </View>
          </View>

          {/* Fast Pay Options Header */}
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="flash" size={15} color="#38BDF8" />
            <Text style={styles.sectionHeaderTitle}>FAST UPI PAYMENT OPTIONS</Text>
          </View>

          {/* Option 1: Direct Google Pay with Exact Banking Name VIGNESH B */}
          <TouchableOpacity
            style={styles.gpayDirectBtn}
            onPress={handlePayWithGPay}
            activeOpacity={0.88}
          >
            <View style={styles.gpayLogoBox}>
              <Ionicons name="logo-google" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gpayDirectTitle}>Pay with Google Pay (₹{numAmount})</Text>
              <Text style={styles.gpayDirectSub}>Direct intent to {bankingName} (Axis Bank)</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Option 2: 100% Smooth Fallback (Copy ID & Open GPay) */}
          <TouchableOpacity
            style={styles.gpaySmoothBtn}
            onPress={handleCopyAndOpenGPay}
            activeOpacity={0.88}
          >
            <View style={styles.smoothIconBox}>
              <Ionicons name="copy" size={16} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.gpaySmoothTitle}>Copy UPI ID &amp; Open GPay</Text>
                <View style={styles.smoothBadge}>
                  <Text style={styles.smoothBadgeText}>⭐ SMOOTH / NO LIMITS</Text>
                </View>
              </View>
              <Text style={styles.gpaySmoothSub}>
                Copies {upiId} &amp; opens GPay app. Paste &amp; pay without bank limit errors!
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color="#059669" />
          </TouchableOpacity>

          {/* Secondary UPI Apps Row: PhonePe, Paytm, Other UPI */}
          <View style={styles.otherAppsRow}>
            <TouchableOpacity
              style={styles.otherAppBtn}
              onPress={handlePayWithPhonePe}
              activeOpacity={0.85}
            >
              <Ionicons name="phone-portrait-outline" size={15} color="#7C3AED" />
              <Text style={[styles.otherAppBtnText, { color: '#7C3AED' }]}>PhonePe</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.otherAppBtn}
              onPress={handlePayWithPaytm}
              activeOpacity={0.85}
            >
              <Ionicons name="wallet-outline" size={15} color="#0284C7" />
              <Text style={[styles.otherAppBtnText, { color: '#0284C7' }]}>Paytm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.otherAppBtn}
              onPress={handleOpenUniversalUPI}
              activeOpacity={0.85}
            >
              <Ionicons name="apps-outline" size={15} color="#0F172A" />
              <Text style={[styles.otherAppBtnText, { color: '#0F172A' }]}>Other UPI</Text>
            </TouchableOpacity>
          </View>

          {/* Professional Bank Support & Tip Card */}
          <View style={styles.infoNoteCard}>
            <View style={styles.infoNoteHeader}>
              <View style={styles.infoNoteIconBox}>
                <Ionicons name="information-circle" size={16} color="#F59E0B" />
              </View>
              <Text style={styles.infoNoteTitle}>Google Pay &amp; Bank Support Notice</Text>
            </View>

            <Text style={styles.infoNoteDesc}>
              Google Pay-il "Bank limit exceeded" error vanthal, <Text style={{ fontWeight: '700', color: '#FFFFFF' }}>unga bank side direct intent payment-kku support illamal irukkalam</Text> (NPCI Security Guidelines).
            </Text>

            <View style={styles.infoNoteDivider} />

            <View style={styles.infoNoteSteps}>
              <Text style={styles.infoNoteStepsTitle}>100% Smooth-aga Pay Seyya:</Text>

              <View style={styles.infoStepRow}>
                <View style={styles.infoStepDot} />
                <Text style={styles.infoStepText}>
                  Maele உள்ள <Text style={styles.infoStepHighlight}>"Copy UPI ID &amp; Open GPay"</Text> click seithu, GPay-il paste panni pay seiyavum.
                </Text>
              </View>

              <View style={styles.infoStepRow}>
                <View style={styles.infoStepDot} />
                <Text style={styles.infoStepText}>
                  Allathu intha <Text style={styles.infoStepHighlight}>QR Code-ai direct-aga scan</Text> seithu PIN pottaal instant-aga pay aagum!
                </Text>
              </View>
            </View>
          </View>

          {/* Copy UPI ID Card */}
          <View style={styles.upiIdCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.upiIdLabel}>Official Payee UPI ID</Text>
              <Text style={styles.upiIdValue} numberOfLines={1}>{upiId}</Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, copiedUpi && styles.copyBtnSuccess]}
              onPress={handleCopyUPI}
              activeOpacity={0.8}
            >
              <Ionicons
                name={copiedUpi ? 'checkmark-circle' : 'copy-outline'}
                size={15}
                color={copiedUpi ? '#FFFFFF' : '#0F172A'}
              />
              <Text style={[styles.copyBtnText, copiedUpi && { color: '#FFFFFF' }]}>
                {copiedUpi ? 'Copied!' : 'Copy ID'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 📸 MANDATORY SCREENSHOT ATTACHMENT SECTION */}
          <View style={styles.screenshotCard}>
            <View style={styles.screenshotHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="camera" size={18} color="#F59E0B" />
                <Text style={styles.screenshotTitle}>Payment Screenshot</Text>
              </View>
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredBadgeText}>REQUIRED FOR ADMIN VERIFICATION</Text>
              </View>
            </View>

            <Text style={styles.screenshotSubtitle}>
              QR scan seithu pay panniya screenshot-ai ingu attach seiyavum. Screenshot upload seitha pinbu thaan wallet-il credit aagum.
            </Text>

            {screenshotUri ? (
              <View style={styles.previewBox}>
                <Image
                  source={{ uri: screenshotUri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
                <View style={styles.previewInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    <Text style={styles.previewSuccessText}>Screenshot Attached ✓</Text>
                  </View>
                  <Text style={styles.previewSubText}>Ready to credit ₹{numAmount} to Wallet</Text>

                  <View style={styles.previewActionBtns}>
                    <TouchableOpacity
                      style={styles.repickBtn}
                      onPress={() => handlePickScreenshot(false)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="image-outline" size={14} color="#0F172A" />
                      <Text style={styles.repickBtnText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => {
                        setScreenshotUri(null)
                        setScreenshotAsset(null)
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.uploadPromptRow}>
                <TouchableOpacity
                  style={styles.uploadOptionBtn}
                  onPress={() => handlePickScreenshot(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="images" size={20} color="#2563EB" />
                  <Text style={styles.uploadOptionText}>Upload from Gallery</Text>
                  <Text style={styles.uploadOptionSub}>Select payment screenshot</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.uploadOptionBtn, { borderColor: '#E2E8F0' }]}
                  onPress={() => handlePickScreenshot(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={20} color="#059669" />
                  <Text style={styles.uploadOptionText}>Take Camera Photo</Text>
                  <Text style={styles.uploadOptionSub}>Capture payment proof</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Required UTR Field */}
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.utrLabel}>
                  UPI Reference / UTR Number <Text style={{ color: '#EF4444', fontWeight: '900' }}>* (Required)</Text>
                </Text>
                <Text style={{ fontSize: 10, color: '#F59E0B', fontWeight: '700' }}>12-Digit Ref</Text>
              </View>
              <TextInput
                style={[
                  styles.utrInput,
                  (!utrRef.trim() && screenshotUri) && { borderColor: '#F59E0B' }
                ]}
                placeholder="Enter 12-digit UTR from GPay / PhonePe"
                placeholderTextColor="#94A3B8"
                value={utrRef}
                onChangeText={setUtrRef}
                keyboardType="numeric"
                maxLength={20}
              />
            </View>
          </View>
        </ScrollView>

        {/* Sticky Bottom Submission Button */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (!screenshotUri || !utrRef.trim()) && styles.confirmBtnDisabled,
              verifying && { opacity: 0.7 }
            ]}
            onPress={handleSubmitPayment}
            disabled={verifying}
            activeOpacity={0.88}
          >
            {verifying ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.confirmBtnText}>
                  {uploadProgress ? 'Uploading Screenshot...' : 'Crediting to Wallet...'}
                </Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name={screenshotUri && utrRef.trim() ? "checkmark-done-circle" : "cloud-upload-outline"}
                  size={20}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.confirmBtnText}>
                  {!screenshotUri
                    ? `Attach Screenshot to Add ₹${numAmount}`
                    : !utrRef.trim()
                      ? `Enter UPI Ref (UTR) to Submit`
                      : `Submit Screenshot & Add ₹${numAmount} to Wallet`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  secureBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginBottom: 2,
  },
  secureBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  amountCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  amountCurrency: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F59E0B',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: '900',
    color: '#F59E0B',
    minWidth: 100,
    textAlign: 'center',
    paddingVertical: 0,
  },
  presetChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  presetChipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  presetChipTextActive: {
    color: '#0F172A',
  },
  walletBalanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  walletBalanceText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#38BDF8',
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  qrCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  qrCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrImageWrapper: {
    width: 250,
    height: 250,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 6,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrUpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrUpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  qrUpiVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  bankingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  bankingNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  supportedAppsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 10,
  },
  appPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  appPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  gpayDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    padding: 13,
    borderRadius: 14,
    marginBottom: 8,
    gap: 12,
  },
  gpayLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpayDirectTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gpayDirectSub: {
    fontSize: 10.5,
    color: '#DCE8FD',
    marginTop: 1,
  },
  gpaySmoothBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 13,
    borderRadius: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  smoothIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpaySmoothTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  smoothBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  smoothBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  gpaySmoothSub: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
  },
  otherAppsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  otherAppBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  otherAppBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  infoNoteCard: {
    backgroundColor: '#1E293B',
    borderWidth: 1.2,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  infoNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoNoteIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoNoteTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.3,
  },
  infoNoteDesc: {
    fontSize: 11.5,
    color: '#CBD5E1',
    lineHeight: 17,
  },
  infoNoteDivider: {
    height: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    marginVertical: 10,
  },
  infoNoteSteps: {
    gap: 6,
  },
  infoNoteStepsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FCD34D',
    marginBottom: 2,
  },
  infoStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoStepDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F59E0B',
    marginTop: 6,
  },
  infoStepText: {
    flex: 1,
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },
  infoStepHighlight: {
    fontWeight: '800',
    color: '#38BDF8',
  },
  upiIdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  upiIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  upiIdValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  copyBtnSuccess: {
    backgroundColor: '#10B981',
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  screenshotCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    marginBottom: 14,
  },
  screenshotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  screenshotTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  requiredBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  requiredBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F59E0B',
  },
  screenshotSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
    marginBottom: 12,
  },
  uploadPromptRow: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadOptionBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  uploadOptionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  uploadOptionSub: {
    fontSize: 9.5,
    color: '#64748B',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  previewInfo: {
    flex: 1,
  },
  previewSuccessText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  previewSubText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  previewActionBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  repickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  repickBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  removeBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#EF4444',
  },
  utrLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
  },
  utrInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F172A',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmBtnDisabled: {
    backgroundColor: '#475569',
  },
  confirmBtnText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
})

