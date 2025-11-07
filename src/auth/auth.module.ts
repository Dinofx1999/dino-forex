/* eslint-disable */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-this',
      signOptions: { 
        expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any  // ✅ Fix với 'as any'
      },
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}