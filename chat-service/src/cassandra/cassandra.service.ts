import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, mapping, auth } from 'cassandra-driver';

@Injectable()
export class CassandraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CassandraService.name);
  private client!: Client;
  private mapper!: mapping.Mapper;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const contactPoints = [this.configService.get<string>('CASSANDRA_CONTACT_POINTS') || '127.0.0.1'];
    const localDataCenter = this.configService.get<string>('CASSANDRA_LOCAL_DATACENTER')!;
const username = this.configService.get<string>('CASSANDRA_USER')!;
const password = this.configService.get<string>('CASSANDRA_PASSWORD')!;
const keyspace = this.configService.get<string>('CASSANDRA_KEYSPACE')!;

    this.client = new Client({
      contactPoints,
      localDataCenter,
      authProvider: new auth.PlainTextAuthProvider(username, password),
    });

    try {
      await this.client.connect();
      this.logger.log('Connected to global Cassandra successfully');

      await this.createKeyspaceIfNotExists(keyspace);

      this.client.keyspace = keyspace;

      await this.createTables();

      this.mapper = new mapping.Mapper(this.client, {
        models: { 'Message': { tables: ['messages'] } }
      });
      
    } catch (error) {
      this.logger.error('Failed to connect to Cassandra', error);
    }
  }

  async onModuleDestroy() {
    await this.client.shutdown();
    this.logger.log('Cassandra connection closed');
  }

  getMapper() {
    return this.mapper;
  }

  private async createKeyspaceIfNotExists(keyspace: string) {
    const query = `
      CREATE KEYSPACE IF NOT EXISTS ${keyspace} 
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};
    `;
    await this.client.execute(query);
  }

  private async createTables() {
    const query = `
      CREATE TABLE IF NOT EXISTS messages (
        room_id text,
        created_at timestamp,
        message_id timeuuid,
        sender_id text,
        content text,
        PRIMARY KEY ((room_id), created_at, message_id)
      ) WITH CLUSTERING ORDER BY (created_at DESC);
    `;
    await this.client.execute(query);
    this.logger.log('Cassandra tables are ready');
  }
}