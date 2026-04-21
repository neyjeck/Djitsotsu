import { Module } from '@nestjs/common';
import { CassandraService } from './cassandra.service';

@Module({
  providers: [CassandraService]
})
export class CassandraModule {}
