import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma v7+ requires a non-empty PrismaClientOptions.
// For Postgres, use the driver adapter.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

// Export a singleton client for the whole app.
const prisma = new PrismaClient({ adapter });
export default prisma;
