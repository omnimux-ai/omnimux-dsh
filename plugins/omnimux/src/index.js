import { Config } from './config.js'
import { apply } from './host/apply.js'

export const name = 'omnimux'
export const inject = ['tools', 'systemPrompt', 'agents', 'llm']
export { Config, apply }
