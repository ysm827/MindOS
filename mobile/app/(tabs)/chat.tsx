/**
 * Chat tab — AI conversation with persistence, retry, and confirmation.
 */
import { useCallback, useRef, useState } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChat } from '@/hooks/useChat';
import ChatInput from '@/components/ChatInput';
import MessageBubble from '@/components/MessageBubble';
import FileAttachmentPicker from '@/components/FileAttachmentPicker';
import type { AskMode } from '@/lib/types';

export default function ChatScreen() {
  const [mode, setMode] = useState<AskMode>('chat');
  const listRef = useRef<FlatList>(null);
  const [inputText, setInputText] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>([]);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const layoutHeightRef = useRef(0);

  const {
    messages, isStreaming, error, lastFailedMessage,
    loaded, send, retry, cancel, newChat,
  } = useChat({ mode });

  const handleSend = useCallback((message: string) => {
    const started = send(message, selectedAttachments);
    if (started) {
      setSelectedAttachments([]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [send, selectedAttachments]);

  const handleNewChat = useCallback(() => {
    if (messages.length === 0) return;
    Alert.alert(
      'New Chat',
      'Start a new conversation? Current messages will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New Chat',
          style: 'destructive',
          onPress: () => {
            newChat();
            setInputText('');
            setSelectedAttachments([]);
          },
        },
      ],
    );
  }, [messages.length, newChat]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    contentHeightRef.current = contentSize.height;
    layoutHeightRef.current = layoutMeasurement.height;
    const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setShowScrollBtn(distFromBottom > 150);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Don't render until storage is loaded
  if (!loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <ActivityIndicator color="#c8873a" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  // --- Empty state ---
  if (!messages.length && !isStreaming && !error) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.emptyCenter}>
            <Text style={styles.emptyIcon}>◆</Text>
            <Text style={styles.emptyTitle}>Ask MindOS</Text>
            <Text style={styles.emptySubtitle}>
              Ask anything about your knowledge base
            </Text>

            <View style={styles.suggestionsBox}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={styles.suggestionChip}
                  onPress={() => setInputText(s)}
                >
                  <Text style={styles.suggestionText} numberOfLines={1}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={handleSend}
            onCancel={cancel}
            mode={mode}
            onModeChange={setMode}
            canSend={!isStreaming}
            attachedPaths={selectedAttachments}
            onOpenAttachmentPicker={() => setShowAttachmentPicker(true)}
            onRemoveAttachment={(path) => setSelectedAttachments((prev) => prev.filter((p) => p !== path))}
          />
        </KeyboardAvoidingView>

        <FileAttachmentPicker
          visible={showAttachmentPicker}
          selectedPaths={selectedAttachments}
          onChangeSelectedPaths={setSelectedAttachments}
          onClose={() => setShowAttachmentPicker(false)}
        />
      </SafeAreaView>
    );
  }

  // --- Conversation view ---
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.chatHeader}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>
            {messages.length > 0 ? truncate(messages[0].content, 30) : 'New Chat'}
          </Text>
          <Pressable onPress={handleNewChat} style={styles.newChatBtn} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={22} color="#c8873a" />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          keyboardDismissMode="on-drag"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            // Auto-scroll only if user was near bottom
            const distFromBottom = contentHeightRef.current - scrollOffsetRef.current - layoutHeightRef.current;
            if (distFromBottom < 150 || isStreaming) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          ListFooterComponent={
            <>
              {isStreaming && !messages[messages.length - 1]?.content && (
                <View style={styles.thinkingBox}>
                  <ActivityIndicator color="#c8873a" size="small" />
                  <Text style={styles.thinkingText}>Thinking...</Text>
                </View>
              )}
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="warning-outline" size={14} color="#fca5a5" />
                  <Text style={styles.errorText}>{error}</Text>
                  {lastFailedMessage ? (
                    <Pressable onPress={retry} style={styles.retryBtn} hitSlop={8}>
                      <Ionicons name="refresh-outline" size={14} color="#c8873a" />
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </>
          }
        />

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <Pressable
            style={({ pressed }) => [styles.scrollBtn, pressed && styles.scrollBtnPressed]}
            onPress={scrollToBottom}
          >
            <Ionicons name="chevron-down" size={18} color="#fafaf9" />
          </Pressable>
        )}

        <ChatInput
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onCancel={cancel}
          isLoading={isStreaming}
          mode={mode}
          onModeChange={setMode}
          canSend={!isStreaming}
          attachedPaths={selectedAttachments}
          onOpenAttachmentPicker={() => setShowAttachmentPicker(true)}
          onRemoveAttachment={(path) => setSelectedAttachments((prev) => prev.filter((p) => p !== path))}
        />

      </KeyboardAvoidingView>

      <FileAttachmentPicker
        visible={showAttachmentPicker}
        selectedPaths={selectedAttachments}
        onChangeSelectedPaths={setSelectedAttachments}
        onClose={() => setShowAttachmentPicker(false)}
      />
    </SafeAreaView>
  );
}

const SUGGESTIONS = [
  'Summarize my recent notes',
  'What did I write about this week?',
  'Find my TODO items',
  'Help me brainstorm',
];

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1917' },
  flex: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#292524',
  },
  chatHeaderTitle: { fontSize: 15, fontWeight: '600', color: '#d6d3d1', flex: 1 },
  newChatBtn: { padding: 4 },
  messageList: { paddingVertical: 8 },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 32, color: '#c8873a', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fafaf9' },
  emptySubtitle: { fontSize: 14, color: '#a8a29e', textAlign: 'center' },
  suggestionsBox: { marginTop: 24, gap: 8, width: '100%' },
  suggestionChip: {
    backgroundColor: '#292524',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#44403c',
  },
  suggestionText: { fontSize: 14, color: '#d6d3d1' },
  thinkingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(200, 135, 58, 0.08)',
    borderRadius: 8,
  },
  thinkingText: { fontSize: 12, color: '#c8873a' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  errorText: { fontSize: 12, color: '#fca5a5', flex: 1 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(200, 135, 58, 0.15)',
  },
  retryText: { fontSize: 12, color: '#c8873a', fontWeight: '600' },
  scrollBtn: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#44403c',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  scrollBtnPressed: {
    opacity: 0.7,
  },
});
