import { DataTypes, Model, Sequelize } from 'sequelize';
import { MONEY_PRECISION, MONEY_SCALE, Table } from '../../lib/constants';

export class Wager extends Model {
  declare id: string;
  declare walletId: string;
  declare amount: string;
}

export function initWager(sequelize: Sequelize): void {
  Wager.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      walletId: { type: DataTypes.UUID, allowNull: false },
      amount: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false },
    },
    { sequelize, tableName: Table.WAGERS, underscored: true, updatedAt: false },
  );
}
