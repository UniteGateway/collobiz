import { Module } from '@nestjs/common';
import { Eb5Access } from './access';
import { Eb5CoreController } from './core.controller';
import { Eb5LeadsController } from './leads.controller';
import { Eb5EngagementController } from './engagement.controller';
import { Eb5RecordsController } from './records.controller';

/** GO EB5 — EB-5 consultancy module (feature flag `go_eb5`; contracting entity CITRUS360 LLC). */
@Module({ controllers: [Eb5CoreController, Eb5LeadsController, Eb5EngagementController, Eb5RecordsController], providers: [Eb5Access] })
export class Eb5Module {}
