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
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { driverAPI, authAPI, uploadAPI, settingsAPI, createUploadFormData, resolveAssetUrl } from '../../api/api'
import { useAuth } from '../../context/AuthContext'
import RazorpayCheckoutModal from '../../components/common/RazorpayCheckoutModal'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const DriverProfileScreen = ({ navigation }) => {
  const { user, logout, updateUser, deleteAccount } = useAuth()
  const [driver, setDriver] = useState(null)
  const [loading, setLoading] = useState(true)

  // Outstation Wallet & Current Balance State
  const [storedBalance, setStoredBalance] = useState(null)
  const [razorpayModalVisible, setRazorpayModalVisible] = useState(false)
  const [razorpayPaymentData, setRazorpayPaymentData] = useState(null)

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
      try {
        const cachedBal = await SecureStore.getItemAsync('driver_wallet_balance')
        if (cachedBal !== null && !isNaN(Number(cachedBal))) {
          setStoredBalance(Number(cachedBal))
        }
      } catch { }

      const [res, sysRes] = await Promise.allSettled([
        driverAPI.profile(),
        settingsAPI.list()
      ])
      const profData = res.status === 'fulfilled' ? res.value?.data : null
      const sysSettings = sysRes.status === 'fulfilled' ? (sysRes.value?.data?.settings || {}) : {}

      if (profData?.driver || profData) {
        const d = profData.driver || profData
        try {
          const cachedCaps = await SecureStore.getItemAsync('@driver_accepted_capacities')
          if (cachedCaps && !d.accepted_capacities) {
            d.accepted_capacities = cachedCaps
          }
        } catch { }

        const dynamicMinWallet = Number(
          sysSettings.min_wallet_for_outstation
          ?? sysSettings.driver_min_wallet_balance
          ?? profData?.min_wallet_required
          ?? d.min_wallet_required
          ?? 500
        )
        d.min_wallet_required = dynamicMinWallet
        setDriver(d)
        setName(d.name || user?.name || '')
        setEmail(d.email || user?.email || '')
        setPhone(d.phone || user?.phone || '')
        setVehicleNo(d.plate_no || d.vehicle_no || '')
        setVehicleModel(d.vehicle_model || (d.make ? `${d.make} ${d.model}` : ''))
        setLicenseNo(d.license_no || '')
      }
    } catch { }
    finally {
      setLoading(false)
    }
  }, [user])

  // Additional Vehicle Categories (4+1 can enable 3+1; 6+1 can enable 4+1, 3+1; 7+1 can enable 6+1, 4+1, 3+1)
  const [updatingCapacities, setUpdatingCapacities] = useState(false)

  const getDriverBaseCapacity = (d) => {
    const vType = String(d?.vehicle_type || d?.vehicle_type_name || d?.model || d?.vehicle_model || '').toLowerCase()
    const cap = Number(d?.capacity || 0)

    // Priority 1: Check explicit category strings in vehicle type or model
    if (vType.includes('3+1') || vType.includes('3 seater') || vType.includes('mini') || vType.includes('hatchback')) {
      return '3+1'
    }
    if (vType.includes('7+1') || vType.includes('7 seater') || vType.includes('8 seater') || vType.includes('suv xl') || vType.includes('suv_xl') || vType.includes('crysta')) {
      return '7+1'
    }
    if (vType.includes('6+1') || vType.includes('6 seater') || vType.includes('suv') || vType.includes('ertiga')) {
      return '6+1'
    }
    if (vType.includes('4+1') || vType.includes('4 seater') || vType.includes('sedan') || vType.includes('dzire') || vType.includes('etios')) {
      return '4+1'
    }

    // Priority 2: Seating capacity fallback (4 is 3+1 Mini, 5 is 4+1 Sedan, 7 is 6+1 SUV, 8+ is 7+1 SUV XL)
    if (cap >= 8) return '7+1'
    if (cap >= 6) return '6+1'
    if (cap === 5) return '4+1'
    if (cap > 0 && cap <= 4) return '3+1'
    return '4+1'
  }

  const parseAcceptedCapacities = (rawCaps, rawServices) => {
    const set = new Set()
    if (rawCaps) {
      const parts = String(rawCaps).split(',').map(s => s.trim()).filter(Boolean)
      parts.forEach(p => set.add(p))
    }
    if (rawServices) {
      const sParts = String(rawServices).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      if (sParts.includes('cap_3_1') || sParts.includes('3+1')) set.add('3+1')
      if (sParts.includes('cap_4_1') || sParts.includes('4+1')) set.add('4+1')
      if (sParts.includes('cap_6_1') || sParts.includes('6+1')) set.add('6+1')
      if (sParts.includes('cap_7_1') || sParts.includes('7+1')) set.add('7+1')
    }
    return Array.from(set)
  }

  const handleToggleCapacity = async (capKey) => {
    const currentActive = parseAcceptedCapacities(driver?.accepted_capacities, driver?.service_types)
    let nextList
    if (currentActive.includes(capKey)) {
      nextList = currentActive.filter(c => c !== capKey)
    } else {
      nextList = [...currentActive, capKey]
    }

    const nextCapStr = nextList.join(',')
    const currentServices = parseActiveServices(driver?.service_types)
    const capTags = nextList.map(c => `cap_${c.replace('+', '_')}`)
    const pureServices = currentServices.filter(s => !s.startsWith('cap_') && s !== '3+1' && s !== '4+1' && s !== '6+1' && s !== '7+1')
    const combinedServices = Array.from(new Set([...pureServices, ...capTags])).join(',')

    setDriver(prev => ({
      ...prev,
      accepted_capacities: nextCapStr,
      service_types: combinedServices
    }))

    if (updateUser) {
      updateUser(prev => ({
        ...prev,
        accepted_capacities: nextCapStr,
        service_types: combinedServices
      }))
    }

    try {
      await SecureStore.setItemAsync('@driver_accepted_capacities', nextCapStr)
    } catch { }

    setUpdatingCapacities(true)
    try {
      const res = await driverAPI.updateProfile({
        accepted_capacities: nextCapStr,
        service_types: combinedServices
      })
      if (res.data?.status === 'success' || res.data?.status === true) {
        // Saved successfully
      }
    } catch (err) {
      console.log('Update capacities error:', err)
      Alert.alert('Update Failed', 'Could not update vehicle category preferences.')
      loadProfile()
    } finally {
      setUpdatingCapacities(false)
    }
  }

  const [updatingServices, setUpdatingServices] = useState(false)

  const checkIsLocalAllowed = (d) => {
    if (!d) return false
    // 1. Explicit disable from admin in local_trip_enabled or local_trip_alert
    if (d.local_trip_enabled === 0 || d.local_trip_enabled === '0' || d.local_trip_enabled === false) {
      return false
    }
    if (Boolean(d.local_trip_alert)) {
      return false
    }
    const raw = String(d.service_types || '').toLowerCase()
    if (raw.includes('local_disabled')) {
      return false
    }
    // 2. If local_trip_enabled is explicitly 1, admin turned it on
    if (Number(d.local_trip_enabled) === 1) {
      return true
    }
    // 3. For legacy backend without local_trip_enabled column, check if admin assigned local services
    const hasLocalTokens = raw.includes('local_drop') || raw.includes('hourly_package') || raw.includes('local') || raw.includes('hourly')
    return hasLocalTokens
  }

  const parseActiveServices = (raw, isLocalAllowed = true) => {
    if (!raw) {
      return isLocalAllowed ? ['local_drop', 'hourly_package'] : []
    }
    const parts = String(raw).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const set = new Set()

    const hasGranularLocal = parts.includes('local_drop') || parts.includes('hourly_package')
    const hasGranularOutstation = parts.includes('outstation_oneway') || parts.includes('outstation_round')

    parts.forEach(p => {
      if (p === 'local_drop' || p === 'hourly_package') {
        if (isLocalAllowed) set.add(p)
      } else if (p === 'outstation_oneway' || p === 'outstation_round') {
        set.add(p)
      } else if (p === 'local') {
        // Only expand legacy 'local' if driver has no granular local keys configured and admin permits local
        if (isLocalAllowed && !hasGranularLocal) {
          set.add('local_drop')
          set.add('hourly_package')
        }
      } else if (p === 'hourly' || p === 'rental') {
        if (isLocalAllowed && !hasGranularLocal) {
          set.add('hourly_package')
        }
      } else if (p === 'outstation') {
        // Only expand legacy 'outstation' if driver has no granular outstation keys configured
        if (!hasGranularOutstation) {
          set.add('outstation_oneway')
          set.add('outstation_round')
        }
      } else if (p === 'oneway' || p === 'one_way') {
        set.add('outstation_oneway')
      } else if (p === 'round' || p === 'round_trip') {
        set.add('outstation_round')
      }
    })

    return Array.from(set)
  }

  const openRazorpayTopUpModal = (suggestedAmount = 500) => {
    const amt = Math.max(100, Number(suggestedAmount) || 500)
    setRazorpayPaymentData({
      order_id: `order_topup_${Date.now().toString(36)}`,
      amount: amt * 100,
      amount_rupees: amt,
      key_id: 'rzp_test_TsVWNKaYfW13sp',
      booking_ref: 'OUTSTATION_WALLET',
      description: `Outstation Wallet Recharge (₹${amt})`,
      user: {
        name: name || user?.name || 'Driver',
        phone: phone || user?.phone || '',
        email: email || user?.email || '',
      }
    })
    setRazorpayModalVisible(true)
  }

  const handlePaymentSuccess = async (rzpResponse) => {
    setRazorpayModalVisible(false)
    const paidAmt = Number(razorpayPaymentData?.amount_rupees || 500)
    const curBal = Number(storedBalance !== null ? storedBalance : (driver?.wallet_balance ?? user?.wallet_balance ?? 0))
    const newBal = curBal + paidAmt
    setStoredBalance(newBal)
    try {
      await SecureStore.setItemAsync('driver_wallet_balance', String(newBal))
    } catch { }

    setDriver(prev => ({ ...(prev || {}), wallet_balance: newBal }))
    if (updateUser) updateUser(prev => ({ ...(prev || {}), wallet_balance: newBal }))

    try {
      await driverAPI.updateProfile({ wallet_balance: newBal })
    } catch (_) { }

    const minWallet = Number(driver?.min_wallet_required || user?.min_wallet_required || 500)
    if (newBal >= minWallet) {
      const isLocalAllowed = checkIsLocalAllowed(driver)
      const currentActive = parseActiveServices(driver?.service_types, isLocalAllowed)
      const nextActive = Array.from(new Set([...currentActive, 'outstation_oneway', 'outstation_round']))
      await saveServices(nextActive, newBal)
      Alert.alert(
        'Recharge Successful 🎉',
        `₹${paidAmt} credited to Current Balance! Current Balance is now ₹${newBal.toLocaleString('en-IN')}.\n\nOutstation Trips have been ENABLED successfully!`
      )
    } else {
      Alert.alert(
        'Recharge Successful 🎉',
        `₹${paidAmt} credited to Current Balance! Current Balance is now ₹${newBal.toLocaleString('en-IN')}.\n\n(Admin minimum required is ₹${minWallet}. Short by ₹${minWallet - newBal} to activate Outstation).`
      )
    }
  }

  const saveServices = async (list, overrideBalance = null) => {
    const isLocalAllowed = checkIsLocalAllowed(driver)
    let sanitizedList = [...list]
    if (!isLocalAllowed) {
      // Driver CANNOT self-assign local trips under any circumstance if admin paused it
      sanitizedList = sanitizedList.filter(s => s !== 'local_drop' && s !== 'hourly_package' && s !== 'local' && s !== 'hourly' && s !== 'rental')
      sanitizedList.push('local_disabled')
    }

    const effectiveBalance = overrideBalance !== null
      ? Number(overrideBalance)
      : Number(storedBalance !== null ? storedBalance : (driver?.wallet_balance ?? user?.wallet_balance ?? 0))
    const minWallet = Number(driver?.min_wallet_required || user?.min_wallet_required || 500)
    if (effectiveBalance < minWallet) {
      sanitizedList = sanitizedList.filter(s => !s.startsWith('outstation') && s !== 'oneway' && s !== 'round')
    }

    // Retain any existing capacity tokens in service_types string (e.g. cap_3_1, cap_4_1, etc.)
    const existingRaw = driver?.service_types || ''
    let capTags = String(existingRaw).split(',').map(s => s.trim()).filter(s => s.startsWith('cap_'))
    if (capTags.length === 0) capTags = ['cap_3_1']
    const allTokens = Array.from(new Set([...sanitizedList, ...capTags]))
    const newTypesStr = allTokens.join(',')

    setDriver(prev => ({ ...prev, service_types: newTypesStr }))
    if (updateUser) {
      updateUser(prev => ({ ...prev, service_types: newTypesStr }))
    }
    setUpdatingServices(true)
    try {
      const res = await driverAPI.updateProfile({ service_types: newTypesStr })
      if (res.data?.status === 'success' || res.data?.status === true) {
        if (res.data?.service_types) {
          setDriver(prev => ({ ...prev, service_types: res.data.service_types }))
          if (updateUser) updateUser(prev => ({ ...prev, service_types: res.data.service_types }))
        }
      } else {
        throw new Error(res.data?.message || 'Could not update service preferences.')
      }
    } catch (err) {
      console.log('Update service preferences error:', err)
      Alert.alert('Update Failed', err?.response?.data?.message || err?.message || 'Could not update service preferences.')
      loadProfile()
    } finally {
      setUpdatingServices(false)
    }
  }

  const handleToggleParentGroup = async (groupKey) => {
    const isLocalAllowed = checkIsLocalAllowed(driver)
    const currentActive = parseActiveServices(driver?.service_types, isLocalAllowed)
    let nextActive = [...currentActive]

    if (groupKey === 'local') {
      if (!isLocalAllowed) {
        Alert.alert(
          'Local Rides Locked 🔒',
          'Local rides are currently paused by Admin due to pending monthly subscription payment.\n\nPlease contact Admin or pay via GPay to activate Local Rides.'
        )
        return
      }
      const isLocalActive = nextActive.includes('local_drop') || nextActive.includes('hourly_package')
      if (isLocalActive) {
        nextActive = nextActive.filter(s => s !== 'local_drop' && s !== 'hourly_package')
      } else {
        if (!nextActive.includes('local_drop')) nextActive.push('local_drop')
        if (!nextActive.includes('hourly_package')) nextActive.push('hourly_package')
      }
    } else if (groupKey === 'outstation') {
      const isOutstationActive = nextActive.includes('outstation_oneway') || nextActive.includes('outstation_round')
      if (isOutstationActive) {
        nextActive = nextActive.filter(s => s !== 'outstation_oneway' && s !== 'outstation_round')
      } else {
        // Driver is enabling outstation: check minimum wallet balance!
        const walletBalance = Number(storedBalance !== null ? storedBalance : (driver?.wallet_balance ?? user?.wallet_balance ?? 0))
        const minWallet = Number(driver?.min_wallet_required || user?.min_wallet_required || 500)
        if (walletBalance < minWallet) {
          Alert.alert(
            'Outstation Minimum Wallet Required ⚠️',
            `Outstation trip enable பண்ண குறைந்தபட்சம் ₹${minWallet} wallet balance தேவை.\n\nதயவுசெய்து Earnings சென்று Wallet Recharge செய்யவும்.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Recharge',
                onPress: () => navigation.navigate('Earnings')
              }
            ]
          )
          return
        }
        if (!nextActive.includes('outstation_oneway')) nextActive.push('outstation_oneway')
        if (!nextActive.includes('outstation_round')) nextActive.push('outstation_round')
      }
    }

    await saveServices(nextActive)
  }

  const handleToggleSubService = async (serviceKey) => {
    const isLocalAllowed = checkIsLocalAllowed(driver)
    if (serviceKey === 'local_drop' || serviceKey === 'hourly_package') {
      if (!isLocalAllowed) {
        Alert.alert(
          'Local Rides Locked 🔒',
          'Local rides are currently paused by Admin due to pending monthly subscription payment.\n\nPlease contact Admin or pay via GPay to activate Local Rides.'
        )
        return
      }
    }
    const currentActive = parseActiveServices(driver?.service_types, isLocalAllowed)
    let nextActive

    if (currentActive.includes(serviceKey)) {
      nextActive = currentActive.filter(s => s !== serviceKey)
    } else {
      if (serviceKey === 'outstation_oneway' || serviceKey === 'outstation_round') {
        const walletBalance = Number(storedBalance !== null ? storedBalance : (driver?.wallet_balance ?? user?.wallet_balance ?? 0))
        const minWallet = Number(driver?.min_wallet_required || user?.min_wallet_required || 500)
        if (walletBalance < minWallet) {
          Alert.alert(
            'Outstation Minimum Wallet Required ⚠️',
            `Outstation trip இயக்க குறைந்தபட்சம் ₹${minWallet} wallet balance தேவை.\n\nதயவுசெய்து Earnings சென்று Wallet Recharge செய்யவும்.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Recharge',
                onPress: () => navigation.navigate('Earnings')
              }
            ]
          )
          return
        }
      }
      nextActive = [...currentActive, serviceKey]
    }

    await saveServices(nextActive)
  }

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

      if (result.canceled || !result.assets || !result.assets[0]?.uri) return
      uploadPhoto(result.assets[0].uri, result.assets[0])
    } catch (err) {
      Alert.alert('Error', 'Could not open image picker: ' + err.message)
    }
  }

  // Upload Photo to Backend
  const uploadPhoto = async (localUri, asset = null) => {
    setUploadingPhoto(true)
    try {
      const formData = createUploadFormData(localUri, {
        prefix: 'driver_profile',
        type: 'profile',
        asset: asset,
      })

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
    } catch (err) {
      console.log('Driver profile photo upload error:', err)
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
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await driverAPI.toggleOnline({ is_online: 0 })
          } catch { }
          logout()
        }
      }
    ])
  }

  // Delete Driver Account (Google Play Compliance)
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Driver Account',
      'Permanently delete your CityOneTaxi Driver Partner account? All your personal details, KYC verification documents, and vehicle records will be permanently removed. Active trips must be completed before deletion.',
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
          <View style={styles.heroTopAccent} />

          {/* Large Luxury Embossed Watermark */}
          <Image
            source={require('../../../assets/cityonetaxi_badge.png')}
            style={styles.driverWatermarkLogo}
            resizeMode="contain"
            pointerEvents="none"
          />

          {/* Driver Brand & ID Header */}
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroBrandBadge}>
              <Image
                source={require('../../../assets/cityonetaxi_badge.png')}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.heroBrandTitle}>
                  CITYONE <Text style={{ color: '#D97706' }}>TAXI</Text>
                </Text>
                <Text style={styles.heroBrandTier}>COMMERCIAL FLEET PARTNER</Text>
              </View>
            </View>

            <View style={styles.heroIdBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#059669" />
              <Text style={styles.heroIdText}>DRV-{driver?.id || user?.id || '001'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={() => setPhotoModalVisible(true)}
            activeOpacity={0.85}
            disabled={uploadingPhoto}
          >
            <View style={styles.avatarRing}>
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
            </View>
            <View style={styles.cameraIconBtn}>
              <Ionicons name="camera" size={13} color={COLORS.white} />
            </View>
          </TouchableOpacity>

          <Text style={styles.driverNameText}>{driver?.name || user?.name || 'Driver Partner'}</Text>

          {/* Vehicle Info Badge Pill */}
          <View style={styles.vehicleBadgePill}>
            <Ionicons name="car" size={12} color="#D97706" />
            <Text style={styles.vehicleBadgeText}>
              {driver?.vehicle_type || 'Commercial Cab'} · {driver?.plate_no || 'Verified Partner'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {((
              (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'approved' ||
              (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'verified' ||
              (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved'
            )) ? (
              <View style={[styles.verifiedBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Ionicons name="checkmark-circle" size={12} color="#059669" />
                <Text style={[styles.verifiedText, { color: '#059669' }]}>Verified Driver Partner</Text>
              </View>
            ) : ((driver?.approval_status || user?.approval_status || '').toLowerCase() === 'rejected' || (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'rejected') ? (
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
                style={[styles.verifiedBadge, { backgroundColor: '#FFF8E7', borderColor: '#FDE68A' }]}
                onPress={() => navigation.navigate('DriverDocuments')}
              >
                <Ionicons name="document-text" size={12} color="#D97706" />
                <Text style={[styles.verifiedText, { color: '#B45309' }]}> KYC Submission Required</Text>
              </TouchableOpacity>
            )}
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingPillText}>{driver?.rating || '5.0'} Rating</Text>
            </View>
          </View>
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

        {/* Additional Vehicle Category Assignments (4+1 -> 3+1; 6+1 -> 4+1, 3+1; 7+1 -> 6+1, 4+1, 3+1) */}
        {(() => {
          const baseCap = getDriverBaseCapacity(driver)
          const activeCaps = parseAcceptedCapacities(driver?.accepted_capacities, driver?.service_types)

          let lowerCapOptions = []
          if (baseCap === '7+1') {
            lowerCapOptions = [
              { key: '6+1', label: 'SUV (6+1)', desc: 'Accept 6+1 SUV trips with your 7+1 vehicle', icon: 'car-sport', badge: '6+1 SEATER', color: '#D97706', bg: '#FFFBEB' },
              { key: '4+1', label: 'Sedan (4+1)', desc: 'Accept 4+1 Sedan trips with your 7+1 vehicle', icon: 'car-sport', badge: '4+1 SEATER', color: '#059669', bg: '#ECFDF5' },
              { key: '3+1', label: 'Mini (3+1)', desc: 'Accept 3+1 Mini trips with your 7+1 vehicle', icon: 'car', badge: '3+1 SEATER', color: '#2563EB', bg: '#EFF6FF' },
            ]
          } else if (baseCap === '6+1') {
            lowerCapOptions = [
              { key: '4+1', label: 'Sedan (4+1)', desc: 'Accept 4+1 Sedan trips with your 6+1 vehicle', icon: 'car-sport', badge: '4+1 SEATER', color: '#059669', bg: '#ECFDF5' },
              { key: '3+1', label: 'Mini (3+1)', desc: 'Accept 3+1 Mini trips with your 6+1 vehicle', icon: 'car', badge: '3+1 SEATER', color: '#2563EB', bg: '#EFF6FF' },
            ]
          } else if (baseCap === '4+1') {
            lowerCapOptions = [
              { key: '3+1', label: 'Mini (3+1)', desc: 'Accept 3+1 Mini trips with your 4+1 vehicle', icon: 'car', badge: '3+1 SEATER', color: '#2563EB', bg: '#EFF6FF' },
            ]
          }

          // If driver's vehicle has no lower seating categories (e.g. 3+1 Mini is already the lowest), hide this section completely
          if (lowerCapOptions.length === 0) {
            return null
          }

          return (
            <View style={{ marginTop: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 2 }]}>Additional Vehicle Categories</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    Enable smaller categories to receive more trips & maximize earnings
                  </Text>
                </View>
                {updatingCapacities && <ActivityIndicator size="small" color={COLORS.primary} />}
              </View>

              <View style={[styles.card, { padding: 14 }]}>
                {/* Registered Base Vehicle Info Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="car-sport" size={22} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
                        Registered: {driver?.vehicle_type || `${baseCap} Cab`}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                        Base Capacity: {baseCap} · {driver?.plate_no || 'Cab Assigned'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>
                      BASE {baseCap}
                    </Text>
                  </View>
                </View>

                {/* Lower Category Toggles */}
                {lowerCapOptions.length > 0 ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Enable Lower Seating Bookings:
                    </Text>
                    {lowerCapOptions.map(opt => {
                      const isOptActive = activeCaps.includes(opt.key)
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isOptActive ? opt.bg : '#F8FAFC',
                            borderWidth: 1.5,
                            borderColor: isOptActive ? opt.color : '#E2E8F0',
                            borderRadius: 12,
                            padding: 12,
                          }}
                          onPress={() => handleToggleCapacity(opt.key)}
                          activeOpacity={0.8}
                        >
                          {/* Car Icon with Category Color */}
                          <View style={{
                            width: 42,
                            height: 42,
                            borderRadius: 10,
                            backgroundColor: isOptActive ? opt.color : '#E2E8F0',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Ionicons name={opt.icon} size={22} color={isOptActive ? '#FFFFFF' : '#64748B'} />
                          </View>

                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 14, fontWeight: '800', color: isOptActive ? '#0F172A' : '#475569' }}>
                                {opt.label}
                              </Text>
                              <View style={{
                                backgroundColor: isOptActive ? '#FFFFFF' : '#E2E8F0',
                                paddingHorizontal: 6,
                                paddingVertical: 1.5,
                                borderRadius: 4
                              }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '800', color: isOptActive ? opt.color : '#64748B' }}>
                                  {opt.badge}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 11, color: isOptActive ? '#475569' : '#94A3B8', marginTop: 2 }}>
                              {opt.desc}
                            </Text>
                            <Text style={{ fontSize: 10.5, fontWeight: '700', color: isOptActive ? '#10B981' : '#94A3B8', marginTop: 2 }}>
                              {isOptActive ? '✓ Assigned & Receiving Trips' : 'Disabled · Tap to enable'}
                            </Text>
                          </View>

                          <Switch
                            value={isOptActive}
                            onValueChange={() => handleToggleCapacity(opt.key)}
                            trackColor={{ false: '#CBD5E1', true: opt.color }}
                            thumbColor="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )
                    })}

                    <View style={{ marginTop: 4, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="information-circle-outline" size={16} color="#64748B" />
                      <Text style={{ fontSize: 10.5, color: '#64748B', flex: 1 }}>
                        Enabled categories allow the system & admin to assign smaller vehicle trips to you whenever available.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8 }}>
                    <Text style={{ fontSize: 11.5, color: '#64748B', textAlign: 'center', lineHeight: 16 }}>
                      Your vehicle is registered as {baseCap}. You receive all {baseCap} trip requests automatically.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )
        })()}

        {/* Operating Trip Services (Local & Outstation Hierarchy) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
          <View>
            <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 2 }]}>Operating Services</Text>
            <Text style={{ fontSize: 11, color: '#64748B' }}>Choose trip categories you accept</Text>
          </View>
          {updatingServices && <ActivityIndicator size="small" color={COLORS.primary} />}
        </View>

        {(() => {
          const isLocalEnabledByAdmin = checkIsLocalAllowed(driver)
          const activeList = parseActiveServices(driver?.service_types, isLocalEnabledByAdmin)
          const isLocalActive = isLocalEnabledByAdmin && (activeList.includes('local_drop') || activeList.includes('hourly_package'))
          const walletBalance = Number(storedBalance !== null ? storedBalance : (driver?.wallet_balance ?? user?.wallet_balance ?? 0))
          const minWallet = Number(driver?.min_wallet_required || user?.min_wallet_required || 500)
          const hasOutstationWallet = walletBalance >= minWallet
          const isOutstationActive = hasOutstationWallet && (activeList.includes('outstation_oneway') || activeList.includes('outstation_round'))

          return (
            <View style={{ gap: 12 }}>
              {/* 1. Local Trip Master Card */}
              <View style={[
                styles.card,
                {
                  padding: 14,
                  borderWidth: 1.5,
                  borderColor: !isLocalEnabledByAdmin ? '#FCA5A5' : (isLocalActive ? '#818CF8' : '#E2E8F0'),
                  backgroundColor: !isLocalEnabledByAdmin ? '#FFFBFB' : (isLocalActive ? '#F8FAFC' : '#FFFFFF')
                }
              ]}>
                {/* Master Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: !isLocalEnabledByAdmin ? '#FEE2E2' : (isLocalActive ? '#EEF2FF' : '#F1F5F9'),
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Ionicons
                        name={!isLocalEnabledByAdmin ? "lock-closed" : "car"}
                        size={22}
                        color={!isLocalEnabledByAdmin ? '#DC2626' : (isLocalActive ? '#4F46E5' : '#64748B')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: !isLocalEnabledByAdmin ? '#991B1B' : (isLocalActive ? '#1E1B4B' : '#64748B') }}>
                          Local Trip
                        </Text>
                        {!isLocalEnabledByAdmin ? (
                          <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#FCA5A5' }}>
                            <Text style={{ fontSize: 9, fontWeight: '900', color: '#DC2626' }}>
                              🔒 PAUSED (DUE)
                            </Text>
                          </View>
                        ) : (
                          <View style={{ backgroundColor: isLocalActive ? '#4F46E5' : '#E2E8F0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: isLocalActive ? '#FFFFFF' : '#64748B' }}>
                              CITY
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: !isLocalEnabledByAdmin ? '#B91C1C' : '#64748B', marginTop: 2 }}>
                        {!isLocalEnabledByAdmin ? 'Monthly fee pending. Contact Admin via GPay to activate.' : 'City point-to-point rides & hourly rentals'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!isLocalEnabledByAdmin) {
                        Alert.alert(
                          'Local Rides Locked 🔒',
                          'Local rides are currently paused by Admin due to pending monthly subscription payment.\n\nPlease contact Admin or pay via GPay to activate Local Rides.'
                        )
                      }
                    }}
                  >
                    <Switch
                      value={isLocalActive}
                      disabled={!isLocalEnabledByAdmin}
                      onValueChange={() => {
                        if (!isLocalEnabledByAdmin) {
                          Alert.alert(
                            'Local Rides Locked 🔒',
                            'Local rides are currently paused by Admin due to pending monthly subscription payment.\n\nPlease contact Admin or pay via GPay to activate Local Rides.'
                          )
                          return
                        }
                        handleToggleParentGroup('local')
                      }}
                      trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
                      thumbColor="#FFFFFF"
                    />
                  </TouchableOpacity>
                </View>

                {/* Notice banner when admin disabled */}
                {!isLocalEnabledByAdmin && (
                  <View style={{
                    marginTop: 10,
                    padding: 10,
                    backgroundColor: '#FEF2F2',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8
                  }}>
                    <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#991B1B', flex: 1, lineHeight: 16 }}>
                      Local rides are currently paused by Admin due to pending monthly subscription payment. Please pay via GPay to Admin. Once approved, Admin will reactivate this service.
                    </Text>
                  </View>
                )}

                {/* Sub Options (Local Drop & Hourly Package) */}
                {isLocalActive && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                      Select Local Options (Choose either or both):
                    </Text>

                    {/* Local Drop Option */}
                    {(() => {
                      const isDropActive = activeList.includes('local_drop')
                      return (
                        <TouchableOpacity
                          style={[
                            styles.profileSvcRow,
                            isDropActive && { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' }
                          ]}
                          onPress={() => handleToggleSubService('local_drop')}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.profileSvcIcon, { backgroundColor: isDropActive ? '#4F46E5' : '#F1F5F9' }]}>
                            <Ionicons name="location" size={17} color={isDropActive ? '#FFFFFF' : '#64748B'} />
                          </View>
                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.profileSvcTitle, isDropActive && { color: '#0F172A', fontWeight: '800' }]}>
                                Local Drop
                              </Text>
                              <View style={[styles.profileSvcBadge, { backgroundColor: isDropActive ? '#FFFFFF' : '#E2E8F0' }]}>
                                <Text style={[styles.profileSvcBadgeText, { color: isDropActive ? '#4F46E5' : '#64748B' }]}>
                                  Point to Point
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.profileSvcSub}>One-way direct city drop</Text>
                          </View>
                          <Switch
                            value={isDropActive}
                            onValueChange={() => handleToggleSubService('local_drop')}
                            trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
                            thumbColor="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )
                    })()}

                    {/* Hourly Package Option */}
                    {(() => {
                      const isHourlyActive = activeList.includes('hourly_package')
                      return (
                        <TouchableOpacity
                          style={[
                            styles.profileSvcRow,
                            isHourlyActive && { borderColor: '#D97706', backgroundColor: '#FFFBEB' }
                          ]}
                          onPress={() => handleToggleSubService('hourly_package')}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.profileSvcIcon, { backgroundColor: isHourlyActive ? '#D97706' : '#F1F5F9' }]}>
                            <Ionicons name="time" size={17} color={isHourlyActive ? '#FFFFFF' : '#64748B'} />
                          </View>
                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.profileSvcTitle, isHourlyActive && { color: '#0F172A', fontWeight: '800' }]}>
                                Hourly Package
                              </Text>
                              <View style={[styles.profileSvcBadge, { backgroundColor: isHourlyActive ? '#FFFFFF' : '#E2E8F0' }]}>
                                <Text style={[styles.profileSvcBadgeText, { color: isHourlyActive ? '#D97706' : '#64748B' }]}>
                                  Rental
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.profileSvcSub}>Multi-hour city rentals (1h, 2h, 4h, etc.)</Text>
                          </View>
                          <Switch
                            value={isHourlyActive}
                            onValueChange={() => handleToggleSubService('hourly_package')}
                            trackColor={{ false: '#CBD5E1', true: '#D97706' }}
                            thumbColor="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )
                    })()}
                  </View>
                )}
              </View>

              {/* 2. Outstation Trip Master Card */}
              <View style={[styles.card, { padding: 14, borderWidth: 1.5, borderColor: isOutstationActive ? '#34D399' : '#E2E8F0', backgroundColor: isOutstationActive ? '#F8FAFC' : '#FFFFFF' }]}>
                {/* Master Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: isOutstationActive ? '#ECFDF5' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="navigate" size={22} color={isOutstationActive ? '#059669' : '#64748B'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: isOutstationActive ? '#064E3B' : '#64748B' }}>
                          Outstation Trip
                        </Text>
                        <View style={{ backgroundColor: isOutstationActive ? '#059669' : (hasOutstationWallet ? '#E2E8F0' : '#FEE2E2'), paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: isOutstationActive ? '#FFFFFF' : (hasOutstationWallet ? '#64748B' : '#DC2626') }}>
                            {isOutstationActive ? 'LONG TRIP' : (hasOutstationWallet ? 'LONG TRIP' : `MIN WALLET ₹${minWallet}`)}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        Inter-city one-way drops & return trips
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isOutstationActive}
                    onValueChange={() => handleToggleParentGroup('outstation')}
                    trackColor={{ false: '#CBD5E1', true: '#059669' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Sub Options (One Way Trip & Round Trip) */}
                {isOutstationActive && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                      Select Outstation Options (Choose either or both):
                    </Text>

                    {/* One Way Trip Option */}
                    {(() => {
                      const isOneWayActive = activeList.includes('outstation_oneway')
                      return (
                        <TouchableOpacity
                          style={[
                            styles.profileSvcRow,
                            isOneWayActive && { borderColor: '#059669', backgroundColor: '#ECFDF5' }
                          ]}
                          onPress={() => handleToggleSubService('outstation_oneway')}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.profileSvcIcon, { backgroundColor: isOneWayActive ? '#059669' : '#F1F5F9' }]}>
                            <Ionicons name="arrow-forward" size={17} color={isOneWayActive ? '#FFFFFF' : '#64748B'} />
                          </View>
                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.profileSvcTitle, isOneWayActive && { color: '#0F172A', fontWeight: '800' }]}>
                                One Way Trip
                              </Text>
                              <View style={[styles.profileSvcBadge, { backgroundColor: isOneWayActive ? '#FFFFFF' : '#E2E8F0' }]}>
                                <Text style={[styles.profileSvcBadgeText, { color: isOneWayActive ? '#059669' : '#64748B' }]}>
                                  Drop Only
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.profileSvcSub}>Single destination outstation drop</Text>
                          </View>
                          <Switch
                            value={isOneWayActive}
                            onValueChange={() => handleToggleSubService('outstation_oneway')}
                            trackColor={{ false: '#CBD5E1', true: '#059669' }}
                            thumbColor="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )
                    })()}

                    {/* Round Trip Option */}
                    {(() => {
                      const isRoundActive = activeList.includes('outstation_round')
                      return (
                        <TouchableOpacity
                          style={[
                            styles.profileSvcRow,
                            isRoundActive && { borderColor: '#0284C7', backgroundColor: '#F0F9FF' }
                          ]}
                          onPress={() => handleToggleSubService('outstation_round')}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.profileSvcIcon, { backgroundColor: isRoundActive ? '#0284C7' : '#F1F5F9' }]}>
                            <Ionicons name="repeat" size={17} color={isRoundActive ? '#FFFFFF' : '#64748B'} />
                          </View>
                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.profileSvcTitle, isRoundActive && { color: '#0F172A', fontWeight: '800' }]}>
                                Round Trip
                              </Text>
                              <View style={[styles.profileSvcBadge, { backgroundColor: isRoundActive ? '#FFFFFF' : '#E2E8F0' }]}>
                                <Text style={[styles.profileSvcBadgeText, { color: isRoundActive ? '#0284C7' : '#64748B' }]}>
                                  Two Way / Return
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.profileSvcSub}>Outstation return & multi-day journeys</Text>
                          </View>
                          <Switch
                            value={isRoundActive}
                            onValueChange={() => handleToggleSubService('outstation_round')}
                            trackColor={{ false: '#CBD5E1', true: '#0284C7' }}
                            thumbColor="#FFFFFF"
                          />
                        </TouchableOpacity>
                      )
                    })()}
                  </View>
                )}
              </View>
            </View>
          )
        })()}

        {/* Partner Management Navigation */}
        <Text style={styles.sectionTitle}>Partner Management</Text>
        <View style={styles.card}>
          {/* 1. Dedicated KYC Verification Menu Row */}
          <TouchableOpacity
            style={[styles.menuRow, styles.rowBorder]}
            onPress={() => navigation.navigate('DriverDocuments')}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#D97706" />
            </View>
            {(() => {
              const isApproved =
                (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'approved' ||
                (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'verified' ||
                (driver?.kyc_status || user?.kyc_status || '').toLowerCase() === 'approved'
              const isRejected = (driver?.verification_status || user?.verification_status || '').toLowerCase() === 'rejected'
              const hasSubmitted = Boolean(driver?.has_kyc_submitted || driver?.license_front_image || driver?.verification_status === 'pending')

              return (
                <>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>KYC Verification & Documents</Text>
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>
                      {isApproved
                        ? 'All documents verified'
                        : isRejected
                          ? 'Correction required · Tap to re-upload'
                          : hasSubmitted
                            ? 'Documents in Admin review'
                            : 'Action required · Submit government IDs'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[
                      styles.approvedPill,
                      {
                        backgroundColor: isApproved
                          ? '#D1FAE5'
                          : isRejected
                            ? '#FEE2E2'
                            : hasSubmitted
                              ? '#FEF3C7'
                              : '#FFF8E7'
                      }
                    ]}>
                      <Text style={[
                        styles.approvedPillText,
                        {
                          color: isApproved
                            ? '#059669'
                            : isRejected
                              ? '#DC2626'
                              : hasSubmitted
                                ? '#B45309'
                                : '#D97706'
                        }
                      ]}>
                        {isApproved
                          ? 'VERIFIED'
                          : isRejected
                            ? 'REJECTED'
                            : hasSubmitted
                              ? 'IN REVIEW'
                              : 'SUBMIT KYC'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.gray400} />
                  </View>
                </>
              )
            })()}
          </TouchableOpacity>

          {[
            { icon: 'star-outline', label: 'Our Reviews', color: '#F59E0B', badge: `${driver?.rating || '5.0'} ★`, action: () => navigation.navigate('DriverReviews') },
            { icon: 'cash-outline', label: 'Earnings & Payout Settlements', color: '#10B981', action: () => navigation.navigate('Earnings') },
            { icon: 'key-outline', label: 'Change Security Password', color: '#B45309', action: () => setPwModalVisible(true) },
            { icon: 'notifications-outline', label: 'Trip Notifications', color: '#2563EB', action: () => navigation.navigate('DriverNotifications') },
            { icon: 'headset-outline', label: 'Help, Safety & 24x7 SOS Support', color: '#EA580C', action: () => navigation.navigate('DriverSupport') },
            { icon: 'document-text-outline', label: 'Privacy Policy', color: '#D97706', action: () => navigation.navigate('PrivacyPolicy') },
            { icon: 'newspaper-outline', label: 'Terms & Conditions', color: '#64748B', action: () => navigation.navigate('Terms') },
          ].map((item, idx, arr) => (
            <TouchableOpacity key={idx} style={[styles.menuRow, idx < arr.length - 1 && styles.rowBorder]} onPress={item.action} activeOpacity={0.8}>
              <View style={[styles.menuIconWrap, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              {item.badge && (
                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#B45309' }}>{item.badge}</Text>
                </View>
              )}
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

        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
          <Image
            source={require('../../../assets/cityonetaxi_badge.png')}
            style={{ width: 44, height: 44, marginBottom: 8 }}
            resizeMode="contain"
          />
          <Text style={styles.appVer}>CityOneTaxi Driver Partner Platform · Secure 256-Bit SSL</Text>
        </View>
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

      {/* Razorpay In-App Top-Up Modal */}
      <RazorpayCheckoutModal
        visible={razorpayModalVisible}
        onClose={() => setRazorpayModalVisible(false)}
        onSuccess={handlePaymentSuccess}
        onFailure={(err) => {
          setRazorpayModalVisible(false)
          Alert.alert('Payment Failed', err?.message || 'Recharge was cancelled or could not be processed.')
        }}
        paymentData={razorpayPaymentData}
      />
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
    backgroundColor: '#FEF3C7',
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
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 16,
    ...SHADOW.md,
    position: 'relative',
    overflow: 'hidden',
  },
  heroTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#FFC700',
  },
  driverWatermarkLogo: {
    position: 'absolute',
    right: -40,
    bottom: -40,
    width: 240,
    height: 240,
    opacity: 0.08,
    transform: [{ rotate: '-12deg' }],
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  heroBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBrandTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.6,
  },
  heroBrandTier: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  heroIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  heroIdText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  avatarWrapper: {
    position: 'relative',
    width: 88,
    height: 88,
    marginBottom: 10,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 3,
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 41,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFC700',
  },
  vehicleBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 14,
    marginTop: 6,
  },
  vehicleBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
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
  profileSvcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  profileSvcIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSvcTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  profileSvcBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  profileSvcBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  profileSvcSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  profileSvcToggle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default DriverProfileScreen

