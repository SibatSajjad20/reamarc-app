import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { colors, API_URL } from '../src/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.brand}>Reamarc</Text>
      <Text style={styles.sub}>Check in from your phone only</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Work email"
        placeholderTextColor="#A1A1AA"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#A1A1AA"
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </Pressable>
      <Text style={styles.hint}>You can log out and sign in as another account on this phone while testing.</Text>
      {__DEV__ ? <Text style={styles.hint}>API: {API_URL}</Text> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 },
  brand: { fontSize: 32, fontWeight: '800', color: colors.indigo, marginBottom: 6 },
  sub: { color: colors.muted, marginBottom: 28, fontSize: 15 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.indigo,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: colors.rose, marginBottom: 8 },
  hint: { marginTop: 18, color: colors.muted, fontSize: 13, lineHeight: 18 },
});
