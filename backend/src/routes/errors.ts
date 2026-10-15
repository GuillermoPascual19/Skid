// Avisos de errores del juego (frontend/src/shared/errors.ts): se dejan en los
// logs del Worker para verlos en Cloudflare (Workers → skid → Logs). No hace
// falta sesión (el error puede saltar antes de tenerla) y no se guarda nada en
// la base de datos ni se apunta quién lo mandó.

/** Lo único que necesita del entorno (así se prueba sin los tipos de Cloudflare). */
interface ErrorEnv {
  readonly ERROR_RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/** Tamaño máximo del aviso; lo que pase de ahí se descarta. */
const MAX_BODY = 8000;

/** Texto recortado y sin caracteres de control (salvo saltos de línea, para la pila). */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[^\P{Cc}\n]|\p{Cf}/gu, '').trim();
  return clean ? clean.slice(0, max) : null;
}

/** Siempre responde 204: quien lo manda no necesita saber si se apuntó. */
export async function logClientError(req: Request, env: ErrorEnv): Promise<Response> {
  const done = new Response(null, { status: 204 });
  // El limitador es de Cloudflare y en memoria: la IP no se guarda en ningún sitio.
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  if (!(await env.ERROR_RATE_LIMITER.limit({ key: ip })).success) return done;

  const raw = await req.text();
  if (raw.length > MAX_BODY) return done;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return done;
  }
  if (typeof data !== 'object' || data === null) return done;
  const report = data as Record<string, unknown>;
  const message = text(report.message, 300);
  if (!message) return done;

  console.error({
    event: 'clientError',
    kind: report.kind === 'rejection' ? 'rejection' : 'error',
    message,
    source: text(report.source, 300),
    route: text(report.route, 40),
    build: text(report.build, 40),
    browser: text(req.headers.get('user-agent'), 200),
    stack: text(report.stack, 2000),
  });
  return done;
}
