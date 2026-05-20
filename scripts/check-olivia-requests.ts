import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const requests = await prisma.timeOffRequest.findMany({
    where: { employeeId: 'cmnn5n5aa002pmis90wbqznti' },
    include: { policy: true }
  });
  console.log(JSON.stringify(requests, null, 2));
}
main().finally(() => prisma.$disconnect());
