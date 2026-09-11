import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createLinkTriggerSource,
  registerLinkTriggerSource,
} from './linkTriggerSource.ts';

describe('linkTriggerSource', () => {
  it('creates valid link trigger source matching DSH reference codec contract', async () => {
    const source = createLinkTriggerSource();
    assert.equal(source.name, 'link');
    assert.equal(source.trigger, '');
    assert.equal(typeof source.candidates, 'function');
    assert.equal(typeof source.codec, 'object');
    assert.equal(typeof source.codec.serialize, 'function');
    assert.equal(typeof source.codec.clipboardText, 'function');

    // Candidates returns empty array without triggering completion menu
    const candidates = await source.candidates();
    assert.deepEqual(candidates, []);

    // Serializer converts ref to promise of url string for prompt assembly
    const testUrl = 'https://www.tiktok.com/@creator/video/789101112';
    const serialized = await source.codec.serialize(testUrl);
    assert.equal(serialized, testUrl);

    // Clipboard fallback returns ref
    const copied = source.codec.clipboardText(testUrl);
    assert.equal(copied, testUrl);
  });

  it('registers source immediately when inputTriggers is available on ctx.get', () => {
    let registeredSource: any = null;
    let unregistered = false;
    let effectInstalled = false;

    const mockInputTriggers = {
      live: { sources: [] },
      registerSource(src: any) {
        registeredSource = src;
        mockInputTriggers.live.sources.push(src);
        return () => {
          unregistered = true;
        };
      },
    };

    const mockCtx = {
      get(name: string) {
        if (name === 'inputTriggers') return mockInputTriggers;
        return undefined;
      },
      effect(fn: () => () => void, label: string) {
        effectInstalled = true;
        assert.match(label, /link trigger source/);
        const disposer = fn();
        if (typeof disposer === 'function') {
          disposer();
        }
      },
    };

    registerLinkTriggerSource(mockCtx);

    assert.ok(registeredSource, 'Source should be registered');
    assert.equal(registeredSource.name, 'link');
    assert.equal(effectInstalled, true, 'Effect should be installed');
    assert.equal(unregistered, true, 'Disposer returned by effect was called in test fixture');
  });

  it('registers source via ctx.inject when inputTriggers is loaded asynchronously', () => {
    let registeredSource: any = null;
    let injectCallback: ((inner: any) => void) | null = null;
    let effectRan = false;

    const mockInputTriggers = {
      live: { sources: [] },
      registerSource(src: any) {
        registeredSource = src;
        mockInputTriggers.live.sources.push(src);
        return () => {};
      },
    };

    const mockCtx = {
      get() {
        return undefined;
      },
      inject(services: string[], cb: (inner: any) => void) {
        assert.deepEqual(services, ['inputTriggers']);
        injectCallback = cb;
      },
    };

    registerLinkTriggerSource(mockCtx);
    assert.equal(registeredSource, null, 'Not yet registered before inject fires');

    assert.ok(injectCallback, 'injectCallback must be recorded');
    injectCallback({
      inputTriggers: mockInputTriggers,
      effect(fn: () => void) {
        effectRan = true;
        fn();
      },
    });

    assert.ok(registeredSource, 'Source should be registered after inject');
    assert.equal(registeredSource.name, 'link');
    assert.equal(effectRan, true);
  });

  it('is idempotent and skips registration when source link is already registered', () => {
    let callCount = 0;
    const existingSource = { name: 'link', trigger: '' };
    const mockInputTriggers = {
      live: { sources: [existingSource] },
      registerSource() {
        callCount++;
        return () => {};
      },
    };

    const mockCtx = {
      get(name: string) {
        if (name === 'inputTriggers') return mockInputTriggers;
        return undefined;
      },
      effect: () => {},
    };

    registerLinkTriggerSource(mockCtx);
    assert.equal(callCount, 0, 'Should not register if link source already exists');
  });

  it('safely handles missing or null context without throwing', () => {
    assert.doesNotThrow(() => registerLinkTriggerSource(null));
    assert.doesNotThrow(() => registerLinkTriggerSource(undefined));
    assert.doesNotThrow(() => registerLinkTriggerSource({}));
  });
});
