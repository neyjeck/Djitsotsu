import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { CassandraModule } from './cassandra/cassandra.module';
import { ChatGateway } from './chat/chat.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CassandraModule,
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'auth',
          protoPath: join(process.cwd(), '../contracts/proto/auth/auth.proto'),
          url: '0.0.0.0:50051',
        },
      },
    ]),
  ],
  providers: [ChatGateway],
})
export class AppModule {}