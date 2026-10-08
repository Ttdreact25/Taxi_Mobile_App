import React from 'react'
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../../constants/theme'

const Button = ({
  title,
  onPress,
  loading = false,
  variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'dark'
  size = 'lg',        // 'sm' | 'md' | 'lg'
  icon,
  iconPosition = 'left',
  disabled = false,
  style,
  textStyle,
}) => {
  const isOutline   = variant === 'outline'
  const isSecondary = variant === 'secondary'
  const isDanger    = variant === 'danger'
  const isSuccess   = variant === 'success'
  const isDark      = variant === 'dark'

  const getHeight = () => {
    if (size === 'sm') return 38
    if (size === 'md') return 46
    return 52 // Large modern CTA button
  }

  const getFontSize = () => {
    if (size === 'sm') return FONTS.sizes.sm
    if (size === 'md') return FONTS.sizes.md
    return FONTS.sizes.base
  }

  const getTextColor = () => {
    if (isOutline) return COLORS.primary
    if (isSecondary) return COLORS.text
    return COLORS.white
  }

  const iconColor = getTextColor()

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.82}
      style={[
        styles.btn,
        { height: getHeight() },
        isOutline && styles.btnOutline,
        isSecondary && styles.btnSecondary,
        isDanger && styles.btnDanger,
        isSuccess && styles.btnSuccess,
        isDark && styles.btnDark,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={18} color={iconColor} style={styles.iconLeft} />
          )}
          <Text style={[styles.btnText, { fontSize: getFontSize(), color: getTextColor() }, textStyle]}>
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={18} color={iconColor} style={styles.iconRight} />
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    ...SHADOW.sm,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    elevation: 0,
    shadowOpacity: 0,
  },
  btnSecondary: {
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    elevation: 0,
    shadowOpacity: 0,
  },
  btnDanger: {
    backgroundColor: COLORS.error,
  },
  btnSuccess: {
    backgroundColor: COLORS.success,
  },
  btnDark: {
    backgroundColor: COLORS.text,
  },
  btnDisabled: {
    opacity: 0.55,
    elevation: 0,
    shadowOpacity: 0,
  },
  btnText: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
})

export default Button
