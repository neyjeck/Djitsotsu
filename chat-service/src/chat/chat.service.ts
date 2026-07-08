import { Injectable } from '@nestjs/common';
import { CassandraService } from '../cassandra/cassandra.service';
import { types } from 'cassandra-driver';
import sanitizeHtml from 'sanitize-html';

@Injectable()
export class ChatService {
  constructor(private readonly cassandraService: CassandraService) {}

  async checkRoomAccess(roomId: string, userId: string): Promise<boolean> {
    const mapper = this.cassandraService.getMapper();
    const result = await mapper.forModel('RoomMember').find({ room_id: roomId, user_id: userId });
    return result.first() !== null;
  }

  async addUserToRoom(roomId: string, userId: string) {
    const mapper = this.cassandraService.getMapper();
    await mapper.forModel('RoomMember').insert({
      room_id: roomId,
      user_id: userId,
      joined_at: new Date(),
    });
    return { success: true };
  }

  async saveMessage(roomId: string, userId: string, content: string) {
    const cleanContent = sanitizeHtml(content, {
      allowedTags: [],
      allowedAttributes: {}
    });

    const message = {
      room_id: roomId,
      created_at: new Date(),
      message_id: types.TimeUuid.now(),
      sender_id: userId,
      content: cleanContent,
    };

    const mapper = this.cassandraService.getMapper();
    await mapper.forModel('Message').insert(message);
    
    return message;
  }

  async getRoomMessages(roomId: string, pageState?: string) {
    const mapper = this.cassandraService.getMapper();
    
    const result = await mapper.forModel('Message').find(
      { room_id: roomId },
      {},
      { fetchSize: 50, pageState: pageState as any }
    );
    
    return {
      messages: result.toArray(),
      pageState: (result as any).pageState
    };
  }
}