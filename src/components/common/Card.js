import React from 'react'
import { View, StyleSheet } from 'react-native'
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const Card = ({ children, style }) => {
  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW.sm },
})

export default Card
