import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const password = await hash("Test123@123", 10);

    const admin = await prisma.user.upsert({
        where: { email: "test@test.com" },
        update: {},
        create: {
            email: "test@test.com",
            password,
            role: "ADMIN",
            isApproved: true,
        },
    });

    console.log({ admin });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
