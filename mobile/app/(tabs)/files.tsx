/**
 * Files tab — file tree browser.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mindosClient } from '@/lib/api-client';
import type { FileNode } from '@/lib/types';

export default function FilesScreen() {
  const router = useRouter();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const files = await mindosClient.getFileTree();
      setTree(files);
    } catch {
      // handled by connection store
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#c8873a" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  function iconForNode(node: FileNode) {
    if (node.type === 'directory') {
      return node.isSpace ? 'layers-outline' : 'folder-outline';
    }
    if (node.extension === '.csv') return 'grid-outline';
    return 'document-text-outline';
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={tree}
        keyExtractor={(item) => item.path}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c8873a" />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/view/${item.path}` as any)}
          >
            <Ionicons
              name={iconForNode(item) as any}
              size={20}
              color={item.isSpace ? '#c8873a' : '#a8a29e'}
            />
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {item.type === 'directory' && (
              <Ionicons name="chevron-forward" size={16} color="#44403c" />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No files yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1917' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#292524',
  },
  name: { flex: 1, fontSize: 15, color: '#fafaf9' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#78716c' },
});
