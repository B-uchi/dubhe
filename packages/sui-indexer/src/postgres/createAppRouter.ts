import { initTRPC } from '@trpc/server';
import { QueryAdapter } from './common';
import superjson from 'superjson';

export function createAppRouter() {
    const t = initTRPC.context<{ queryAdapter: QueryAdapter }>().create({
        transformer: superjson,
    });

    return t.router({
        getEvents: t.procedure
            .input((val: unknown) => val as { name: string })
            .query(async ({ input, ctx }) => {
                return ctx.queryAdapter.getEvents(input.name);
            }),
        getSchemas: t.procedure
            .input((val: unknown) => val as { name: string })
            .query(async ({ input, ctx }) => {
                return ctx.queryAdapter.getSchemas(input.name);
            }),
    });
}

export type AppRouter = ReturnType<typeof createAppRouter>;