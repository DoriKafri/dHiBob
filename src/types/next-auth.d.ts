import { type DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      companyId: string;
      employeeId?: string;
    } & DefaultSession['user'];
  }

  interface User {
    role: string;
    companyId: string;
    employeeId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    companyId?: string;
    employeeId?: string;
  }
}
