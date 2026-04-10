/**
 * Search tab — full-text search across knowledge base.
 */
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mindosClient } from '@/lib/api-client';
import type { SearchResult } from '@/lib/types';

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await mindosClient.search(q);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#78716c" />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search your knowledge base..."
          placeholderTextColor="#78716c"
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
            <Ionicons name="close-circle" size={18} color="#78716c" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#c8873a" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <Pressable
              style={styles.resultRow}
              onPress={() => router.push(`/view/${item.path}` as any)}
            >
              <Text style={styles.resultPath} numberOfLines={1}>{item.path}</Text>
              <Text style={styles.resultSnippet} numberOfLines={2}>{item.snippet}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            searched ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No results found</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color="#44403c" />
                <Text style={styles.emptyText}>Search across all your notes</Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1917' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#292524',
    borderRadius: 10,
    margin: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#fafaf9' },
  resultRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#292524',
  },
  resultPath: { fontSize: 13, color: '#c8873a', marginBottom: 4 },
  resultSnippet: { fontSize: 14, color: '#d6d3d1', lineHeight: 20 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#78716c' },
});
