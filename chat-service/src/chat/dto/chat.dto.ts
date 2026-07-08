import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;
}

export class GetMessagesDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;
  
  @IsString()
  @IsOptional()
  pageState?: string
}