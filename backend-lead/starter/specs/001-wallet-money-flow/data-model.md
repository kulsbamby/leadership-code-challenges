# Data Model: Wallet Money Flow

All tables follow the starter conventions: UUID `id` with `gen_random_uuid()`, snake_case columns,
`created_at`/`updated_at` (where mutable), money as `DECIMAL(36,18)`. Created by new migrations dated
`20261007…` in `src/db/migrations/`. Existing `members` and `wallets` are unchanged except one added check.

## wallets (existing, altered)

| Column | Type | Notes |
|---|---|---|
| balance | DECIMAL(36,18) | **ADD** `CHECK (balance >= 0)` named `wallets_balance_non_negative` |

Only `ledgerService.postEntry` writes `balance`.

## funding_transactions

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| member_id | UUID NOT NULL | FK members |
| wallet_id | UUID NOT NULL | FK wallets |
| type | VARCHAR NOT NULL | `deposit` \| `withdrawal` (CHECK) |
| status | VARCHAR NOT NULL | `Pending` \| `Completed` \| `Failed` (CHECK) |
| amount | DECIMAL(36,18) NOT NULL | CHECK `> 0` |
| turnover_multiplier | INTEGER NOT NULL DEFAULT 1 | CHECK `>= 0`; meaningful for deposits |
| psp_ref | VARCHAR NULL | **UNIQUE**; required for deposits (CHECK `type <> 'deposit' OR psp_ref IS NOT NULL`) |
| created_at / updated_at | TIMESTAMPTZ | |

Indexes: unique `psp_ref`; `(member_id, type, status)` for the turnover sum.

### State machine (FR-008), enforced in `fundingStateMachine.ts` only

```
Pending --completed--> Completed      (credit wallet, once)
Pending --failed-----> Failed
Completed --completed--> Completed    (same state: success no-op)
Failed    --failed-----> Failed       (same state: success no-op)
Completed --failed--> REJECT 409      Failed --completed--> REJECT 409
```

Withdrawals are created `Pending` and have no callback path (no `psp_ref`, so a callback gets 404).

## wallet_txs (append-only ledger)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| wallet_id | UUID NOT NULL | FK wallets |
| kind | VARCHAR NOT NULL | `deposit_credit` \| `wager_debit` \| `withdrawal_debit` (CHECK) |
| amount | DECIMAL(36,18) NOT NULL | signed: credits positive, debits negative; CHECK `<> 0` |
| balance_after | DECIMAL(36,18) NOT NULL | wallet balance after this entry |
| funding_transaction_id | UUID NULL | FK; set for deposit credit and withdrawal debit |
| wager_id | UUID NULL | FK; set for wager debit |
| seq | BIGSERIAL NOT NULL | monotonic order; per wallet it equals commit order because inserts run under the wallet lock |
| created_at | TIMESTAMPTZ | no `updated_at`: rows never change |

- **Unique partial index** `(funding_transaction_id, kind) WHERE funding_transaction_id IS NOT NULL`:
  a deposit can be credited at most once, whatever the application does.
- **Trigger** `wallet_txs_append_only` (`BEFORE UPDATE OR DELETE`) raises an exception.
- **Invariant** (asserted by tests): `wallets.balance = SUM(wallet_txs.amount)` per wallet, and the last
  entry's `balance_after` equals the balance.

## wagers

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| wallet_id | UUID NOT NULL | FK wallets |
| amount | DECIMAL(36,18) NOT NULL | CHECK `> 0` |
| created_at | TIMESTAMPTZ | |

Index `(wallet_id)`. Accrued turnover = `SUM(amount)` per member's wallet.

## callback_mismatches

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| psp_ref | VARCHAR NOT NULL | |
| funding_transaction_id | UUID NOT NULL | FK |
| expected_amount | DECIMAL(36,18) NOT NULL | deposit amount at the time |
| received_amount | DECIMAL(36,18) NOT NULL | |
| repeat_count | INTEGER NOT NULL DEFAULT 1 | |
| first_seen_at / last_seen_at | TIMESTAMPTZ | |

**Unique** `(psp_ref, received_amount)`; written with an upsert after the callback transaction rolls back.

## idempotency_keys

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| scope | VARCHAR NOT NULL | `<endpoint>:<owner id>` |
| key | VARCHAR NOT NULL | client-supplied, max 255 chars |
| request_hash | VARCHAR NOT NULL | sha256 of the normalized payload |
| response_body | JSONB NULL | stored in the same transaction as the business write |
| created_at | TIMESTAMPTZ | |

**Unique** `(scope, key)`.

## Derived: turnover position (per member, computed under the wallet lock)

```
required  = SUM(amount * turnover_multiplier)  FROM funding_transactions
            WHERE member_id = :m AND type = 'deposit' AND status = 'Completed'
accrued   = SUM(amount) FROM wagers WHERE wallet_id = :w
outstanding = max(required - accrued, 0)       -- withdrawal allowed iff outstanding = 0
```
