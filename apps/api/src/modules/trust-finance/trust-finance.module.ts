import { Module } from '@nestjs/common';
import { ProofController } from './proof.controller';
import { BooksController } from './books.controller';
import { ProgrammesController } from './programmes.controller';

/** Proof passport + Business QR, Invoices & P&L with credit notes and expenses, Unite programmes and the setup checklist. */
@Module({ controllers: [ProofController, BooksController, ProgrammesController] })
export class TrustFinanceModule {}
