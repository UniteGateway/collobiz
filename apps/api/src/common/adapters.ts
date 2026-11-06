/**
 * External-service adapters (§6.5 / instruction 10). Local adapters run without credentials;
 * production adapters are selected by env vars and documented in docs/architecture.md.
 */
import { Global, Injectable, Logger, Module, BadRequestException } from '@nestjs/common';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InjectDb, type Db } from '../db/client';
import { outboxMessages } from '../db/schema';
import { config } from '../config';
import { sha256, signDownload } from './crypto';

export const ALLOWED_MIME: Record<string, string[]> = {
  'application/pdf': ['%PDF'],
  'image/png': ['\x89PNG'],
  'image/jpeg': ['\xFF\xD8\xFF'],
  'image/webp': ['RIFF'],
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export interface StoredObject { key: string; sha256: string; size: number; mime: string; scanStatus: 'clean' | 'rejected' }

/** Private object storage. Files are never exposed as public URLs; downloads use signed, expiring links. */
@Injectable()
export class StorageService {
  private root = resolve(config().STORAGE_LOCAL_DIR);

  /** Validates type by magic bytes (not just extension), size, and runs the malware-scan hook. */
  async put(buf: Buffer, mime: string, prefix: string): Promise<StoredObject> {
    if (buf.length === 0) throw new BadRequestException('File is empty');
    if (buf.length > MAX_UPLOAD_BYTES) throw new BadRequestException('File exceeds 15 MB limit');
    const magics = ALLOWED_MIME[mime];
    if (!magics) throw new BadRequestException('Only PDF, PNG, JPEG or WEBP files are accepted');
    const head = buf.subarray(0, 4).toString('latin1');
    if (!magics.some((m) => head.startsWith(m))) throw new BadRequestException('File content does not match its declared type');
    if (this.scan(buf) !== 'clean') throw new BadRequestException('File failed security scan');
    const key = `${prefix}/${randomUUID()}`;
    if (config().STORAGE_DRIVER === 's3') {
      throw new BadRequestException('S3 storage driver requires credentials — see docs/deployment.md (blocker B-03)');
    }
    const path = join(this.root, key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, buf, { mode: 0o600 });
    return { key, sha256: sha256(buf), size: buf.length, mime, scanStatus: 'clean' };
  }

  async get(key: string): Promise<Buffer> {
    if (key.includes('..')) throw new BadRequestException('Invalid key');
    const p = join(this.root, key);
    await stat(p);
    return readFile(p);
  }

  /** Malware-scan hook. Local adapter rejects the EICAR test signature; production should call ClamAV/vendor. */
  scan(buf: Buffer): 'clean' | 'infected' {
    return buf.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) ? 'infected' : 'clean';
  }

  signedUrl(key: string, ttlSec = 300) {
    const { expires, sig } = signDownload(key, ttlSec);
    return `/v1/files/download?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`;
  }
}

/** E-mail/SMS through a transactional outbox. Local driver stores + logs; SMTP/SMS providers plug in later. */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  constructor(@InjectDb() private db: Db) {}
  async send(channel: 'email' | 'sms' | 'push', recipient: string, subject: string, body: string, payload?: unknown) {
    const [m] = await this.db.insert(outboxMessages).values({ channel, recipient, subject, body, payload: payload ?? null, status: config().MAIL_DRIVER === 'outbox' ? 'sent' : 'pending', sentAt: new Date() }).returning();
    if (config().NODE_ENV !== 'test') this.log.log(`[${channel}] → ${recipient}: ${subject}`);
    return m;
  }
  async emitIntegrationEvent(topic: string, payload: unknown) {
    return this.db.insert(outboxMessages).values({ channel: 'integration', recipient: topic, subject: topic, payload: payload as object, status: 'pending' }).returning();
  }
}

@Global()
@Module({ providers: [StorageService, MailService], exports: [StorageService, MailService] })
export class AdaptersModule {}
