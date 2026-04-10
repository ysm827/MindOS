/**
 * Connect screen — first-time setup to connect to a MindOS server.
 */
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectionStore } from '@/lib/connection-store';

export default function ConnectScreen() {
  const router = useRouter();
  const { status, error, connect } = useConnectionStore();
  const [url, setUrl] = useState('http://');

  const isConnecting = status === 'connecting';

  async function handleConnect() {
    if (!url.trim() || isConnecting) return;
    const success = await connect(url.trim());
    if (success) {
      router.replace('/(tabs)');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.hero}>
          <Text style={styles.logo}>◆ MindOS</Text>
          <Text style={styles.tagline}>Your Mind, Everywhere</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>MindOS Server Address</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.1.10:3456"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            editable={!isConnecting}
            onSubmitEditing={handleConnect}
          />

          {status === 'error' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.button, isConnecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>
            Open MindOS on your computer, then go to{'\n'}
            Settings → Mobile to find your server address.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1917',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#c8873a',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#a8a29e',
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#d6d3d1',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#44403c',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fafaf9',
    backgroundColor: '#292524',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#c8873a',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    color: '#78716c',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});
