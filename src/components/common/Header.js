import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme'

const Header = ({ title, subtitle, onBack, rightElement, style }) => {
  return (
    <View style={[styles.container, style]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {rightElement ? (
        <View style={styles.rightWrap}>{rightElement}</View>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  rightWrap: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
})

export default Header
