import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { installDocumentIdentity } from './document-identity.js'
import { BrandedDocumentTitle, type DocumentTitleProps } from './DocumentTitle.js'
import { TotvsBrandName, TotvsHeroMark, TotvsRunningMark, TotvsSidebarMark } from './totvs-visuals.js'
import styles from './totvs-styles.css'

const PRODUCT_TITLE = 'TOTVS ENG V&D CODE'

function TotvsDocumentTitle(props: DocumentTitleProps): null {
  return BrandedDocumentTitle({ ...props, brandTitle: PRODUCT_TITLE })
}

/** Register the optional TOTVS chat identity. */
export function applyTotvs(ctx: Context): void {
  ctx.effect(() => installDocumentIdentity(document, styles, {}, {
    pluginId: '@everywhere-harness/client-ui-chat/totvs',
    applicationName: PRODUCT_TITLE,
    shortName: 'TOTVS CODE',
    errorLabel: 'TOTVS application identity failed',
  }))
  ctx.slots.inject('shell.document.title', () => ctx.slots.register({
    name: 'shell.document.title', priority: -90,
  }, TotvsDocumentTitle))
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark', priority: -90,
  }, TotvsSidebarMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name', priority: -90,
  }, TotvsBrandName))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -90,
  }, TotvsHeroMark))
  ctx.slots.inject('conversation.chat.running.icon', () => ctx.slots.register({
    name: 'conversation.chat.running.icon', priority: -90,
  }, TotvsRunningMark))
}
