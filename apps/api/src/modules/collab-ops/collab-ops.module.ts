import { Module } from '@nestjs/common';
import { LaunchController } from './launch.controller';
import { CapacityController } from './capacity.controller';
import { MicroController } from './micro.controller';
import { PoolsController } from './pools.controller';
import { CommitController } from './commit.controller';

/** Launch, Capacity calendar, Micro-contracts, Demand pools and Commit. */
@Module({ controllers: [LaunchController, CapacityController, MicroController, PoolsController, CommitController] })
export class CollabOpsModule {}
