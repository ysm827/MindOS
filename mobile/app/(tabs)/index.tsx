/**
 * Home tab — Spaces overview + recently active files + Quick Capture.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mindosClient } from '@/lib/api-client';
import { useConnectionStore } from '@/lib/connection-store';
import { buildInboxPath, appendCaptureToContent, isValidCapture } from '@/lib/quick-capture';
import type { FileNode } from '@/lib/types';

export default function HomeScreen() {
  const router = useRouter();
  const { serverVersion, hostname } = useConnectionStore();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Quick capture state
  const [captureMode, setCaptureMode] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [captureSuccess, setCaptureSuccess] = useState(false);

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

  const handleCaptureSubmit = useCallback(async () => {
    if (!isValidCapture(captureText)) return;

    setCaptureError('');
    setCaptureSaving(true);

    try {
      const inboxPath = buildInboxPath();

      // Check if inbox file exists and read it
      let existingContent = '';
      const exists = await mindosClient.fileExists(inboxPath);
      if (exists) {
        try {
          const { content } = await mindosClient.getFileContent(inboxPath);
          existingContent = content;
        } catch (e) {
          console.warn('Failed to read inbox:', (e as Error).message);
        }
      }

      // Append capture to content
      const newContent = appendCaptureToContent(existingContent, captureText);

      // Save file
      await mindosClient.saveFile(inboxPath, newContent);

      // Success: clear input and show brief success message
      setCaptureText('');
      setCaptureSuccess(true);
      setTimeout(() => setCaptureSuccess(false), 2000);

      // Refresh home to show updated inbox in recent files
      await loadData();
    } catch (e) {
      setCaptureError((e as Error).message);
    } finally {
      setCaptureSaving(false);
    }
  }, [captureText, loadData]);

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

            {/* Quick Capture Card */}
            {!captureSuccess ? (
              <View style={styles.captureCard}>
                {!captureMode ? (
                  <>
                    <Text style={styles.captureTitle}>Quick Capture</Text>
                    <Text style={styles.captureSubtitle}>Capture a thought before it escapes</Text>
                    <Pressable
                      style={styles.captureStartBtn}
                      onPress={() => setCaptureMode(true)}
                    >
                      <Text style={styles.captureStartText}>Start writing</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.captureLabel}>Save to: {buildInboxPath()}</Text>
                    <TextInput
                      style={styles.captureInput}
                      value={captureText}
                      onChangeText={setCaptureText}
                      placeholder="I need to remember to..."
                      placeholderTextColor="#78716c"
                      multiline
                      maxLength={1000}
                      editable={!captureSaving}
                    />
                    {captureError ? (
                      <Text style={styles.captureErrorText}>{captureError}</Text>
                    ) : null}
                    <View style={styles.captureActions}>
                      <Pressable
                        style={styles.captureCancelBtn}
                        onPress={() => { setCaptureMode(false); setCaptureText(''); setCaptureError(''); }}
                        disabled={captureSaving}
                      >
                        <Text style={styles.captureCancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.captureSaveBtn, (!isValidCapture(captureText) || captureSaving) && styles.captureSaveBtnDisabled]}
                        onPress={handleCaptureSubmit}
                        disabled={!isValidCapture(captureText) || captureSaving}
                      >
                        {captureSaving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.captureSaveText}>Save to Inbox</Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.captureSuccessCard}>
                <View style={styles.successContent}>
                  <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                  <View style={styles.successText}>
                    <Text style={styles.successTitle}>Saved to {buildInboxPath()}</Text>
                    <Text style={styles.successSubtitle}>Your note was added to today's inbox</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.successWriteMoreBtn}
                  onPress={() => setCaptureMode(true)}
                >
                  <Text style={styles.successWriteMoreText}>Write more</Text>
                </Pressable>
              </View>
            )}

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
              Create your first note or start writing on desktop.
            </Text>
            <Pressable
              style={styles.createBtn}
              onPress={() => router.push('/(tabs)/files' as any)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Create a Note</Text>
            </Pressable>
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
  captureCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#292524',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#44403c',
    gap: 10,
  },
  captureTitle: { fontSize: 16, fontWeight: '600', color: '#fafaf9' },
  captureSubtitle: { fontSize: 13, color: '#a8a29e' },
  captureStartBtn: {
    backgroundColor: '#c8873a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  captureStartText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  captureLabel: { fontSize: 12, color: '#78716c', fontWeight: '500' },
  captureInput: {
    backgroundColor: '#1a1917',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#d6d3d1',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captureErrorText: { fontSize: 12, color: '#fca5a5' },
  captureActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  captureCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  captureCancelText: { fontSize: 13, color: '#a8a29e', fontWeight: '500' },
  captureSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#c8873a',
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureSaveBtnDisabled: { opacity: 0.4 },
  captureSaveText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  captureSuccessCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    gap: 10,
  },
  successContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  successText: { flex: 1 },
  successTitle: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  successSubtitle: { fontSize: 12, color: '#86efac', marginTop: 2 },
  successWriteMoreBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    alignSelf: 'flex-start',
  },
  successWriteMoreText: { color: '#22c55e', fontWeight: '600', fontSize: 12 },
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
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#c8873a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
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
