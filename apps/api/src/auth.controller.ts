import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';
import { AuthService } from './auth';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

class RegisterDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{3,40}$/) referralCode?: string;
  @IsString() @MinLength(10) password!: string;
}
class LoginDto {
  @IsString() identity!: string;
  @IsString() @MinLength(10) password!: string;
}
class RefreshDto { @IsString() refreshToken!: string; }
class IdentityDto { @IsString() @MinLength(3) @MaxLength(320) identity!: string; }
class ChallengeDto extends IdentityDto { @IsString() @Matches(/^\d{6}$/) code!: string; }
class ResetPasswordDto extends ChallengeDto { @IsString() @MinLength(10) @MaxLength(128) password!: string; }

@ApiTags('auth')
@Controller('auth')
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() body: RegisterDto) { return this.auth.register(body); }
  @Post('login') login(@Body() body: LoginDto) { return this.auth.login(body.identity, body.password); }
  @Post('refresh') refresh(@Body() body: RefreshDto) { return this.auth.refresh(body.refreshToken); }
  @Post('logout') logout(@Body() body: RefreshDto) { return this.auth.revoke(body.refreshToken); }
  @Post('verification/request') requestVerification(@Body() body: IdentityDto) { return this.auth.requestVerification(body.identity); }
  @Post('verification/confirm') verifyContact(@Body() body: ChallengeDto) { return this.auth.verifyContact(body.identity, body.code); }
  @Post('password-reset/request') requestPasswordReset(@Body() body: IdentityDto) { return this.auth.requestPasswordReset(body.identity); }
  @Post('password-reset/confirm') resetPassword(@Body() body: ResetPasswordDto) { return this.auth.resetPassword(body.identity, body.code, body.password); }
}
