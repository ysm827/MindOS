/**
 * Obsidian Plugin Compatibility - UI shims
 * Minimal Notice and Modal implementations for plugin compatibility.
 */

import { Component } from '../component';
import type { App } from '../types';

export class Notice {
  message: string;
  timeout?: number;

  constructor(message: string, timeout?: number) {
    this.message = message;
    this.timeout = timeout;
  }
}

function createElement(tagName: string): HTMLElement {
  if (typeof document !== 'undefined') {
    return document.createElement(tagName);
  }

  return {
    innerHTML: '',
    textContent: '',
    appendChild: () => null,
    remove: () => {},
  } as unknown as HTMLElement;
}

export class Modal extends Component {
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  isOpen = false;

  constructor(app: App) {
    super();
    this.app = app;
    this.containerEl = createElement('div');
    this.contentEl = createElement('div');
    this.titleEl = createElement('div');
  }

  open(): void {
    this.isOpen = true;
    this.onOpen();
  }

  close(): void {
    this.isOpen = false;
    this.onClose();
  }

  onOpen(): void {}

  onClose(): void {}

  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  setContent(content: string | HTMLElement): void {
    if (typeof content === 'string') {
      this.contentEl.textContent = content;
      return;
    }

    this.contentEl.appendChild(content);
  }
}
