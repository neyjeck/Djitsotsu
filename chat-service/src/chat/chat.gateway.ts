import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { CassandraService } from '../cassandra/cassandra.service';
import { types } from 'cassandra-driver';

interface AuthGrpcService {
  Validate(data: { token: string }): Observable<{ status: number; error: string; userId: string | number }>;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  private authService!: AuthGrpcService;

  constructor(
    @Inject('AUTH_SERVICE') private client: ClientGrpc,
    private cassandraService: CassandraService
  ) {}

  onModuleInit() {
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers['authorization'];
      
      if (!token) {
        console.error('Disconnected: Token not provided');
        client.disconnect();
        return;
      }

      const cleanToken = token.replace('Bearer ', '').trim();

      const response = await firstValueFrom(this.authService.Validate({ token: cleanToken }));

      if (response.status !== 200) {
        console.error(`Disconnected: Invalid token. Status: ${response.status}, Error: ${response.error}`);
        client.disconnect();
        return;
      }

      client.data.userId = response.userId;
      console.log(`User successfully connected: ${response.userId}`);
    } catch (error) {
      console.error('Disconnected due to critical error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`User disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody('roomId') roomId: string) {
    client.join(String(roomId));
    console.log(`User ${client.data.userId} joined room ${roomId}`);
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; content: string }
  ) {
    const message = {
      room_id: String(payload.roomId),
      created_at: new Date(),
      message_id: types.TimeUuid.now(),
      sender_id: String(client.data.userId),
      content: payload.content,
    };

    const mapper = this.cassandraService.getMapper();
    await mapper.forModel('Message').insert(message);

    console.log(`User ${client.data.userId} sent a message to room ${payload.roomId}`);
    
    this.server.to(String(payload.roomId)).emit('newMessage', message);
  }
}