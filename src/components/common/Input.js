import React, { useState } from 'react'
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme'

const Input = ({
  label,
  icon,
  rightIcon,
  onRightIconPress,
  error,
  value,
  onChangeText,
  placeholder,
  style,
  inputStyle,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrap,
          isFocused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={isFocused ? COLORS.primary : COLORS.gray400}
            style={styles.icon}
          />
        )}
        <TextInput
          style={[styles.input, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray400}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          underlineColorAndroid="transparent"
          {...props}
        />
        {rightIcon ? (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightBtn}>
            <Ionicons name={rightIcon} size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        ) : value && onChangeText ? (
          <TouchableOpacity onPress={() => onChangeText('')} style={styles.rightBtn}>
            <Ionicons name="close-circle" size={18} color={COLORS.gray300} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    height: '100%',
  },
  rightBtn: {
    padding: 6,
  },
  errorText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.error,
    marginTop: 4,
    fontWeight: '600',
  },
})

export default Input
