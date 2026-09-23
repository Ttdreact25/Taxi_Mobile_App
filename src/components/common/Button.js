import React from 'react'
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const Button = ({ title, onPress, loading, variant = 'primary', style }) => {
  const isOutline = variant === 'outline'
  const isDanger = variant === 'danger'

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        isOutline && styles.btnOutline,
        isDanger && styles.btnDanger,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? COLORS.primary : COLORS.white} />
      ) : (
        <Text style={[styles.btnText, isOutline && styles.btnTextOutline]}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn:            { height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, ...SHADOW.sm },
  btnOutline:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.primary },
  btnDanger:      { backgroundColor: COLORS.error },
  btnText:        { color: COLORS.white, fontSize: FONTS.sizes.base, fontWeight: '700' },
  btnTextOutline: { color: COLORS.primary },
})

export default Button
