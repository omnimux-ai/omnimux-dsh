import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { imageSize } from 'image-size'
import png from 'pngjs'
import crc from 'pngjs/lib/crc.js'
import exif from 'exif-reader'
import jpeg from 'jpeg-js'
import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js'
import { OmnimuxError } from './errors.js'

const require=createRequire(import.meta.url)
let webpReady
const invalid=message=>new OmnimuxError('omnimux-invalid-request',message)

/** Check container declarations before a decoder allocates pixel storage. */
export async function inspectImageBytes(input){
  const bytes=Buffer.from(input)
  const meta=imageSize(bytes)
  if(!['png','jpg','webp'].includes(meta.type)||!(meta.width>0&&meta.height>0))throw invalid('图片需要为有效的静态PNG、JPEG或WebP')
  if(meta.width*meta.height>40_000_000)throw invalid('Image pixel limit exceeded (40 million pixels)')
  if(meta.type==='png'){
    let offset=8;let headers=0;let ended=false
    while(offset+12<=bytes.length){
      const length=bytes.readUInt32BE(offset)
      const name=bytes.toString('ascii',offset+4,offset+8)
      if(length>bytes.length-offset-12)throw invalid('PNG数据已截断')
      if(name==='IHDR'){
        headers++
        if(headers!==1||length!==13||offset!==8)throw invalid('PNG头部无效')
        if(bytes[offset+20]!==0)throw invalid('暂不支持交错PNG，请使用普通静态图片')
      }
      if(name==='acTL')throw invalid('仅支持静态图片')
      if((crc.crc32(bytes.subarray(offset+4,offset+8+length))>>>0)!==bytes.readUInt32BE(offset+8+length))throw invalid('PNG校验失败')
      if(name==='eXIf')meta.orientation=exif(bytes.subarray(offset+8,offset+8+length)).Image?.Orientation
      offset+=12+length
      if(name==='IEND'){if(length!==0)throw invalid('PNG结尾无效');ended=true;break}
    }
    if(headers!==1||!ended||offset!==bytes.length)throw invalid('PNG头部或结尾无效')
    const decoded=png.PNG.sync.read(bytes,{checkCRC:true})
    if(decoded.width!==meta.width||decoded.height!==meta.height)throw invalid('图片尺寸不一致')
  }else if(meta.type==='jpg'){
    jpeg.decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:40,maxMemoryUsageInMB:512})
  }else{
    let offset=12;let frames=0;let extended=0
    if(bytes.readUInt32LE(4)+8!==bytes.length)throw invalid('WebP容器长度不符')
    while(offset+8<=bytes.length){
      const length=bytes.readUInt32LE(offset+4)
      const name=bytes.toString('ascii',offset,offset+4)
      if(length>bytes.length-offset-8)throw invalid('WebP数据已截断')
      if(name==='ANIM'||name==='ANMF'||name==='VP8X'&&(bytes[offset+8]&2))throw invalid('仅支持静态图片')
      if(name==='VP8X'&&(length!==10||++extended!==1))throw invalid('WebP头部无效')
      if(name==='VP8 '||name==='VP8L'){
        if(++frames!==1)throw invalid('WebP需要单一静态图像')
        const chunk=bytes.subarray(offset,offset+8+length+(length%2))
        const header=Buffer.alloc(12);header.write('RIFF');header.writeUInt32LE(chunk.length+4,4);header.write('WEBP',8)
        const frame=imageSize(Buffer.concat([header,chunk]))
        if(frame.width!==meta.width||frame.height!==meta.height)throw invalid('WebP头部与像素尺寸不一致')
      }
      if(name==='EXIF')meta.orientation=exif(bytes.subarray(offset+8,offset+8+length)).Image?.Orientation
      offset+=8+length+(length%2)
    }
    if(frames!==1||offset!==bytes.length)throw invalid('WebP头部或结尾无效')
    webpReady??=WebAssembly.compile(readFileSync(require.resolve('@jsquash/webp/codec/dec/webp_dec.wasm'))).then(module=>initWebp(module))
    await webpReady
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)
    const decoded=await decodeWebp(buffer)
    if(decoded.width!==meta.width||decoded.height!==meta.height)throw invalid('图片尺寸不一致')
  }
  const rotated=[5,6,7,8].includes(meta.orientation)
  return {width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height}
}
