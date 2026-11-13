import { prisma } from "../config/prisma";

export type UpdateClubInput = {
  name?: string;
  country?: string;
  league?: string;
  foundedYear?: number | null;
};

export const updateClub = async (id: number, data: UpdateClubInput) => {
  return prisma.club.update({ where: { id }, data });
};

export const getClubs = async () => {
  return prisma.club.findMany({
    orderBy: { id: "asc" },
  });
};
type CreateClubInput = {
  name: string;
  country: string;
  league: string;
  foundedYear: number | null;
};

export const createClub = async (data: CreateClubInput) => {
  return prisma.club.create({
    data: {
      name: data.name,
      country: data.country,
      league: data.league,
      foundedYear: data.foundedYear,
    },
  });
};

export const getClubById = async (id: number) => {
  return prisma.club.findUnique({
    where: { id },
  });
};

export const deleteClub = async (id: number) => {
  return prisma.club.delete({
    where: { id },
  });
};
