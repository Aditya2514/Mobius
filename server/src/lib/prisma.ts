import { PrismaClient } from '@prisma/client';

/** The one PrismaClient for the whole process. Only services import this. */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
