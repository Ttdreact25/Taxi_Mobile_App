import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const MapViewComponent = ({ pickup, destination }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Ionicons name="map-outline" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Route Map View</Text>
      {pickup && (
        <View style={styles.routeBox}>
          <Text style={styles.routeText} numberOfLines={1}>🟢 {pickup}</Text>
          {destination && <Text style={styles.routeText} numberOfLines={1}>🔴 {destination}</Text>}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { height: 180, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, alignItems: 'center', justifyContent: 'center', marginHorizontal: SPACING.xl, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.gray200, ...SHADOW.sm },
  iconBox:   { width: 52, height: 52, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:     { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  routeBox:  { width: '100%', backgroundColor: COLORS.gray50, padding: SPACING.sm, borderRadius: RADIUS.md, gap: 4 },
  routeText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
})

export default MapViewComponent
