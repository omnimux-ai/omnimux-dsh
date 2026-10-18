import assert from 'node:assert/strict'
import { it } from 'node:test'
import { fetchPublicTweet } from './public-tweet.js'
import { fetchSocialData } from './social-data.js'
const post = { id_str: '12345', text: 'mixed post', mediaDetails: [
  { type: 'video', media_url_https: 'https://pbs.twimg.com/thumb.jpg', video_info: { duration_millis: 12000, variants: [{content_type:'video/mp4',bitrate:1,url:'https://video.twimg.com/a.mp4'}] } },
  { type: 'photo', media_url_https: 'https://pbs.twimg.com/photo.jpg' },
] }
it('reads only the requested public post and preserves video plus independent photo', async () => {
 let seen
 const data = await fetchPublicTweet('12345', { fetcher: async (url,init) => {seen={url,init};return {ok:true,json:async()=>post}} })
 assert.equal(data.images[0], 'https://pbs.twimg.com/photo.jpg')
 assert.equal(data.media.video.length,1)
 assert.equal(data.duration,12)
 assert.equal(seen.init.redirect,'error')
 assert.equal(seen.init.headers.authorization,undefined)
 assert.match(seen.url,/^https:\/\/cdn.syndication.twimg.com\/tweet-result\?id=12345/)
})
it('public success needs no cloud credentials or request', async () => {
 const result = await fetchSocialData({ withSk:async()=>assert.fail('cloud must not run') },{platform:'x',capability:'tweet',id:'12345'},{fetcher:async()=>({ok:true,json:async()=>post})})
 assert.equal(result.source,'x-public-embed')
 assert.equal(result.data.images.length,1)
})
it('falls back to configured cloud once when public source is unavailable', async () => {
 let calls=0
 const result = await fetchSocialData({withSk:async()=>{calls++;return {data:post}}},{platform:'x',capability:'tweet',id:'12345'},{fetcher:async()=>({ok:false,status:404})})
 assert.equal(calls,1);assert.equal(result.data,post)
})
it('rejects mismatched identities and follows no quoted post', async () => {
 await assert.rejects(fetchPublicTweet('12345',{fetcher:async()=>({ok:true,json:async()=>({...post,id_str:'999'})})}),{code:'omnimux-request-failed'})
})
it('actual caller cancellation issues no fallback', async () => {
 const controller=new AbortController()
 await assert.rejects(fetchSocialData({withSk:async()=>assert.fail('cancelled cloud')},{platform:'x',capability:'tweet',id:'12345'},{signal:controller.signal,fetcher:async()=>{controller.abort();throw new Error('closed')}}),{name:'AbortError'})
})
it('public opt-out issues no public request', async () => {
 let calls=0
 await fetchSocialData({withSk:async()=>{calls++;return {data:post}}},{platform:'x',capability:'tweet',id:'12345'},{allowPublicTweet:false,fetcher:async()=>assert.fail('public disabled')})
 assert.equal(calls,1)
})
it('incomplete public media retries the configured cloud instead of declaring success', async () => {
 let calls=0
 await fetchSocialData({withSk:async()=>{calls++;return {data:post}}},{platform:'x',capability:'tweet',id:'12345'},{fetcher:async()=>({ok:true,json:async()=>({...post,mediaDetails:[{type:'video',video_info:{variants:[]}}]})})})
 assert.equal(calls,1)
})
