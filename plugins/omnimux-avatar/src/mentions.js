export function normalizeMentions(text) {
  return String(text).replace(/\[(?:Image|Picture|图片)\s*(\d+)\]/gi,'@Image $1').replace(/\[(?:Video|视频)\s*1?\]/gi,'@Video').replace(/@(?:Picture|图片)\s*(\d+)/gi,'@Image $1').replace(/@视频\s*1?/g,'@Video')
}
export function removeImageMention(text,index) {
  return normalizeMentions(text).replace(/@Image\s*(\d+)/gi,(match,number)=>Number(number)===index?'[missing image]':Number(number)>index?'@Image '+(Number(number)-1):match)
}

/** Validate explicit media indices without rebinding a missing item. */
export function validateMentions(text, imageCount, hasVideo) {
  const normalized = normalizeMentions(text)
  if (normalized.includes('[missing image]')) return {error:'说明引用的图片已移除，请重新选择或修改说明'}
  for (const match of normalized.matchAll(/@Image\s*(\d+)/gi)) {
    const index=Number(match[1])
    if(index<1 || index>imageCount) return {error:`图片${index}未选择，请重新选择素材或修改说明`}
  }
  if(/@Video\b/i.test(normalized) && !hasVideo)return {error:'参考视频未选择'}
  return {text:normalized}
}
