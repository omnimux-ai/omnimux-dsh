import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { withDefaults } from '../config-store.js';
import { handleApi } from '../local-api.js';
import { readSessionTrial } from '../session-attach.js';
function mockRes() {
    const res = {
        statusCode: 200,
        _status: 200,
        _body: '',
        setHeader() { },
        end(chunk) {
            this._status = this.statusCode;
            this._body = chunk == null ? '' : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        },
    };
    return res;
}
function postReq(payload) {
    return {
        method: 'POST',
        url: '/omnimux-market',
        headers: {
            origin: 'http://127.0.0.1:3080',
            host: '127.0.0.1:3080',
        },
        [Symbol.asyncIterator]: async function* () {
            yield Buffer.from(JSON.stringify(payload));
        },
    };
}
test('tryAttach loads bundled skill into the session without writing skills dir', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omx-try-'));
    const skillsDir = join(home, 'skills');
    mkdirSync(skillsDir, { recursive: true });
    const prev = process.env.DSH_HOME;
    process.env.DSH_HOME = home;
    try {
        const cfg = withDefaults({ skillsDir, timeoutMs: 5000, userAgent: 't' });
        const req = postReq({
            method: 'tryAttach',
            sessionId: 'sess-try-1',
            slug: 'hypit-setup',
            catalogId: 'sk-omx-hypit-setup',
            title: 'Hypit 能力接入',
        });
        const res = mockRes();
        await handleApi(req, res, cfg);
        assert.equal(res._status, 200, res._body);
        const body = JSON.parse(res._body);
        assert.equal(body.ok, true);
        assert.equal(body.attached, true);
        assert.equal(body.installed, false);
        assert.equal(body.hasBody, true);
        const trial = readSessionTrial(home, 'sess-try-1');
        assert.ok(trial);
        assert.equal(trial.slug, 'hypit-setup');
        assert.match(trial.body, /hypit-setup/);
        const leftover = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => !n.startsWith('.')) : [];
        assert.deepEqual(leftover, []);
    }
    finally {
        if (prev === undefined)
            delete process.env.DSH_HOME;
        else
            process.env.DSH_HOME = prev;
    }
});
