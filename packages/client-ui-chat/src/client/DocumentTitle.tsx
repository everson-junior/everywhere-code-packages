import { useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

export type DocumentTitleProps = Pick<PropsRuntime<'root'>, 'useSessions' | 'usePanelInfo'> & {
	productTitle: string
}

/**
 * Project the active main session title with the Everywhere product name.
 * @param props - Host-owned session and panel subscriptions.
 * @returns No rendered content.
 */
export function BrandedDocumentTitle({ useSessions, usePanelInfo, brandTitle }: DocumentTitleProps & { brandTitle: string }): null {
	const showSessionTitle = usePanelInfo(info => info.activePanelId === null)
	const title = useSessions(state => Object.values(state.byId)
		.find(session => (session.retainedBy.mainView ?? 0) > 0)?.title)
	useEffect(() => {
		const previousTitle = document.title
		const nextTitle = showSessionTitle && title !== undefined
			? `${title} \u2014 ${brandTitle}`
			: brandTitle
		document.title = nextTitle
		return () => {
			if (document.title === nextTitle) document.title = previousTitle
		}
	}, [brandTitle, showSessionTitle, title])
	return null
}

export function DocumentTitle(props: DocumentTitleProps): null {
	return BrandedDocumentTitle({ ...props, brandTitle: 'EveryWhere Harness' })
}