import { ArgumentsHost, BadRequestException, Catch, ConflictException, ExceptionFilter, HttpException, Logger, PipeTransform } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { TransitionError } from '@collabiz/types';

/** Validates & normalises input with the shared Zod schema (same rules as client forms). */
export class ZodPipe<T> implements PipeTransform {
  constructor(private schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: 'Please correct the highlighted fields',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
export const body = <T>(schema: ZodType<T>) => new ZodPipe(schema);

/** Maps domain errors to consistent JSON responses. Never leaks stack traces. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Http');
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof TransitionError) {
      const e = new ConflictException({ statusCode: 409, error: 'InvalidTransition', message: err.message });
      return res.status(409).json(e.getResponse());
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ statusCode: 400, error: 'ValidationError', message: 'Invalid input', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err instanceof HttpException) {
      const r = err.getResponse();
      return res.status(err.getStatus()).json(typeof r === 'string' ? { statusCode: err.getStatus(), message: r } : r);
    }
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === '23505') return res.status(409).json({ statusCode: 409, error: 'Conflict', message: 'A record with these details already exists' });
    if (pgCode === '22P02') return res.status(400).json({ statusCode: 400, error: 'BadRequest', message: 'Malformed identifier' });
    this.log.error(err instanceof Error ? err.stack : String(err));
    return res.status(500).json({ statusCode: 500, error: 'InternalError', message: 'Unexpected error. The incident has been logged.' });
  }
}
