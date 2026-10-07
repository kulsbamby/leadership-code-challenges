'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('callback_mismatches', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      psp_ref: { type: Sequelize.STRING, allowNull: false },
      funding_transaction_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'funding_transactions', key: 'id' },
      },
      expected_amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      received_amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      repeat_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      first_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    // One row per distinct (pspRef, received amount); repeats bump repeat_count.
    await queryInterface.addIndex('callback_mismatches', ['psp_ref', 'received_amount'], {
      unique: true,
      name: 'callback_mismatches_psp_ref_received_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('callback_mismatches');
  },
};
