import { exportLocalData } from '@/server/data-settings';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const data = await exportLocalData();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(data, {
      headers: {
        'Content-Disposition': `attachment; filename="jianyuan-backup-${date}.json"`,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: 'SQLite storage is not available for export.' },
      { status: 409 },
    );
  }
}
