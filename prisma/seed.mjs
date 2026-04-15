import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import prismaPackage from "@prisma/client";

const { PrismaClient } = prismaPackage;

const prisma = new PrismaClient();

function generateInviteCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

async function upsertDemoUser({ email, password, displayName }) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      displayName,
      passwordHash,
    },
    create: {
      email: normalizedEmail,
      displayName,
      passwordHash,
    },
  });
}

async function main() {
  if (process.env.SEED_DEMO_USERS !== "true") {
    console.log("SEED_DEMO_USERS=false, seed atlandi.");
    return;
  }

  const demoUsers = [
    {
      email: process.env.DEMO_USER_1_EMAIL,
      password: process.env.DEMO_USER_1_PASSWORD,
      displayName: process.env.DEMO_USER_1_NAME,
    },
    {
      email: process.env.DEMO_USER_2_EMAIL,
      password: process.env.DEMO_USER_2_PASSWORD,
      displayName: process.env.DEMO_USER_2_NAME,
    },
  ].filter((item) => item.email && item.password && item.displayName);

  if (demoUsers.length === 0) {
    console.log("Demo kullanicilari tanimli degil, seed atlandi.");
    return;
  }

  const createdUsers = [];
  for (const user of demoUsers) {
    createdUsers.push(await upsertDemoUser(user));
  }

  if (createdUsers.length !== 2) {
    console.log("Sadece kullanicilar olusturuldu. Cift baglantisi icin iki demo kullanici gerekli.");
    return;
  }

  const memberships = await prisma.coupleMembership.findMany({
    where: {
      userId: {
        in: createdUsers.map((user) => user.id),
      },
    },
  });

  if (memberships.length > 0) {
    console.log("Demo kullanicilarindan en az biri zaten bir cift odasina bagli.");
    return;
  }

  const inviteCode = generateInviteCode();
  const couple = await prisma.couple.create({
    data: {
      name: `${createdUsers[0].displayName} & ${createdUsers[1].displayName}`,
      inviteCode,
      memberships: {
        create: createdUsers.map((user) => ({
          userId: user.id,
        })),
      },
    },
  });

  console.log(`Demo cift olusturuldu. inviteCode=${couple.inviteCode}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
