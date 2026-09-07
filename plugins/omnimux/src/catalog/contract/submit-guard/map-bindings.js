/** Collect ordered media URLs from validated slot bindings. */
export function collectMappedBindings(bindings = [], bySlot) {
  const urls = {
    firstFrames: [], lastFrames: [], references: [], audioTracks: [], sources: [],
    genericImages: [], genericAudio: [], genericVideo: [], sourceVideos: [],
    referenceVideos: [], referenceAudios: [], documentUrls: [], webpageUrls: [],
  }
  for (const binding of bindings) {
    const role = binding.role || binding.asset?.role || ''
    const url = binding.pathOrUrl
    if (!url) continue
    if (role === 'first_frame') urls.firstFrames.push(url)
    else if (role === 'last_frame') urls.lastFrames.push(url)
    else if (role === 'audio_track') urls.audioTracks.push(url)
    else if (role === 'source' && binding.type === 'audio') urls.sources.push(url)
    else if (role === 'source' && binding.type === 'video') {
      urls.sourceVideos.push(url)
      urls.genericVideo.push(url)
    } else if (role === 'document' || binding.slot === 'file_url') urls.documentUrls.push(url)
    else if (role === 'webpage' || binding.slot === 'link_url') urls.webpageUrls.push(url)
    else if (role === 'reference' || role === 'style' || !role) {
      if (binding.type === 'image') {
        urls.references.push(url)
        urls.genericImages.push(url)
      } else if (binding.type === 'audio') {
        urls.genericAudio.push(url)
        urls.referenceAudios.push(url)
      } else if (binding.type === 'video') {
        urls.genericVideo.push(url)
        urls.referenceVideos.push(url)
      }
    } else if (binding.type === 'image') urls.genericImages.push(url)
    else if (binding.type === 'audio') urls.genericAudio.push(url)
  }
  if (bySlot instanceof Map) {
    for (const [slotName, list] of bySlot.entries()) {
      for (const asset of list ?? []) {
        const url = asset.pathOrUrl
        if (!url) continue
        if (slotName.includes('audio') && asset.type === 'audio' && !urls.audioTracks.includes(url) && !urls.sources.includes(url)) {
          if (slotName.includes('track') || asset.role === 'audio_track') urls.audioTracks.push(url)
          else if (asset.role === 'source') urls.sources.push(url)
        }
        if ((slotName.includes('avatar') || slotName.includes('frame') || slotName.includes('image')) && asset.type === 'image') {
          if (asset.role === 'first_frame' && !urls.firstFrames.includes(url)) urls.firstFrames.push(url)
          else if (asset.role === 'last_frame' && !urls.lastFrames.includes(url)) urls.lastFrames.push(url)
          else if (!urls.firstFrames.includes(url) && !urls.lastFrames.includes(url) && !urls.references.includes(url) && !urls.genericImages.includes(url)) {
            urls.genericImages.push(url)
          }
        }
      }
    }
  }
  return urls
}
