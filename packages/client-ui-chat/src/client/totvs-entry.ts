import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { applyTotvs } from './totvs.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.chat.running.icon': { kind: 'single'; scope: 'session'; owner: Record<never, never> }
    'shell.document.title': { kind: 'single'; scope: 'root'; owner: { productTitle: string } }
  }
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  applyTotvs(ctx)
}
