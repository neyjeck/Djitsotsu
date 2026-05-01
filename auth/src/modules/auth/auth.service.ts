import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/database/prisma.service';
import { REDIS_CLIENT } from '../../core/database/redis.module';
import { generateTag } from '../../common/utils/generate-tag.util';
import { RegisterRequest, LoginRequest } from '@contracts/auth/auth.generated';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async register(dto: RegisterRequest) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    if (!dto.nickname || dto.nickname.length < 3) {
        throw new BadRequestException('Nickname must be at least 3 chars');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        nickname: dto.nickname,
        avatarUrl: dto.avatarUrl || null,
        tag: generateTag(),
        provider: 'local',
        isVerified: false,
      },
    });
  }

  async login(dto: LoginRequest) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSession(user.id, user.role, 'Unknown', '127.0.0.1');
  }


  async sendOtp(identifier: string) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:${identifier}`;
    await this.redis.set(key, otp, 'EX', 300);
    this.logger.log(`OTP for ${identifier}: ${otp}`);
    return { success: true, message: 'Code sent' };
  }

  async verifyOtpAndLogin(identifier: string, code: string, ip: string, userAgent: string) {
    const key = `otp:${identifier}`;
    const storedCode = await this.redis.get(key);

    if (!storedCode || storedCode !== code) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.redis.del(key);

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });

    if (!user) {
      user = await this.registerNewUser(identifier);
    }

    const tokens = await this.createSession(user.id, user.role, userAgent, ip);
    return { user, ...tokens };
  }


  async socialLogin(data: { email: string; firstName: string; avatarUrl: string; provider: string; providerId: string }, ip: string, userAgent: string) {
    let user = await this.prisma.user.findFirst({ where: { email: data.email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: data.email,
          nickname: data.firstName || `User_${Math.floor(Math.random() * 1000)}`,
          avatarUrl: data.avatarUrl,
          provider: data.provider,
          providerId: data.providerId,
          tag: generateTag(),
          isVerified: true,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: data.avatarUrl, provider: data.provider },
      });
    }

    return this.createSession(user.id, user.role, userAgent, ip);
  }

  async validateToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      return { id: payload.sub };
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async refreshTokens(refreshToken: string, ip: string, userAgent: string) {
    const session = await this.prisma.session.findUnique({ where: { refreshToken } });

    if (!session) throw new UnauthorizedException('Invalid Refresh Token');
    if (new Date() > session.expiresAt) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    
    if (!user) throw new UnauthorizedException('User not found');

    return this.createSession(user.id, user.role, userAgent, ip);
  }

  async logout(refreshToken: string) {
    try {
      await this.prisma.session.delete({ where: { refreshToken } });
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  }

  private async registerNewUser(identifier: string) {
    const isEmail = identifier.includes('@');
    const tempNickname = isEmail ? identifier.split('@')[0] : `User${identifier.slice(-4)}`;
    return this.prisma.user.create({
      data: {
        email: isEmail ? identifier : null,
        phone: !isEmail ? identifier : null,
        nickname: tempNickname,
        tag: generateTag(),
        avatarUrl: null,
      },
    });
  }

  private async createSession(userId: string, role: string, userAgent: string, ip: string) {
    const refreshToken = uuidv4(); 
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.session.create({
      data: { userId, refreshToken, userAgent, ip, expiresAt },
    });

    const accessToken = this.jwtService.sign(
      { sub: userId, role },
      { expiresIn: this.config.get('JWT_EXPIRATION'), secret: this.config.get('JWT_SECRET') },
    );

    return { accessToken, refreshToken };
  }
}