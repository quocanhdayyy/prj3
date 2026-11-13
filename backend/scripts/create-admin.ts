import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { prisma } from "../src/config/prisma";
import { createUser } from "../src/services/user.service";

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Chạy lệnh này trong Terminal tương tác.");
  if (await prisma.user.findFirst({ where: { role: "ADMIN" } })) {
    throw new Error("Đã có Admin. Dùng tài khoản Admin đó để quản lý User qua API.");
  }
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const username = (await prompt.question("Username Admin (3–50 ký tự): ")).trim().toLowerCase();
    const email = (await prompt.question("Email Admin: ")).trim().toLowerCase();
    const pending = prompt.question("Mật khẩu (8–128 ký tự, không hiển thị): ");
    muted = true;
    const password = await pending;
    muted = false; process.stdout.write("\n");
    const confirmation = prompt.question("Nhập lại mật khẩu: ");
    muted = true;
    const repeated = await confirmation;
    muted = false; process.stdout.write("\n");
    if (!/^[a-z0-9_]{3,50}$/.test(username) || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Username hoặc email không hợp lệ.");
    }
    if (password.length < 8 || password.length > 128 || !password.trim() || password !== repeated) {
      throw new Error("Mật khẩu không hợp lệ hoặc xác nhận không khớp.");
    }
    const user = await createUser({ username, email, password, role: "ADMIN" });
    console.log(`Đã tạo Admin ID ${user.id}. Có thể đăng nhập bằng /api/auth/login.`);
  } finally { muted = false; prompt.close(); }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Không thể tạo Admin.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
