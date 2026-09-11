/**
 * Validates whether a URL represents a supported social media or deconstructed video link.
 */
export function isSocialMediaVideoUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false
  const trimmed = url.trim().toLowerCase()
  return (
    trimmed.includes('tiktok.com') ||
    trimmed.includes('douyin.com') ||
    trimmed.includes('youtube.com/watch') ||
    trimmed.includes('youtu.be/') ||
    trimmed.includes('instagram.com/reel') ||
    trimmed.includes('kuaishou.com') ||
    trimmed.includes('bilibili.com/video') ||
    trimmed.includes('.vbreakdown') ||
    trimmed.endsWith('.mp4') ||
    trimmed.endsWith('.webm') ||
    trimmed.endsWith('.mov')
  )
}
