import React from 'react'
import { View, Text, TextInput, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme'

const Input = ({ label, icon, error, ...props }) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        {icon && <Ionicons name={icon} size={18} color={COLORS.gray400} style={styles.icon} />}
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.gray400}
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { marginBottom: SPACING.md },
  label:      { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gray50, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.gray200, paddingHorizontal: SPACING.md, height: 50 },
  inputError: { borderColor: COLORS.error },
  icon:       { marginRight: 8 },
  input:      { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  errorText:  { fontSize: FONTS.sizes.xs, color: COLORS.error, marginTop: 4 },
})

export default Input
