import { mediaFromMagic } from '../text/image.js'
import { mediaFromVideoMagic } from '../text/video.js'
import { mediaFromAudioMagic } from '../text/audio.js'
import { storageConfigError } from './config.js'

/** Check actual leading bytes against the claimed media type; not a full decoder. */
export function assertReferenceMediaType(bytes, declared) {
  let actual
  if (declared.startsWith('image/')) actual = mediaFromMagic(bytes)
  else if (declared.startsWith('video/')) actual = mediaFromVideoMagic(bytes)
  else if (declared.startsWith('audio/')) {
    actual = mediaFromAudioMagic(bytes)
    if (actual === 'audio/mp3') actual = 'audio/mpeg'
    if (!actual && declared === 'audio/ogg' && bytes.subarray(0, 4).toString() === 'OggS') actual = 'audio/ogg'
    if (!actual && declared === 'audio/mp4' && bytes.length >= 12 && bytes.subarray(4, 8).toString() === 'ftyp' && bytes.subarray(8, 12).toString().trim() === 'M4A') actual = 'audio/mp4'
  }
  if (!actual || actual !== declared) throw storageConfigError('参考素材声明类型与实际内容不符')
  return actual
}
