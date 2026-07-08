import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket, 
  OnGatewayConnection, 
  OnGatewayDisconnect 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, OnModuleInit, UsePipes, ValidationPipe } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { ChatService } from './chat.service';
import { JoinRoomDto, SendMessageDto, GetMessagesDto } from './dto/chat.dto';

interface AuthGrpcService {
  Validate(data: { token: string }): Observable<{ status: number; error: string; userId: string | number }>;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  private authService!: AuthGrpcService;

  constructor(
    @Inject('AUTH_SERVICE') private client: ClientGrpc,
    private readonly chatService: ChatService
  ) {}

  onModuleInit() {
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers['authorization'];
      
      if (!token) {
        client.emit('error', { message: 'Token not provided' });
        return client.disconnect();
      }

      const cleanToken = token.replace('Bearer ', '').trim();
      const response = await firstValueFrom(this.authService.Validate({ token: cleanToken }));

      if (response.status !== 200) {
        client.emit('error', { message: 'Invalid token' });
        return client.disconnect();
      }

      client.data.userId = String(response.userId);
      console.log(`User connected: ${client.data.userId}`);
    } catch (error) {
      client.emit('error', { message: 'Auth service unavailable' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected: ${client.data?.userId || client.id}`);
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('subscribeToRoom')
  async handleSubscribeToRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinRoomDto) {
    await this.chatService.addUserToRoom(payload.roomId, client.data.userId);
    client.join(payload.roomId);
    client.emit('roomJoined', { roomId: payload.roomId });
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinRoomDto) {
    const hasAccess = await this.chatService.checkRoomAccess(payload.roomId, client.data.userId);
    if (!hasAccess) return client.emit('error', { message: 'Access denied' });

    client.join(payload.roomId);
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('sendMessage')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: SendMessageDto) {
    const hasAccess = await this.chatService.checkRoomAccess(payload.roomId, client.data.userId);
    if (!hasAccess) return client.emit('error', { message: 'Access denied' });

    const message = await this.chatService.saveMessage(payload.roomId, client.data.userId, payload.content);
    this.server.to(payload.roomId).emit('newMessage', message);
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('getMessages')
  async handleGetMessages(@ConnectedSocket() client: Socket, @MessageBody() payload: GetMessagesDto) {
    const hasAccess = await this.chatService.checkRoomAccess(payload.roomId, client.data.userId);
    if (!hasAccess) return client.emit('error', { message: 'Access denied' });
    
    const data = await this.chatService.getRoomMessages(payload.roomId, payload.pageState);
    client.emit('messagesList', data);
  }
}