import { router } from '@/server/trpc';
import { employeeRouter } from './employee';
import { timeoffRouter } from './timeoff';
import { hiringRouter } from './hiring';
import { performanceRouter } from './performance';
import { analyticsRouter } from './analytics';
import { onboardingRouter } from './onboarding';
import { documentRouter } from './document';
import { compensationRouter } from './compensation';
import { homeRouter } from './home';
import { customRouter } from './custom';
import { payrollRouter } from './payroll';
import { reportsRouter } from './reports';
import { hrPortalRouter } from './hr-portal';
import { surveysRouter } from './surveys';
import { learningRouter } from './learning';
import { workforceRouter } from './workforce';
import { notificationsRouter } from './notifications';
import { expensesRouter } from './expenses';
import { ticketsRouter } from './tickets';
import { itAssetsRouter } from './it-assets';
import { itLicensesRouter } from './it-licenses';
import { signatureRouter } from './signature';
import { userRouter } from './user';

export const appRouter = router({
  employee: employeeRouter,
  timeoff: timeoffRouter,
  hiring: hiringRouter,
  performance: performanceRouter,
  analytics: analyticsRouter,
  onboarding: onboardingRouter,
  document: documentRouter,
  compensation: compensationRouter,
  home: homeRouter,
  custom: customRouter,
  payroll: payrollRouter,
  reports: reportsRouter,
  hrPortal: hrPortalRouter,
  surveys: surveysRouter,
  learning: learningRouter,
  workforce: workforceRouter,
  notifications: notificationsRouter,
  expenses: expensesRouter,
  tickets: ticketsRouter,
  itAssets: itAssetsRouter,
  itLicenses: itLicensesRouter,
  signature: signatureRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
