export type VelocityTier = 'viral' | 'surging' | 'normal'

export interface TweetVelocityData {
  tweetId: string
  author: string
  url: string
  text: string
  views: number
  replies: number
  createdAtMs: number
  hoursAlive: number
  pace: number
  tier: VelocityTier
  predictedExposure: number
}
