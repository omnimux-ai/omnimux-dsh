import test from 'node:test';
import { lateReadyRegression, frozenInputRegression } from '../../../test-support/generation-feedback/generation-feedback-regressions.mjs';

// The shared regressions execute the production bridge and contain the strong behavior assertions.
// Real-browser journeys are independent in tests/e2e/generation-feedback.e2e.test.js.
test('bridge regression: late single request consumes retained turn end', () => lateReadyRegression(false));
test('bridge regression: two real candidates resolve without cross-request media', () => lateReadyRegression(true));
test('bridge regression: submitted input is frozen and questions do not generate', frozenInputRegression);
