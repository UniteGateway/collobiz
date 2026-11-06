import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminIdentityController, OrganizationsController } from './organizations.controller';

@Module({ controllers: [AuthController, OrganizationsController, AdminIdentityController], providers: [AuthService], exports: [AuthService] })
export class IdentityModule {}
