import { DataTypes, Model, Sequelize } from 'sequelize';
import { MAX_IDEMPOTENCY_KEY_LENGTH, Table } from '../../lib/constants';

export class IdempotencyKey extends Model {
  declare id: string;
  declare scope: string;
  declare key: string;
  declare requestHash: string;
  declare responseBody: object | null;
}

export function initIdempotencyKey(sequelize: Sequelize): void {
  IdempotencyKey.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      scope: { type: DataTypes.STRING, allowNull: false },
      key: { type: DataTypes.STRING(MAX_IDEMPOTENCY_KEY_LENGTH), allowNull: false },
      requestHash: { type: DataTypes.STRING, allowNull: false },
      responseBody: { type: DataTypes.JSONB, allowNull: true },
    },
    { sequelize, tableName: Table.IDEMPOTENCY_KEYS, underscored: true, updatedAt: false },
  );
}
