import React from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const Card = ({ children, style, onPress, activeOpacity = 0.88 }) => {
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={activeOpacity}
        style={[styles.card, style]}
      >
        {children}
      </TouchableOpacity>
    )
  }

  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOW.sm,
  },
})

export default Card
