import { entity, role, uuid, text, date } from '@microsoft/rayfin-core';

// Holds the short-lived Power BI embed token for the dashboard's embedded report.
// Minted SERVER-SIDE by a service principal (app-owns-data) and upserted here; the
// dashboard reads it through the data API and hands it to powerbi-client. The SP
// SECRET never leaves the server. The embed token is meant to reach the browser,
// and it expires (~1h), so a scheduled mint keeps it fresh.
@entity()
@role('authenticated', ['read'])
export class EmbedConfig {
  @uuid() id!: string;
  @text({ max: 200 }) reportId!: string;
  @text({ max: 800 }) embedUrl!: string;
  @text({ max: 4000 }) embedToken!: string;
  @date() expiresAt!: Date;
}
