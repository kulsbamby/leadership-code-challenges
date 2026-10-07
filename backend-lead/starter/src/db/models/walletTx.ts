import { DataTypes, Model, Sequelize } from 'sequelize';
import { LedgerKind, MONEY_PRECISION, MONEY_SCALE, Table } from '../../lib/constants';

// Append-only ledger row. Never update or delete (the DB rejects it).
export class WalletTx extends Model {
  declare id: string;
  declare walletId: string;
  declare kind: LedgerKind;
  declare amount: string;
  declare balanceAfter: string;
  declare fundingTransactionId: string | null;
  declare wagerId: string | null;
}

export function initWalletTx(sequelize: Sequelize): void {
  WalletTx.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      walletId: { type: DataTypes.UUID, allowNull: false },
      kind: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false },
      balanceAfter: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false },
      fundingTransactionId: { type: DataTypes.UUID, allowNull: true },
      wagerId: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, tableName: Table.WALLET_TXS, underscored: true, updatedAt: false },
  );
}
