# Personal Workspace — @Sites Full Website Build Brief

**Status**: user-authorized implementation; provider-specific handoff. **Do not claim publication before a real live URL is verified.**
**Source-of-truth**: attached `Personal_Workspace_Design_Handoff_V2.1_Exception_Full_States_v1.1.zip` + `Personal_Workspace_S1_Development_Kickoff_V1.0.zip`. The approved business requirements, policy supplements, UX and visual tokens take precedence over shortcuts described here. Retain IDs and source links from those documents. If this @Sites instance cannot implement secure persistent multi-user backends, explicitly state limitations and build a truthful preview, not a faux production app.

## Product goal
Build and deploy a responsive Chinese-first private life-management web application named **Personal Workspace**. Five permanent top-level destinations: **Dashboard 首页, Schedule 日程, Finance 经济, Fitness 运动, Diet 饮食**. Light-only MVP, Calm Workspace visual language. Personal-use-first, account isolation from day one; no forced module onboarding; usable desktop/mobile.

## Visual design V2.1
- Primary `#256B5F`, page background `#F7F8FA`, surface `#FFFFFF`, ink `#17212F`, secondary text `#586473`, border `#E3E8EF`; success `#137A5A`, warning `#A65B11`, danger `#B42318`.
- 4px spacing foundation, mostly 12px card corners, fine borders, calm typography; usable mobile 320–430px and desktop >1024px; keyboard-accessible controls, semantic states not relying on color, touch targets >=44px.
- Desktop: fixed left navigation; mobile: persistent 5-item bottom navigation. Secondary tabs are scrollable on mobile. Lightweight create: bottom sheet on mobile / dialog or drawer on desktop; detailed records: full mobile page / desktop drawer or detail page.
- All dashboard data come from real persistence; never insert fabricated zeroes on loading failures, and never treat samples as real user data. Optional explicit demo/sandbox dataset only when visibly labelled.

## Account / security
- Secure signup, login and logout or supported secure managed authentication; authorization on every API and owned record, isolated user IDs, safe session cookies/CSRF as appropriate. Do not publicly expose financial, workout or body data. Personal settings include persistent privacy masking and timezone/currency.
- Sensitive overview figures, charts, helper texts and derived percentages are hidden together in privacy mode. However active editing inputs needed by the user remain operable and readable (POL-PRIV-01).
- User can start without creating entries in all modules; truthful empty, loading, permission, offline, save-failed, unknown-request-result and source-inaccessible states.

## Schedule module
- Exactly five subviews: Today, Inbox, Tasks, Calendar, Projects. Task vs Event are different object types; visuals use icon + text + muted auxiliary color. Inbox is organizational bucket, NOT a task status; task can be created with title alone. Tasks have lifecycle TODO/IN_PROGRESS/COMPLETED/CANCELLED, due date (`due_at`) separated from scheduled execution (`scheduled_date`, `scheduled_time`); tasks scheduled for today appear today even with no due date. Project is grouping, priority optional. Events are not checkboxes. Support recurring task instances with history. Overdue items should not auto-reschedule. Desktop complete temporal calendar, mobile date agenda; task details desktop drawer/mobile full page.
- Domain-derived schedule tasks only reference domain source IDs; marking a schedule task complete NEVER auto-creates a financial transaction, workout session or meal record. Editing one instance does not rewrite source plan.

## Finance module
- Five subviews: Overview, Transactions, Accounts, Budget, Savings. Asset accounts and credit liability accounts are separate; provide income/expense/transfer/credit repayment/refund/balance correction with accurate decimal amounts, auditability, and date-specific summaries. Transactions are backed by durable account movements, not arbitrary cached balances; use atomic transactions and idempotency identifiers for high-risk writes.
- Transfers are not income/expenses. Card spending is expense when incurred; repayments decrease asset and liability, NOT new spending. Refund references original purchase, offsets net expense in actual refund month, and is capped by total refundable remainder. Return to actual destination account, even if not original payment account (POL-FIN-03); change ONLY destination account balance, do not also reduce original credit liability.
- Asset accounts may become negative to preserve true records; warn/review and do not fabricate balancing income (POL-FIN-01). Credit overpayment can create positive card overpayment balance; distinguish 0 remaining debt from funds paid in excess (POL-FIN-02). Never double-count overpayment as expenses or cash.
- Monthly total and category budgets must avoid duplicate addition; remaining budget ≠ account cash; saving goal tied to actual dedicated asset account, only one active goal per account; avoid counting same funds as a separate asset.
- High-risk operation flow: review, submitting, confirmed success, definitive failure and **unknown status**. If write times out, QUERY the original request status using idempotency key, NEVER blindly re-send duplicate transaction. Optimistic concurrent balance/refund changes require re-review.

## Fitness module
- Five subviews: Overview, Plan, Workout, History, Body. Plan contains exercise library, editable templates and weekly planned sessions. Quick standalone cardio logs and detailed strength sessions with exercise sets, weight/repetitions/duration. Save each set to server (saving / saved / failed states), preserve unsaved input for retry, pause/resume and explicit complete/abort; history accurately records only actual sets. At most one active OR paused detailed workout per user across devices, backed by server constraint/version control; multiple completed sessions per day allowed.
- Mobile workout focus mode: current exercise and set editing dominant; fixed safe actions for pause and finish, no obstruction by keyboard. Recovery from refresh/browser crash/multiple device contention; on conflict do not silently overwrite. Body measurements and recovery feedback optional, avoid mandatory scoring. Completing schedule task does not record workout.

## Diet module
- Five subviews: Overview, Recipes, Meal Plan, Shopping, Records. Browse existing searchable recipes; include recipe ingredients, compatible quantities and units, preparation time, directions, servings, optional preference/allergy warnings, manual recipe editing; avoid hallucinated missing allergens. Desktop week plan shows all seven days; mobile single day + date selector. Breakfast/lunch/dinner plan entries editable.
- Shopping list is an independent snapshot aggregated from structured recipe ingredients; automatically convert ONLY verified compatible units (g/kg, ml/L or known consistent piece specifications) (POL-DIET-01), no invented conversions. When plan changes, show proposed diff, apply only after user consent; protect manually modified quantities and purchased facts, support increases/decreases, incremental supplemental purchases, repeated updates WITHOUT duplication (POL-DIET-02). E.g. 2 bought +2 pending, new plan needs 5 => offer +1 pending, not +5.
- Shopping checkbox NEVER generates financial spending. Planned meals NEVER automatically become actual meal records; prefill actual meal entry only after explicit verification and save. Eating out and quick manual records supported without mandatory nutrition/macros. Actual self-cooked metrics only count records explicitly identified as home-cooked.

## Dashboard
- Today timed tasks/events, all-day and undated-but-scheduled-today task attention; overdue separate; card summaries derived from domain records, not plans. Privacy mask toggle persists. First-use dashboard helpful with no forced setup, source links navigate back preserving view state.

## Integration, lifecycle, acceptance
- Common global `+` launches exactly one underlying creation action, domain shortcuts reuse same form. Cross-module actions must carry stable source object identifiers and return path. Source changes do not erase historical domain facts.
- Explicit status model for loading, no data, true zero, saving, success, failure, unknown submit, auth expiry, no permission and source unavailable.
- Deliver hosted preview URL and clearly mark staging vs public production; if @Sites supports repo export, provide code repository or source package, database migrations, environment/secrets setup, deploy steps, backup/restore plan, tests and documented limitations. No exposed password, test account personal records or actual user's financial/health data.
- Test at least: task only title, Today unscheduled-time, event non-checkbox, finance double-entry transfer/refund/idempotent timed-out refund, negative asset, card overpayment, training one-active constraint/conflict/autosave recovery, meal plan vs actual separation, shopping diff with purchased/manual protected, privacy masking across all components, responsive mobile navigation and auth isolation.
- Do not claim end-to-end launch or testing without real execution and verified URL. Build complete MVP if provider can do so, otherwise deliver functional honest phase and explicit gaps; never simulate persisted success.

## Build & handoff direction
Please implement this site with @Sites now, reuse approved designs in attached files, create/publish a working preview only after testing. Prefer a maintainable typed frontend and secure persistent database backend supported by Sites. If provider supports user-owned source export or connected GitHub, use those; otherwise supply available source and deployment details. Ask only for essentials that genuinely block creation or secure deployment; otherwise choose conventional defaults and proceed.
