/**
 * File/directory view — renders Markdown preview, directory listing, or Markdown editor.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  Alert,
  Share,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { mindosClient } from '@/lib/api-client';
import MarkdownEditor from '@/components/editor/MarkdownEditor';
import CSVTable from '@/components/CSVTable';
import type { FileNode } from '@/lib/types';

export default function ViewScreen() {
  const { path: pathSegments } = useLocalSearchParams<{ path: string[] }>();
  const filePath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments ?? '';
  const fileName = filePath.split('/').pop() || filePath;
  const isMarkdown = fileName.endsWith('.md');
  const router = useRouter();

  const [content, setContent] = useState('');
  const [mtime, setMtime] = useState<number | undefined>();
  const [children, setChildren] = useState<FileNode[]>([]);
  const [isDir, setIsDir] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const dirtyRef = useRef(false);

  const handleExitEditor = useCallback(() => {
    if (dirtyRef.current) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => { dirtyRef.current = false; setEditing(false); } },
        ],
      );
    } else {
      setEditing(false);
    }
  }, []);

  const requestIdRef = useRef(0);

  const loadContent = () => {
    const currentId = ++requestIdRef.current;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await mindosClient.getFileContent(filePath, controller.signal);
        if (currentId !== requestIdRef.current) return;
        setContent(data.content);
        setMtime(data.mtime);
        setIsDir(false);
      } catch {
        if (currentId !== requestIdRef.current) return;
        try {
          const tree = await mindosClient.getFileTree();
          if (currentId !== requestIdRef.current) return;
          const node = findNode(tree, filePath);
          if (node?.children) {
            // Sort: directories first, then alphabetically
            const sorted = [...node.children].sort((a, b) => {
              if (a.type === 'directory' && b.type !== 'directory') return -1;
              if (a.type !== 'directory' && b.type === 'directory') return 1;
              return a.name.localeCompare(b.name);
            });
            setChildren(sorted);
            setIsDir(true);
          } else {
            setError('File not found');
          }
        } catch (e) {
          if (currentId !== requestIdRef.current) return;
          setError((e as Error).message);
        }
      } finally {
        if (currentId === requestIdRef.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  };

  useEffect(() => {
    const cleanup = loadContent();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // --- Loading ---
  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: fileName }} />
        <ActivityIndicator color="#c8873a" style={{ marginTop: 40 }} />
      </View>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: fileName }} />
        <View style={styles.errorCenter}>
          <Ionicons name="alert-circle-outline" size={48} color="#78716c" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // --- Directory listing ---
  if (isDir) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: fileName }} />
        <FlatList
          data={children}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/view/${item.path}` as any)}
            >
              <Ionicons
                name={item.type === 'directory'
                  ? (item.isSpace ? 'layers-outline' : 'folder-outline')
                  : 'document-text-outline'}
                size={20}
                color={item.isSpace ? '#c8873a' : '#a8a29e'}
              />
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              {item.type === 'directory' && (
                <Ionicons name="chevron-forward" size={16} color="#44403c" />
              )}
            </Pressable>
          )}
        />
      </View>
    );
  }

  // --- Markdown editor mode ---
  if (editing && isMarkdown) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: fileName,
            headerLeft: () => (
              <Pressable onPress={handleExitEditor} style={styles.headerBtn}>
                <Ionicons name="close" size={22} color="#fafaf9" />
              </Pressable>
            ),
          }}
        />
        <MarkdownEditor
          filePath={filePath}
          initialContent={content}
          initialMtime={mtime}
          onDirtyChange={(d) => { dirtyRef.current = d; }}
          onSaved={() => {
            dirtyRef.current = false;
            setEditing(false);
            loadContent();
          }}
        />
      </View>
    );
  }

  // --- Markdown preview (default) ---
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: fileName,
          headerRight: () => (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => Share.share({ message: content, title: fileName })} style={styles.headerBtn}>
                    <Ionicons name="share-outline" size={20} color="#a8a29e" />
                  </Pressable>
                  {isMarkdown && (
                    <Pressable onPress={() => setEditing(true)} style={styles.headerBtn}>
                      <Ionicons name="create-outline" size={22} color="#c8873a" />
                    </Pressable>
                  )}
                </View>
              ),
        }}
      />
      {fileName.endsWith('.csv') || fileName.endsWith('.tsv') ? (
        <CSVTable content={content} delimiter={fileName.endsWith('.tsv') ? '\t' : ','} />
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Markdown style={markdownStyles}>{content}</Markdown>
        </ScrollView>
      )}
    </View>
  );
}

function findNode(tree: FileNode[], targetPath: string): FileNode | null {
  for (const node of tree) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1917' },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#292524',
  },
  rowName: { flex: 1, fontSize: 15, color: '#fafaf9' },
  errorCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  errorText: { fontSize: 15, color: '#a8a29e', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#292524',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fafaf9', fontWeight: '500' },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

const markdownStyles = {
  body: { color: '#d6d3d1', fontSize: 15, lineHeight: 24 },
  heading1: { color: '#fafaf9', fontSize: 24, fontWeight: '700' as const, marginTop: 24, marginBottom: 8 },
  heading2: { color: '#fafaf9', fontSize: 20, fontWeight: '700' as const, marginTop: 20, marginBottom: 8 },
  heading3: { color: '#fafaf9', fontSize: 17, fontWeight: '600' as const, marginTop: 16, marginBottom: 6 },
  strong: { color: '#fafaf9', fontWeight: '600' as const },
  em: { fontStyle: 'italic' as const },
  link: { color: '#c8873a' },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#c8873a',
    paddingLeft: 12,
    marginLeft: 0,
    opacity: 0.8,
  },
  code_inline: {
    backgroundColor: '#292524',
    color: '#fbbf24',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  code_block: {
    backgroundColor: '#292524',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#d6d3d1',
  },
  fence: {
    backgroundColor: '#292524',
    padding: 12,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#d6d3d1',
  },
  list_item: { marginBottom: 4 },
  bullet_list: { marginLeft: 8 },
  ordered_list: { marginLeft: 8 },
  hr: { borderColor: '#44403c', marginVertical: 16 },
  table: { borderColor: '#44403c' },
  thead: { backgroundColor: '#292524' },
  th: { color: '#fafaf9', fontWeight: '600' as const, padding: 8 },
  td: { color: '#d6d3d1', padding: 8, borderColor: '#44403c' },
};
