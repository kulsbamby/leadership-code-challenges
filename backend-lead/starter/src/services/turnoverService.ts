import BigNumber from 'bignumber.js';
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { FundingStatus, FundingType, Table } from '../lib/constants';
import { dec, ZERO } from '../lib/money';

export interface Turnover {
  required: BigNumber;
  accrued: BigNumber;
  outstanding: BigNumber;
}

// Derived from rows, not stored: nothing to drift. Call it while holding the wallet lock so a
// concurrent wager or deposit completion cannot change the totals mid-decision. The sums run in
// Postgres NUMERIC (exact) and come back as strings.
export async function getTurnover(t: Transaction, memberId: string, walletId: string): Promise<Turnover> {
  const [req] = await sequelize.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount * turnover_multiplier), 0)::text AS total
       FROM ${Table.FUNDING_TRANSACTIONS}
      WHERE member_id = :memberId AND type = :type AND status = :status`,
    {
      replacements: { memberId, type: FundingType.DEPOSIT, status: FundingStatus.COMPLETED },
      type: QueryTypes.SELECT, transaction: t },
  );
  const [acc] = await sequelize.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total FROM ${Table.WAGERS} WHERE wallet_id = :walletId`,
    { replacements: { walletId }, type: QueryTypes.SELECT, transaction: t },
  );
  const required = dec(req.total);
  const accrued = dec(acc.total);
  return { required, accrued, outstanding: BigNumber.max(required.minus(accrued), ZERO) };
}
