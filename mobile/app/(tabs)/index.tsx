/**
 * Home tab — Spaces overview + recently active files.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mindosClient } from '@/lib/api-client';
import { useConnectionStore } from '@/lib/connection-store';
import type { FileNode } from '@/lib/types';

export default function HomeScreen() {
  const router = useRouter();
  const { serverVersion, hostname } = useConnectionStore();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setError('');
      const files = await mindosClient.getFileTree();
      setTree(files);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const spaces = tree.filter((n) => n.type === 'directory' && n.isSpace);
  const recentFiles = flattenFiles(tree)
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
    .slice(0, 10);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color="#78716c" />
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={recentFiles}
        keyExtractor={(item) => item.path}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#c8873a"
          />
        }
        ListHeaderComponent={
          <View>
            {/* Connection badge */}
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {hostname || 'MindOS'} · v{serverVersion}
              </Text>
            </View>

            {/* Spaces */}
            {spaces.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Spaces</Text>
                <View style={styles.spacesGrid}>
                  {spaces.map((space) => (
                    <Pressable
                      key={space.path}
                      style={styles.spaceCard}
                      onPress={() => router.push(`/view/${space.path}` as any)}
                    >
                      <Ionicons name="layers-outline" size={20} color="#c8873a" />
                      <Text style={styles.spaceName} numberOfLines={1}>{space.name}</Text>
                      <Text style={styles.spaceCount}>
                        {space.children?.length ?? 0} files
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Recent header */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recently Active</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.fileRow}
            onPress={() => router.push(`/view/${item.path}` as any)}
          >
            <Ionicons
              name={item.extension === '.csv' ? 'grid-outline' : 'document-text-outline'}
              size={18}
              color="#a8a29e"
            />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.fileMeta}>
                {item.mtime ? formatRelativeTime(item.mtime) : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#44403c" />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="archive-outline" size={48} color="#44403c" />
            <Text style={styles.emptyTitle}>Your mind is empty</Text>
            <Text style={styles.emptyText}>
              Start writing on desktop, and it will show up here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') result.push(node);
    if (node.children) result.push(...flattenFiles(node.children));
  }
  return result;
}

function formatRelativeTime(mtimeMs: number): string {
  const diff = Date.now() - mtimeMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(mtimeMs).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1917' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusText: { fontSize: 13, color: '#a8a29e' },
  section: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fafaf9' },
  spacesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  spaceCard: {
    backgroundColor: '#292524',
    borderRadius: 12,
    padding: 16,
    minWidth: 140,
    gap: 6,
    borderWidth: 1,
    borderColor: '#44403c',
  },
  spaceName: { fontSize: 15, fontWeight: '600', color: '#fafaf9' },
  spaceCount: { fontSize: 12, color: '#78716c' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#292524',
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, color: '#fafaf9' },
  fileMeta: { fontSize: 12, color: '#78716c', marginTop: 2 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#a8a29e' },
  emptyText: { fontSize: 14, color: '#78716c', textAlign: 'center', paddingHorizontal: 40 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#fafaf9' },
  errorText: { fontSize: 14, color: '#a8a29e', textAlign: 'center' },
  retryButton: {
    backgroundColor: '#c8873a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
