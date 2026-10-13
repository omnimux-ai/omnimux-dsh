/** Resolve only normalized exact same-origin catalogue media routes. */
export function inspirationMediaUrl(value, origin = globalThis.location?.origin ?? 'http://localhost') {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f]/.test(value))return null
  let url
  try{url=new URL(value,origin)}catch{return null}
  if(url.origin!==origin||url.hash||url.username||url.password)return null
  if(!url.pathname.startsWith('/omnimux/inspiration/media/')&&!url.pathname.startsWith('/omnimux/inspiration/local/media/'))return null
  const path=value.split(/[?#]/)[0]
  if(url.pathname!==path)return null
  return url.pathname+url.search
}
export function selectedInspirationVideo(item) {
  return (item.media_urls??[]).map(value=>inspirationMediaUrl(value)).find(Boolean)??null
}
