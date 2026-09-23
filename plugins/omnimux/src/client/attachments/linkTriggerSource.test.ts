import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createLinkTriggerSource,
  registerLinkTriggerSource,
  type LinkTriggerSource,
} from './linkTriggerSource.ts';

const NAMES = ['link', 'omnimux-video-link', 'omnimux-product-link'];
const URL = 'https://www.tiktok.com/@creator/video/789101112?tag=sample#clip';
type Dispose = () => void;
type SourceService = ReturnType<typeof createService>;

/** Enforce the public trigger and unique-name rules instead of accepting invalid fixtures. */
function createService(existing: LinkTriggerSource[] = [], failName?: string) {
  const sources = [...existing];
  const registered: string[] = [];
  const disposed: string[] = [];
  return {
    live: { sources }, registered, disposed,
    registerSource(source: LinkTriggerSource): Dispose {
      assert.ok(source.trigger === '@' || source.trigger === '/');
      assert.equal(sources.some(item => item.name === source.name), false);
      if (source.name === failName) throw new Error(`registration refused: ${source.name}`);
      sources.push(source);
      registered.push(source.name);
      let active = true;
      return () => {
        assert.equal(active, true, 'registration disposer must run only once');
        active = false;
        sources.splice(sources.indexOf(source), 1);
        disposed.push(source.name);
      };
    },
  };
}

function createContext(service?: SourceService) {
  const effects: Dispose[] = [];
  let injected: ((inner: unknown) => void) | undefined;
  const effect = (factory: () => Dispose) => { effects.push(factory()); };
  return {
    effects,
    ctx: {
      get: (name: string) => name === 'inputTriggers' ? service : undefined,
      effect,
      inject(names: string[], callback: (inner: unknown) => void) {
        assert.deepEqual(names, ['inputTriggers']);
        injected = callback;
      },
    },
    deliver(next: SourceService) {
      assert.ok(injected, 'dependency injection callback must be installed');
      injected({ inputTriggers: next, effect });
    },
  };
}

function sourceNames(service: SourceService) {
  return service.live.sources.map(source => source.name);
}

const cases = [
  { kind: undefined, name: 'link', text: URL },
  { kind: 'video' as const, name: 'omnimux-video-link', text: `参考视频：${URL}` },
  { kind: 'product' as const, name: 'omnimux-product-link', text: `商品页面：${URL}` },
];

describe('linkTriggerSource public codecs', () => {
  for (const { kind, name, text } of cases) {
    it(`${name}: legal passive @ trigger and lossless purpose-aware serialization`, async () => {
      const source = createLinkTriggerSource(kind);
      assert.equal(source.name, name);
      assert.equal(source.trigger, '@');
      assert.deepEqual(await source.candidates(), []);
      assert.equal(source.codec.clipboardText(URL), text);
      assert.equal(await source.codec.serialize(URL), text);
      assert.equal(await source.codec.serialize(URL, new AbortController().signal), text);
    });

    it(`${name}: already aborted submission rejects without producing text`, async () => {
      const source = createLinkTriggerSource(kind);
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(source.codec.serialize(URL, controller.signal), { message: '链接提交已取消' });
    });
  }

  for (const kind of ['video', 'product'] as const) {
    it(`${kind}: rejects invalid references instead of submitting unsafe or ambiguous text`, async () => {
      const codec = createLinkTriggerSource(kind).codec;
      for (const ref of ['', '789101112', 'example.com/a', 'ftp://example.com/a', 'javascript:alert(1)',
        'https://example.com/a https://example.org/b', 'https://user:password@example.com/a',
        'https://example.com/<bad>', 'https://']) {
        await assert.rejects(codec.serialize(ref), { message: '链接格式无效' }, ref);
      }
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(codec.serialize('', controller.signal), { message: '链接提交已取消' });
    });
  }

  it('legacy codec preserves opaque unsent references without imposing the new URL policy', async () => {
    const codec = createLinkTriggerSource().codec;
    for (const ref of ['', 'legacy-reference', '[视频](https://example.com/a)']) {
      assert.equal(await codec.serialize(ref), ref);
      assert.equal(codec.clipboardText(ref), ref);
    }
  });
});

describe('linkTriggerSource registration lifecycle', () => {
  it('registers all three sources immediately and disposes each exactly once in reverse order', () => {
    const service = createService();
    const fixture = createContext(service);
    const stop = registerLinkTriggerSource(fixture.ctx);
    assert.deepEqual(sourceNames(service), NAMES);
    assert.equal(fixture.effects.length, 1);
    fixture.effects[0]();
    assert.deepEqual(sourceNames(service), []);
    assert.deepEqual(service.disposed, [...NAMES].reverse());
    stop?.();
    fixture.effects[0]();
    assert.equal(service.disposed.length, 3);
  });

  it('waits for the public service and deduplicates repeated delivery of the same service', () => {
    const fixture = createContext();
    const service = createService();
    const stop = registerLinkTriggerSource(fixture.ctx);
    assert.deepEqual(service.registered, []);
    fixture.deliver(service);
    fixture.deliver(service);
    assert.deepEqual(service.registered, NAMES);
    assert.equal(fixture.effects.length, 1);
    stop?.();
    assert.deepEqual(sourceNames(service), []);
    fixture.effects[0]();
  });

  it('direct discovery followed by injection does not duplicate source ownership', () => {
    const service = createService();
    const fixture = createContext(service);
    const stop = registerLinkTriggerSource(fixture.ctx);
    fixture.deliver(service);
    assert.deepEqual(service.registered, NAMES);
    assert.equal(fixture.effects.length, 1);
    stop?.();
    assert.deepEqual(service.disposed, [...NAMES].reverse());
  });

  it('tracks replacement service instances independently and closes all owned registrations', () => {
    const first = createService();
    const second = createService();
    const fixture = createContext(first);
    const stop = registerLinkTriggerSource(fixture.ctx);
    fixture.deliver(second);
    assert.deepEqual(sourceNames(first), NAMES);
    assert.deepEqual(sourceNames(second), NAMES);
    fixture.effects[0]();
    assert.deepEqual(sourceNames(first), []);
    assert.deepEqual(sourceNames(second), NAMES);
    stop?.();
    assert.deepEqual(sourceNames(second), []);
    fixture.effects[1]();
  });

  for (const kind of [undefined, 'video', 'product'] as const) {
    it(`preserves an existing ${kind ?? 'legacy'} source and its codec through teardown`, async () => {
      const source = createLinkTriggerSource(kind);
      const existing: LinkTriggerSource = {
        ...source,
        codec: { clipboardText: ref => `existing:${ref}`, serialize: async ref => `existing:${ref}` },
      };
      const service = createService([existing]);
      const fixture = createContext(service);
      const stop = registerLinkTriggerSource(fixture.ctx);
      assert.equal(service.live.sources.find(item => item.name === existing.name), existing);
      assert.deepEqual(service.registered, NAMES.filter(name => name !== existing.name));
      assert.equal(await existing.codec.serialize(URL), `existing:${URL}`);
      stop?.();
      assert.deepEqual(service.live.sources, [existing]);
      assert.equal(existing.codec.clipboardText(URL), `existing:${URL}`);
    });
  }

  it('does not claim or dispose any codec when all three names already exist', () => {
    const existing = cases.map(({ kind }) => createLinkTriggerSource(kind));
    const service = createService(existing);
    const fixture = createContext(service);
    const stop = registerLinkTriggerSource(fixture.ctx);
    fixture.deliver(service);
    assert.deepEqual(service.registered, []);
    stop?.();
    fixture.effects.forEach(dispose => dispose());
    assert.deepEqual(service.live.sources, existing);
    assert.deepEqual(service.disposed, []);
  });

  for (const failName of NAMES) {
    it(`rolls back partial registration when ${failName} is refused`, t => {
      const warning = t.mock.method(console, 'warn', () => {});
      const service = createService([], failName);
      const fixture = createContext(service);
      const stop = registerLinkTriggerSource(fixture.ctx);
      const expected = NAMES.slice(0, NAMES.indexOf(failName));
      assert.deepEqual(service.registered, expected);
      assert.deepEqual(service.disposed, [...expected].reverse());
      assert.deepEqual(sourceNames(service), []);
      assert.equal(fixture.effects.length, 0);
      assert.equal(warning.mock.callCount(), 1);
      stop?.();
      assert.deepEqual(service.disposed, [...expected].reverse());
    });
  }

  it('rolls back only owned sources while preserving an existing codec', t => {
    t.mock.method(console, 'warn', () => {});
    const existing = createLinkTriggerSource();
    const service = createService([existing], 'omnimux-product-link');
    const fixture = createContext(service);
    const stop = registerLinkTriggerSource(fixture.ctx);
    assert.deepEqual(service.live.sources, [existing]);
    assert.deepEqual(service.disposed, ['omnimux-video-link']);
    stop?.();
    assert.deepEqual(service.live.sources, [existing]);
  });

  it('can retry after rollback when the service becomes available again', t => {
    t.mock.method(console, 'warn', () => {});
    const service = createService();
    const register = service.registerSource;
    let refuse = true;
    service.registerSource = source => {
      if (refuse && source.name === 'omnimux-video-link') throw new Error('temporarily unavailable');
      return register(source);
    };
    const fixture = createContext(service);
    const stop = registerLinkTriggerSource(fixture.ctx);
    assert.deepEqual(sourceNames(service), []);
    refuse = false;
    fixture.deliver(service);
    assert.deepEqual(sourceNames(service), NAMES);
    stop?.();
    assert.deepEqual(sourceNames(service), []);
    assert.deepEqual(service.disposed, ['link', ...[...NAMES].reverse()]);
  });

  it('does not resurrect registrations when dependency delivery arrives after aggregate disposal', () => {
    const fixture = createContext();
    const service = createService();
    const stop = registerLinkTriggerSource(fixture.ctx);
    stop?.();
    fixture.deliver(service);
    try {
      assert.deepEqual(service.registered, [], 'disposed owner must reject late service delivery');
      assert.deepEqual(sourceNames(service), []);
    } finally {
      // Retain cleanup even when this regression exposes a live registration.
      stop?.();
      fixture.effects.forEach(dispose => dispose());
    }
  });

  it('handles absent contexts and missing service capability without throwing', () => {
    assert.equal(registerLinkTriggerSource(null), undefined);
    assert.equal(registerLinkTriggerSource(undefined), undefined);
    const stop = registerLinkTriggerSource({ get: () => ({ live: { sources: [] } }) });
    assert.equal(typeof stop, 'function');
    assert.doesNotThrow(() => stop?.());
    assert.doesNotThrow(() => registerLinkTriggerSource({})?.());
  });
});
