import { DefaultSession, DefaultUser } from "next-auth";
import { Role } from "@prisma/client";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            role: Role;
        } & DefaultSession["user"];
    }

    interface User extends DefaultUser {
        role: Role;
        id: string; // Add id to User interface as well
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        role: Role;
        id: string;
    }
}
