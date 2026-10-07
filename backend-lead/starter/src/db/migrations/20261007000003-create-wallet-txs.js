'use strict';

// The append-only ledger. Every balance change has exactly one row here.
// Rows are never updated or deleted: a trigger enforces it in the database.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallet_txs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
      },
      kind: { type: Sequelize.STRING, allowNull: false },
      // Signed: credits positive, debits negative.
      amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      balance_after: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      funding_transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'funding_transactions', key: 'id' },
      },
      wager_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'wagers', key: 'id' },
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    // Monotonic order. Per wallet it equals commit order, because inserts happen under the wallet lock.
    await queryInterface.sequelize.query('ALTER TABLE wallet_txs ADD COLUMN seq BIGSERIAL NOT NULL');

    await queryInterface.sequelize.query(`
      ALTER TABLE wallet_txs
        ADD CONSTRAINT wallet_txs_kind_check
          CHECK (kind IN ('deposit_credit', 'wager_debit', 'withdrawal_debit')),
        ADD CONSTRAINT wallet_txs_amount_non_zero CHECK (amount <> 0)
    `);

    // A deposit can be credited at most once, whatever the application does.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX wallet_txs_funding_kind_unique
        ON wallet_txs (funding_transaction_id, kind)
        WHERE funding_transaction_id IS NOT NULL
    `);
    await queryInterface.addIndex('wallet_txs', ['wallet_id', 'seq'], {
      name: 'wallet_txs_wallet_seq_idx',
    });

    await queryInterface.sequelize.query(`
      CREATE FUNCTION wallet_txs_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_txs is append-only (% not allowed)', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryInterface.sequelize.query(`
      CREATE TRIGGER wallet_txs_append_only
        BEFORE UPDATE OR DELETE ON wallet_txs
        FOR EACH ROW EXECUTE FUNCTION wallet_txs_append_only()
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS wallet_txs_append_only ON wallet_txs');
    await queryInterface.dropTable('wallet_txs');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS wallet_txs_append_only()');
  },
};
