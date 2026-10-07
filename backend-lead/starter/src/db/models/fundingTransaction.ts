import { DataTypes, Model, Sequelize } from 'sequelize';
import {
  DEFAULT_TURNOVER_MULTIPLIER,
  FundingStatus,
  FundingType,
  MONEY_PRECISION,
  MONEY_SCALE,
  Table,
} from '../../lib/constants';

export class FundingTransaction extends Model {
  declare id: string;
  declare memberId: string;
  declare walletId: string;
  declare type: FundingType;
  declare status: FundingStatus;
  declare amount: string;
  declare turnoverMultiplier: number;
  declare pspRef: string | null;
}

export function initFundingTransaction(sequelize: Sequelize): void {
  FundingTransaction.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      memberId: { type: DataTypes.UUID, allowNull: false },
      walletId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false },
      turnoverMultiplier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: DEFAULT_TURNOVER_MULTIPLIER },
      pspRef: { type: DataTypes.STRING, allowNull: true },
    },
    { sequelize, tableName: Table.FUNDING_TRANSACTIONS, underscored: true },
  );
}
