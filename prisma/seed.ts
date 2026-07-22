import { hash } from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_MASTER_EMAIL ?? "admin@driving.com";
  const password = process.env.SUPER_MASTER_PASSWORD ?? "123456";
  const passwordHash = await hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: Role.SUPER_MASTER,
      nickname: "슈퍼마스터",
      suspended: false,
    },
    create: {
      email,
      passwordHash,
      role: Role.SUPER_MASTER,
      nickname: "슈퍼마스터",
    },
  });

  console.log(`Seeded super master: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
