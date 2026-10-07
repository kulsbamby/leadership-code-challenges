# Quickstart: validating the wallet money flow

Prerequisites: Node 20+, Docker. Details of the endpoints are in [contracts/api.md](contracts/api.md) and the
tables in [data-model.md](data-model.md).

```bash
cp .env.example .env && npm install
npm run db:up && npm run db:migrate
npx tsc --noEmit        # must be clean
npm test                # migrates the test DB, runs jest --runInBand against real Postgres
npm run dev             # API on :3000
```

## Manual end-to-end walk (dev server)

1. `POST /members {"username":"alice01"}` -> note `member.id` and `wallet.id`.
2. `POST /deposits {"memberId":<id>,"amount":"100.00","turnoverMultiplier":1}` -> 201 `Pending`, note `pspRef`.
3. `POST /psp/callbacks {"pspRef":<ref>,"status":"completed","amount":"100.00"}` -> 200 `applied:true`;
   repeat it -> 200 `applied:false`; `GET /members/<id>/wallet` shows `100.0…` once.
4. `POST /withdrawals {"memberId":<id>,"amount":"50.00"}` -> 422 `turnover_not_met`, `outstanding` `100.0…`.
5. `POST /wallets/<walletId>/wagers {"amount":"100.00"}` -> 201, balance `0`.
6. The turnover requirement is now met (accrued 100 of 100) but the balance is 0, so a withdrawal gives 422
   `insufficient_balance`. Deposit and complete another 100 with `turnoverMultiplier: 0` (adds balance, no
   requirement), then withdraw 50 -> 201 `Pending`, balance drops by 50. (A deposit with multiplier 1 would add a
   new requirement of 100 and block the withdrawal again.)

## Expected automated coverage (maps to spec success criteria)

| Test file | Proves |
|---|---|
| `test/callbacks.test.ts` | sequential duplicate (SC-005), 50 concurrent duplicates credit once (SC-001), failed/invalid transitions, unknown ref, mismatch recorded once with counter |
| `test/wagers.test.ts` | insufficient balance, concurrent wagers cannot overdraw (SC-002) |
| `test/withdrawals.test.ts` | turnover lock blocks then unblocks (SC-004), multiplier 0, insufficient balance, concurrent withdrawals |
| `test/idempotency.test.ts` | replay, key reuse 422, concurrent same key debits once (SC-006) |
| `test/ledger.test.ts` | ledger sum equals balance after mixed flows (SC-003); ledger UPDATE/DELETE rejected by the DB |
| `test/deposits.test.ts` | creation, defaults, validation (precision, sign, multiplier) |
