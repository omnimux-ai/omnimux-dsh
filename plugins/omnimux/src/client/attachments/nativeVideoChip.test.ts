import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { insertNativeVideoChip } from './nativeVideoChip.ts';

describe('nativeVideoChip insertion and caret position', () => {
  it('inserts chip and trailing spacer via selection.insertNodes to keep caret at tail', () => {
    let insertedNodes: any[] = [];
    let editorFocused = false;

    class MockChipNode {
      config: any;
      constructor(config: any) {
        this.config = config;
      }
    }

    class MockTextNode {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
      selectEnd() {}
    }

    const mockSelection = {
      insertNodes(nodes: any[]) {
        insertedNodes = nodes;
      },
    };

    const mockLexicalEditor = {
      _nodes: new Map([
        ['reference-chip', { klass: MockChipNode }],
        ['text', { klass: MockTextNode }],
      ]),
      _editorState: {
        _selection: mockSelection,
        _nodeMap: new Map(),
      },
      update(fn: () => void) {
        fn();
      },
      getRootElement() {
        return {
          focus() {
            editorFocused = true;
          },
        };
      },
    };

    // Mock DOM environment
    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel.includes('contenteditable')) {
          return {
            focus() {},
            __lexicalEditor_test: mockLexicalEditor,
          };
        }
        return null;
      },
      execCommand() {
        return true;
      },
    };

    const testUrl = 'https://www.tiktok.com/@creator/video/123456789';
    const result = insertNativeVideoChip(testUrl);

    assert.equal(result, true);
    assert.equal(insertedNodes.length, 2, 'Should insert both chip and trailing spacer');
    assert.ok(insertedNodes[0] instanceof MockChipNode);
    assert.equal(insertedNodes[0].config.source, 'link');
    assert.equal(insertedNodes[0].config.ref, testUrl);
    assert.equal(insertedNodes[0].config.label, 'TikTok');
    assert.ok(insertedNodes[1] instanceof MockTextNode);
    assert.equal(insertedNodes[1].text, ' ');
    assert.equal(editorFocused, true);
  });

  it('falls back to append and selects spacer end when selection is null', () => {
    let selectEndCalled = false;
    let appendedNodes: any[] = [];

    class MockChipNode {
      config: any;
      constructor(config: any) {
        this.config = config;
      }
    }

    class MockTextNode {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
      selectEnd() {
        selectEndCalled = true;
      }
    }

    const mockTargetBlock = {
      getWritable() {
        return this;
      },
      append(node: any) {
        appendedNodes.push(node);
      },
    };

    const mockRoot = {
      getWritable() {
        return this;
      },
      getLastChild() {
        return mockTargetBlock;
      },
      getFirstChild() {
        return mockTargetBlock;
      },
    };

    const mockNodeMap = new Map([['root', mockRoot]]);

    const mockLexicalEditor = {
      _nodes: new Map([
        ['reference-chip', { klass: MockChipNode }],
        ['text', { klass: MockTextNode }],
      ]),
      _editorState: {
        _selection: null, // No active selection
        _nodeMap: mockNodeMap,
      },
      update(fn: () => void) {
        fn();
      },
    };

    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel.includes('contenteditable')) {
          return {
            focus() {},
            __lexicalEditor_test: mockLexicalEditor,
          };
        }
        return null;
      },
    };

    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const result = insertNativeVideoChip(testUrl);

    assert.equal(result, true);
    assert.equal(appendedNodes.length, 2);
    assert.ok(appendedNodes[0] instanceof MockChipNode);
    assert.equal(appendedNodes[0].config.label, 'YouTube');
    assert.ok(appendedNodes[1] instanceof MockTextNode);
    assert.equal(appendedNodes[1].text, ' ');
    assert.equal(selectEndCalled, true, 'selectEnd must be called on trailing spacer to position caret');
  });
});
