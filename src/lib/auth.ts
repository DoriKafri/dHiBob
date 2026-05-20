import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare, hash } from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from './db';
import { redisClient } from './redis';

const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: { employee: { include: { company: true } } },
          });
          if (!user) return null;
          const isValid = await compare(credentials.password, user.passwordHash);
          if (!isValid) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.employee
              ? `${user.employee.firstName} ${user.employee.lastName}`
              : user.email,
            role: user.role,
            employeeId: user.employee?.id,
            companyId: user.employee?.companyId ?? '',
          };
        } catch (error) {
          console.error('[auth] authorize error:', error);
          return null;
        }
      },
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        if (!user.email) return false;
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing) return true;

        // Auto-create: match email domain to a company
        const domain = user.email.split('@')[1];
        const company = await prisma.company.findUnique({ where: { domain } });
        if (!company) return false; // domain not registered — reject

        const firstName = (profile as any)?.given_name || user.name?.split(' ')[0] || '';
        const lastName = (profile as any)?.family_name || user.name?.split(' ').slice(1).join(' ') || '';

        // Create employee + user in a transaction
        await prisma.$transaction(async (tx) => {
          const employee = await tx.employee.create({
            data: {
              firstName,
              lastName,
              displayName: `${firstName} ${lastName}`.trim(),
              email: user.email!,
              companyId: company.id,
              startDate: new Date(),
              employmentType: 'FULL_TIME',
              status: 'ACTIVE',
            },
          });
          await tx.user.create({
            data: {
              email: user.email!,
              passwordHash: await hash(crypto.randomBytes(32).toString('hex'), 12),
              role: 'EMPLOYEE',
              employeeId: employee.id,
            },
          });
        });
        return true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // On Google sign-in, look up the user record by email
      if (account?.provider === 'google' && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: { employee: { include: { company: true } } },
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.role = dbUser.role;
          token.companyId = dbUser.employee?.companyId ?? '';
          token.employeeId = dbUser.employee?.id;
          try {
            const redis = await redisClient();
            await redis.set(
              `session:${dbUser.id}`,
              JSON.stringify({ companyId: dbUser.employee?.companyId, role: dbUser.role }),
              'EX',
              SESSION_TTL,
            );
          } catch {}
        }
      } else if (user) {
        token.role = user.role;
        token.companyId = user.companyId;
        token.employeeId = user.employeeId;
        // Cache active session in Redis for blocklist/audit support
        try {
          const redis = await redisClient();
          await redis.set(
            `session:${user.id}`,
            JSON.stringify({ companyId: user.companyId, role: user.role }),
            'EX',
            SESSION_TTL,
          );
        } catch {
          // Redis unavailable — auth still proceeds (non-blocking)
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.employeeId = token.employeeId as string | undefined;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: SESSION_TTL },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};
