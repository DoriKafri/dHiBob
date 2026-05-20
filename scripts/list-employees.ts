import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true },
    take: 50
  });
  console.log(JSON.stringify(employees, null, 2));
}
main().finally(() => prisma.$disconnect());
