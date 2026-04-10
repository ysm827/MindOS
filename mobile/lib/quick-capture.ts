/**
 * Quick Capture - Append text to daily inbox file without creating a new editor session
 */

export interface QuickCaptureOptions {
  basePath?: string;
}

/**
 * Build today's inbox file path: inbox/YYYY-MM-DD.md
 */
export function buildInboxPath(basePath = 'inbox'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  return `${basePath}/${dateStr}.md`;
}

/**
 * Format capture content for inbox: add timestamp prefix and section marker
 */
export function formatCaptureContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

  // Format: [HH:MM] text
  return `[${timeStr}] ${trimmed}`;
}

/**
 * Append capture to inbox file content
 * - If file is empty or doesn't exist yet, create structure
 * - Otherwise append to end with newline
 */
export function appendCaptureToContent(existingContent: string, captureText: string): string {
  if (!captureText.trim()) return existingContent;

  const formatted = formatCaptureContent(captureText);

  // If existing content is empty, create header + content
  if (!existingContent.trim()) {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `# Inbox - ${today}\n\n${formatted}\n`;
  }

  // Otherwise append with newline separator
  const trimmed = existingContent.replace(/\n+$/, '');
  return `${trimmed}\n${formatted}\n`;
}

/**
 * Validate capture input: not empty, not just whitespace
 */
export function isValidCapture(text: string): boolean {
  return text.trim().length > 0;
}
