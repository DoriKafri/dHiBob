import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@acme.tech' },
  });

  if (!user) {
    console.error('Admin user not found. Please run seed first.');
    return;
  }

  const employee = await prisma.employee.findFirst({
    where: { companyId: 'acme-technologies-seed-company' },
  });

  if (!employee) {
    console.error('No employee found. Please run seed first.');
    return;
  }

  const task = await prisma.onboardingTask.create({
    data: {
      title: 'Review New Onboarding Dashboard',
      description: 'Check out the new Task Popover in the global header.',
      assigneeId: user.id,
      status: 'NOT_STARTED',
      employeeId: employee.id, // Linking to some employee
    },
  });

  console.log('Successfully created task:', task.title);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
