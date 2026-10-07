'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wagers', {
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
      amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    await queryInterface.sequelize.query(
      'ALTER TABLE wagers ADD CONSTRAINT wagers_amount_positive CHECK (amount > 0)',
    );
    await queryInterface.addIndex('wagers', ['wallet_id'], { name: 'wagers_wallet_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('wagers');
  },
};
