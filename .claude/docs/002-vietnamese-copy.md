# 002: Vietnamese copy for review

Generated 2026-11-22 from `web/src/i18n/vi.ts` and `en.ts` (575 strings). Mark changes in the Vietnamese column; your own data (account and category names, notes) is never translated.

## app

| key | Tiếng Việt | English |
|---|---|---|
| `app.name` | ownledger | ownledger |

## nav

| key | Tiếng Việt | English |
|---|---|---|
| `nav.home` | Tổng quan | Overview |
| `nav.transactions` | Giao dịch | Transactions |
| `nav.accounts` | Tài khoản | Accounts |
| `nav.plans` | Kế hoạch | Plans |
| `nav.reports` | Báo cáo | Reports |
| `nav.import` | Nhập dữ liệu | Import |
| `nav.settings` | Cài đặt | Settings |
| `nav.more` | Thêm | More |
| `nav.main` | Điều hướng chính | Main navigation |
| `nav.cards` | Thẻ | Cards |

## lang

| key | Tiếng Việt | English |
|---|---|---|
| `lang.label` | Ngôn ngữ | Language |
| `lang.vi` | VI | VI |
| `lang.en` | EN | EN |

## auth

| key | Tiếng Việt | English |
|---|---|---|
| `auth.signIn` | Đăng nhập bằng GitHub | Sign in with GitHub |
| `auth.signInHint` | Đăng nhập để xem sổ tài chính của bạn. | Sign in to see your ledger. |
| `auth.signOut` | Đăng xuất | Sign out |
| `auth.signedInAs` | Đang đăng nhập: {login} | Signed in as {login} |

## common

| key | Tiếng Việt | English |
|---|---|---|
| `common.add` | Thêm | Add |
| `common.loading` | Đang tải… | Loading… |
| `common.error` | Không tải được dữ liệu: {message} | Could not load data: {message} |
| `common.retry` | Thử lại | Try again |
| `common.copy` | Sao chép | Copy |
| `common.showLess` | Thu gọn | Show less |
| `common.cancel` | Huỷ | Cancel |

## home

| key | Tiếng Việt | English |
|---|---|---|
| `home.title` | Tổng quan | Overview |
| `home.headline` | {spent} đã chi {month} | {spent} spent in {month} |
| `home.headlineUsual` | {spent} đã chi {month} · thường là {usual} đến hôm nay | {spent} spent in {month} · usually {usual} by this day |

## transactions

| key | Tiếng Việt | English |
|---|---|---|
| `transactions.title` | Giao dịch | Transactions |

## accounts

| key | Tiếng Việt | English |
|---|---|---|
| `accounts.title` | Tài khoản | Accounts |
| `accounts.closedOn` | Đóng ngày {date} | Closed {date} |
| `accounts.noPrice` | Chưa có giá | No price |
| `accounts.qty` | {n} đơn vị | {n} units |
| `accounts.price` | giá {price} ngày {date} | price {price} on {date} |
| `accounts.cost` | vốn | cost |
| `accounts.cardPage` | Trang thẻ | Card page |
| `accounts.inactive` | Không hoạt động | Inactive |
| `accounts.closed` | Đã đóng | Closed |
| `accounts.empty` | Chưa có tài khoản nào. | No accounts yet. |
| `accounts.netWorth` | Tài sản ròng | Net worth |
| `accounts.assets` | Tài sản | Assets |
| `accounts.liabilities` | Nợ | Liabilities |
| `accounts.byType` | Tài sản ròng theo loại tài khoản | Net worth by account type |
| `accounts.other` | Khác | Other |
| `accounts.inPool` | one: {n} tài khoản / other: {n} tài khoản | one: {n} account / other: {n} accounts |
| `accounts.expand` | Xem các tài khoản trong {name} | Show the accounts in {name} |

## plans

| key | Tiếng Việt | English |
|---|---|---|
| `plans.title` | Kế hoạch | Plans |
| `plans.overdue` | Quá hạn | Overdue |
| `plans.next30` | 30 ngày tới | Next 30 days |
| `plans.perDay` | Số tiền đến hạn mỗi ngày | Amount due per day |
| `plans.progress` | Trả góp và khoản vay | Instalments and loans |
| `plans.recurring` | Định kỳ | Recurring |
| `plans.perPayment` | Mỗi kỳ | Per payment |
| `plans.lateCount` | one: trễ {n} kỳ / other: trễ {n} kỳ | one: {n} late / other: {n} late |
| `plans.next` | kỳ tới {date} | next {date} |
| `plans.overdueTotal` | Quá hạn ({n}): | Overdue ({n}): |
| `plans.empty` | Chưa có kế hoạch nào. Thêm một kế hoạch cho khoản vay, trả góp hoặc khoản trả định kỳ. | No plans yet. Add one for a loan, an instalment or a payment that repeats. |

## reports

| key | Tiếng Việt | English |
|---|---|---|
| `reports.title` | Báo cáo | Reports |
| `reports.headline` | đã chi trong kỳ này | spent in this period |
| `reports.headlineUsual` | đã chi · thường là {usual} | spent · usually {usual} |
| `reports.badRange` | Ngày bắt đầu sau ngày kết thúc. | The start date is after the end date. |
| `reports.compare` | So với mức thường lệ | Compared with your usual |
| `reports.kind` | Chi hay thu | Spending or income |
| `reports.groupBy` | Nhóm theo | Group by |
| `reports.by.top` | Nhóm chính | Main category |
| `reports.by.category` | Danh mục | Category |
| `reports.by.account` | Tài khoản | Account |
| `reports.by.who` | Người | Who |
| `reports.by.event` | Sự kiện | Event |
| `reports.by.tag` | Nhãn | Tag |
| `reports.empty` | Kỳ này chưa có gì. | Nothing in this period. |
| `reports.thisPeriod` | Kỳ này | This period |
| `reports.usual` | Thường lệ | Usual |
| `reports.change` | Chênh lệch | Change |
| `reports.none` | (không có) | (none) |
| `reports.total` | Tổng | Total |
| `reports.bestCard` | Thẻ nên dùng cho {name} | Best card for {name} |
| `reports.usualNote` | Thường lệ là trung bình {n} tháng trước, cho kỳ cùng độ dài. | Usual is the average of the last {n} months, for a period of the same length. |
| `reports.byMonth` | Thu và chi theo tháng | Income and spending by month |

## import

| key | Tiếng Việt | English |
|---|---|---|
| `import.title` | Nhập dữ liệu | Import |
| `import.cli` | Để nhập dữ liệu từ một ứng dụng, thiết lập một lần bằng CLI cùng AI của bạn (npx ownledger import, xem AGENTS.md). Sau đó bạn nhập các bản xuất mới hơn ngay tại đây. | To import from an app, set it up once with the CLI and your AI (npx ownledger import, see AGENTS.md). After that you can import newer exports here. |
| `import.intro` | Nhập bản xuất mới hơn từ ứng dụng bạn đã nhập một lần. Tệp được đọc ngay trong trình duyệt và chỉ gửi đến Worker của bạn. Chỉ khi bạn xác nhận mới ghi dữ liệu. | Import a newer export from an app you already imported once. The file is read in your browser and sent only to your own Worker. Nothing is written until you confirm. |
| `import.choose` | Chọn tệp | Choose a file |
| `import.mapping` | Cách đọc dữ liệu (mapping) | Mapping |
| `import.mappingOne` | Mapping: {name} | Mapping: {name} |
| `import.file` | Tệp xuất (.xlsx, .csv, .json) | Export file (.xlsx, .csv, .json) |
| `import.reading` | Đang đọc và đối chiếu… | Reading and reconciling… |
| `import.preview` | Xem trước | Preview |
| `import.result` | Kết quả xem trước | Result of the preview |
| `import.reconciles` | Khớp với số dư của ứng dụng | Reconciles with the app's balances |
| `import.refused` | Bị từ chối: sẽ không nhập gì | Refused: nothing will be imported |
| `import.summary` | {rows} dòng · {skipped} đã nhập trước đó · | {rows} rows · {skipped} already imported · |
| `import.newCount` | {n} mới | {n} new |
| `import.newAccounts` | one: {n} tài khoản mới / other: {n} tài khoản mới | one: {n} new account / other: {n} new accounts |
| `import.matches` | {ok}/{total} tài khoản khớp số dư của ứng dụng. | {ok} of {total} accounts match the app's own balances. |
| `import.problems` | Tài khoản không khớp ({n}) | Accounts that do not match ({n}) |
| `import.account` | Tài khoản | Account |
| `import.problem` | Vấn đề | Problem |
| `import.unresolvedCategories` | Danh mục chưa có trong mapping ({n}) | Categories not in the mapping ({n}) |
| `import.rowsCount` | one: {n} dòng / other: {n} dòng | one: {n} row / other: {n} rows |
| `import.unresolvedRows` | Dòng chưa xếp được ({n}) | Rows that could not be placed ({n}) |
| `import.unpaired` | Chuyển khoản thiếu phía còn lại ({n}) | Transfers without their other side ({n}) |
| `import.changedGone` | {changed} dòng đã đổi và {gone} dòng đã mất ở nguồn: chưa áp dụng, hãy tự quyết định. | {changed} changed and {gone} gone in the source: not applied, decide by hand. |
| `import.rounding` | Đã ghi điều chỉnh làm tròn ở {n} tài khoản. | Rounding adjustments booked on {n} accounts. |
| `import.zeroed` | {n} tài khoản đã đóng được đưa về 0. | {n} closed accounts brought to zero. |
| `import.cardTerms` | Điều khoản thẻ được cập nhật ở {n} tài khoản | Card terms updated on {n} accounts |
| `import.nameWarnings` | Cảnh báo từ tên ví ({n}) | Warnings from wallet names ({n}) |
| `import.errors` | Lỗi ({n}) | Errors ({n}) |
| `import.sample` | Giao dịch mới ({n} đầu tiên) | New transactions (first {n}) |
| `import.committed` | Đã lưu {sha}: | Committed {sha}: |
| `import.committing` | Đang lưu… | Committing… |
| `import.commit` | one: Lưu {n} giao dịch / other: Lưu {n} giao dịch | one: Commit {n} transaction / other: Commit {n} transactions |
| `import.nothingNew` | Không có gì mới để nhập. | Nothing new to import. |

## settings

| key | Tiếng Việt | English |
|---|---|---|
| `settings.title` | Cài đặt | Settings |
| `settings.version` | Phiên bản {version} | Version {version} |
| `settings.saving` | Đang lưu… | Saving… |
| `settings.save` | Lưu | Save |
| `settings.saved` | Đã lưu | Saved |
| `settings.connector` | Địa chỉ connector | Connector address |
| `settings.connectorHint` | Thêm địa chỉ này làm connector tùy chỉnh (MCP) trong Claude hoặc ChatGPT, rồi đăng nhập bằng GitHub. | Add this address as a custom connector (MCP) in Claude or ChatGPT, then sign in with GitHub. |
| `settings.reset` | Đặt lại trang Tổng quan | Reset dashboard |
| `settings.resetHint` | Đưa trang Tổng quan về các widget mặc định. Các cài đặt khác được giữ nguyên. | Puts Home back to the default widgets. Your other settings stay. |
| `settings.resetConfirm` | Đúng, đặt lại | Yes, reset |
| `settings.resetDone` | Đã đặt lại. | Dashboard reset. |
| `settings.apps` | Ứng dụng đã kết nối | Connected apps |
| `settings.appsEmpty` | Chưa có ứng dụng nào kết nối. | No app is connected yet. |
| `settings.connectedOn` | Kết nối ngày {date} | Connected on {date} |
| `settings.revoke` | Thu hồi | Revoke |
| `settings.revokeConfirm` | Đúng, thu hồi | Yes, revoke |
| `settings.data` | Dữ liệu của bạn | Your data |
| `settings.repo` | Kho dữ liệu | Data repository |
| `settings.commit` | Commit mới nhất | Latest commit |
| `settings.checkLabel` | Kiểm tra sổ | Ledger check |
| `settings.check` | {errors} lỗi, {warnings} cảnh báo | {errors} errors, {warnings} warnings |
| `settings.versionLabel` | Phiên bản | Version |

## ask

| key | Tiếng Việt | English |
|---|---|---|
| `ask.button` | Hỏi AI | Ask AI |
| `ask.copied` | Đã chép | Copied |
| `ask.editTx` | Trong ownledger, sửa giúp mình giao dịch {id} ({summary}, ngày {date}):  | In ownledger, edit transaction {id} ({summary}, dated {date}):  |
| `ask.generic` | Trong ownledger, giúp mình xử lý việc này: {title} | In ownledger, help me with this: {title} |
| `ask.negative` | Trong ownledger, tài khoản {name} đang âm. Giúp mình tìm giao dịch bị thiếu hoặc nhập sai. | In ownledger, the account {name} is negative. Help me find the missing or wrong transaction. |
| `ask.plan` | Trong ownledger, ghi giúp mình khoản đã trả cho kế hoạch "{name}" hoặc dời lịch nếu cần. | In ownledger, record the payment for the plan "{name}", or move its schedule if needed. |
| `ask.uncategorised` | one: Trong ownledger, phân loại giúp mình {n} giao dịch chưa có danh mục từ {from}. / other: Trong ownledger, phân loại giúp mình {n} giao dịch chưa có danh mục từ {from}. | one: In ownledger, categorise the {n} transaction without a category since {from}. / other: In ownledger, categorise the {n} transactions without a category since {from}. |
| `ask.unmatched` | Trong ownledger, tài khoản {name} có chuyển khoản chưa khớp bên kia. Giúp mình tìm và ghép lại. | In ownledger, the account {name} has transfers without their other side. Help me find and match them. |
| `ask.cardTerms` | Trong ownledger, đặt thông tin cho thẻ {name}: {list}. Hỏi tôi các giá trị rồi lưu bằng set_card_details. | In ownledger, set the details of the card {name}: {list}. Ask me for the values, then save them with set_card_details. |
| `ask.cardRecord` | Trong ownledger, thêm hồ sơ cho thẻ {name}: ngân hàng, mạng thẻ, 4 số cuối, trạng thái và phí thường niên. | In ownledger, add the card record for {name}: bank, network, last 4 digits, status and annual fee. |
| `ask.check` | Trong ownledger, chạy kiểm tra sổ và giúp tôi sửa các lỗi và cảnh báo. | In ownledger, run the ledger check and help me fix its errors and warnings. |
| `ask.addPlan` | Trong ownledger, thêm một kế hoạch cho khoản trả định kỳ: trả góp, khoản vay hoặc gói đăng ký. | In ownledger, add a plan for a payment that repeats: an instalment, a loan or a subscription. |

## delta

| key | Tiếng Việt | English |
|---|---|---|
| `delta.up` | tăng | up |
| `delta.down` | giảm | down |

## widget

| key | Tiếng Việt | English |
|---|---|---|
| `widget.pace` | Tháng này | This month |
| `widget.attention` | Cần bạn xử lý | Needs you |
| `widget.unusual` | Có gì khác | What's different |
| `widget.netWorth` | Tài sản ròng | Net worth |
| `widget.left` | Còn lại tháng này | Left this month |
| `widget.byCategory` | Chi theo danh mục | Spending by category |
| `widget.incomeSpending` | Thu và chi | Income vs spending |
| `widget.recent` | Giao dịch gần đây | Recent transactions |
| `widget.account` | Tài khoản | Account |
| `widget.upcoming` | Sắp tới | Upcoming |
| `widget.deposits` | Tiền gửi | Deposits |
| `widget.chart` | Biểu đồ | Chart |
| `widget.cards` | Thẻ tín dụng | Credit cards |
| `widget.cashback` | Hoàn tiền kỳ này | Cashback this period |
| `widget.which_card` | Nên dùng thẻ nào? | Which card? |
| `widget.cards_value` | Thẻ: có đáng giữ? | Cards: worth it? |
| `widget.aiMark` | AI | AI |
| `widget.byAi` | Do AI thêm vào | Added by AI |
| `widget.desc.pace` | Đã chi trong tháng so với mức thường lệ đến ngày này, kèm dự kiến cuối tháng. | Spent so far this month against your usual by this day, with a month-end estimate. |
| `widget.desc.attention` | Một danh sách việc cần xử lý: khoản đến hạn, sao kê, tiền gửi, dữ liệu cần dọn. | One list of what to deal with: overdue plans, statements, deposits, housekeeping. |
| `widget.desc.unusual` | Điều khác thường so với mọi tháng: danh mục tăng giảm, nơi chi mới, giao dịch lớn. | What changed against your usual: a category up or down, new payees, large transactions. |
| `widget.desc.net_worth` | Tài sản ròng, thay đổi trong tháng và trong năm, kèm đường 12 tháng. | Your net worth, the change this month and this year, and a 12-month line. |
| `widget.desc.left` | Thu trừ chi đến hôm nay, và còn lại bao nhiêu vào cuối tháng. | Income so far minus spending so far, and what is left at month end. |
| `widget.desc.by_category` | Thanh chi tiêu theo danh mục trong khoảng bạn chọn, kèm tỷ trọng và mức thay đổi. | Bars of spending by category for a period you choose, with share and change. |
| `widget.desc.income_spending` | Cột thu và chi theo từng tháng, kèm tỷ lệ tiết kiệm. | Columns of income and spending per month, with the savings rate. |
| `widget.desc.recent` | Các giao dịch mới nhất, mới lên trên. | The latest transactions, newest first. |
| `widget.desc.account` | Số dư một tài khoản và đường diễn biến trong năm. | One account's balance and its line over the year. |
| `widget.desc.upcoming` | 30 ngày tới: khoản đến hạn theo từng tuần. | The next 30 days: what is due, week by week. |
| `widget.desc.deposits` | Đếm ngược ngày đáo hạn tiền gửi và lãi khi đáo hạn. | Deposit maturity countdowns and interest at maturity. |
| `widget.desc.cards` | Thẻ tín dụng: đã dùng so với hạn mức, số cần trả, số ngày đến hạn. | Credit cards: used against limit, amount to pay, days to the due date. |
| `widget.desc.cashback` | Hoàn tiền kỳ này, theo từng thẻ. | Cashback earned this period, card by card. |
| `widget.desc.which_card` | Nên quẹt thẻ nào cho từng danh mục. | Which card to use for a category. |
| `widget.desc.cards_value` | Từng thẻ đem lại nhiều hơn phí thường niên hay không. | Whether each card earns more than its fee. |

## pool

| key | Tiếng Việt | English |
|---|---|---|
| `pool.name` | Tiền của tôi | My money |
| `pool.hint` | Các tài khoản dùng hằng ngày (tiền mặt, ngân hàng, ví điện tử) hiện thành một số dư. Trong dữ liệu chúng vẫn tách riêng: đây chỉ là cách hiển thị. | Everyday accounts (cash, banks, e-wallets) show as one balance. They stay separate in your data: this only changes how they are shown. |
| `pool.on` | Gộp thành một số dư | Show as one balance |
| `pool.nameLabel` | Tên gọi | Name |
| `pool.default` | Tài khoản mặc định cho chi tiêu hằng ngày | Default account for everyday spending |
| `pool.noDefault` | Không chọn | None |
| `pool.defaultHint` | Dùng khi bạn nói "chi 50k cà phê" mà không nêu tài khoản. | Used when you say "spent 50k on coffee" without naming an account. |
| `pool.accounts` | Tài khoản trong đó ({n}/{total}) | Accounts in it ({n} of {total}) |
| `pool.all` | Chọn tất cả | Select all |
| `pool.none` | Bỏ chọn hết | Select none |

## pace

| key | Tiếng Việt | English |
|---|---|---|
| `pace.thisMonth` | Tháng này | This month |
| `pace.lastMonth` | Tháng trước | Last month |
| `pace.usual` | Thường lệ | Usual |
| `pace.vsUsual` | so với thường lệ | vs usual |
| `pace.vsLast` | so với tháng trước | vs last month |
| `pace.estimate` | Dự kiến cuối tháng: | Estimated month end: |
| `pace.range` | Vùng thường lệ (tháng thấp nhất đến cao nhất) | Usual range (lowest to highest month) |
| `pace.low` | Thấp nhất | Lowest |
| `pace.high` | Cao nhất | Highest |

## left

| key | Tiếng Việt | English |
|---|---|---|
| `left.monthEnd` | Cuối tháng dự kiến: | Estimated at month end: |

## nw

| key | Tiếng Việt | English |
|---|---|---|
| `nw.changeMonth` | Tháng này | This month |
| `nw.change12` | 12 tháng qua | Last 12 months |
| `nw.unpriced` | {n} khoản chưa có giá, chưa tính vào tổng. | {n} holdings have no price and are left out of the total. |

## attention

| key | Tiếng Việt | English |
|---|---|---|
| `attention.empty` | Không có gì cần xử lý. Sổ của bạn đang gọn. | Nothing needs you. Your ledger is tidy. |
| `attention.seeAll` | Xem tất cả ({n}) | See all ({n}) |
| `attention.today` | hôm nay | today |
| `attention.inDays` | one: còn {n} ngày / other: còn {n} ngày | one: in {n} day / other: in {n} days |
| `attention.overdueDays` | one: quá {n} ngày / other: quá {n} ngày | one: {n} day overdue / other: {n} days overdue |
| `attention.sev.red` | Gấp | Urgent |
| `attention.sev.amber` | Sắp đến hạn | Due soon |
| `attention.sev.info` | Cần xem | To review |
| `attention.card_due` | Thẻ {name}: sắp đến hạn trả | Card {name}: payment due soon |
| `attention.card_overdue` | Thẻ {name}: quá hạn trả | Card {name}: payment overdue |
| `attention.card_near_limit` | Thẻ {name} đã dùng {pct}% hạn mức | Card {name} is at {pct}% of its limit |
| `attention.deposit_maturing` | Sổ tiết kiệm {name} sắp đáo hạn | Deposit {name} matures soon |
| `attention.deposit_matured` | Sổ tiết kiệm {name} đã đáo hạn | Deposit {name} has matured |
| `attention.plan_due` | {name}: sắp đến hạn | {name}: due soon |
| `attention.plan_overdue` | {name}: đã quá hạn | {name}: overdue |
| `attention.unpriced` | Chưa có giá: {accounts} | No price yet: {accounts} |
| `attention.over_budget` | Vượt ngân sách: {category} | Over budget: {category} |
| `attention.uncategorised` | {count} giao dịch chưa có danh mục | one: {count} transaction without a category / other: {count} transactions without a category |
| `attention.unmatched` | Chuyển khoản chưa khớp: {name} | Unmatched transfers: {name} |
| `attention.negative` | {name} đang âm | {name} is negative |
| `attention.check_errors` | Kiểm tra sổ: {count} lỗi | Ledger check: {count} errors |
| `attention.check_warnings` | Kiểm tra sổ: {count} cảnh báo | Ledger check: {count} warnings |

## unusual

| key | Tiếng Việt | English |
|---|---|---|
| `unusual.empty` | Tháng này chưa có gì khác thường. | Nothing unusual this month. |
| `unusual.needHistory` | Cần ít nhất 2 tháng dữ liệu để so với thường lệ. | It needs at least 2 months of history to compare with your usual. |
| `unusual.vsUsual` | {pct}% so với thường lệ | {pct}% vs usual |
| `unusual.new` | Mới | New |
| `unusual.new_category` | Mới: danh mục {name} | New: category {name} |
| `unusual.new_who` | Mới: "{who}" | New: "{who}" |
| `unusual.times` | one: {n} lần / other: {n} lần | one: {n} time / other: {n} times |
| `unusual.large` | Lớn bất thường | Unusually large |
| `unusual.large_label` | Lớn bất thường: {name} | Unusually large: {name} |

## bycat

| key | Tiếng Việt | English |
|---|---|---|
| `bycat.total` | Tổng chi | Total spent |
| `bycat.empty` | Chưa có khoản chi nào trong kỳ này. | No spending in this period yet. |

## incsp

| key | Tiếng Việt | English |
|---|---|---|
| `incsp.empty` | Chưa có thu chi trong các tháng này. | No income or spending in these months. |
| `incsp.noIncome` | Chưa ghi nhận thu nhập trong kỳ. | No income recorded in this period. |
| `incsp.rate` | Tỷ lệ tiết kiệm {pct}% | Savings rate {pct}% |
| `incsp.rateShort` | Tiết kiệm | Savings |

## recent

| key | Tiếng Việt | English |
|---|---|---|
| `recent.empty` | Chưa có giao dịch nào. | No transactions yet. |

## account

| key | Tiếng Việt | English |
|---|---|---|
| `account.pick` | Widget này chưa chọn tài khoản. | This widget has no account chosen yet. |
| `account.empty` | Tài khoản này chưa có số dư để vẽ. | This account has no balance to draw yet. |
| `account.balance` | Số dư | Balance |

## upcoming

| key | Tiếng Việt | English |
|---|---|---|
| `upcoming.empty` | Không có khoản nào đến hạn trong 30 ngày tới. | Nothing is due in the next 30 days. |
| `upcoming.total` | Phải trả trong 30 ngày: | To pay in 30 days: |
| `upcoming.weeks` | Số tiền đến hạn theo tuần | Amount due per week |
| `upcoming.overdue` | Quá hạn từ {date} | Overdue since {date} |

## deposits

| key | Tiếng Việt | English |
|---|---|---|
| `deposits.empty` | Chưa có sổ tiết kiệm nào. | No deposits yet. |
| `deposits.inDays` | one: còn {n} ngày / other: còn {n} ngày | one: {n} day left / other: {n} days left |
| `deposits.matured` | Đã đáo hạn | Matured |
| `deposits.noMaturity` | Không kỳ hạn | No fixed term |
| `deposits.interest` | Lãi khi đáo hạn: | Interest at maturity: |

## chart

| key | Tiếng Việt | English |
|---|---|---|
| `chart.showTable` | Xem dạng bảng | Show as table |
| `chart.showChart` | Xem dạng biểu đồ | Show as chart |
| `chart.day` | Ngày | Day |
| `chart.month` | Tháng | Month |
| `chart.item` | Mục | Item |
| `chart.value` | Giá trị | Value |
| `chart.compare` | So sánh | Compared |
| `chart.previous` | Kỳ trước | Previous period |
| `chart.vsPrevious` | so với kỳ trước | vs previous period |
| `chart.empty` | Không có dữ liệu cho truy vấn này. | No data for this query. |
| `chart.noQuery` | Widget này chưa có truy vấn. | This widget has no query yet. |
| `chart.metric.spending` | Chi tiêu | Spending |
| `chart.metric.income` | Thu nhập | Income |
| `chart.metric.net` | Ròng | Net |
| `chart.metric.balance` | Số dư | Balance |
| `chart.metric.count` | Số giao dịch | Transactions |

## start

| key | Tiếng Việt | English |
|---|---|---|
| `start.title` | Bắt đầu với ownledger | Get started with ownledger |
| `start.intro` | Sổ của bạn còn trống. Ba bước để có dữ liệu đầu tiên: | Your ledger is empty. Three steps to your first data: |
| `start.s1.title` | Thêm connector vào Claude hoặc ChatGPT | Add the connector in Claude or ChatGPT |
| `start.s1.body` | Thêm địa chỉ dưới đây làm connector (MCP) tùy chỉnh, rồi đăng nhập bằng GitHub. | Add the address below as a custom connector (MCP), then sign in with GitHub. |
| `start.s1.prompt` | Giúp mình thêm connector MCP tùy chỉnh có địa chỉ {url} và đăng nhập bằng GitHub. | Help me add a custom MCP connector with the address {url} and sign in with GitHub. |
| `start.s2.title` | Nói cho AI biết các tài khoản của bạn | Tell the AI your accounts |
| `start.s2.body` | Tiền mặt, ngân hàng, ví điện tử, thẻ tín dụng. Số dư đầu kỳ là số hiện có. | Cash, banks, e-wallets, credit cards. The opening balance is what you hold now. |
| `start.s2.prompt` | Trong ownledger, tạo giúp mình các tài khoản: tiền mặt, ngân hàng VCB, ví MoMo. Mình sẽ cho bạn số dư hiện tại của từng tài khoản. | In ownledger, create my accounts: cash, VCB bank, MoMo wallet. I will give you the current balance of each. |
| `start.s3.title` | Ghi khoản chi đầu tiên | Add your first spending |
| `start.s3.body` | Chỉ cần kể bằng lời, AI sẽ chọn danh mục và hỏi lại khi chưa rõ. | Just say it in words; the AI picks the category and asks when unsure. |
| `start.s3.prompt` | Trong ownledger, ghi giúp mình hôm nay chi 45.000 đồng uống cà phê. | In ownledger, record that I spent 45,000 on coffee today. |

## filter

| key | Tiếng Việt | English |
|---|---|---|
| `filter.searchLabel` | Tìm giao dịch | Search transactions |
| `filter.searchPlaceholder` | Tìm ghi chú, người, sự kiện… | Search notes, people, events… |
| `filter.account` | Tài khoản | Account |
| `filter.category` | Danh mục | Category |
| `filter.search` | Tìm… | Search… |
| `filter.noMatch` | Không có kết quả. | No match. |
| `filter.closed` | Đã đóng | Closed |
| `filter.remove` | Bỏ lọc {name} | Remove filter {name} |
| `filter.clear` | Xem tất cả giao dịch | Show all transactions |
| `filter.within` | Gồm chuyển khoản trong {name} | Include moves inside {name} |

## period

| key | Tiếng Việt | English |
|---|---|---|
| `period.label` | Khoảng thời gian | Period |
| `period.thisMonth` | Tháng này | This month |
| `period.lastMonth` | Tháng trước | Last month |
| `period.3months` | 3 tháng | 3 months |
| `period.thisYear` | Năm nay | This year |
| `period.all` | Tất cả | All time |
| `period.custom` | Tùy chọn | Custom |
| `period.from` | Từ | From |
| `period.to` | Đến | To |
| `period.6months` | 6 tháng | 6 months |
| `period.lastYear` | Năm ngoái | Last year |

## chip

| key | Tiếng Việt | English |
|---|---|---|
| `chip.who` | Người: {v} | Who: {v} |
| `chip.event` | Sự kiện: {v} | Event: {v} |
| `chip.plan` | Kế hoạch: {v} | Plan: {v} |
| `chip.tx` | Một giao dịch | One transaction |

## tx

| key | Tiếng Việt | English |
|---|---|---|
| `tx.in` | Thu | In |
| `tx.out` | Chi | Out |
| `tx.net` | Ròng | Net |
| `tx.count` | one: {n} giao dịch / other: {n} giao dịch | one: {n} transaction / other: {n} transactions |
| `tx.transfer` | Chuyển khoản | Transfer |
| `tx.today` | Hôm nay | Today |
| `tx.yesterday` | Hôm qua | Yesterday |
| `tx.loadMore` | Xem thêm | Load more |
| `tx.empty` | Chưa có giao dịch nào. | No transactions yet. |
| `tx.emptyFiltered` | Không có giao dịch nào khớp bộ lọc này. | No transaction matches this filter. |
| `tx.balanceCol` | Số dư sau giao dịch | Balance after each transaction |
| `tx.lines` | Các dòng | Lines |
| `tx.who` | Người | Who |
| `tx.event` | Sự kiện | Event |
| `tx.tags` | Thẻ | Tags |
| `tx.plan` | Kế hoạch | Plan |
| `tx.id` | Mã | ID |
| `tx.void` | Giao dịch này đã bị huỷ. | This transaction was voided. |
| `tx.askEdit` | Hỏi AI sửa giao dịch này | Ask AI to edit this |

## pin

| key | Tiếng Việt | English |
|---|---|---|
| `pin.button` | Ghim lên Tổng quan | Pin to Home |
| `pin.title` | Ghim vào Tổng quan | Pin to Home |
| `pin.description` | Thêm biểu đồ này vào Tổng quan như một widget và lưu ngay. | Adds this chart to Home as a widget and saves it right away. |
| `pin.titleLabel` | Tiêu đề widget | Widget title |
| `pin.save` | Ghim | Pin |
| `pin.saving` | Đang ghim… | Pinning… |
| `pin.done` | Đã ghim. | Pinned. |
| `pin.doneHint` | Widget nằm ở cuối Tổng quan. | It is at the end of Home. |
| `pin.openHome` | Mở Tổng quan | Open Home |
| `pin.close` | Đóng | Close |
| `pin.error` | Chưa ghim được: {message} | Not pinned: {message} |

## cards

| key | Tiếng Việt | English |
|---|---|---|
| `cards.title` | Thẻ | Cards |
| `cards.off` | Sổ chưa có thẻ tín dụng nào. | The ledger has no credit cards yet. |
| `cards.headline` | one: Đang nợ {owed} trên {n} thẻ / other: Đang nợ {owed} trên {n} thẻ | one: {owed} owed on {n} card / other: {owed} owed on {n} cards |
| `cards.totals` | Tổng | Totals |
| `cards.owedAll` | Đang nợ trên mọi thẻ | Owed on all cards |
| `cards.dueWeek` | Đến hạn tuần này | Due this week |
| `cards.dueMonth` | Đến hạn tháng này | Due this month |
| `cards.filter` | Trạng thái thẻ | Card status |
| `cards.group.active` | Đang dùng | Active |
| `cards.group.locked` | Đã khoá | Locked |
| `cards.group.cancelled` | Đã huỷ | Cancelled |
| `cards.credit` | Thẻ tín dụng | Credit cards |
| `cards.debit` | Thẻ ghi nợ và ATM | Debit and ATM cards |
| `cards.debitHint` | Các thẻ này chi từ tiền của bạn nên không có số dư riêng. | These spend from your everyday money, so they have no balance of their own. |
| `cards.emptyCredit` | Không có thẻ tín dụng nào ở đây. | No credit cards here. |
| `cards.last4` | •••• {n} | •••• {n} |
| `cards.nothingToPay` | Không phải trả | Nothing to pay |
| `cards.noStatement` | Chưa có sao kê | No statement yet |
| `cards.cashbackShort` | Hoàn tiền | Cashback |
| `cards.rateNotSet` | chưa đặt tỷ lệ | rate not set |
| `cards.capLeft` | còn {amount} đến mức trần | {amount} left to the cap |
| `cards.used` | Đã dùng so với hạn mức | Used of the limit |
| `cards.ofLimit` | trên | of |
| `cards.limitAtLeast` | ≥ {amount} | ≥ {amount} |
| `cards.noLimit` | Chưa đặt hạn mức | No limit set |
| `cards.overdueDays` | one: quá hạn {n} ngày / other: quá hạn {n} ngày | one: {n} day overdue / other: {n} days overdue |
| `cards.dueToday` | đến hạn hôm nay | due today |
| `cards.daysLeft` | one: còn {n} ngày / other: còn {n} ngày | one: {n} day left / other: {n} days left |
| `cards.st.none` | Không có khoản phải trả | Nothing to pay |
| `cards.st.paid` | Đã trả đủ | Paid in full |
| `cards.st.due` | Chờ thanh toán | Waiting for payment |
| `cards.st.late` | Trả trễ | Paid late |
| `cards.st.partly` | Mới trả một phần | Partly paid |
| `cards.st.unpaid` | Chưa trả | Not paid |
| `cards.st.open` | Đang mở | Open |
| `cards.status.active` | Đang dùng | Active |
| `cards.status.locked` | Đã khoá | Locked |
| `cards.status.inactive` | Chưa dùng | Not used |
| `cards.status.cancelled` | Đã huỷ | Cancelled |
| `cards.missing` | Còn thiếu: {list} | Missing: {list} |
| `cards.missing.statement_day` | ngày sao kê | statement day |
| `cards.missing.due_day` | ngày đến hạn | due day |
| `cards.missing.limit` | hạn mức | limit |
| `cards.missing.cashback_rates` | tỷ lệ hoàn tiền | cashback rates |
| `cards.kind.credit` | Tín dụng | Credit |
| `cards.kind.debit` | Ghi nợ | Debit |
| `cards.kind.atm` | ATM | ATM |
| `cards.annualFee` | Phí thường niên | Annual fee |
| `cards.noFee` | Không phí thường niên | No annual fee |
| `cards.value.hint` | Lợi ích + hoàn tiền − phí. Thẻ lỗ nhất trong 12 tháng qua ở trên cùng. | Benefits + cashback − fees. The card that cost most in the last 12 months comes first. |
| `cards.value.total` | Tất cả thẻ, 12 tháng qua: {amount} | All cards, last 12 months: {amount} |
| `cards.value.sinceIssued` | Từ khi mở | Since issued |
| `cards.value.estimated` | phí ước tính | fees estimated |
| `cards.value.parts` | lợi ích {benefits} + hoàn tiền {cashback} − phí {fees} | benefits {benefits} + cashback {cashback} − fees {fees} |
| `cards.value.empty` | Chưa có số liệu giá trị thẻ. | No card values yet. |
| `cards.value.benefits` | Lợi ích | Benefits |
| `cards.value.fees` | Phí thường niên | Annual fees |
| `cards.value.last12` | 12 tháng qua | Last 12 months |
| `cards.back` | Tất cả thẻ | All cards |
| `cards.notFound` | Không tìm thấy thẻ này. | This card was not found. |
| `cards.currentPeriod` | Kỳ hiện tại | Current period |
| `cards.purchasesSoFar` | Đã chi trong kỳ | Purchases so far |
| `cards.closesOn` | Chốt sao kê | Statement closes |
| `cards.payByToday` | Mua hôm nay: trả trước | A purchase made today: pay by |
| `cards.noActivity` | Kỳ này chưa có giao dịch. | No activity in this period yet. |
| `cards.noStatementDay` | Chưa đặt ngày sao kê nên chưa tính được sao kê. | No statement day is set, so statements cannot be worked out. |
| `cards.lastStatement` | Sao kê gần nhất | Last statement |
| `cards.statementOf` | Sao kê ngày {date} | Statement of {date} |
| `cards.amountDue` | Số tiền phải trả | Amount due |
| `cards.dueDate` | Hạn thanh toán | Due date |
| `cards.paid` | Đã trả | Paid |
| `cards.toPay` | Còn phải trả | To pay |
| `cards.deferred` | Trả góp chưa đến kỳ | Instalments not billed yet |
| `cards.bankAmount` | Số tiền ngân hàng | Bank's amount |
| `cards.bankDiff` | Lệch {amount} so với sổ | {amount} off the ledger's figure |
| `cards.noClosed` | Chưa có sao kê nào đã chốt. | No closed statement yet. |
| `cards.history` | Lịch sử sao kê | Statement history |
| `cards.noHistory` | Chưa có sao kê nào. | No statements yet. |
| `cards.purchasesShort` | chi | spent |
| `cards.statements` | Sao kê | Statements |
| `cards.noStatements` | Sao kê cần có ngày sao kê và giao dịch trên tài khoản này. | Statements need a statement day and purchases on this account. |
| `cards.cashback` | Hoàn tiền | Cashback |
| `cards.noCashback` | Chưa đặt quy tắc hoàn tiền. | No cashback rules set yet. |
| `cards.spendThisPeriod` | Chi trong kỳ | Spend this period |
| `cards.expected` | Dự kiến | Expected |
| `cards.capLeftLabel` | Còn đến mức trần | Left to the cap |
| `cards.minSpend` | Chi tối thiểu | Minimum spend |
| `cards.minMet` | Đã đủ mức chi tối thiểu {amount} | Minimum of {amount} reached |
| `cards.minNeed` | Cần chi thêm {amount} để đủ mức tối thiểu {min} | {amount} more to reach the minimum of {min} |
| `cards.last12` | 12 kỳ gần nhất | Last 12 periods |
| `cards.earned` | Đã nhận | Received |
| `cards.feeWaiver` | Miễn phí thường niên | Annual fee waiver |
| `cards.spent` | Đã chi trong năm thẻ | Spent this card year |
| `cards.deadline` | Hạn chót | Deadline |
| `cards.perMonth` | Cần chi mỗi tháng | Needed per month |
| `cards.feeMet` | Đã đạt mức chi: phí sẽ được miễn. | Target met: the fee should be waived. |
| `cards.onTrack` | Đang đúng tiến độ. | On track to reach the target. |
| `cards.behind` | Đang chậm: với tốc độ này sẽ không đạt mức chi. | Behind: at this pace the target will not be reached. |
| `cards.noWaiver` | Chưa đặt mức chi để được miễn phí. | No target to waive the fee is set. |
| `cards.instalments` | Trả góp 0% | 0% instalments |
| `cards.perMonthPay` | Mỗi tháng | Per month |
| `cards.left` | còn lại | left |
| `cards.lifecycle` | Vòng đời thẻ | Card life |
| `cards.noRecord` | Thẻ này chưa có hồ sơ (trạng thái, ngày, phí). | This card has no record yet (status, dates, fees). |
| `cards.issued` | Ngày mở | Issued |
| `cards.activated` | Ngày kích hoạt | Activated |
| `cards.lockedOn` | Ngày khoá | Locked |
| `cards.cancelledOn` | Ngày huỷ | Cancelled |
| `cards.network` | Mạng thẻ | Network |
| `cards.form` | Dạng thẻ | Form |
| `cards.physical.physical` | Thẻ cứng | Physical |
| `cards.physical.virtual` | Thẻ ảo | Virtual |
| `cards.physical.both` | Cứng và ảo | Physical and virtual |
| `cards.closeFee` | Phí đóng thẻ | Fee to close |
| `cards.keepForLimit` | Giữ để có hạn mức | Kept for its limit |
| `cards.yes` | Có | Yes |
| `cards.cancelPlan` | Dự định huỷ trước {by} | Plan to cancel by {by} |
| `cards.netValue` | Giá trị ròng | Net value |
| `cards.opening` | Dư nợ đầu kỳ | Owed at the start |
| `cards.closing` | Dư nợ cuối kỳ | Owed at the end |
| `cards.k.purchase` | Chi tiêu | Purchase |
| `cards.k.fee` | Phí | Fee |
| `cards.k.charge` | Rút hoặc chuyển ra | Money out |
| `cards.k.payment` | Thanh toán thẻ | Payment |
| `cards.k.refund` | Hoàn trả | Refund |
| `cards.k.cashback` | Hoàn tiền | Cashback |
| `cards.k.adjust` | Điều chỉnh | Adjustment |
| `cards.best.rate` | hoàn {rate}% | {rate}% back |
| `cards.best.noRate` | chưa đặt tỷ lệ | rate not set |
| `cards.best.capLeft` | còn {amount} đến mức trần | {amount} left to the cap |
| `cards.best.minShort` | thiếu {amount} đến mức tối thiểu | {amount} short of the minimum |
| `cards.best.payBy` | trả trước {date} | pay by {date} |
| `cards.best.payByDays` | one: trả trước {date} ({n} ngày) / other: trả trước {date} ({n} ngày) | one: pay by {date} ({n} day) / other: pay by {date} ({n} days) |
| `cards.best.limitLeft` | còn hạn mức {amount} | limit left {amount} |

## best

| key | Tiếng Việt | English |
|---|---|---|
| `best.title` | Thẻ nên dùng | Best card for this |
| `best.pick` | Chọn một danh mục để xem nên dùng thẻ nào. | Pick a category to see which card to use. |
| `best.none` | Chưa có thẻ nào để gợi ý cho danh mục này. | No card to suggest for this category. |

## cashback

| key | Tiếng Việt | English |
|---|---|---|
| `cashback.empty` | Chưa thẻ nào có quy tắc hoàn tiền. | No card has cashback rules yet. |
| `cashback.total` | Dự kiến kỳ này: | Expected this period: |

## edit

| key | Tiếng Việt | English |
|---|---|---|
| `edit.start` | Sửa | Edit |
| `edit.editing` | Đang sửa | Editing |
| `edit.done` | Xong | Done |
| `edit.saving` | Đang lưu… | Saving… |
| `edit.reset` | Về mặc định | Reset to default |
| `edit.resetConfirm` | Đặt lại Tổng quan về widget mặc định? Bố cục hiện tại sẽ mất và được lưu ngay. | Reset Home to the default widgets? Your layout is replaced and this is saved right away. |
| `edit.resetYes` | Đặt lại | Yes, reset |
| `edit.resetKeep` | Giữ bố cục của tôi | Keep my layout |
| `edit.add` | Thêm widget | Add widget |
| `edit.saveError` | Chưa lưu được: {message} | Not saved: {message} |
| `edit.resetError` | Chưa đặt lại được: {message} | Could not reset: {message} |
| `edit.hintDesktop` | Kéo tay nắm để di chuyển, kéo góc để đổi cỡ. Bàn phím dùng nút mũi tên để đổi thứ tự. | Drag the handle to move a widget and the corner to resize it. The arrows reorder with the keyboard. |
| `edit.hintPhone` | Dùng nút mũi tên để đổi thứ tự. Thêm hoặc bỏ widget ở dưới. | Use the arrows to reorder. Add or remove widgets below. |
| `edit.empty` | Tổng quan chưa có widget nào. Thêm một widget để bắt đầu. | Home has no widgets. Add one to start. |
| `edit.moveUp` | Đưa {name} lên | Move {name} up |
| `edit.moveDown` | Đưa {name} xuống | Move {name} down |
| `edit.settings` | Cài đặt cho {name} | Settings for {name} |
| `edit.remove` | Bỏ {name} | Remove {name} |
| `edit.drag` | Kéo {name} để di chuyển | Drag {name} to move it |
| `edit.added` | Đã thêm {name} vào cuối. | {name} added at the end. |
| `edit.removed` | Đã bỏ {name}. | {name} removed. |
| `edit.moved` | Đã di chuyển {name}. | {name} moved. |
| `edit.updated` | Đã cập nhật {name}. | {name} updated. |

## cat

| key | Tiếng Việt | English |
|---|---|---|
| `cat.title` | Thêm widget | Add a widget |
| `cat.description` | Chọn nội dung cần hiện trên Tổng quan. Widget được thêm vào cuối, sau đó bạn kéo đi đâu cũng được. | Pick what Home should show. It is added at the end; move it afterwards. |
| `cat.custom` | Biểu đồ tuỳ chỉnh | Custom chart |
| `cat.customDesc` | Tự dựng: chọn thứ cần tính, bộ lọc, khoảng thời gian và kiểu biểu đồ. | Build your own: pick what to count, a filter, a period and a chart. |
| `cat.preview` | Hình phác của widget | Sketch of the widget |
| `cat.none` | Không còn widget nào để thêm. | Nothing else to add. |

## wset

| key | Tiếng Việt | English |
|---|---|---|
| `wset.title` | Cài đặt: {name} | Settings: {name} |
| `wset.description` | Thay đổi áp dụng cho widget này và được lưu khi bạn bấm Xong ở Tổng quan. | Changes apply to this widget when you press Done on Home. |
| `wset.titleLabel` | Tiêu đề | Title |
| `wset.titleHint` | Để trống để dùng tiêu đề mặc định. | Leave empty for the default title. |
| `wset.period` | Khoảng thời gian | Period |
| `wset.months` | Số tháng hiển thị | Months shown |
| `wset.monthsN` | {n} tháng | {n} months |
| `wset.count` | Số giao dịch hiển thị | Transactions shown |
| `wset.account` | Tài khoản | Account |
| `wset.accountNone` | Chọn tài khoản | Pick an account |
| `wset.save` | Lưu | Save |
| `wset.add` | Thêm vào Tổng quan | Add to Home |
| `wset.period.this-month` | Tháng này | This month |
| `wset.period.last-month` | Tháng trước | Last month |
| `wset.period.this-year` | Năm nay | This year |
| `wset.period.last-year` | Năm ngoái | Last year |

## cf

| key | Tiếng Việt | English |
|---|---|---|
| `cf.pool` | {name} (mọi tài khoản dùng hằng ngày) | {name} (all everyday accounts) |
| `cf.metric` | Tính | Measure |
| `cf.metric.spending` | Chi tiêu | Spending |
| `cf.metric.income` | Thu nhập | Income |
| `cf.metric.net` | Ròng (thu trừ chi) | Net (income minus spending) |
| `cf.metric.balance` | Số dư | Balance |
| `cf.metric.count` | Số giao dịch | Number of transactions |
| `cf.filters` | Chỉ tính giao dịch khớp | Only transactions matching |
| `cf.any` | Tất cả | Any |
| `cf.category` | Danh mục | Category |
| `cf.account` | Tài khoản | Account |
| `cf.who` | Người | Who |
| `cf.event` | Sự kiện | Event |
| `cf.tag` | Thẻ | Tag |
| `cf.text` | Chữ trong ghi chú | Text in the note |
| `cf.period` | Khoảng thời gian | Period |
| `cf.periodOther` | Một tháng hoặc một năm | A month or a year |
| `cf.periodValue` | yyyy-mm hoặc yyyy | yyyy-mm or yyyy |
| `cf.period.this-month` | Tháng này | This month |
| `cf.period.last-month` | Tháng trước | Last month |
| `cf.period.last-3-months` | 3 tháng gần nhất | Last 3 months |
| `cf.period.last-6-months` | 6 tháng gần nhất | Last 6 months |
| `cf.period.last-12-months` | 12 tháng gần nhất | Last 12 months |
| `cf.period.this-year` | Năm nay | This year |
| `cf.period.last-year` | Năm ngoái | Last year |
| `cf.period.all` | Từ trước đến nay | All time |
| `cf.by` | Nhóm theo | Group by |
| `cf.by.day` | Ngày | Day |
| `cf.by.week` | Tuần | Week |
| `cf.by.month` | Tháng | Month |
| `cf.by.category` | Danh mục | Category |
| `cf.by.top` | Danh mục chi nhiều nhất | Top categories |
| `cf.by.account` | Tài khoản | Account |
| `cf.by.who` | Người | Who |
| `cf.by.event` | Sự kiện | Event |
| `cf.by.tag` | Thẻ | Tag |
| `cf.compare` | So sánh với | Compare with |
| `cf.compare.none` | Không so sánh | Nothing |
| `cf.compare.previous` | Kỳ trước | The previous period |
| `cf.compare.usual` | Mức thường lệ | Your usual |
| `cf.kind` | Biểu đồ | Chart |
| `cf.kind.stat` | Một con số | One number |
| `cf.kind.line` | Đường | Line |
| `cf.kind.bar` | Cột | Columns |
| `cf.kind.hbar` | Thanh ngang | Bars |
| `cf.kind.table` | Bảng | Table |
| `cf.title` | Tiêu đề | Title |
| `cf.titlePlaceholder` | Ví dụ: Cà phê mỗi tuần | For example: Coffee each week |
| `cf.preview` | Xem trước | Preview |
| `cf.balanceHint` | Số dư chỉ nhóm theo ngày, tuần hoặc tháng. | Balance goes by day, week or month. |
| `cf.err.metric` | Hãy chọn thứ cần tính. | Pick what to count. |
| `cf.err.balanceBy` | Số dư cần nhóm theo ngày, tuần hoặc tháng. | Balance needs a grouping by day, week or month. |
| `cf.err.period` | Khoảng thời gian: chọn mẫu có sẵn, hoặc nhập tháng (2026-11) hay năm (2026). | Period: pick a preset, or write a month (2026-11) or a year (2026). |
| `cf.err.title` | Tiêu đề tối đa 80 ký tự. | The title can be 80 characters at most. |

