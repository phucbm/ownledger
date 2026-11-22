/**
 * A made-up export shaped like MISA Sổ Thu Chi's "Bảng kê thu chi" (same layout as observed; every row invented).
 * Writes fixtures/misa/bang-ke-demo.xlsx and bang-ke-demo-newer.xlsx (two more rows, for re-import).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeXlsx } from "../src/import/xlsx-write.js";
import type { Cell } from "../src/import/workbook.js";

type R = { date: string; time: string; in?: number; out?: number; parent?: string; child?: string; who?: string; event?: string; note?: string };
const W = {
  cash: "cash",
  card: "vcb visa _1234 🗓️20💸5 hạn mức 50tr chính", // > 31 chars: Excel cuts the sheet name
  dep: "gửi 6 tháng từ 01/07/2025",
  momo1: "momo",
  momo2: "momo", // duplicate wallet name → sheet "momo_5"
  fund: "chứng chỉ quỹ",
};
const sheetName = (full: string, n: number, used: Set<string>) => {
  // Excel cuts at 31 UTF-16 units; MISA writes a cut emoji half as _xD83D_
  let s = full.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
  if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1) + `_x${s.charCodeAt(s.length - 1).toString(16).toUpperCase()}_`;
  if (used.has(s)) s = `${s}_${n}`;
  used.add(s);
  return s;
};

function rows(extra: boolean): Record<string, { full: string; opening: number; rows: R[] }> {
  const cash: R[] = [
    { date: "02/01/2025", time: "08:10", out: 45000, parent: "Chi tiêu hàng ngày", child: "Ăn uống", note: "Phở" },
    { date: "02/01/2025", time: "12:30", out: 45000, parent: "Chi tiêu hàng ngày", child: "Ăn uống", note: "Phở" },
    { date: "02/01/2025", time: "12:30", out: 45000, parent: "Chi tiêu hàng ngày", child: "Ăn uống", note: "Phở" }, // identical twin row
    { date: "05/01/2025", time: "09:00", in: 30000000.3200002, parent: "Tiền vào", note: "Lương" },
    { date: "06/01/2025", time: "10:00", out: 5000000, note: "Chuyển tới momo" },
    { date: "07/01/2025", time: "18:00", out: 1200000, parent: "Chi tiêu không thường xuyên", child: "Hiếu hỉ", who: "Bạn A", note: "Đám cưới" },
    { date: "10/01/2025", time: "07:45", in: 500000, note: "Bán đồ cũ" }, // income with no category
    { date: "15/01/2025", time: "20:00", out: 8000000, note: "Chuyển tới " + W.card }, // pay the card
    { date: "01/07/2025", time: "09:00", out: 10000000, note: "Gửi tiết kiệm tài khoản " + W.dep + " (Chuyển tới cash)" },
    { date: "01/01/2026", time: "09:05", in: 10260000.4, note: "Tất toán sổ tiết kiệm " + W.dep + " (Chuyển từ " + W.dep + ")" },
    { date: "02/01/2026", time: "11:00", out: 2000000, note: "Vcbf mgf (Chuyển tới chứng chỉ quỹ)" },
    { date: "02/01/2026", time: "15:00", out: 17000000, note: "8500k/chỉ" }, // gold bought, no wallet in MISA
    { date: "02/01/2026", time: "16:00", out: 1234, parent: "Khoản chi bí ẩn", note: "Điều chỉnh số dư tài khoản" }, // MISA balance fix: _adjust by rule
    { date: "03/01/2026", time: "11:00", out: 300000, parent: "Chi tiêu hàng ngày", child: "Đi lại", event: "Đà Lạt 2026", note: "Xe" },
  ];
  if (extra) cash.push({ date: "20/01/2026", time: "19:00", out: 99000, parent: "Chi tiêu hàng ngày", child: "Ăn uống", note: "Bún" });
  const card: R[] = [
    { date: "03/01/2025", time: "19:00", out: 7999999.7, parent: "Chi tiêu không thường xuyên", child: "Mua sắm lớn", note: "Máy lạnh" },
    { date: "15/01/2025", time: "20:00", in: 8000000, note: "Chuyển từ cash" },
    { date: "16/01/2025", time: "12:00", out: 250000, parent: "Hoá đơn", child: "Internet", note: "" },
  ];
  if (extra) card.push({ date: "18/01/2026", time: "12:00", out: 59000, parent: "Hoá đơn", child: "Internet", note: "Tên miền" });
  const dep: R[] = [
    { date: "01/07/2025", time: "09:00", in: 10000000, note: "Gửi tiết kiệm tài khoản " + W.dep + " (Chuyển từ cash)" },
    { date: "01/01/2026", time: "09:00", in: 260000.6, parent: "Tiền vào", child: "Tiền lãi", note: "Lãi" },
    { date: "01/01/2026", time: "09:05", out: 10260000.4, note: "Tất toán sổ tiết kiệm " + W.dep + " (Chuyển tới cash)" },
  ];
  const momo1: R[] = [
    { date: "06/01/2025", time: "10:00", in: 5000000, note: "Chuyển từ cash" },
    { date: "08/01/2025", time: "21:00", out: 150000, parent: "Chi tiêu hàng ngày", child: "Ăn uống", note: "" },
    { date: "09/01/2025", time: "21:00", out: 70000, note: "Chuyển tới ví không có trong file" }, // unpaired on purpose
  ];
  const momo2: R[] = [{ date: "11/01/2025", time: "09:00", in: 20000, parent: "Tiền vào", child: "Hoàn tiền", note: "Cashback" }];
  const fund: R[] = [{ date: "02/01/2026", time: "11:00", in: 2000000, note: "Vcbf mgf (Chuyển từ cash)" }];
  return {
    cash: { full: W.cash, opening: 100000, rows: cash },
    card: { full: W.card, opening: 0, rows: card },
    dep: { full: W.dep, opening: 0, rows: dep },
    momo1: { full: W.momo1, opening: 0, rows: momo1 },
    momo2: { full: W.momo2, opening: 0, rows: momo2 },
    fund: { full: W.fund, opening: 0, rows: fund },
  };
}

function sheet(opening: number, rs: R[]): Cell[][] {
  const tin = rs.reduce((s, r) => s + (r.in ?? 0), 0);
  const tout = rs.reduce((s, r) => s + (r.out ?? 0), 0);
  const out: Cell[][] = [
    [],
    [null, null, "SỔ THU CHI"],
    [null, null, "Giải pháp Tài chính Cá nhân"],
    ["Bảng Kê Thu Chi"],
    ["Từ ngày 01/01/1753 đến ngày 01/01/9999"],
    [],
    [null, null, null, null, null, null, null, "Tổng thu", tin, "Số dư đầu kì", opening],
    [null, null, null, null, null, null, null, "Tổng chi", tout, "Số dư cuối kì", opening + tin - tout],
    [null, null, null, null, null, null, null, null, null, null, "Đơn vị tiền tệ: VND"],
    ["STT", "Ngày", "Giờ", "Số tiền thu", "Số tiền chi", "Số dư", "Hạng mục cha", "Hạng mục con", "Chi cho ai", "Chuyến đi/Sự kiện", "Diễn giải"],
  ];
  // newest first, running balance
  const key = (r: R) => r.date.split("/").reverse().join("-") + r.time;
  const sorted = rs.map((r, i) => ({ r, i })).sort((a, b) => (key(a.r) < key(b.r) ? -1 : key(a.r) > key(b.r) ? 1 : a.i - b.i));
  let bal = opening;
  const withBal = sorted.map(({ r }) => {
    bal += (r.in ?? 0) - (r.out ?? 0);
    return { r, bal };
  });
  withBal.reverse().forEach(({ r, bal }, i) => {
    out.push([i + 1, r.date, r.time, r.in ?? 0, r.out ?? 0, bal, r.parent ?? null, r.child ?? null, r.who ?? null, r.event ?? null, r.note ?? null]);
  });
  return out;
}

const dir = join(import.meta.dirname, "..", "fixtures", "misa");
mkdirSync(dir, { recursive: true });
for (const [file, extra] of [["bang-ke-demo.xlsx", false], ["bang-ke-demo-newer.xlsx", true]] as const) {
  const used = new Set<string>();
  const data = rows(extra);
  const sheets = Object.values(data).map((w, n) => ({ name: sheetName(w.full, n, used), rows: sheet(w.opening, w.rows) }));
  writeFileSync(join(dir, file), writeXlsx(sheets));
  if (!extra) console.log(sheets.map((s) => s.name));
}
