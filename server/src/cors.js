/**
 * Allow the Vercel site to call the API. Set CLIENT_URL to your exact production URL.
 * Optional: CORS_ORIGINS=https://app.vercel.app,https://custom.domain.com
 * Optional: ALLOW_VERCEL_PREVIEWS=true for *.vercel.app preview deployments
 */

function parseOrigins() {
  const list = [];
  const raw = process.env.CORS_ORIGINS || process.env.CLIENT_URL || '';
  for (const part of raw.split(',')) {
    const o = part.trim().replace(/\/$/, '');
    if (o) list.push(o);
  }
  return list;
}

export function createCorsMiddleware() {
  const allowed = parseOrigins();

  return (req, res, next) => {
    const origin = req.headers.origin;

    if (!origin) {
      return next();
    }

    const normalized = origin.replace(/\/$/, '');
    let permit = false;

    if (allowed.length === 0) {
      permit = true;
    } else if (allowed.some((a) => a === normalized)) {
      permit = true;
    } else if (process.env.ALLOW_VERCEL_PREVIEWS === 'true') {
      try {
        const host = new URL(origin).hostname;
        if (host.endsWith('.vercel.app')) permit = true;
      } catch {
        /* ignore */
      }
    }

    if (permit) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } else {
      console.warn('CORS blocked origin:', origin, 'allowed:', allowed);
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(permit ? 204 : 403);
    }

    next();
  };
}
