import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import type { 
  RegisterRequest, RegisterResponse, 
  LoginRequest, LoginResponse,
  ValidateRequest, ValidateResponse,
  RefreshRequest, LogoutRequest, LogoutResponse,
  SocialLoginRequest, VerifyOtpRequest, SendOtpRequest, SendOtpResponse,
  ForgotPasswordRequest, ForgotPasswordResponse, ResetPasswordRequest,
} from '@contracts/auth/auth.generated';
import { AUTH_SERVICE_NAME } from '@contracts/auth/auth.generated';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @GrpcMethod(AUTH_SERVICE_NAME, 'Register')
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    try {
      await this.authService.register(data);
      return {
        status: 201,
        error: '',
        userId: 0
      };
    } catch (e) {
      return { status: 400, error: (e as Error).message, userId: 0 };
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
      return { status: 401, error: (e as Error).message, accessToken: '', refreshToken: '' };
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

      return { 
        status: 200, 
        error: '', 
        accessToken: result.accessToken, 
        refreshToken: result.refreshToken 
      };
    } catch (e) {
      this.logger.error(`Social Login Error: ${(e as Error).message}`);
      return { 
        status: 400, 
        error: (e as Error).message, 
        accessToken: '', 
        refreshToken: '' 
      };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Validate')
  async validate(data: ValidateRequest): Promise<ValidateResponse> {
    this.logger.log(`gRPC received data for verification: ${JSON.stringify(data)}`);
    try {
      const result = await this.authService.validateToken(data.token);
      return { status: 200, error: '', userId: typeof result.id === 'string' ? parseInt(result.id) : result.id };
    } catch (e) {
      this.logger.error(`Error validating token in auth-service: ${(e as Error).message}`);
      return { status: 401, error: 'Invalid token', userId: 0 };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Refresh')
  async refresh(data: RefreshRequest, metadata: any): Promise<LoginResponse> {
    try {
      const result = await this.authService.refreshTokens(data.refreshToken, '127.0.0.1', 'Unknown');
      return {
        status: 200,
        error: '',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (e) {
      return { status: 401, error: (e as Error).message, accessToken: '', refreshToken: '' };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'Logout')
  async logout(data: LogoutRequest): Promise<LogoutResponse> {
    const result = await this.authService.logout(data.refreshToken);
    return { success: result.success };
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'SendOtp')
  async sendOtp(data: SendOtpRequest): Promise<SendOtpResponse> {
    try {
      const result = await this.authService.sendOtp(data.identifier);
      return { success: result.success, message: result.message };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'VerifyOtp')
  async verifyOtp(data: VerifyOtpRequest): Promise<LoginResponse> {
    try {
      const result = await this.authService.verifyOtpAndLogin(
        data.identifier, 
        data.code, 
        '0.0.0.0', 
        'Gateway'
      );
      
      return {
        status: 200,
        error: '',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (e) {
      return { status: 400, error: (e as Error).message, accessToken: '', refreshToken: '' };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ForgotPassword')
  async forgotPassword(data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    try {
      const result = await this.authService.forgotPassword(data.email);
      return { 
        success: true, 
        message: result.message || 'Code sent to email' 
      };
    } catch (e) {
      this.logger.error(`Forgot Password Error: ${(e as Error).message}`);
      return { 
        success: false, 
        message: (e as Error).message 
      };
    }
  }

  @GrpcMethod(AUTH_SERVICE_NAME, 'ResetPassword')
  async resetPassword(data: ResetPasswordRequest): Promise<LoginResponse> {
    try {
      const result = await this.authService.resetPassword({
        email: data.email,
        code: data.code,
        new_password: data.newPassword || (data as any).new_password, 
      });

      return {
        status: 200,
        error: '',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (e) {
      this.logger.error(`Reset Password Error: ${(e as Error).message}`);
      return { 
        status: 400, 
        error: (e as Error).message, 
        accessToken: '', 
        refreshToken: '' 
      };
    }
  }
}