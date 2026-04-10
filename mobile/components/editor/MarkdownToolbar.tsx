/**
 * MarkdownToolbar — Keyboard-top toolbar for quick Markdown formatting.
 */
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { TOOLBAR_ACTIONS, TOOLBAR_ORDER } from './markdown-actions';
import type { ToolbarAction } from './markdown-actions';

interface MarkdownToolbarProps {
  onAction: (action: ToolbarAction) => void;
  disabled?: boolean;
}

export default function MarkdownToolbar({ onAction, disabled }: MarkdownToolbarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.container}
      style={styles.scroll}
    >
      {TOOLBAR_ORDER.map((action) => {
        const config = TOOLBAR_ACTIONS[action];
        return (
          <Pressable
            key={action}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              disabled && styles.buttonDisabled,
            ]}
            onPress={() => onAction(action)}
            disabled={disabled}
          >
            <Text style={[styles.buttonText, disabled && styles.textDisabled]}>
              {config.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: '#292524',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#44403c',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1a1917',
    minWidth: 36,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: '#44403c',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d6d3d1',
    fontFamily: 'monospace',
  },
  textDisabled: {
    color: '#78716c',
  },
});
