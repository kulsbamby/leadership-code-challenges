'use strict';

// DB backstop against overdraw: even a buggy code path cannot persist a negative balance.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE wallets ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0)',
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE wallets DROP CONSTRAINT wallets_balance_non_negative',
    );
  },
};
