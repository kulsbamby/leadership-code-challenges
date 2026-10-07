import { Router } from 'express';
import { z } from 'zod';
import * as memberService from '../services/memberService';
import {
  ErrorCode,
  HttpStatus,
  MAX_USERNAME_LENGTH,
  MEMBER_ID_PARAM,
  MIN_USERNAME_LENGTH,
  RoutePath,
} from '../lib/constants';

export const membersRouter = Router();

const createMemberBody = z.object({
  username: z.string().min(MIN_USERNAME_LENGTH).max(MAX_USERNAME_LENGTH),
});

membersRouter.post(RoutePath.ROOT, async (req, res, next) => {
  try {
    const body = createMemberBody.parse(req.body);
    const { member, wallet } = await memberService.createMember(body.username);
    res.status(HttpStatus.CREATED).json({
      member: { id: member.id, username: member.username },
      wallet: { id: wallet.id, balance: wallet.balance },
    });
  } catch (err) {
    next(err);
  }
});

membersRouter.get(RoutePath.MEMBER_WALLET, async (req, res, next) => {
  try {
    const wallet = await memberService.getWalletByMemberId(req.params[MEMBER_ID_PARAM]);
    if (!wallet) {
      res.status(HttpStatus.NOT_FOUND).json({ error: ErrorCode.WALLET_NOT_FOUND });
      return;
    }
    res.json({ id: wallet.id, memberId: wallet.memberId, balance: wallet.balance });
  } catch (err) {
    next(err);
  }
});
