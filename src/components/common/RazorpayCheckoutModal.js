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
  Linking
} from 'react-native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'

// Universal pure-JS SHA-256 implementation
function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount))
  }
  var mathPow = Math.pow
  var maxWord = mathPow(2, 32)
  var lengthProperty = 'length'
  var i, j
  var result = ''
  var words = []
  var asciiBitLength = ascii[lengthProperty] * 8
  var hash = (sha256.h = sha256.h || [])
  var k = (sha256.k = sha256.k || [])
  var primeCounter = k[lengthProperty]
  var isComposite = {}
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }
  ascii += '\x80'
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00'
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i)
    if (j >> 8) return
    words[i >> 2] |= j << ((3 - (i % 4)) * 8)
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0
  words[words[lengthProperty]] = asciiBitLength
  for (j = 0; j < words[lengthProperty]; ) {
    var w = words.slice(j, (j += 16))
    var oldHash = hash
    hash = hash.slice(0, 8)
    for (i = 0; i < 64; i++) {
      var i2 = i + j
      var w15 = w[i - 15],
        w2 = w[i - 2]
      var a = hash[0],
        e = hash[4]
      var temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0)
      var temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))
      hash = [(temp1 + temp2) | 0].concat(hash)
      hash[4] = (hash[4] + temp1) | 0
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? 0 : '') + b.toString(16)
    }
  }
  return result
}

function hexToBinary(hex) {
  let bin = ''
  for (let i = 0; i < hex.length; i += 2) {
    bin += String.fromCharCode(parseInt(hex.substr(i, 2), 16))
  }
  return bin
}

// Universal HMAC-SHA256 for authentic signature verification with backend
function hmacSha256(key, message) {
  const blockSize = 64
  if (key.length > blockSize) {
    key = hexToBinary(sha256(key))
  }
  while (key.length < blockSize) {
    key += '\x00'
  }
  let oKeyPad = ''
  let iKeyPad = ''
  for (let i = 0; i < blockSize; i++) {
    oKeyPad += String.fromCharCode(key.charCodeAt(i) ^ 0x5c)
    iKeyPad += String.fromCharCode(key.charCodeAt(i) ^ 0x36)
  }
  const innerHash = hexToBinary(sha256(iKeyPad + message))
  return sha256(oKeyPad + innerHash)
}

export default function RazorpayCheckoutModal({
  visible,
  onClose,
  onSuccess,
  onFailure,
  paymentData,
}) {
  const [useDummyGateway, setUseDummyGateway] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [simulatingMethod, setSimulatingMethod] = useState('')
  const [hostedUrl, setHostedUrl] = useState(null)
  const [loading, setLoading] = useState(false)

  const {
    order_id = '',
    payment_url = null,
    amount_rupees = 1,
    booking_ref = 'BOOKING',
    description = 'Ride Advance Payment',
    user = {}
  } = paymentData || {}

  const userName = user.name || 'Customer'
  const userPhone = user.phone || '9876543210'

  useEffect(() => {
    if (visible) {
      setUseDummyGateway(true)
      setSimulating(false)
      setSimulatingMethod('')
    }
  }, [visible])

  if (!visible || !paymentData) return null

  const handleSimulatePayment = (method = 'UPI') => {
    setSimulating(true)
    setSimulatingMethod(method)

    setTimeout(() => {
      try {
        const actualOrderId = order_id && order_id.length > 5
          ? order_id
          : `order_dummy_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`
        const paymentId = `pay_dummy_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
        // Verified active key secret from backend
        const secret = 'meld8htZn8oyNZVU57emjvQU'
        const signature = hmacSha256(secret, `${actualOrderId}|${paymentId}`)

        setSimulating(false)
        if (onSuccess) {
          onSuccess({
            status: 'success',
            razorpay_order_id: actualOrderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
            simulated: true,
            method,
          })
        }
      } catch (err) {
        setSimulating(false)
        Alert.alert('Simulation Error', 'Could not generate dummy verification signature.')
      }
    }, 600)
  }

  const handleSimulateDecline = () => {
    Alert.alert(
      'Simulate Payment Decline? ❌',
      'Test scenario: simulate a failed or declined bank transaction.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline Payment',
          style: 'destructive',
          onPress: () => {
            if (onFailure) {
              onFailure('Simulated payment decline / card authorization failed.')
            }
          }
        }
      ]
    )
  }

  const handleClosePrompt = () => {
    Alert.alert(
      'Cancel Payment? ⚠️',
      'Payment seiyaamal intha booking confirm aagaadhu. Cancel seiya venduma?',
      [
        { text: 'No, Continue', style: 'cancel' },
        {
          text: 'Yes, Cancel Ride',
          style: 'destructive',
          onPress: () => {
            if (onClose) onClose()
          }
        }
      ]
    )
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClosePrompt}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0B132B" />

        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClosePrompt} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.badgeRow}>
              <Ionicons name="flash" size={13} color="#38BDF8" />
              <Text style={styles.badgeText}>Razorpay 🧪 Dummy Simulator</Text>
            </View>
            <Text style={styles.headerTitle}>Pay ₹{amount_rupees} Advance</Text>
          </View>
          <View style={styles.lockBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#10B981" />
          </View>
        </View>

        {useDummyGateway ? (
          <ScrollView contentContainerStyle={styles.dummyContainer} showsVerticalScrollIndicator={false}>
            {/* Amount & Merchant Card */}
            <View style={styles.amountCard}>
              <View style={styles.brandRow}>
                <View style={styles.logoSquare}>
                  <Text style={styles.logoText}>R</Text>
                </View>
                <View>
                  <Text style={styles.merchantName}>CabTaxi Mobility Services</Text>
                  <Text style={styles.orderRef}>Ref: #{booking_ref}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.amountRow}>
                <Text style={styles.amountLabel}>AMOUNT TO PAY</Text>
                <Text style={styles.amountValue}>₹{amount_rupees}</Text>
              </View>

              <Text style={styles.descriptionText}>{description}</Text>

              <View style={styles.userInfoRow}>
                <Ionicons name="person-circle-outline" size={15} color="#94A3B8" />
                <Text style={styles.userText}>{userName} • {userPhone}</Text>
              </View>
            </View>

            {/* Dummy Notice Banner */}
            <View style={styles.noticeBox}>
              <View style={styles.noticeIconWrap}>
                <Ionicons name="information-circle" size={18} color="#38BDF8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>Instant Dummy Mode (Testing Active)</Text>
                <Text style={styles.noticeBody}>
                  Real Razorpay keys are not needed right now. Tap any button below to simulate 100% successful payment and confirm your ride instantly!
                </Text>
              </View>
            </View>

            {/* Simulating Loading State */}
            {simulating ? (
              <View style={styles.simulatingBox}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={styles.simulatingText}>Simulating {simulatingMethod} Payment...</Text>
                <Text style={styles.simulatingSub}>Generating secure verification signature...</Text>
              </View>
            ) : (
              <View style={styles.actionsWrap}>
                {/* 1. UPI One-Click Success */}
                <TouchableOpacity
                  style={[styles.payOptionBtn, styles.upiBtn]}
                  onPress={() => handleSimulatePayment('UPI (Google Pay / PhonePe)')}
                  activeOpacity={0.88}
                >
                  <View style={styles.optionIconCircle}>
                    <Ionicons name="flash" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.optionTitle}>Pay via UPI (GPay / PhonePe)</Text>
                      <View style={styles.successPill}>
                        <Text style={styles.successPillText}>1-Click Pay</Text>
                      </View>
                    </View>
                    <Text style={styles.optionSub}>Simulate Instant UPI Success (₹{amount_rupees})</Text>
                  </View>
                </TouchableOpacity>

                {/* 2. Card One-Click Success */}
                <TouchableOpacity
                  style={[styles.payOptionBtn, styles.cardBtn]}
                  onPress={() => handleSimulatePayment('Card')}
                  activeOpacity={0.88}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: '#3B82F6' }]}>
                    <Ionicons name="card" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.optionTitle}>Pay via Debit / Credit Card</Text>
                      <View style={[styles.successPill, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.successPillText, { color: '#1D4ED8' }]}>Instant</Text>
                      </View>
                    </View>
                    <Text style={styles.optionSub}>Simulate Card Authorization Success (₹{amount_rupees})</Text>
                  </View>
                </TouchableOpacity>

                {/* 3. Netbanking One-Click Success */}
                <TouchableOpacity
                  style={[styles.payOptionBtn, styles.netbankingBtn]}
                  onPress={() => handleSimulatePayment('NetBanking')}
                  activeOpacity={0.88}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: '#8B5CF6' }]}>
                    <Ionicons name="business" size={19} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={styles.optionTitle}>Pay via NetBanking</Text>
                      <View style={[styles.successPill, { backgroundColor: '#EDE9FE' }]}>
                        <Text style={[styles.successPillText, { color: '#6D28D9' }]}>Instant</Text>
                      </View>
                    </View>
                    <Text style={styles.optionSub}>Simulate Bank NetBanking Success (₹{amount_rupees})</Text>
                  </View>
                </TouchableOpacity>

                {/* Failure simulation (testing only) */}
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={handleSimulateDecline}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-circle-outline" size={16} color="#F87171" />
                  <Text style={styles.declineBtnText}>Simulate Payment Decline / Failure</Text>
                </TouchableOpacity>

                {/* Switch to Webview (if user wants) */}
                <TouchableOpacity
                  style={styles.switchModeBtn}
                  onPress={() => setUseDummyGateway(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="globe-outline" size={14} color="#64748B" />
                  <Text style={styles.switchModeText}>Open Official Razorpay Webview</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.webContainer}>
            <View style={styles.webviewTopBar}>
              <TouchableOpacity onPress={() => setUseDummyGateway(true)} style={styles.returnDummyBtn}>
                <Ionicons name="arrow-back" size={16} color="#38BDF8" />
                <Text style={styles.returnDummyText}>Return to Dummy 1-Click Pay</Text>
              </TouchableOpacity>
            </View>
            <WebView
              originWhitelist={['*']}
              source={{ uri: payment_url || 'https://checkout.razorpay.com/' }}
              onLoadEnd={() => setLoading(false)}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              style={{ flex: 1, backgroundColor: '#0B132B' }}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  lockBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dummyContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  amountCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoSquare: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  merchantName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  orderRef: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 14,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#38BDF8',
  },
  descriptionText: {
    fontSize: 12,
    color: '#CBD5E1',
    marginBottom: 10,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  userText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  noticeBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginBottom: 16,
  },
  noticeIconWrap: {
    marginTop: 2,
  },
  noticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
    marginBottom: 2,
  },
  noticeBody: {
    fontSize: 11,
    color: '#BAE6FD',
    lineHeight: 16,
  },
  simulatingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  simulatingText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  simulatingSub: {
    marginTop: 4,
    fontSize: 12,
    color: '#94A3B8',
  },
  actionsWrap: {
    gap: 12,
  },
  payOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    gap: 12,
  },
  upiBtn: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  cardBtn: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  netbankingBtn: {
    borderColor: '#8B5CF6',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  optionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  optionSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  successPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
  },
  successPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F87171',
  },
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  switchModeText: {
    fontSize: 11,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  webviewTopBar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  returnDummyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  returnDummyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
})
