import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme'

export const EmptyState = ({
  icon = 'car-outline',
  title = 'No Data Available',
  subtitle = 'Nothing to show at the moment.',
  actionLabel,
  onAction,
  iconColor = COLORS.primary,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconCircle, { backgroundColor: iconColor + '14' }]}>
        <View style={[styles.iconInner, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={icon} size={36} color={iconColor} />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.white} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  iconInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: SPACING.lg,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  actionText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
})

export default EmptyState
