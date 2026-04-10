/**
 * Root layout — initializes connection state and wraps the app.
 */
import { useEffect, useState } from 'react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useConnectionStore } from '@/lib/connection-store';

export default function RootLayout() {
  const init = useConnectionStore((s) => s.init);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init().finally(() => setReady(true));
  }, [init]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Slot />
    </SafeAreaProvider>
  );
}
