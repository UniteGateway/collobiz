import { Module } from '@nestjs/common';
import { NetworkController } from './network.controller';
import { NetworkAdminController } from './network-admin.controller';
import { NetworkService } from './network.service';

/** Unite Solar Franchise Network (franchises and store partners) — partner app and Admin Control Centre. */
@Module({ controllers: [NetworkController, NetworkAdminController], providers: [NetworkService, NetworkController] })
export class UniteNetworkModule {}
