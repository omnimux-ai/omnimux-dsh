import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { parseSocialMeta } from '../plugins/omnimux-inspiration/src/http-handlers.js'

async function runVerification() {
  console.log('--- 开始验证社媒主流视频 CDN 与媒体直链识别修复 ---')
  const results = []

  // 测试案例 1: TikTok 官方 CDN 直链（无扩展名，由 CDN 域名白名单与 mime_type 保障）
  const tiktokCdnUrl = 'https://v19.tiktokcdn-us.com/1187e4beb006c9d37d67b277b153c892/6aac45e6/video/tos/alisg/tos-alisg-pve-0037c001/oYibQEXvbAxibBYBhspSAQuHCaJEYuppIhyEA/?a=1233&bti=OUBzOTg7QGo6OjZAL3AjLTAzYCMxNDNg&&mime_type=video_mp4'
  const mockTikTokData = {
    title: 'TikTok AI Video',
    play: tiktokCdnUrl,
    cover: 'https://p16-sign.tiktokcdn-us.com/tos-no1a-p/cover.jpg',
  }
  const parsedTikTok = parseSocialMeta(mockTikTokData)
  assert.equal(parsedTikTok.video_url, tiktokCdnUrl, 'TikTok CDN 视频直链必须被完整保留，不得误杀置空')
  results.push({ name: 'TikTok CDN Stream URL Resolution', status: 'PASS', video_url: parsedTikTok.video_url })

  // 测试案例 2: 带 mime_type=video/mp4 的无扩展名直链
  const customMimeUrl = 'https://media-stream.example-public-cdn.com/stream/segment-live?mime_type=video/mp4'
  const mockMimeData = {
    title: 'Custom Stream Video',
    video_url: customMimeUrl,
  }
  const parsedMime = parseSocialMeta(mockMimeData)
  assert.equal(parsedMime.video_url, customMimeUrl, '带视频 MIME 参数的直链必须被正确放行')
  results.push({ name: 'MIME Parameter Video Stream', status: 'PASS', video_url: parsedMime.video_url })

  // 测试案例 3: 非媒体格式拦截（.m3u8、.html）
  const m3u8Url = 'https://v19.tiktokcdn-us.com/playlist.m3u8'
  const parsedM3u8 = parseSocialMeta({ play: m3u8Url })
  assert.equal(parsedM3u8.video_url, '', '非媒体容器 .m3u8 必须被严格拦截过滤')
  results.push({ name: 'HLS Manifest Rejection', status: 'PASS', result: 'blocked' })

  // 测试案例 4: 非白名单且无视频后缀的普通网页拦截
  const webpageUrl = 'https://example.com/article/123'
  const parsedWebpage = parseSocialMeta({ video_url: webpageUrl })
  assert.equal(parsedWebpage.video_url, '', '普通非媒体网页必须被拦截过滤')
  results.push({ name: 'Generic Webpage Rejection', status: 'PASS', result: 'blocked' })

  const evidencePath = path.resolve('docs/evidence/inspiration-video-cdn-verification.json')
  fs.writeFileSync(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8')
  console.log('✅ 所有验证用例全部通过！验证证据已记录至:', evidencePath)
}

runVerification().catch((err) => {
  console.error('❌ 验证失败:', err)
  process.exit(1)
})
