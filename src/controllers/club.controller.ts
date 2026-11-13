import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import type { UpdateClubInput } from "../services/club.service";
import {
  getClubs,
  createClub,
  getClubById,
  updateClub,
  deleteClub,
} from "../services/club.service";

export const editClub = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawId = req.params.id;
    if (
      typeof rawId !== "string" ||
      !/^[0-9]+$/.test(rawId) ||
      Number(rawId) < 1 ||
      Number(rawId) > 2147483647
    ) {
      res.status(400).json({ status: "error", message: "ID không hợp lệ." });
      return;
    }

    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({
        status: "error",
        message: "Body phải là một đối tượng JSON.",
      });
      return;
    }

    const input = body as Record<string, unknown>;
    const fields = Object.keys(input);
    const allowedFields = ["name", "country", "league", "foundedYear"];
    if (
      fields.length === 0 ||
      fields.some((field) => !allowedFields.includes(field))
    ) {
      res.status(400).json({
        status: "error",
        message: "Chỉ gửi các trường cần sửa: name, country, league, foundedYear.",
      });
      return;
    }

    const data: UpdateClubInput = {};
    for (const field of ["name", "country", "league"] as const) {
      if (Object.hasOwn(input, field)) {
        const value = input[field];
        if (
          typeof value !== "string" ||
          value.trim().length === 0 ||
          value.trim().length > 100
        ) {
          res.status(400).json({
            status: "error",
            message: `${field} phải có từ 1 đến 100 ký tự.`,
          });
          return;
        }
        data[field] = value.trim();
      }
    }

    if (Object.hasOwn(input, "foundedYear")) {
      const value = input.foundedYear;
      if (value !== null && (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > new Date().getFullYear()
      )) {
        res.status(400).json({
          status: "error",
          message: "Năm thành lập không hợp lệ.",
        });
        return;
      }
      data.foundedYear = value;
    }

    const club = await updateClub(Number(rawId), data);
    res.json({ status: "success", data: club });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).json({
        status: "error",
        message: "Không tìm thấy CLB.",
      });
      return;
    }
    next(error);
  }
};

export const listClubs = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const clubs = await getClubs();

    res.json({
      status: "success",
      data: clubs,
    });
  } catch (error) {
    next(error);
  }
};
export const addClub = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, country, league, foundedYear = null } = req.body ?? {};

    const validText = (value: unknown): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= 100;

    if (!validText(name) || !validText(country) || !validText(league)) {
      res.status(400).json({
        status: "error",
        message: "Tên, quốc gia và giải đấu phải có từ 1 đến 100 ký tự.",
      });
      return;
    }

    if (foundedYear !== null && (
      typeof foundedYear !== "number" ||
      !Number.isInteger(foundedYear) ||
      foundedYear < 1 ||
      foundedYear > new Date().getFullYear()
    )) {
      res.status(400).json({
        status: "error",
        message: "Năm thành lập phải là số nguyên từ 1 đến năm hiện tại.",
      });
      return;
    }

    const club = await createClub({
      name: name.trim(),
      country: country.trim(),
      league: league.trim(),
      foundedYear,
    });

    res.status(201).json({
      status: "success",
      data: club,
    });
  } catch (error) {
    next(error);
  }
};

export const getClubDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawId = req.params.id;

    if (typeof rawId !== "string" || !/^[0-9]+$/.test(rawId)) {
      res.status(400).json({
        status: "error",
        message: "ID phải là số nguyên dương.",
      });
      return;
    }

    const id = Number(rawId);

    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      res.status(400).json({
        status: "error",
        message: "ID nằm ngoài phạm vi hợp lệ.",
      });
      return;
    }

    const club = await getClubById(id);

    if (!club) {
      res.status(404).json({
        status: "error",
        message: "Không tìm thấy CLB.",
      });
      return;
    }

    res.json({
      status: "success",
      data: club,
    });
  } catch (error) {
    next(error);
  }
};

export const removeClub = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawId = req.params.id;

    if (typeof rawId !== "string" || !/^[0-9]+$/.test(rawId)) {
      res.status(400).json({
        status: "error",
        message: "ID phải là số nguyên dương.",
      });
      return;
    }

    const id = Number(rawId);

    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      res.status(400).json({
        status: "error",
        message: "ID nằm ngoài phạm vi hợp lệ.",
      });
      return;
    }

    await deleteClub(id);

    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      res.status(409).json({ status: "error", message: "Không thể xóa CLB đang có hợp đồng hoặc nhu cầu chuyển nhượng." });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).json({
        status: "error",
        message: "Không tìm thấy CLB.",
      });
      return;
    }
    next(error);
  }
};
