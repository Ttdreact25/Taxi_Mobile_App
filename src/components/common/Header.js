import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme'

const Header = ({ title, onBack, rightElement }) => {
  return (
    <View style={styles.container}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 38 }} />
      )}
      <Text style={styles.title}>{title}</Text>
      {rightElement ? rightElement : <View style={{ width: 38 }} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, backgroundColor: COLORS.background },
  backBtn:    { width: 38, height: 38, borderRadius: RADIUS.lg, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
})

export default Header
