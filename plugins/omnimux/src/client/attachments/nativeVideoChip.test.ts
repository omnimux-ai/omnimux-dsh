import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { insertNativeVideoChip } from './nativeVideoChip.ts';

describe('nativeVideoChip insertion without trailing space', () => {
  it('inserts chip directly via selection.insertNodes without trailing spacer space', () => {
    let insertedNodes: any[] = [];
    let editorFocused = false;

    class MockChipNode {
      config: any;
      constructor(config: any) {
        this.config = config;
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
    assert.equal(insertedNodes.length, 1, 'Should insert only chip, without trailing spacer space');
    assert.ok(insertedNodes[0] instanceof MockChipNode);
    assert.equal(insertedNodes[0].config.source, 'link');
    assert.equal(insertedNodes[0].config.ref, testUrl);
    assert.equal(insertedNodes[0].config.label, 'TikTok');
    assert.equal(editorFocused, true);
  });

  it('falls back to append and calls selectEnd on chip when selection is null', () => {
    let selectEndCalled = false;
    let appendedNodes: any[] = [];

    class MockChipNode {
      config: any;
      constructor(config: any) {
        this.config = config;
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
    assert.equal(appendedNodes.length, 1, 'Should append only chip without extra space node');
    assert.ok(appendedNodes[0] instanceof MockChipNode);
    assert.equal(appendedNodes[0].config.label, 'YouTube');
    assert.equal(selectEndCalled, true, 'selectEnd must be called on chip to position caret');
  });

  it('insertFallbackText does not append trailing space', () => {
    let insertedText = '';
    (globalThis as any).document = {
      querySelector(sel: string) {
        if (sel.includes('contenteditable')) {
          return {
            focus() {},
            // No lexicalEditor instance to trigger fallback text insertion
          };
        }
        return null;
      },
      execCommand(_cmd: string, _ui: boolean, text: string) {
        insertedText = text;
        return true;
      },
    };

    const testUrl = 'https://www.tiktok.com/@test/video/999';
    const result = insertNativeVideoChip(testUrl);
    assert.equal(result, true);
    assert.equal(insertedText, '[视频](https://www.tiktok.com/@test/video/999)');
    assert.doesNotMatch(insertedText, /\s$/);
  });
});
