import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import type { 
  RegisterRequest, RegisterResponse, 
  LoginRequest, LoginResponse,
  ValidateRequest, ValidateResponse,
  RefreshRequest, LogoutRequest, LogoutResponse,
  SocialLoginRequest, 
} from '@contracts/auth/auth.generated';
import { AUTH_SERVICE_NAME } from '@contracts/auth/auth.generated';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod(AUTH_SERVICE_NAME, 'Register')
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    try {
      const user = await this.authService.register(data);
      return {
        status: 201,
        error: '',
        userId: Number(user.id)
      };
    } catch (e) {
      return { status: 400, error: e.message, userId: 0 };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Login')
  async login(data: LoginRequest): Promise<LoginResponse> {
    try {
      
      const tokens = await this.authService.login(data);
      
      return {
        status: 200,
        error: '',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (e) {
      return { status: 401, error: 'Invalid credentials', accessToken: '', refreshToken: '' };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'SocialLogin')
  async socialLogin(data: SocialLoginRequest): Promise<LoginResponse> {
    try {
      const result = await this.authService.socialLogin(
        {
          email: data.email,
          firstName: data.firstName,
          avatarUrl: data.avatarUrl,
          provider: data.provider,
          providerId: data.providerId
        },
        '127.0.0.1',
        'Unknown'
      );
      return { status: 200, error: '', accessToken: result.accessToken, refreshToken: result.refreshToken };
    } catch (e) {
      return { status: 400, error: e.message, accessToken: '', refreshToken: '' };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Validate')
  async validate(data: ValidateRequest): Promise<ValidateResponse> {
    try {
      const result = await this.authService.validateToken(data.token);
      return { status: 200, error: '', userId: typeof result.id === 'string' ? parseInt(result.id) : result.id };
    } catch (e) {
      return { status: 401, error: 'Invalid token', userId: 0 };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Refresh')
  async refresh(data: RefreshRequest): Promise<LoginResponse> {
    try {
      const result = await this.authService.refreshTokens(data.refreshToken, '127.0.0.1', 'Unknown');
      return { status: 200, error: '', accessToken: result.accessToken, refreshToken: result.refreshToken };
    } catch (e) {
      return { status: 401, error: 'Invalid Refresh Token', accessToken: '', refreshToken: '' };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Logout')
  async logout(data: LogoutRequest): Promise<LogoutResponse> {
    const result = await this.authService.logout(data.refreshToken);
    return { success: result.success };
  }
}