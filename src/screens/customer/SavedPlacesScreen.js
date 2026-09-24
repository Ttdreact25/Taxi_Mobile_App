import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { customerAPI, bookingsAPI } from '../../api/api'
import { searchPlacesService, reverseGeocodeService } from '../../services/locationSearchService'
import { COLORS, RADIUS, SHADOW } from '../../constants/theme'

const PRESET_CATEGORIES = [
  { type: 'home',    label: 'Home',     icon: 'home',      color: '#10B981', bg: '#ECFDF5' },
  { type: 'work',    label: 'Work',     icon: 'briefcase', color: '#7C3AED', bg: '#F5F3FF' },
  { type: 'airport', label: 'Airport',  icon: 'airplane',  color: '#2563EB', bg: '#EFF6FF' },
  { type: 'station', label: 'Station',  icon: 'train',     color: '#D97706', bg: '#FFFBEB' },
  { type: 'custom',  label: 'Custom',   icon: 'location',  color: '#EF4444', bg: '#FEF2F2' },
]

const getCategoryMeta = (loc) => {
  const iconType = loc.icon_type || (loc.is_home ? 'home' : (loc.is_work ? 'work' : 'custom'))
  const found = PRESET_CATEGORIES.find(c => c.type === iconType)
  if (found) return found
  if (loc.is_home) return PRESET_CATEGORIES[0]
  if (loc.is_work) return PRESET_CATEGORIES[1]
  return PRESET_CATEGORIES[4]
}

const SavedPlacesScreen = ({ navigation }) => {
  const [locations, setLocations]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingLoc, setEditingLoc]   = useState(null)
  const [saving, setSaving]           = useState(false)

  // Form State
  const [selectedCategory, setSelectedCategory] = useState('home')
  const [customName, setCustomName]             = useState('')
  const [customLabel, setCustomLabel]           = useState('')
  const [address, setAddress]                   = useState('')
  const [lat, setLat]                           = useState(12.9716)
  const [lng, setLng]                           = useState(77.5946)

  // Autocomplete Search State
  const [searchQuery, setSearchQuery]           = useState('')
  const [predictions, setPredictions]           = useState([])
  const [searchingPlaces, setSearchingPlaces]   = useState(false)
  const debounceTimer                           = useRef(null)

  const loadLocations = useCallback(async () => {
    try {
      setLoading(true)
      const res = await customerAPI.getSavedLocations()
      const list = res.data?.saved_locations || res.data?.locations || []
      setLocations(list)
    } catch {
      setLocations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  // Open Modal for New Location
  const handleOpenAdd = () => {
    setEditingLoc(null)
    setSelectedCategory('home')
    setCustomName('Home')
    setCustomLabel('')
    setAddress('')
    setSearchQuery('')
    setPredictions([])
    setLat(12.9716)
    setLng(77.5946)
    setModalVisible(true)
  }

  // Open Modal for Edit
  const handleOpenEdit = (item) => {
    setEditingLoc(item)
    const cat = item.icon_type || (item.is_home ? 'home' : (item.is_work ? 'work' : 'custom'))
    setSelectedCategory(cat)
    setCustomName(item.location_name || '')
    setCustomLabel(item.custom_label || '')
    setAddress(item.address || '')
    setSearchQuery(item.address || '')
    setPredictions([])
    setLat(parseFloat(item.latitude) || 12.9716)
    setLng(parseFloat(item.longitude) || 77.5946)
    setModalVisible(true)
  }

  // Real-time Multi-Engine Location Search
  const handleSearchPlaces = (query) => {
    setSearchQuery(query)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (query.trim().length < 2) {
      setPredictions([])
      setSearchingPlaces(false)
      return
    }
    setSearchingPlaces(true)
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await searchPlacesService(query, lat, lng)
        setPredictions(results)
      } catch {
        setPredictions([])
      } finally {
        setSearchingPlaces(false)
      }
    }, 280)
  }

  // Select Prediction & Resolve Coordinates
  const handleSelectPrediction = async (p) => {
    const mainText = p.structured_formatting?.main_text || p.description || ''
    const fullText = p.description || mainText
    let itemLat = p.latitude ?? p.geometry?.location?.lat
    let itemLng = p.longitude ?? p.geometry?.location?.lng

    if ((!itemLat || !itemLng) && p.place_id) {
      const parts = p.place_id.split('_')
      if (parts.length >= 3 && !isNaN(parseFloat(parts[1])) && !isNaN(parseFloat(parts[2]))) {
        itemLat = parseFloat(parts[1])
        itemLng = parseFloat(parts[2])
      } else if (!p.place_id.startsWith('local_')) {
        try {
          const det = await bookingsAPI.placeDetails(p.place_id)
          if (det.data?.latitude && det.data?.longitude) {
            itemLat = det.data.latitude
            itemLng = det.data.longitude
          } else if (det.data?.result?.geometry?.location) {
            itemLat = det.data.result.geometry.location.lat
            itemLng = det.data.result.geometry.location.lng
          }
        } catch {}
      }
    }

    itemLat = itemLat ? parseFloat(itemLat) : 13.0382
    itemLng = itemLng ? parseFloat(itemLng) : 80.2315

    setAddress(fullText)
    setSearchQuery(fullText)
    setLat(itemLat)
    setLng(itemLng)
    setPredictions([])

    if (selectedCategory === 'custom' && !customName) {
      setCustomName(mainText)
    }
  }

  // Use Live GPS Position
  const handleUseCurrentGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable location permissions in settings.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const gpsLat = loc.coords.latitude
      const gpsLng = loc.coords.longitude
      setLat(gpsLat)
      setLng(gpsLng)

      // Multi-engine Reverse geocode
      const addr = await reverseGeocodeService(gpsLat, gpsLng)
      setAddress(addr)
      setSearchQuery(addr)
      setPredictions([])
    } catch {
      Alert.alert('GPS Error', 'Could not detect current location.')
    }
  }

  // Save to Database
  const handleSave = async () => {
    let finalName = customName.trim()
    if (!finalName) {
      const cat = PRESET_CATEGORIES.find(c => c.type === selectedCategory)
      finalName = cat ? cat.label : 'Saved Place'
    }

    if (!address.trim()) {
      Alert.alert('Missing Address', 'Please search and select a location address.')
      return
    }

    const payload = {
      location_name: finalName,
      custom_label: customLabel.trim() || null,
      address: address.trim(),
      latitude: lat,
      longitude: lng,
      icon_type: selectedCategory,
      is_home: selectedCategory === 'home' ? 1 : 0,
      is_work: selectedCategory === 'work' ? 1 : 0,
      is_favorite: 1,
    }

    setSaving(true)
    try {
      let res
      if (editingLoc) {
        res = await customerAPI.updateSavedLocation(editingLoc.id, payload)
      } else {
        res = await customerAPI.addSavedLocation(payload)
      }

      if (res.data?.status === 'success') {
        Alert.alert('Success', editingLoc ? 'Saved location updated!' : 'Location saved successfully!')
        setModalVisible(false)
        loadLocations()
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to save location')
      }
    } catch {
      Alert.alert('Error', 'An error occurred while saving the location.')
    } finally {
      setSaving(false)
    }
  }

  // Delete from Database
  const handleDelete = (loc) => {
    Alert.alert(
      'Delete Saved Location',
      `Are you sure you want to remove "${loc.custom_label || loc.location_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await customerAPI.deleteSavedLocation(loc.id)
              if (res.data?.status === 'success') {
                loadLocations()
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to delete')
              }
            } catch {
              Alert.alert('Error', 'Could not delete saved location')
            }
          }
        }
      ]
    )
  }

  // Tap on Location Card -> Book ride
  const handleSelectToBook = (loc) => {
    navigation.navigate('Booking', {
      destination: loc.address,
      destCoords: { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude) },
      autoFocusDest: false,
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Destinations</Text>
        <TouchableOpacity onPress={handleOpenAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading saved places...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {locations.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="bookmark-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Saved Destinations Yet</Text>
              <Text style={styles.emptySub}>
                Save your Home, Work, Airport, or favorite hangouts for 1-tap ride bookings.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={handleOpenAdd}>
                <Ionicons name="add-circle" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
                <Text style={styles.emptyBtnText}>Add First Saved Place</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {locations.map((item) => {
                const meta = getCategoryMeta(item)
                return (
                  <View key={item.id} style={styles.locCard}>
                    <TouchableOpacity
                      style={styles.locCardMain}
                      onPress={() => handleSelectToBook(item)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={22} color={meta.color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={styles.locName}>{item.location_name}</Text>
                          {item.custom_label ? (
                            <View style={styles.labelBadge}>
                              <Text style={styles.labelText}>{item.custom_label}</Text>
                            </View>
                          ) : null}
                          {item.is_home ? (
                            <View style={[styles.labelBadge, { backgroundColor: '#ECFDF5' }]}>
                              <Text style={[styles.labelText, { color: '#10B981' }]}>HOME</Text>
                            </View>
                          ) : null}
                          {item.is_work ? (
                            <View style={[styles.labelBadge, { backgroundColor: '#F5F3FF' }]}>
                              <Text style={[styles.labelText, { color: '#7C3AED' }]}>WORK</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.locAddr} numberOfLines={2}>
                          {item.address}
                        </Text>
                        <View style={styles.bookNowRow}>
                          <Text style={styles.bookNowText}>Tap to Book Ride →</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Actions Row */}
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleOpenEdit(item)}
                      >
                        <Ionicons name="create-outline" size={18} color={COLORS.gray600} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleDelete(item)}
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Quick Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={18} color="#059669" style={{ marginRight: 8 }} />
            <Text style={styles.infoText}>
              Saved destinations are private to your account and synchronize across your mobile and web portal.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Add / Edit Saved Location Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingLoc ? 'Edit Saved Place' : 'Add Saved Destination'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Category Selector */}
              <Text style={styles.fieldLabel}>CATEGORY TYPE</Text>
              <View style={styles.categoryRow}>
                {PRESET_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.type
                  return (
                    <TouchableOpacity
                      key={cat.type}
                      style={[
                        styles.categoryBtn,
                        isSelected && { borderColor: cat.color, backgroundColor: cat.bg }
                      ]}
                      onPress={() => {
                        setSelectedCategory(cat.type)
                        if (cat.type !== 'custom') {
                          setCustomName(cat.label)
                        }
                      }}
                    >
                      <Ionicons
                        name={cat.icon}
                        size={18}
                        color={isSelected ? cat.color : COLORS.gray500}
                      />
                      <Text
                        style={[
                          styles.categoryBtnText,
                          isSelected && { color: cat.color, fontWeight: '800' }
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Location Name / Custom Label */}
              <Text style={styles.fieldLabel}>
                {selectedCategory === 'custom' ? 'CUSTOM NAME *' : 'LOCATION NAME'}
              </Text>
              <TextInput
                style={styles.inputField}
                placeholder={selectedCategory === 'custom' ? "e.g. Mom's House, Gym, College" : "Name (Home, Work, Airport)"}
                value={customName}
                onChangeText={setCustomName}
                placeholderTextColor={COLORS.gray400}
              />

              <Text style={styles.fieldLabel}>CUSTOM LABEL / SUBTITLE (OPTIONAL)</Text>
              <TextInput
                style={styles.inputField}
                placeholder="e.g. Flat 402, Main Campus, Terminal 2"
                value={customLabel}
                onChangeText={setCustomLabel}
                placeholderTextColor={COLORS.gray400}
              />

              {/* Google Places Autocomplete Address Search */}
              <Text style={styles.fieldLabel}>GOOGLE MAPS LOCATION ADDRESS *</Text>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={COLORS.gray400} style={{ marginLeft: 12 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search landmark, building, street..."
                  value={searchQuery}
                  onChangeText={handleSearchPlaces}
                  placeholderTextColor={COLORS.gray400}
                />
                {searchingPlaces ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 12 }} />
                ) : (
                  <TouchableOpacity
                    style={styles.gpsBtn}
                    onPress={handleUseCurrentGPS}
                  >
                    <Ionicons name="navigate" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Autocomplete Predictions Dropdown */}
              {predictions.length > 0 && (
                <View style={styles.predictionsBox}>
                  {predictions.map((p, idx) => (
                    <TouchableOpacity
                      key={p.place_id || idx}
                      style={[
                        styles.predictionItem,
                        idx < predictions.length - 1 && styles.predictionBorder
                      ]}
                      onPress={() => handleSelectPrediction(p)}
                    >
                      <Ionicons name="location-sharp" size={18} color={COLORS.primary} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.predMain} numberOfLines={1}>
                          {p.structured_formatting?.main_text || p.description}
                        </Text>
                        {p.structured_formatting?.secondary_text ? (
                          <Text style={styles.predSub} numberOfLines={1}>
                            {p.structured_formatting.secondary_text}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Selected Address Card */}
              {Boolean(address) && (
                <View style={styles.selectedAddrCard}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.selectedAddrTitle}>Selected Location</Text>
                    <Text style={styles.selectedAddrText}>{address}</Text>
                    <Text style={styles.coordsText}>📍 {lat.toFixed(5)}, {lng.toFixed(5)}</Text>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
                      <Text style={styles.saveBtnText}>
                        {editingLoc ? 'Update Place' : 'Save Location'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.small,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    ...SHADOW.small,
  },
  emptyBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  locCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOW.small,
  },
  locCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  labelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  labelText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.gray700,
  },
  locAddr: {
    fontSize: 12,
    color: COLORS.gray600,
    lineHeight: 16,
    marginTop: 2,
  },
  bookNowRow: {
    marginTop: 6,
  },
  bookNowText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: RADIUS.lg,
    padding: 14,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 16,
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  modalCloseBtn: {
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
    marginTop: 12,
    marginBottom: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  categoryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  inputField: {
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.lg,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  gpsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  predictionsBox: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.lg,
    marginTop: 6,
    maxHeight: 180,
    ...SHADOW.small,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  predictionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  predMain: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  predSub: {
    fontSize: 11,
    color: COLORS.gray500,
    marginTop: 2,
  },
  selectedAddrCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: RADIUS.lg,
    padding: 12,
    marginTop: 12,
  },
  selectedAddrTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  selectedAddrText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  coordsText: {
    fontSize: 10,
    color: '#059669',
    marginTop: 4,
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
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
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.small,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.white,
  },
})

export default SavedPlacesScreen
