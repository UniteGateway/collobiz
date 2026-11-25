import { Module } from '@nestjs/common';
import { ComearnController } from './comearn.controller';
import { ComearnPlusController } from './comearn-plus.controller';

@Module({ controllers: [ComearnController, ComearnPlusController] })
export class ComearnModule {}
