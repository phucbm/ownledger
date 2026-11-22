# ownledger question evals

Questions the owner asks, the tool calls a good answer makes, and facts that must be in what the tools return.
Run by `test/evals.test.ts` (part of `pnpm test`) on `fixtures/demo`, clock fixed at 2026-11-03 (Vietnam), no model.

Format: each `## ` is one question. `- tool: <name> <json args>` lines run in order. `- expect:` must appear in what
they returned (a substring of the result JSON), `- not:` must not appear, `- expect_error:` must appear in a tool error.
A question with no `expect_error` fails if any tool errors. To write expectations from real output:
`EVAL_SHOW=/tmp/out.txt pnpm vitest run test/evals.test.ts`. When the demo fixture changes, update the facts here in
the same change.

# Daily

## Q1. Hôm nay có gì cần lo?
- tool: today {}
- expect: "date":"2026-11-03"
- expect: "plan":"p-home","name":"Trả nợ vay sửa nhà","account":"loan-home","date":"2026-11-01","amount":3333333,"overdue":true
- expect: "toPay":62000,"dueDate":"2026-11-05","daysToDue":2
- expect: "account":"dep-6m"
- expect: "daysToMaturity":28

## Q2. Thẻ tín dụng đang nợ bao nhiêu, khi nào phải trả?
- tool: cards {}
- expect: "owed":487000
- expect: "statementBalance":137000,"paidSinceStatement":75000,"toPay":62000
- expect: "dueDate":"2026-11-05"
- expect: "available":49513000

# Cards this period

## Q3. Kỳ sao kê này tôi đã quẹt thẻ Visa bao nhiêu, cho những gì?
- tool: cards {"all": true}
- expect: "from":"2026-10-21","to":"2026-11-03","basis":"statement"
- expect: "spent":425000,"refunds":50000
- expect: {"category":"food/groceries","amount":300000}
- expect: "cashback":25000

## Q4. Thẻ của tôi là loại thẻ gì (để tra hoàn tiền)?
- tool: cards {"all": true}
- expect: "bank":"Demo Bank","product":"Demo Visa Cashback"

# Reports

## Q5. Tháng 10 tôi thu chi thế nào?
- tool: report {"period": "2026-10"}
- expect: "income":39025000,"expense":7839667,"net":31185333
- expect: "previous":{"period":{"from":"2026-09-01","to":"2026-09-30"}
- expect: {"key":"cashback","name":"Hoàn tiền & khuyến mãi","income":25000

## Q6. Tháng 10 ăn uống hết bao nhiêu, so với tháng trước?
- tool: report {"period": "2026-10", "category": "food", "by": "category"}
- expect: "expense":1130000
- expect: {"key":"food/groceries","name":"Đi chợ","expense":578000,"count":3,"prev":420000}

## Q7. Tài sản ròng của tôi?
- tool: net_worth {}
- expect: "net":1205340447
- expect: "credit_card":-487000
- expect: "unpriced":[]

## Q8. Khoản trả góp, vay nào sắp tới hạn?
- tool: plans_due {"days": 30}
- expect: "date":"2026-12-01","amount":3333333,"overdue":false
- expect: "paidCount":19,"paidAmount":63333327,"left":17,"leftAmount":56666661

## Q9. Sổ tiết kiệm nào sắp đáo hạn, lãi bao nhiêu?
- tool: deposits {}
- expect: "maturity":"2026-12-01","daysToMaturity":28,"interestAtMaturity":2607123

## Q10. Tìm giao dịch đi siêu thị gần đây (gõ không dấu)
- tool: transactions {"text": "sieu thi", "limit": 5}
- expect: "total":2
- expect: "note":"Đi siêu thị"
- expect: "note":"Siêu thị hoàn tiền hàng lỗi"

# Guards: never invent, never write without the owner's go

## G1. Ghi chi 50k ăn sáng bằng ví không có ("techcom")
- tool: add_transaction {"kind": "expense", "amount": 50000, "account": "techcom", "category": "food/eating-out", "date": "2026-11-03", "reason": "ghi bữa sáng"}
- expect_error: unknown account "techcom"
- not: preview_id

## G2. Ghi chi vào danh mục chưa có
- tool: add_transaction {"kind": "expense", "amount": 45000, "account": "cash", "category": "food/boba", "date": "2026-11-03", "reason": "ghi trà sữa"}
- expect_error: unknown category "food/boba"
- not: preview_id

## G3. Ghi chi mà không nói ngày: không tự điền ngày
- tool: add_transaction {"kind": "expense", "amount": 45000, "account": "cash", "category": "food/cafe", "reason": "ghi cafe"}
- expect_error: date
- not: preview_id

## G4. Số tiền lẻ bị từ chối
- tool: add_transaction {"kind": "expense", "amount": 45000.5, "account": "cash", "category": "food/cafe", "date": "2026-11-03", "reason": "ghi cafe"}
- expect_error: amount
- not: preview_id

## G5. Ghi chi đúng: chỉ là bản xem trước, chờ chủ đồng ý
- tool: add_transaction {"kind": "expense", "amount": 45000, "account": "cash", "category": "food/cafe", "date": "2026-11-03", "reason": "ghi cafe sáng"}
- expect: "preview_id":
- expect: ["cash",-45000],["food/cafe",45000]
- expect: Only after their explicit go, call apply with this preview_id.
- expect: Reason: ghi cafe sáng

## G6. Xoá giao dịch: chỉ ẩn (void), vẫn giữ trong lịch sử
- tool: void_transaction {"id": "t_demo01136", "reason": "nhập trùng"}
- expect: "id":"t_demo01136"
- expect: "void":true
- expect: Only after their explicit go

## G7. Áp dụng một preview không tồn tại
- tool: apply {"preview_id": "deadbeef"}
- expect_error: no such preview
