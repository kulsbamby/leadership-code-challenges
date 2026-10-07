import { DataTypes, Model, Sequelize } from 'sequelize';
import { MONEY_PRECISION, MONEY_SCALE, Table } from '../../lib/constants';

export class Wallet extends Model {
  declare id: string;
  declare memberId: string;
  // DECIMAL comes back from the pg driver as a string. Keep it that way; see src/lib/money.ts.
  declare balance: string;
}

export function initWallet(sequelize: Sequelize): void {
  Wallet.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      memberId: { type: DataTypes.UUID, allowNull: false },
      balance: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false, defaultValue: '0' },
    },
    { sequelize, tableName: Table.WALLETS, underscored: true },
  );
}
