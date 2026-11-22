import type { CategoriesFile, CategoryNode } from "./types.js";

type N = [id: string, vi: string, en: string, children?: N[]];

const INCOME: N[] = [
  ["salary", "Lương", "Salary"],
  ["freelance", "Làm thêm", "Freelance"],
  ["interest", "Lãi & cổ tức", "Interest & dividends"],
  ["cashback", "Hoàn tiền & khuyến mãi", "Cashback & promos"],
  ["gifts-received", "Được tặng", "Gifts received"],
  ["other-income", "Thu khác", "Other income"],
];

const EXPENSE: N[] = [
  ["food", "Ăn uống", "Food", [
    ["eating-out", "Ăn ngoài", "Eating out"],
    ["cafe", "Cafe", "Cafe"],
    ["groceries", "Đi chợ", "Groceries"],
  ]],
  ["transport", "Đi lại", "Transport", [
    ["fuel", "Xăng", "Fuel"],
    ["fares", "Vé xe & gửi xe", "Fares & parking"],
    ["vehicle", "Sửa xe", "Vehicle repairs"],
  ]],
  ["home", "Nhà cửa", "Home", [
    ["electricity", "Điện nước", "Electricity & water"],
    ["internet", "Internet", "Internet"],
    ["repairs", "Sửa chữa", "Repairs"],
    ["household", "Đồ gia dụng", "Household items"],
    ["plants", "Cây cảnh", "Plants"],
  ]],
  ["family", "Gia đình", "Family", [
    ["parents", "Bố mẹ", "Parents"],
    ["gifts-weddings", "Quà & đám cưới", "Gifts & weddings"],
  ]],
  ["health", "Sức khoẻ & thể thao", "Health & sport", [
    ["sport", "Thể thao", "Sport"],
    ["medical", "Khám chữa bệnh", "Medical"],
    ["personal-care", "Chăm sóc cá nhân", "Personal care"],
    ["insurance", "Phí bảo hiểm", "Insurance premiums"],
  ]],
  ["shopping", "Mua sắm", "Shopping", [
    ["clothes", "Quần áo", "Clothes"],
    ["big-purchases", "Đồ lớn", "Big purchases"],
  ]],
  ["fun", "Giải trí & du lịch", "Fun & travel", [
    ["entertainment", "Giải trí", "Entertainment"],
    ["trips", "Du lịch", "Trips"],
  ]],
  ["learning", "Học tập", "Learning"],
  ["work-tools", "Công cụ làm việc", "Work tools"],
  ["subscriptions", "Điện thoại & dịch vụ", "Phone & subscriptions"],
  ["bank-fees", "Phí & lãi ngân hàng", "Bank fees & interest paid"],
  ["other", "Chi khác", "Other / unknown"],
];

function build(nodes: N[], lang: "vi" | "en"): CategoryNode[] {
  return nodes.map(([id, vi, en, children]) => {
    const n: CategoryNode = { id, name: lang === "vi" ? vi : en };
    if (children) n.children = build(children, lang);
    return n;
  });
}

export function defaultCategories(lang: "vi" | "en" = "vi"): CategoriesFile {
  return { income: build(INCOME, lang), expense: build(EXPENSE, lang) };
}
