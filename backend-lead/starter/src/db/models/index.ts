import { sequelize } from '../sequelize';
import { Member, initMember } from './member';
import { Wallet, initWallet } from './wallet';
import { FundingTransaction, initFundingTransaction } from './fundingTransaction';
import { Wager, initWager } from './wager';
import { WalletTx, initWalletTx } from './walletTx';
import { CallbackMismatch, initCallbackMismatch } from './callbackMismatch';
import { IdempotencyKey, initIdempotencyKey } from './idempotencyKey';
import { Alias, ForeignKey } from '../../lib/constants';

initMember(sequelize);
initWallet(sequelize);
initFundingTransaction(sequelize);
initWager(sequelize);
initWalletTx(sequelize);
initCallbackMismatch(sequelize);
initIdempotencyKey(sequelize);

Member.hasOne(Wallet, { foreignKey: ForeignKey.MEMBER_ID, as: Alias.WALLET });
Wallet.belongsTo(Member, { foreignKey: ForeignKey.MEMBER_ID, as: Alias.MEMBER });
FundingTransaction.belongsTo(Wallet, { foreignKey: ForeignKey.WALLET_ID });
Wager.belongsTo(Wallet, { foreignKey: ForeignKey.WALLET_ID });
WalletTx.belongsTo(Wallet, { foreignKey: ForeignKey.WALLET_ID });

export {
  Member,
  Wallet,
  FundingTransaction,
  Wager,
  WalletTx,
  CallbackMismatch,
  IdempotencyKey,
};
