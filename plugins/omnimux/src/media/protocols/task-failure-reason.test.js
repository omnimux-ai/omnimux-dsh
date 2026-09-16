import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pollOpenAiMediaTask } from './openai-media.js'
import {
  TASK_DETAIL_PATH,
  describeTaskFailure,
  pickTaskFailureReason,
  taskDetailUrl,
} from '../vendors/omnimux.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

const noSleep = async () => {}

/**
 * The real failure this suite exists for (Issue #2092): a `minimax-h3` video
 * task whose upstream reason lives on the detail record, not on the poll body.
 */
const FILE_DOWNLOAD_REASON =
  'body.input.reference_image_urls: Failed to download the file. Please check if the URL is accessible and try again. (file_download_error)'

function pollOptions(fetcher, extra = {}) {
  return {
    fetcher,
    baseUrl: 'https://api.omnimux.ai/v1',
    apiKey: 'fixture-key',
    taskId: 'task_fixture',
    capability: 'video',
    sleep: noSleep,
    ...extra,
  }
}

/** Poll body that carries no reason but does carry its own resource URL. */
const shallowFailedBody = {
  code: 'success',
  message: '',
  data: {
    error: null,
    format: 'mp4',
    metadata: null,
    status: 'failed',
    task_id: 'task_fixture',
    url: 'https://omnimux.ai/v1/videos/task_fixture/content',
  },
}

/* ------------------------------------------------------------ 响应体原因提取 */

test('pickTaskFailureReason reads every envelope the platform answers with', () => {
  assert.equal(
    pickTaskFailureReason({ error: { message: 'boom' } }),
    'boom',
  )
  assert.equal(pickTaskFailureReason({ error: 'boom' }), 'boom')
  assert.equal(pickTaskFailureReason({ data: { error: { message: 'boom' } } }), 'boom')
  assert.equal(pickTaskFailureReason({ data: { error: 'boom' } }), 'boom')
  assert.equal(pickTaskFailureReason({ message: 'boom' }), 'boom')
  assert.equal(pickTaskFailureReason({ data: { message: 'boom' } }), 'boom')
  assert.equal(pickTaskFailureReason({ data: { fail_reason: 'boom' } }), 'boom')
})

test('pickTaskFailureReason treats blank placeholders as no reason', () => {
  assert.equal(pickTaskFailureReason({ message: '' }), undefined)
  assert.equal(pickTaskFailureReason({ message: '   ' }), undefined)
  assert.equal(pickTaskFailureReason({ error: null, data: { error: null } }), undefined)
  assert.equal(pickTaskFailureReason(null), undefined)
  assert.equal(pickTaskFailureReason('boom'), undefined)
  assert.equal(pickTaskFailureReason([]), undefined)
})

/* ---------------------------------------------------------------- 详情地址 */

test('taskDetailUrl prefers the content URL the poll body itself carries', () => {
  assert.equal(
    taskDetailUrl(shallowFailedBody, {
      capability: 'video',
      baseUrl: 'https://api.omnimux.ai/v1',
      taskId: 'task_fixture',
    }),
    'https://omnimux.ai/v1/videos/task_fixture',
  )
})

test('taskDetailUrl falls back to the capability detail endpoint', () => {
  assert.equal(
    taskDetailUrl({ data: { status: 'failed' } }, {
      capability: 'video',
      baseUrl: 'https://api.omnimux.ai/v1/',
      taskId: 'task_fixture',
    }),
    'https://api.omnimux.ai/v1/videos/task_fixture',
  )
  // Only `videos` is evidenced; an unevidenced capability yields no URL.
  assert.equal(
    taskDetailUrl({ data: { status: 'failed' } }, {
      capability: 'image',
      baseUrl: 'https://api.omnimux.ai/v1',
      taskId: 'task_fixture',
    }),
    undefined,
  )
  assert.equal(TASK_DETAIL_PATH.video, 'videos')
})

test('taskDetailUrl ignores a body URL that is not the content form', () => {
  // A completed response carries a direct media URL; stripping it would send the
  // detail read to a media object, so the capability endpoint wins instead.
  assert.equal(
    taskDetailUrl({ url: 'https://cdn.example.com/out.mp4' }, {
      capability: 'video',
      baseUrl: 'https://api.omnimux.ai/v1',
      taskId: 'task_fixture',
    }),
    'https://api.omnimux.ai/v1/videos/task_fixture',
  )
})

/* ------------------------------------------------------------------ 消息形态 */

test('describeTaskFailure reads a known upstream reason in Chinese', () => {
  const message = describeTaskFailure({
    capability: 'video',
    taskId: 'task_fixture',
    reason: FILE_DOWNLOAD_REASON,
  })
  assert.match(message, /^video task task_fixture failed/)
  assert.match(message, /模型方下载不到参考图/)
  assert.match(message, /file_download_error/)
})

test('describeTaskFailure maps moderation, quota and timeout reasons', () => {
  assert.match(
    describeTaskFailure({ capability: 'video', taskId: 't', reason: 'input was flagged by moderation' }),
    /内容未通过审核/,
  )
  assert.match(
    describeTaskFailure({ capability: 'video', taskId: 't', reason: 'insufficient_user_quota' }),
    /账户额度不足/,
  )
  assert.match(
    describeTaskFailure({ capability: 'video', taskId: 't', reason: 'upstream timed out' }),
    /上游生成超时/,
  )
})

test('describeTaskFailure still shows an unrecognised reason verbatim', () => {
  const message = describeTaskFailure({ capability: 'video', taskId: 't', reason: 'something new' })
  assert.match(message, /上游生成失败，请重试/)
  assert.match(message, /（上游：something new）/)
})

test('describeTaskFailure names the missing reason instead of going silent', () => {
  const message = describeTaskFailure({ capability: 'video', taskId: 't' })
  assert.match(message, /^video task t failed/)
  assert.match(message, /上游未返回失败原因/)
})

/* ------------------------------------------------------------------ 轮询集成 */

test('a reason on the poll body reaches the error without a second request', async () => {
  const seen = []
  const fetcher = async (url) => {
    seen.push(String(url))
    return json({ data: { status: 'failed', error: { message: FILE_DOWNLOAD_REASON } } })
  }

  await assert.rejects(
    () => pollOpenAiMediaTask(pollOptions(fetcher)),
    (error) => {
      assert.equal(error.code, 'omnimux-failed')
      assert.match(error.message, /模型方下载不到参考图/)
      assert.match(error.message, /file_download_error/)
      return true
    },
  )
  assert.deepEqual(seen, ['https://api.omnimux.ai/v1/video/generations/task_fixture'])
})

test('a shallow poll body triggers the detail read only when the caller opts in', async () => {
  const seen = []
  const fetcher = async (url) => {
    seen.push(String(url))
    if (String(url).includes('/video/generations/')) return json(shallowFailedBody)
    return json({ status: 'failed', error: { message: FILE_DOWNLOAD_REASON } })
  }

  await assert.rejects(
    () => pollOpenAiMediaTask(pollOptions(fetcher, { resolveFailureReason: true })),
    (error) => {
      assert.equal(error.code, 'omnimux-failed')
      assert.match(error.message, /模型方下载不到参考图/)
      return true
    },
  )
  assert.deepEqual(seen, [
    'https://api.omnimux.ai/v1/video/generations/task_fixture',
    'https://omnimux.ai/v1/videos/task_fixture',
  ])
})

test('without the opt-in the poll stays one request per attempt (#831)', async () => {
  const seen = []
  const fetcher = async (url) => {
    seen.push(String(url))
    return json(shallowFailedBody)
  }

  await assert.rejects(
    () => pollOpenAiMediaTask(pollOptions(fetcher)),
    (error) => {
      assert.equal(error.code, 'omnimux-failed')
      assert.match(error.message, /上游未返回失败原因/)
      return true
    },
  )
  assert.equal(seen.length, 1)
})

test('a failing detail read never replaces the original failure', async () => {
  const detailFailures = [
    ['HTTP 500', () => json({ error: { message: 'boom' } }, 500)],
    ['broken JSON', () => new Response('<html>gateway</html>', { status: 200 })],
    ['transport error', () => { throw new Error('socket hang up') }],
  ]

  for (const [name, detailResponse] of detailFailures) {
    const fetcher = async (url) => (
      String(url).includes('/video/generations/') ? json(shallowFailedBody) : detailResponse()
    )
    await assert.rejects(
      () => pollOpenAiMediaTask(pollOptions(fetcher, { resolveFailureReason: true })),
      (error) => {
        assert.equal(error.code, 'omnimux-failed', name)
        assert.match(error.message, /上游未返回失败原因/, name)
        return true
      },
    )
  }
})

test('a quota failure keeps its own code and skips the detail read', async () => {
  const seen = []
  const fetcher = async (url) => {
    seen.push(String(url))
    return json({ data: { status: 'failed', error: { message: 'insufficient_user_quota' } } })
  }

  await assert.rejects(
    () => pollOpenAiMediaTask(pollOptions(fetcher)),
    (error) => {
      assert.equal(error.code, 'quota-exceeded')
      return true
    },
  )
  assert.equal(seen.length, 1)
})

test('a successful task is untouched by the failure path', async () => {
  const seen = []
  const fetcher = async (url) => {
    seen.push(String(url))
    return json({ data: { status: 'succeeded', url: 'https://cdn.example.com/out.mp4' } })
  }

  const done = await pollOpenAiMediaTask(pollOptions(fetcher))
  assert.equal(done.data.status, 'succeeded')
  assert.equal(seen.length, 1)
})
