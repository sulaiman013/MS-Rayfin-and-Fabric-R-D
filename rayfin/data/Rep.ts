import { entity, role, uuid, text, email, boolean, date, set, many } from '@microsoft/rayfin-core';
import type { Lead } from './Lead.js';

// A sales or design representative who owns leads.
@entity()
@role('authenticated', ['create', 'read', 'update', 'delete'])
export class Rep {
  @uuid() id!: string;
  @text({ max: 120 }) name!: string;
  @email({ unique: true }) email!: string;
  @set('austin', 'la', 'dallas', 'online') showroom!: 'austin' | 'la' | 'dallas' | 'online';
  @boolean({ default: true }) active!: boolean;
  @date() createdAt!: Date;

  @many(() => Lead) leads?: Lead[];
}
