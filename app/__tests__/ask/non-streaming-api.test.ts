import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for non-streaming API fallback.
 * Verifies that messages are correctly converted from pi-ai format to OpenAI format.
 */

describe('Non-streaming API message conversion', () => {
  // Helper function that replicates the one in route.ts
  function piMessagesToOpenAI(piMessages: any[]): any[] {
    return piMessages.map(msg => {
      const role = msg.role;

      if (role === 'system') return null;

      if (role === 'user') {
        return {
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        };
      }

      if (role === 'assistant') {
        const content = msg.content;
        let textContent = '';
        const toolCalls: any[] = [];

        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              textContent += part.text;
            } else if (part.type === 'toolCall') {
              toolCalls.push({
                id: part.id ?? `call_${Date.now()}`,
                type: 'function',
                function: {
                  name: part.name ?? 'unknown',
                  arguments: JSON.stringify(part.arguments ?? {}),
                },
              });
            }
          }
        }

        const result: any = { role: 'assistant' };
        if (textContent) result.content = textContent;
        if (toolCalls.length > 0) result.tool_calls = toolCalls;
        if (!textContent && toolCalls.length === 0) result.content = '';
        return result;
      }

      if (role === 'toolResult') {
        const contentText = Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text ?? '')
              .join('\n')
          : String(msg.content ?? '');

        return {
          role: 'tool',
          tool_call_id: msg.toolCallId ?? 'unknown',
          content: contentText,
        };
      }

      return null;
    }).filter(Boolean);
  }

  it('converts plain user message', () => {
    const piMessages = [
      {
        role: 'user',
        content: 'Hello, world!',
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages).toEqual([
      {
        role: 'user',
        content: 'Hello, world!',
      },
    ]);
  });

  it('converts assistant text-only message', () => {
    const piMessages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'This is a response' },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages).toEqual([
      {
        role: 'assistant',
        content: 'This is a response',
      },
    ]);
  });

  it('converts assistant message with tool calls', () => {
    const piMessages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will help with that' },
          { 
            type: 'toolCall',
            id: 'call_123',
            name: 'read_file',
            arguments: { path: '/tmp/test.txt' },
          },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    const msg = openaiMessages[0];
    
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('I will help with that');
    expect(msg.tool_calls).toBeDefined();
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls[0]).toMatchObject({
      id: 'call_123',
      type: 'function',
      function: {
        name: 'read_file',
        arguments: '{"path":"/tmp/test.txt"}',
      },
    });
  });

  it('converts tool result message', () => {
    const piMessages = [
      {
        role: 'toolResult',
        toolCallId: 'call_123',
        content: [
          { type: 'text', text: 'File contents here' },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages).toEqual([
      {
        role: 'tool',
        tool_call_id: 'call_123',
        content: 'File contents here',
      },
    ]);
  });

  it('skips system messages', () => {
    const piMessages = [
      {
        role: 'system',
        content: 'You are a helpful assistant',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages).toHaveLength(1);
    expect(openaiMessages[0].role).toBe('user');
  });

  it('handles multiple tool calls in one message', () => {
    const piMessages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: 'tool_a',
            arguments: { x: 1 },
          },
          {
            type: 'toolCall',
            id: 'call_2',
            name: 'tool_b',
            arguments: { y: 2 },
          },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    const msg = openaiMessages[0];
    
    expect(msg.tool_calls).toHaveLength(2);
    expect(msg.tool_calls[0].id).toBe('call_1');
    expect(msg.tool_calls[1].id).toBe('call_2');
  });

  it('handles multipart tool result with multiple text sections', () => {
    const piMessages = [
      {
        role: 'toolResult',
        toolCallId: 'call_123',
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages[0].content).toBe('Line 1\nLine 2');
  });

  it('handles empty assistant message with no text or tool calls', () => {
    const piMessages = [
      {
        role: 'assistant',
        content: [],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages[0]).toEqual({
      role: 'assistant',
      content: '',
    });
  });

  it('handles complex conversation history', () => {
    const piMessages = [
      {
        role: 'user',
        content: 'What files are in /home?',
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check that for you' },
          {
            type: 'toolCall',
            id: 'call_1',
            name: 'list_files',
            arguments: { path: '/home' },
          },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        content: [
          { type: 'text', text: 'user1\nuser2\nuser3' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I found 3 users in /home' },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    expect(openaiMessages).toHaveLength(4);
    
    // Verify conversation flow
    expect(openaiMessages[0]).toMatchObject({ role: 'user', content: 'What files are in /home?' });
    expect(openaiMessages[1].role).toBe('assistant');
    expect(openaiMessages[1].tool_calls).toBeDefined();
    expect(openaiMessages[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect(openaiMessages[3]).toMatchObject({ role: 'assistant', content: 'I found 3 users in /home' });
  });

  it('handles assistant message with only tool calls (no text)', () => {
    const piMessages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call_1',
            name: 'search',
            arguments: { query: 'test' },
          },
        ],
      },
    ];

    const openaiMessages = piMessagesToOpenAI(piMessages);
    const msg = openaiMessages[0];
    
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBeUndefined();
    expect(msg.tool_calls).toBeDefined();
    expect(msg.tool_calls).toHaveLength(1);
  });
});
