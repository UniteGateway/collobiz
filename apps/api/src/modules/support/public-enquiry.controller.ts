import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { InjectDb, type Db } from '../../db/client';
import { enquiries } from '../../db/schema';
import { Public } from '../../common/context';
import { body } from '../../common/http';
import { MailService } from '../../common/adapters';
import { randomDigits } from '../../common/crypto';

export const EnquirySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  organization: z.string().trim().max(200).optional().transform((v) => v || undefined),
  topic: z.enum(['partnership', 'requirement', 'support', 'media', 'other']),
  message: z.string().trim().min(20, 'Please give us at least 20 characters').max(4000),
  consent: z.literal(true, { message: 'Consent is required so we can reply' }),
});

/** Screen 010 — public contact enquiries (rate-limited, no account required). */
@ApiTags('public')
@Controller('public/enquiries')
export class PublicEnquiryController {
  constructor(@InjectDb() private db: Db, private mail: MailService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(201)
  async create(@Body(body(EnquirySchema)) input: z.infer<typeof EnquirySchema>) {
    const reference = `ENQ-${new Date().getFullYear()}-${randomDigits(6)}`;
    await this.db.insert(enquiries).values({ reference, name: input.name, email: input.email, organization: input.organization, topic: input.topic, message: input.message });
    await this.mail.send('email', input.email, `COLLABIZ enquiry ${reference}`, `Thank you ${input.name}. We received your enquiry and will respond within two business days.`);
    return { reference };
  }
}
