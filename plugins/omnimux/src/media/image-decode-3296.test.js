import {test} from 'node:test'
import assert from 'node:assert/strict'
import jpeg from 'jpeg-js'
import png from 'pngjs'
import crc from 'pngjs/lib/crc.js'
import {inspectImageBytes} from './image-inspect.js'
test('纯解码检查JPEG与WebP真实字节，损坏输入明确拒绝',async()=>{
 const jpg=jpeg.encode({width:2,height:2,data:Buffer.alloc(16,255)},80).data
 assert.deepEqual(await inspectImageBytes(jpg),{width:2,height:2})
 await assert.rejects(inspectImageBytes(jpg.subarray(0,jpg.length-20)))
 const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')
 assert.deepEqual(await inspectImageBytes(webp),{width:1,height:1})
 await assert.rejects(inspectImageBytes(webp.subarray(0,25)))
})
test('PNG保留EXIF朝向且附加块CRC损坏明确拒绝',async()=>{
 const image=png.PNG.sync.write({width:1,height:2,data:Buffer.alloc(8,255)})
 const metadata=Buffer.from('49492a0008000000010012010300010000000600000000000000','hex')
 const chunk=Buffer.alloc(metadata.length+12);chunk.writeUInt32BE(metadata.length);chunk.write('eXIf',4);metadata.copy(chunk,8);chunk.writeUInt32BE(crc.crc32(chunk.subarray(4,8+metadata.length))>>>0,8+metadata.length)
 const bytes=Buffer.concat([image.subarray(0,33),chunk,image.subarray(33)])
 assert.deepEqual(await inspectImageBytes(bytes),{width:2,height:1})
 chunk[chunk.length-1]^=1
 await assert.rejects(inspectImageBytes(Buffer.concat([image.subarray(0,33),chunk,image.subarray(33)])),/校验/)
})
test('纯图片检查无需原生扩展且真实解码PNG',async()=>{
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC','base64')
 assert.deepEqual(await inspectImageBytes(bytes),{width:1,height:1})
 await assert.rejects(inspectImageBytes(bytes.subarray(0,40)))
 const interlaced=Buffer.from(bytes);interlaced[28]=1
 await assert.rejects(inspectImageBytes(interlaced),/交错PNG/)
 const repeated=Buffer.concat([bytes.subarray(0,33),bytes.subarray(8,33),bytes.subarray(33)])
 await assert.rejects(inspectImageBytes(repeated),/PNG头部/)
})
