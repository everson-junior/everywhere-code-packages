import type { Context } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'conversation.chat.running.icon': {
            kind: 'single';
            scope: 'session';
            owner: Record<never, never>;
        };
        'shell.document.title': {
            kind: 'single';
            scope: 'root';
            owner: {
                productTitle: string;
            };
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: Context): void;
