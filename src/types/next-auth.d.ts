import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            role: string;
            isApproved: boolean;
        } & DefaultSession["user"];
    }

    interface User {
        role: string;
        isApproved: boolean;
        id: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        role: string;
        isApproved: boolean;
        id: string;
    }
}
