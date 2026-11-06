import { BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull } from 'drizzle-orm';
import { from, of, switchMap, tap } from 'rxjs';
import { InjectDb, type Db } from '../db/client';
import { idempotencyKeys } from '../db/schema';
import { sha256 } from './crypto';

export const IDEMPOTENT = 'cz:idempotent';
/** Marks payments, submissions and approvals as requiring an Idempotency-Key header (§6.4). */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, @InjectDb() private db: Db) {}

  intercept(ec: ExecutionContext, next: CallHandler) {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT, [ec.getHandler(), ec.getClass()]);
    const req = ec.switchToHttp().getRequest();
    const res = ec.switchToHttp().getResponse();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) {
      if (required) throw new BadRequestException('Idempotency-Key header is required for this operation');
      return next.handle();
    }
    if (key.length < 8 || key.length > 128) throw new BadRequestException('Idempotency-Key must be 8-128 characters');
    const userId: string | null = req.ctx?.userId ?? null;
    const route = `${req.method} ${req.route?.path ?? req.path}:${JSON.stringify(req.params ?? {})}`;
    const requestHash = sha256(JSON.stringify(req.body ?? {}));
    const where = and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.route, route), userId ? eq(idempotencyKeys.userId, userId) : isNull(idempotencyKeys.userId));

    return from(this.db.select().from(idempotencyKeys).where(where).limit(1)).pipe(
      switchMap(async ([existing]) => {
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was reused with a different request body');
          if (existing.statusCode == null) throw new ConflictException('A request with this Idempotency-Key is still in progress');
          res.status(existing.statusCode);
          res.setHeader('Idempotent-Replay', 'true');
          return { replay: true as const, body: existing.response };
        }
        await this.db.insert(idempotencyKeys).values({ key, route, userId, requestHash });
        return { replay: false as const };
      }),
      switchMap((r) =>
        r.replay
          ? of(r.body)
          : next.handle().pipe(
              tap({
                next: async (body) => {
                  await this.db.update(idempotencyKeys).set({ statusCode: res.statusCode ?? 200, response: body ?? null }).where(where);
                },
                error: async () => {
                  await this.db.delete(idempotencyKeys).where(where);
                },
              }),
            ),
      ),
    );
  }
}
