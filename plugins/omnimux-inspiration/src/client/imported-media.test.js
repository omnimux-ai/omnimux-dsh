import assert from 'node:assert/strict'
import { it } from 'node:test'
import { pickImportedMedia, pickVideoSrc } from './api.js'
it('preserves video/photo order without treating photos as playable videos', () => {
 const row = { media_urls:['/omnimux/inspiration/local/media/videos/a.mp4'], media_items:[{type:'video',url:'/omnimux/inspiration/local/media/videos/a.mp4'},{type:'image',url:'/omnimux/inspiration/local/media/images/b.jpg'}] }
 assert.deepEqual(pickImportedMedia(row).map(m=>m.type),['video','image'])
 assert.equal(pickVideoSrc(row),row.media_items[0].url)
 assert.deepEqual(pickImportedMedia({}),[])
 assert.deepEqual(pickImportedMedia({media_items:[{type:'image',url:'javascript:alert(1)'},{type:'unknown',url:'https://cdn.example/a'}]}),[])
})
