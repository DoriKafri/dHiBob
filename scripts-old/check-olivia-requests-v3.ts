import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const requests = await prisma.timeOffRequest.findMany({
    where: { employeeId: 'cmnnmrf87001kzkxyqdioc88d' },
    include: { policy: true }
  });
  console.log(JSON.stringify(requests, null, 2));
}
main().finally(() => prisma.$disconnect());
