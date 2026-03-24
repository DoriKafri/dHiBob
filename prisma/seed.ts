import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  // Clear existing data
  const tables = ["OnboardingTask","OnboardingTemplate","Webhook","AuditLog","Position","Document",
    "SurveyResponse","Survey","Candidate","JobPosting","SalaryBand","CompensationRecord",
    "KeyResult","Goal","PerformanceReview","ReviewCycle","Attendance","TimeOffRequest",
    "TimeOffPolicy","User","Employee","Team","Department","Site","Company"];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }

  // Create Company
  const company = await prisma.company.create({
    data: {
      name: "Acme Technologies", logo: "https://via.placeholder.com/200x200?text=Acme",
      domain: "acme.tech",
      settings: JSON.stringify({ timezone: "UTC", language: "en", currency: "USD" }),
    },
  });

  // Create Sites
  const sites = await Promise.all([
    prisma.site.create({ data: { companyId: company.id, name: "New York", address: "123 Tech Avenue, New York, NY 10001", country: "USA", timezone: "America/New_York" } }),
    prisma.site.create({ data: { companyId: company.id, name: "London", address: "456 Innovation Street, London, UK", country: "UK", timezone: "Europe/London" } }),
    prisma.site.create({ data: { companyId: company.id, name: "Tel Aviv", address: "789 Tech Park, Tel Aviv, Israel", country: "Israel", timezone: "Asia/Jerusalem" } }),
    prisma.site.create({ data: { companyId: company.id, name: "Berlin", address: "321 Digital Way, Berlin, Germany", country: "Germany", timezone: "Europe/Berlin" } }),
    prisma.site.create({ data: { companyId: company.id, name: "Sydney", address: "654 Future Lane, Sydney, Australia", country: "Australia", timezone: "Australia/Sydney" } }),
  ]);

  // Create Departments
  const departments = await Promise.all([
    prisma.department.create({ data: { companyId: company.id, name: "Executive" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Engineering" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Product" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Design" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Marketing" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Sales" } }),
    prisma.department.create({ data: { companyId: company.id, name: "HR" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Finance" } }),
    prisma.department.create({ data: { companyId: company.id, name: "Operations" } }),
  ]);
  const [execDept, engDept, prodDept, desDept, markDept, salesDept, hrDept, finDept, opsDept] = departments;

  // Create Teams
  const teams = await Promise.all([
    prisma.team.create({ data: { departmentId: engDept.id, name: "Backend" } }),
    prisma.team.create({ data: { departmentId: engDept.id, name: "Frontend" } }),
    prisma.team.create({ data: { departmentId: engDept.id, name: "DevOps" } }),
    prisma.team.create({ data: { departmentId: prodDept.id, name: "Core Product" } }),
    prisma.team.create({ data: { departmentId: prodDept.id, name: "Analytics" } }),
    prisma.team.create({ data: { departmentId: desDept.id, name: "UI/UX" } }),
    prisma.team.create({ data: { departmentId: markDept.id, name: "Content" } }),
    prisma.team.create({ data: { departmentId: markDept.id, name: "Growth" } }),
    prisma.team.create({ data: { departmentId: salesDept.id, name: "Enterprise" } }),
    prisma.team.create({ data: { departmentId: salesDept.id, name: "Mid-Market" } }),
  ]);

  // Create Employees
  const empData = [
    { email: "sarah.johnson@acme.tech", first: "Sarah", last: "Johnson", dept: execDept.id, site: 0, team: null, type: "FULL_TIME", start: "2015-01-15", title: "Chief Executive Officer" },
    { email: "michael.chen@acme.tech", first: "Michael", last: "Chen", dept: engDept.id, site: 0, team: null, type: "FULL_TIME", start: "2016-06-20", title: "VP of Engineering" },
    { email: "emma.watson@acme.tech", first: "Emma", last: "Watson", dept: prodDept.id, site: 1, team: null, type: "FULL_TIME", start: "2017-03-10", title: "VP of Product" },
    { email: "alex.rivera@acme.tech", first: "Alex", last: "Rivera", dept: desDept.id, site: 2, team: null, type: "FULL_TIME", start: "2018-01-08", title: "VP of Design" },
    { email: "james.smith@acme.tech", first: "James", last: "Smith", dept: engDept.id, site: 0, team: 0, type: "FULL_TIME", start: "2018-04-15", title: "Engineering Manager" },
    { email: "priya.patel@acme.tech", first: "Priya", last: "Patel", dept: engDept.id, site: 0, team: 0, type: "FULL_TIME", start: "2019-08-01", title: "Senior Backend Engineer" },
    { email: "david.kumar@acme.tech", first: "David", last: "Kumar", dept: engDept.id, site: 3, team: 0, type: "FULL_TIME", start: "2020-05-12", title: "Backend Engineer" },
    { email: "olivia.brown@acme.tech", first: "Olivia", last: "Brown", dept: engDept.id, site: 1, team: 1, type: "FULL_TIME", start: "2018-09-20", title: "Engineering Manager" },
    { email: "lucas.silva@acme.tech", first: "Lucas", last: "Silva", dept: engDept.id, site: 1, team: 1, type: "FULL_TIME", start: "2019-01-15", title: "Senior Frontend Engineer" },
    { email: "isabella.rossi@acme.tech", first: "Isabella", last: "Rossi", dept: engDept.id, site: 4, team: 1, type: "FULL_TIME", start: "2021-06-01", title: "Frontend Engineer" },
    { email: "ryan.torres@acme.tech", first: "Ryan", last: "Torres", dept: engDept.id, site: 2, team: 2, type: "FULL_TIME", start: "2017-11-13", title: "Engineering Manager" },
    { email: "natalia.koleva@acme.tech", first: "Natalia", last: "Koleva", dept: engDept.id, site: 2, team: 2, type: "FULL_TIME", start: "2020-02-10", title: "DevOps Engineer" },
    { email: "marcus.johnson@acme.tech", first: "Marcus", last: "Johnson", dept: prodDept.id, site: 1, team: 3, type: "FULL_TIME", start: "2019-03-18", title: "Senior Product Manager" },
    { email: "sophie.martin@acme.tech", first: "Sophie", last: "Martin", dept: prodDept.id, site: 1, team: 4, type: "FULL_TIME", start: "2020-08-24", title: "Product Analyst" },
    { email: "carlos.mendez@acme.tech", first: "Carlos", last: "Mendez", dept: desDept.id, site: 2, team: 5, type: "FULL_TIME", start: "2017-09-25", title: "Design Lead" },
    { email: "yuki.tanaka@acme.tech", first: "Yuki", last: "Tanaka", dept: desDept.id, site: 4, team: 5, type: "FULL_TIME", start: "2021-01-11", title: "UI Designer" },
    { email: "rebecca.hall@acme.tech", first: "Rebecca", last: "Hall", dept: markDept.id, site: 3, team: 6, type: "FULL_TIME", start: "2018-05-14", title: "Marketing Manager" },
    { email: "thomas.weber@acme.tech", first: "Thomas", last: "Weber", dept: markDept.id, site: 3, team: 6, type: "FULL_TIME", start: "2020-09-07", title: "Content Writer" },
    { email: "amelia.lee@acme.tech", first: "Amelia", last: "Lee", dept: markDept.id, site: 0, team: 7, type: "FULL_TIME", start: "2021-03-22", title: "Growth Marketing Specialist" },
    { email: "christopher.quinn@acme.tech", first: "Christopher", last: "Quinn", dept: salesDept.id, site: 0, team: 8, type: "FULL_TIME", start: "2017-07-10", title: "Sales Manager" },
    { email: "diana.foster@acme.tech", first: "Diana", last: "Foster", dept: salesDept.id, site: 0, team: 8, type: "FULL_TIME", start: "2019-04-09", title: "Account Executive" },
    { email: "erik.anderson@acme.tech", first: "Erik", last: "Anderson", dept: salesDept.id, site: 3, team: 9, type: "FULL_TIME", start: "2020-10-19", title: "Sales Development Rep" },
    { email: "helen.clark@acme.tech", first: "Helen", last: "Clark", dept: hrDept.id, site: 0, team: null, type: "FULL_TIME", start: "2016-02-01", title: "HR Manager" },
    { email: "jessica.white@acme.tech", first: "Jessica", last: "White", dept: hrDept.id, site: 1, team: null, type: "FULL_TIME", start: "2019-11-04", title: "Recruiter" },
    { email: "george.phillips@acme.tech", first: "George", last: "Phillips", dept: finDept.id, site: 0, team: null, type: "FULL_TIME", start: "2015-08-17", title: "Finance Manager" },
    { email: "victoria.adams@acme.tech", first: "Victoria", last: "Adams", dept: finDept.id, site: 0, team: null, type: "FULL_TIME", start: "2020-01-20", title: "Accountant" },
    { email: "william.turner@acme.tech", first: "William", last: "Turner", dept: opsDept.id, site: 0, team: null, type: "FULL_TIME", start: "2018-10-08", title: "Operations Manager" },
    { email: "zoey.sanders@acme.tech", first: "Zoey", last: "Sanders", dept: hrDept.id, site: 0, team: null, type: "INTERN", start: "2023-06-01", title: "HR Intern" },
  ];

  const employees = await Promise.all(
    empData.map(e => prisma.employee.create({
      data: {
        companyId: company.id, email: e.email, firstName: e.first, lastName: e.last,
        displayName: e.first + " " + e.last, status: "ACTIVE", employmentType: e.type,
        startDate: new Date(e.start), departmentId: e.dept,
        siteId: sites[e.site].id, ...(e.team !== null ? { teamId: teams[e.team].id } : {}),
        personalInfo: JSON.stringify({ phone: "+1-555-0100" }),
        workInfo: JSON.stringify({ jobTitle: e.title }),
      },
    }))
  );

  // Set up manager relationships
  const mgrMap = [[1,0],[2,0],[3,0],[4,1],[5,4],[6,4],[7,1],[8,7],[9,7],[10,1],[11,10],[12,2],[13,2],[14,3],[15,14],[16,0],[17,16],[18,16],[19,0],[20,19],[21,19],[22,0],[23,22],[24,0],[25,24],[26,0],[27,22]];
  await Promise.all(mgrMap.map(([emp, mgr]) =>
    prisma.employee.update({ where: { id: employees[emp].id }, data: { managerId: employees[mgr].id } })
  ));

  // Create Users
  const adminPasswordHash = await bcrypt.hash("password123", 10);
  const employeePassword = await bcrypt.hash("password123", 10);
  await prisma.user.create({ data: { email: "admin@acme.tech", passwordHash: adminPasswordHash, role: "ADMIN" } });
  await Promise.all(employees.map(emp =>
    prisma.user.create({ data: { email: emp.email, passwordHash: employeePassword, role: "EMPLOYEE", employeeId: emp.id } })
  ));

  // Create Time Off Policies
  const policies = await Promise.all([
    prisma.timeOffPolicy.create({ data: { companyId: company.id, name: "Vacation", type: "VACATION", accrualRate: 2.083, maxCarryOver: 5, allowNegative: false } }),
    prisma.timeOffPolicy.create({ data: { companyId: company.id, name: "Sick Leave", type: "SICK", accrualRate: 0.833, maxCarryOver: 10, allowNegative: false } }),
    prisma.timeOffPolicy.create({ data: { companyId: company.id, name: "Personal Days", type: "PERSONAL", accrualRate: 0.417, maxCarryOver: 3, allowNegative: false } }),
  ]);

  // Create Time Off Requests
  const torData = [
    { emp: 4, pol: 0, start: "2024-06-10", end: "2024-06-14", days: 5, status: "APPROVED", reason: "Summer vacation", revBy: 1, revAt: "2024-05-15" },
    { emp: 5, pol: 1, start: "2024-03-15", end: "2024-03-15", days: 1, status: "APPROVED", reason: "Medical appointment", revBy: 4, revAt: "2024-03-10" },
    { emp: 7, pol: 0, start: "2024-07-20", end: "2024-08-02", days: 10, status: "PENDING", reason: "Vacation" },
    { emp: 10, pol: 2, start: "2024-04-15", end: "2024-04-15", days: 1, status: "APPROVED", reason: "Personal matter", revBy: 1, revAt: "2024-04-10" },
    { emp: 12, pol: 0, start: "2024-08-15", end: "2024-08-28", days: 10, status: "REJECTED", reason: "Conference + vacation", revBy: 2, revAt: "2024-08-01" },
    { emp: 14, pol: 0, start: "2024-09-01", end: "2024-09-14", days: 10, status: "PENDING", reason: "Summer break" },
    { emp: 17, pol: 1, start: "2024-05-20", end: "2024-05-20", days: 1, status: "APPROVED", reason: "Doctor appointment", revBy: 16, revAt: "2024-05-15" },
    { emp: 19, pol: 0, start: "2024-10-01", end: "2024-10-15", days: 10, status: "PENDING", reason: "Family vacation" },
    { emp: 22, pol: 0, start: "2024-07-01", end: "2024-07-12", days: 10, status: "APPROVED", reason: "Vacation", revBy: 0, revAt: "2024-06-15" },
    { emp: 24, pol: 1, start: "2024-04-08", end: "2024-04-08", days: 1, status: "APPROVED", reason: "Sick day", revBy: 0, revAt: "2024-04-05" },
  ];
  const timeOffRequests = await Promise.all(torData.map(t =>
    prisma.timeOffRequest.create({
      data: {
        employeeId: employees[t.emp].id, policyId: policies[t.pol].id,
        startDate: new Date(t.start), endDate: new Date(t.end), days: t.days,
        status: t.status, reason: t.reason,
        ...(t.revBy !== undefined ? { reviewedBy: employees[t.revBy].id, reviewedAt: new Date(t.revAt) } : {}),
      },
    })
  ));

  // Create Job Postings
  const jobPostings = await Promise.all([
    prisma.jobPosting.create({ data: { companyId: company.id, title: "Senior Backend Engineer", departmentId: engDept.id, siteId: sites[0].id, description: "Looking for an experienced backend engineer.", requirements: "5+ years Node.js, PostgreSQL", salaryMin: 120000, salaryMax: 160000, currency: "USD", status: "PUBLISHED", publishedAt: new Date("2024-02-01") } }),
    prisma.jobPosting.create({ data: { companyId: company.id, title: "Frontend Engineer", departmentId: engDept.id, siteId: sites[1].id, description: "Join our frontend team.", requirements: "3+ years React, TypeScript", salaryMin: 100000, salaryMax: 140000, currency: "USD", status: "PUBLISHED", publishedAt: new Date("2024-02-15") } }),
    prisma.jobPosting.create({ data: { companyId: company.id, title: "Product Manager", departmentId: prodDept.id, siteId: sites[1].id, description: "Lead product strategy.", requirements: "5+ years PM in B2B SaaS", salaryMin: 130000, salaryMax: 170000, currency: "USD", status: "PUBLISHED", publishedAt: new Date("2024-01-15") } }),
    prisma.jobPosting.create({ data: { companyId: company.id, title: "UX Designer", departmentId: desDept.id, siteId: sites[2].id, description: "Design intuitive interfaces.", requirements: "3+ years UX, Figma", salaryMin: 90000, salaryMax: 130000, currency: "USD", status: "PUBLISHED", publishedAt: new Date("2024-03-01") } }),
    prisma.jobPosting.create({ data: { companyId: company.id, title: "Account Executive", departmentId: salesDept.id, siteId: sites[0].id, description: "Manage enterprise clients.", requirements: "3+ years enterprise SaaS sales", salaryMin: 80000, salaryMax: 150000, currency: "USD", status: "DRAFT" } }),
  ]);

  // Create Candidates
  const candData = [
    { job: 0, first: "John", last: "Doe", email: "john.doe@email.com", phone: "+1-555-0201", stage: "APPLIED", source: "LinkedIn", rating: 4 },
    { job: 0, first: "Jane", last: "Smith", email: "jane.smith@email.com", phone: "+1-555-0202", stage: "SCREENING", source: "Referral", rating: 4.5 },
    { job: 0, first: "Michael", last: "Johnson", email: "michael.j@email.com", stage: "INTERVIEW", source: "Job Board", rating: 4.2 },
    { job: 0, first: "Sarah", last: "Williams", email: "sarah.w@email.com", stage: "ASSESSMENT", rating: 4.1 },
    { job: 1, first: "Alex", last: "Brown", email: "alex.b@email.com", phone: "+44-555-0203", stage: "APPLIED", source: "LinkedIn", rating: 3.8 },
    { job: 1, first: "Emily", last: "Davis", email: "emily.d@email.com", phone: "+44-555-0204", stage: "SCREENING", source: "Referral", rating: 4.6 },
    { job: 1, first: "David", last: "Miller", email: "david.m@email.com", stage: "INTERVIEW", rating: 4.0 },
    { job: 2, first: "Lisa", last: "Anderson", email: "lisa.a@email.com", phone: "+44-555-0205", stage: "INTERVIEW", source: "Recruiter", rating: 4.7 },
    { job: 2, first: "Robert", last: "Taylor", email: "robert.t@email.com", stage: "ASSESSMENT", rating: 4.3 },
    { job: 2, first: "Jennifer", last: "Martinez", email: "jennifer.m@email.com", stage: "OFFER", rating: 4.8 },
    { job: 3, first: "Thomas", last: "Garcia", email: "thomas.g@email.com", phone: "+972-555-0206", stage: "APPLIED", source: "Dribbble", rating: 4.4 },
    { job: 3, first: "Maria", last: "Rodriguez", email: "maria.r@email.com", stage: "SCREENING", source: "Job Board", rating: 4.5 },
    { job: 3, first: "Christopher", last: "Lee", email: "chris.l@email.com", stage: "INTERVIEW", rating: 4.2 },
    { job: 4, first: "Amanda", last: "White", email: "amanda.w@email.com", phone: "+1-555-0207", stage: "APPLIED", source: "LinkedIn", rating: 4.0 },
    { job: 4, first: "Paul", last: "Harris", email: "paul.h@email.com", stage: "REJECTED", rating: 2.5 },
  ];
  await Promise.all(candData.map(c =>
    prisma.candidate.create({
      data: { jobId: jobPostings[c.job].id, firstName: c.first, lastName: c.last, email: c.email, ...(c.phone ? { phone: c.phone } : {}), stage: c.stage, ...(c.source ? { source: c.source } : {}), rating: c.rating, notes: JSON.stringify([]) },
    })
  ));

  // Create Review Cycle
  const reviewCycle = await prisma.reviewCycle.create({
    data: { companyId: company.id, name: "2024 Annual Performance Review", type: "ANNUAL", startDate: new Date("2024-01-01"), endDate: new Date("2024-03-31"), status: "ACTIVE",
      template: JSON.stringify({ sections: ["Technical Skills","Communication","Teamwork","Leadership","Self-development"] }),
    },
  });

  // Create Performance Reviews
  await Promise.all([
    prisma.performanceReview.create({ data: { cycleId: reviewCycle.id, employeeId: employees[5].id, reviewerId: employees[4].id, type: "MANAGER", status: "SUBMITTED", rating: 4.5, responses: JSON.stringify({ technicalSkills: "Excellent", communication: "Very Good", teamwork: "Excellent" }), submittedAt: new Date("2024-02-15") } }),
    prisma.performanceReview.create({ data: { cycleId: reviewCycle.id, employeeId: employees[8].id, reviewerId: employees[7].id, type: "MANAGER", status: "IN_PROGRESS", responses: JSON.stringify({ technicalSkills: "Very Good" }) } }),
    prisma.performanceReview.create({ data: { cycleId: reviewCycle.id, employeeId: employees[12].id, reviewerId: employees[2].id, type: "MANAGER", status: "PENDING" } }),
    prisma.performanceReview.create({ data: { cycleId: reviewCycle.id, employeeId: employees[5].id, reviewerId: employees[5].id, type: "SELF", status: "SUBMITTED", responses: JSON.stringify({ technicalSkills: "Good" }), submittedAt: new Date("2024-02-10") } }),
    prisma.performanceReview.create({ data: { cycleId: reviewCycle.id, employeeId: employees[14].id, reviewerId: employees[3].id, type: "MANAGER", status: "SUBMITTED", rating: 4.7, responses: JSON.stringify({ technicalSkills: "Excellent", leadership: "Excellent" }), submittedAt: new Date("2024-02-20") } }),
  ]);

  // Create Goals
  const goals = await Promise.all([
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[5].id, title: "Improve API Response Times", description: "Reduce average API response time by 30%", type: "INDIVIDUAL", status: "ACTIVE", progress: 65, startDate: new Date("2024-01-01"), dueDate: new Date("2024-06-30") } }),
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[8].id, title: "Complete React Course", description: "Deepen React and hooks knowledge", type: "INDIVIDUAL", status: "ACTIVE", progress: 40, startDate: new Date("2024-02-01"), dueDate: new Date("2024-08-31") } }),
    prisma.goal.create({ data: { companyId: company.id, title: "Launch New Dashboard", description: "Complete redesign of admin dashboard", type: "TEAM", status: "ACTIVE", progress: 50, startDate: new Date("2024-01-15"), dueDate: new Date("2024-09-30") } }),
    prisma.goal.create({ data: { companyId: company.id, title: "Improve Customer Satisfaction", description: "Increase NPS score by 15 points", type: "DEPARTMENT", status: "ACTIVE", progress: 30, startDate: new Date("2024-01-01"), dueDate: new Date("2024-12-31") } }),
    prisma.goal.create({ data: { companyId: company.id, title: "Expand to Asian Market", description: "Establish operations in Asia", type: "COMPANY", status: "ACTIVE", progress: 20, startDate: new Date("2024-01-01"), dueDate: new Date("2025-12-31") } }),
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[14].id, title: "Design System Completion", description: "Establish comprehensive design system", type: "INDIVIDUAL", status: "ACTIVE", progress: 75, startDate: new Date("2024-01-01"), dueDate: new Date("2024-06-30") } }),
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[12].id, title: "Product Roadmap Execution", description: "Execute Q1-Q2 product roadmap", type: "INDIVIDUAL", status: "ACTIVE", progress: 45, startDate: new Date("2024-01-01"), dueDate: new Date("2024-06-30") } }),
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[19].id, title: "Increase Sales by 40%", description: "Grow revenue through new enterprise clients", type: "INDIVIDUAL", status: "ACTIVE", progress: 35, startDate: new Date("2024-01-01"), dueDate: new Date("2024-12-31") } }),
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[17].id, title: "Publish Monthly Blog Posts", description: "Write and publish 1 blog post per month", type: "INDIVIDUAL", status: "ACTIVE", progress: 50, startDate: new Date("2024-01-01"), dueDate: new Date("2024-12-31") } }),
    prisma.goal.create({ data: { companyId: company.id, employeeId: employees[22].id, title: "Implement New HRIS System", description: "Select and implement modern HR information system", type: "INDIVIDUAL", status: "ACTIVE", progress: 25, startDate: new Date("2024-02-01"), dueDate: new Date("2024-12-31") } }),
  ]);

  // Create Key Results
  await Promise.all([
    prisma.keyResult.create({ data: { goalId: goals[0].id, title: "Reduce P95 latency", targetValue: 200, currentValue: 290, unit: "ms" } }),
    prisma.keyResult.create({ data: { goalId: goals[0].id, title: "Reduce database queries per request", targetValue: 5, currentValue: 7, unit: "queries" } }),
    prisma.keyResult.create({ data: { goalId: goals[1].id, title: "Complete 12 course modules", targetValue: 12, currentValue: 5, unit: "modules" } }),
    prisma.keyResult.create({ data: { goalId: goals[2].id, title: "Complete design specifications", targetValue: 100, currentValue: 50, unit: "%" } }),
    prisma.keyResult.create({ data: { goalId: goals[2].id, title: "Implement frontend components", targetValue: 100, currentValue: 50, unit: "%" } }),
    prisma.keyResult.create({ data: { goalId: goals[3].id, title: "Increase NPS score", targetValue: 70, currentValue: 55, unit: "points" } }),
    prisma.keyResult.create({ data: { goalId: goals[4].id, title: "Open office in Singapore", targetValue: 1, currentValue: 0, unit: "offices" } }),
    prisma.keyResult.create({ data: { goalId: goals[5].id, title: "Design system components", targetValue: 100, currentValue: 75, unit: "components" } }),
    prisma.keyResult.create({ data: { goalId: goals[6].id, title: "Complete product features", targetValue: 15, currentValue: 7, unit: "features" } }),
    prisma.keyResult.create({ data: { goalId: goals[7].id, title: "Close enterprise deals", targetValue: 10, currentValue: 3, unit: "deals" } }),
    prisma.keyResult.create({ data: { goalId: goals[8].id, title: "Publish blog posts", targetValue: 12, currentValue: 6, unit: "posts" } }),
    prisma.keyResult.create({ data: { goalId: goals[9].id, title: "Complete vendor evaluation", targetValue: 3, currentValue: 1, unit: "vendors" } }),
  ]);

  // Create Compensation Records
  const compensations = await Promise.all([
    prisma.compensationRecord.create({ data: { employeeId: employees[0].id, effectiveDate: new Date("2023-01-01"), salary: 350000, currency: "USD", payFrequency: "MONTHLY", bonusTarget: 50000, changeReason: "Annual salary review", approvedBy: "BOARD" } }),
    prisma.compensationRecord.create({ data: { employeeId: employees[1].id, effectiveDate: new Date("2023-06-01"), salary: 220000, currency: "USD", payFrequency: "MONTHLY", bonusTarget: 30000, changeReason: "Promotion to VP", approvedBy: employees[0].id } }),
    prisma.compensationRecord.create({ data: { employeeId: employees[5].id, effectiveDate: new Date("2023-08-01"), salary: 140000, currency: "USD", payFrequency: "MONTHLY", bonusTarget: 15000, changeReason: "Merit increase", approvedBy: employees[1].id } }),
    prisma.compensationRecord.create({ data: { employeeId: employees[8].id, effectiveDate: new Date("2023-03-01"), salary: 120000, currency: "USD", payFrequency: "MONTHLY", bonusTarget: 12000, changeReason: "Hire", approvedBy: employees[1].id } }),
    prisma.compensationRecord.create({ data: { employeeId: employees[14].id, effectiveDate: new Date("2023-01-01"), salary: 130000, currency: "USD", payFrequency: "MONTHLY", bonusTarget: 15000, changeReason: "Annual review", approvedBy: employees[3].id } }),
  ]);

  // Create Salary Bands
  await Promise.all([
    prisma.salaryBand.create({ data: { companyId: company.id, jobFamily: "Engineering", level: "Senior", location: "New York", currency: "USD", minSalary: 130000, midSalary: 160000, maxSalary: 200000 } }),
    prisma.salaryBand.create({ data: { companyId: company.id, jobFamily: "Engineering", level: "Mid", location: "New York", currency: "USD", minSalary: 100000, midSalary: 125000, maxSalary: 150000 } }),
    prisma.salaryBand.create({ data: { companyId: company.id, jobFamily: "Product", level: "Senior", location: "London", currency: "GBP", minSalary: 110000, midSalary: 135000, maxSalary: 170000 } }),
  ]);

  // Create Surveys
  const surveys = await Promise.all([
    prisma.survey.create({ data: { companyId: company.id, title: "2024 Employee Engagement Survey", type: "ENGAGEMENT", status: "ACTIVE", anonymous: true, minAnonymousThreshold: 5,
      questions: JSON.stringify([{ id: "q1", text: "How satisfied are you with your role?", type: "scale", scale: 5 }, { id: "q2", text: "Do you have the tools to do your job effectively?", type: "yesno" }, { id: "q3", text: "How would you describe the company culture?", type: "text" }]) } }),
    prisma.survey.create({ data: { companyId: company.id, title: "Pulse Survey - March 2024", type: "PULSE", status: "ACTIVE", anonymous: true,
      questions: JSON.stringify([{ id: "p1", text: "How is morale this week?", type: "scale", scale: 5 }, { id: "p2", text: "Any concerns to discuss?", type: "text" }]) } }),
  ]);

  // Create Survey Responses
  await Promise.all([
    prisma.surveyResponse.create({ data: { surveyId: surveys[0].id, employeeId: employees[5].id, answers: JSON.stringify({ q1: 4, q2: true, q3: "Great team culture" }), submittedAt: new Date("2024-03-10") } }),
    prisma.surveyResponse.create({ data: { surveyId: surveys[0].id, employeeId: employees[8].id, answers: JSON.stringify({ q1: 5, q2: true, q3: "Supportive and inclusive" }), submittedAt: new Date("2024-03-11") } }),
    prisma.surveyResponse.create({ data: { surveyId: surveys[0].id, employeeId: employees[12].id, answers: JSON.stringify({ q1: 4, q2: false, q3: "Good but needs better communication" }), submittedAt: new Date("2024-03-12") } }),
    prisma.surveyResponse.create({ data: { surveyId: surveys[1].id, employeeId: employees[14].id, answers: JSON.stringify({ p1: 5, p2: "Everything going smoothly" }), submittedAt: new Date("2024-03-15") } }),
    prisma.surveyResponse.create({ data: { surveyId: surveys[1].id, employeeId: employees[17].id, answers: JSON.stringify({ p1: 4, p2: "No concerns" }), submittedAt: new Date("2024-03-15") } }),
  ]);

  // Create Documents
  await Promise.all([
    prisma.document.create({ data: { employeeId: employees[0].id, companyId: company.id, name: "Employment Contract - Sarah Johnson", type: "CONTRACT", folder: "employee_contracts", filePath: "/documents/contracts/sarah_contract.pdf", fileSize: 245000, mimeType: "application/pdf", uploadedBy: employees[22].id, signatureStatus: "SIGNED", expiresAt: new Date("2025-01-15") } }),
    prisma.document.create({ data: { employeeId: employees[5].id, companyId: company.id, name: "Employee Handbook Acknowledgment", type: "POLICY", folder: "handbooks", filePath: "/documents/policies/priya_handbook.pdf", fileSize: 1245000, mimeType: "application/pdf", uploadedBy: employees[22].id, signatureStatus: "SIGNED" } }),
    prisma.document.create({ data: { companyId: company.id, name: "Company Data Protection Policy", type: "POLICY", folder: "company_policies", filePath: "/documents/policies/data_protection.pdf", fileSize: 2345000, mimeType: "application/pdf", uploadedBy: employees[22].id, signatureStatus: "SIGNED" } }),
    prisma.document.create({ data: { companyId: company.id, name: "Code of Conduct", type: "POLICY", folder: "company_policies", filePath: "/documents/policies/code_of_conduct.pdf", fileSize: 1234000, mimeType: "application/pdf", uploadedBy: employees[22].id, signatureStatus: "SIGNED" } }),
  ]);

  // Create Positions
  await Promise.all([
    prisma.position.create({ data: { companyId: company.id, title: "Senior Backend Engineer", departmentId: engDept.id, siteId: sites[0].id, status: "OPEN", budgetedSalary: 150000, currency: "USD" } }),
    prisma.position.create({ data: { companyId: company.id, title: "Frontend Engineer", departmentId: engDept.id, siteId: sites[1].id, status: "FILLED", employeeId: employees[8].id, budgetedSalary: 130000, currency: "USD" } }),
    prisma.position.create({ data: { companyId: company.id, title: "Product Manager", departmentId: prodDept.id, siteId: sites[1].id, status: "FILLED", employeeId: employees[12].id, budgetedSalary: 160000, currency: "USD" } }),
  ]);

  // Audit Logs
  const [userSarah, userHelen] = await Promise.all([
    prisma.user.findFirst({ where: { employeeId: employees[0].id } }),
    prisma.user.findFirst({ where: { employeeId: employees[22].id } }),
  ]);
  await Promise.all([
    prisma.auditLog.create({ data: { companyId: company.id, userId: userSarah!.id, action: "CREATE", resource: "EMPLOYEE", resourceId: employees[5].id, changes: JSON.stringify({ status: "ACTIVE" }), ipAddress: "192.168.1.100" } }),
    prisma.auditLog.create({ data: { companyId: company.id, userId: userHelen!.id, action: "UPDATE", resource: "EMPLOYEE", resourceId: employees[5].id, changes: JSON.stringify({ department: "Engineering" }), ipAddress: "192.168.1.101" } }),
  ]);

  // Create Onboarding Templates
  const onboardingTemplates = await Promise.all([
    prisma.onboardingTemplate.create({ data: { companyId: company.id, name: "Engineering Onboarding", tasks: JSON.stringify(["Laptop setup","Git access","System design orientation","Meet the team","Code review training"]) } }),
    prisma.onboardingTemplate.create({ data: { companyId: company.id, name: "Sales Onboarding", tasks: JSON.stringify(["CRM training","Product training","Sales process overview","Client portfolio","Meet sales team"]) } }),
    prisma.onboardingTemplate.create({ data: { companyId: company.id, name: "General Company Onboarding", tasks: JSON.stringify(["Company orientation","Benefits enrollment","IT setup","Office tour","Team lunch"]) } }),
  ]);

  // Create Onboarding Tasks
  await Promise.all([
    prisma.onboardingTask.create({ data: { templateId: onboardingTemplates[0].id, employeeId: employees[9].id, title: "Laptop setup", description: "Complete laptop setup", assigneeType: "HR", assigneeId: employees[22].id, dueDate: new Date("2024-05-01"), status: "COMPLETED", completedAt: new Date("2024-04-30") } }),
    prisma.onboardingTask.create({ data: { templateId: onboardingTemplates[0].id, employeeId: employees[9].id, title: "Git access setup", description: "Grant GitHub access", assigneeType: "MANAGER", assigneeId: employees[7].id, dueDate: new Date("2024-05-02"), status: "COMPLETED", completedAt: new Date("2024-05-02") } }),
    prisma.onboardingTask.create({ data: { templateId: onboardingTemplates[1].id, employeeId: employees[21].id, title: "CRM training", description: "Salesforce training", assigneeType: "MANAGER", assigneeId: employees[19].id, dueDate: new Date("2024-02-15"), status: "COMPLETED", completedAt: new Date("2024-02-14") } }),
    prisma.onboardingTask.create({ data: { templateId: onboardingTemplates[1].id, employeeId: employees[21].id, title: "Product training", description: "Comprehensive product overview", assigneeType: "MANAGER", assigneeId: employees[19].id, dueDate: new Date("2024-02-20"), status: "IN_PROGRESS" } }),
  ]);

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
