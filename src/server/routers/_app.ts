import { router } from '@/server/trpc';
import { employeeRouter } from './employee';
import { timeoffRouter } from './timeoff';
import { hiringRouter } from './hiring';
import { performanceRouter } from './performance';
import { analyticsRouter } from './analytics';

export const appRouter = router({ employee: employeeRouter, timeoff: timeoffRouter, hiring: hiringRouter, performance: performanceRouter, analytics: analyticsRouter });
export type AppRouter = typeof appRouter;
