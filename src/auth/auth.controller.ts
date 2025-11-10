/* eslint-disable */
import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Request } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const { 
  validateUser, 
  createUser, 
  updateRefreshToken,
  updateLastLogin 
} = require('../database/user.helper');

const { log, colors } = require('../module/helper/text.format');

@Controller('auth')
export class AuthController {
  constructor(private jwtService: JwtService) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: any) {
    try {
      log(colors.blue, '🔄 Registering user:', registerDto.username);
      
      const user = await createUser({
        username: registerDto.username,
        email: registerDto.email,
        password: registerDto.password,
        role: registerDto.role || 'user'
      });
      
      log(colors.green, `✅ User registered: ${user.username}`);
      
      return {
        success: true,
        message: 'User registered successfully',
        user: {
          username: user.username,
          email: user.email,
          role: user.role
        }
      };
      
    } catch (error: any) {
      log(colors.red, '❌ Register error:', error.message);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: any) {
    try {
      log(colors.blue, '🔄 Login attempt:', loginDto.username);
      
      // Validate credentials
      const user = await validateUser(loginDto.username, loginDto.password);
      
      if (!user) {
        return {
            success: false,
            message: 'Invalid username or password'
        };
      }
      
      // Generate tokens
      const payload = { 
        sub: user._id.toString(), 
        username: user.username,
        role: user.role
      };
      
      const accessToken = this.jwtService.sign(payload, {
        expiresIn: '7d'
      });
      
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: '7d'
      });
      
      // Save refresh token
      await updateRefreshToken(user._id.toString(), refreshToken);
      await updateLastLogin(user._id.toString());
      
      log(colors.green, `✅ Login successful: ${user.username}`);
      
      return {
        success: true,
        accessToken,
        refreshToken,
        user: {
          username: user.username,
          email: user.email,
          role: user.role
        }
      };
      
    } catch (error: any) {
      log(colors.red, '❌ Login error:', error.message);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() body: any) {
    try {
      const { refreshToken } = body;
      
      if (!refreshToken) {
        throw new Error('Refresh token is required');
      }
      
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken);
      
      // Generate new access token
      const newPayload = {
        sub: payload.sub,
        username: payload.username,
        role: payload.role
      };
      
      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: '15m'
      });
      
      log(colors.green, `✅ Token refreshed for: ${payload.username}`);
      
      return {
        success: true,
        accessToken
      };
      
    } catch (error: any) {
      log(colors.red, '❌ Refresh token error:', error.message);
      throw new Error('Invalid refresh token');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return {
      success: true,
      user: req.user
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: any) {
    try {
      // Clear refresh token
      await updateRefreshToken(req.user.userId, null);
      
      log(colors.green, `✅ Logout successful: ${req.user.username}`);
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
      
    } catch (error: any) {
      log(colors.red, '❌ Logout error:', error.message);
      throw error;
    }
  }
}