import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const requests = await prisma.timeOffRequest.findMany({
    include: { 
      employee: { select: { firstName: true, lastName: true, companyId: true } },
      policy: { select: { name: true, companyId: true } }
    }
  });
  console.log("Total Requests:", requests.length);
  requests.forEach(r => {
    console.log(`- [${r.status}] ${r.employee.firstName} ${r.employee.lastName}: ${r.startDate.toISOString().split('T')[0]} to ${r.endDate.toISOString().split('T')[0]} (Company: ${r.employee.companyId})`);
  });

  const users = await prisma.user.findMany({
    include: { employee: true }
  });
  console.log("\nUsers:");
  users.forEach(u => {
    console.log(`- ${u.email} (Role: ${u.role}, Company: ${u.employee?.companyId})`);
  });
}
main().finally(() => prisma.$disconnect());
