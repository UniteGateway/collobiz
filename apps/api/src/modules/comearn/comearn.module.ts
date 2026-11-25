import { Module } from '@nestjs/common';
import { ComearnController } from './comearn.controller';
import { ComearnPlusController } from './comearn-plus.controller';
import { ComearnReviewController } from './comearn-review.controller';

@Module({ controllers: [ComearnController, ComearnPlusController, ComearnReviewController] })
export class ComearnModule {}
