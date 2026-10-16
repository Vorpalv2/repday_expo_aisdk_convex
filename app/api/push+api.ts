import { pushConfig } from '../../lib/server/webPush';

export function GET() {
  const config = pushConfig();
  return Response.json({ configured: !!config, publicKey: config?.publicKey ?? null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
