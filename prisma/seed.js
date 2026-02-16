/* eslint-disable */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = 'test@test.com';
    const password = 'Test123@123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: 'ADMIN',
            isApproved: true,
        },
        create: {
            email,
            password: hashedPassword,
            role: 'ADMIN',
            isApproved: true,
        },
    });

    console.log('Admin user seeded:', { email: user.email, role: user.role });
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
