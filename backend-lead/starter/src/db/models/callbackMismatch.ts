import { DataTypes, Model, Sequelize } from 'sequelize';
import { MONEY_PRECISION, MONEY_SCALE, Table } from '../../lib/constants';

export class CallbackMismatch extends Model {
  declare id: string;
  declare pspRef: string;
  declare fundingTransactionId: string;
  declare expectedAmount: string;
  declare receivedAmount: string;
  declare repeatCount: number;
}

export function initCallbackMismatch(sequelize: Sequelize): void {
  CallbackMismatch.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      pspRef: { type: DataTypes.STRING, allowNull: false },
      fundingTransactionId: { type: DataTypes.UUID, allowNull: false },
      expectedAmount: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false },
      receivedAmount: { type: DataTypes.DECIMAL(MONEY_PRECISION, MONEY_SCALE), allowNull: false },
      repeatCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    },
    { sequelize, tableName: Table.CALLBACK_MISMATCHES, underscored: true, timestamps: false },
  );
}
