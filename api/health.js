export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  return res.status(200).json({
    ok: true,
    service: 'raw-hairs-api',
    timestamp: new Date().toISOString(),
    configured: {
      database: Boolean(process.env.DATABASE_URL),
      firebaseAdmin: Boolean(
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
      ),
    },
  });
}
