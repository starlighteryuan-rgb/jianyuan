import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { DesktopRuntime } from './desktop-runtime';
import {
  runNativeValidation,
  writeNativeValidationFailure,
  type NativeValidationPhase,
} from './native-validation';

const appDataDir = process.env.JIANYUAN_DESKTOP_APP_DATA_DIR;
const token = process.env.JIANYUAN_DESKTOP_RUNTIME_TOKEN;
const port = Number(process.env.JIANYUAN_DESKTOP_RUNTIME_PORT);

if (
  appDataDir === undefined ||
  token === undefined ||
  token.length < 16 ||
  !Number.isInteger(port) ||
  port <= 0
) {
  throw new Error('Desktop runtime bootstrap configuration is incomplete.');
}

const validationPhaseValue = process.env.JIANYUAN_NATIVE_VALIDATION_PHASE;
const validationEnabled = process.env.JIANYUAN_NATIVE_VALIDATION === '1';
const validationPhase: NativeValidationPhase | null = validationEnabled &&
  (validationPhaseValue === 'prepare' || validationPhaseValue === 'verify')
  ? validationPhaseValue
  : null;

let runtime: DesktopRuntime;
try {
  runtime = new DesktopRuntime({
    appDataDir,
    apiKey: process.env.JIANYUAN_DESKTOP_API_KEY ?? '',
  });
} catch (error) {
  if (validationPhase !== null) {
    writeNativeValidationFailure(validationPhase, appDataDir, error);
  }
  throw error;
}

if (validationPhase !== null) {
  await runNativeValidation(runtime, validationPhase, appDataDir);
}

const writeJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
};

const body = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 20 * 1024 * 1024) throw new Error('Request body is too large.');
    chunks.push(value);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('A JSON object is required.');
  }
  return parsed as Record<string, unknown>;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  return value;
};

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeJson(response, 204, null);
    return;
  }
  if (request.headers.authorization !== `Bearer ${token}`) {
    writeJson(response, 401, { error: 'Unauthorized desktop runtime request.' });
    return;
  }

  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (request.method === 'GET' && url.pathname === '/status') {
      writeJson(response, 200, runtime.status());
      return;
    }
    if (request.method === 'GET' && url.pathname === '/records') {
      writeJson(response, 200, await runtime.listRecords(url.searchParams.get('query') ?? ''));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/capture') {
      const input = await body(request);
      writeJson(response, 200, await runtime.capture(requireString(input.verbatim, 'verbatim')));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/ai/configure') {
      const input = await body(request);
      writeJson(
        response,
        200,
        runtime.configureAI({
          providerId: requireString(input.providerId, 'providerId'),
          baseUrl: requireString(input.baseUrl, 'baseUrl'),
          model: requireString(input.model, 'model'),
          ...(input.apiKey === undefined
            ? {}
            : { apiKey: requireString(input.apiKey, 'apiKey') }),
        }),
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/ai/models') {
      const input = await body(request);
      writeJson(response, 200, await runtime.discoverModels(input.refresh === true));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/ai/select-model') {
      const input = await body(request);
      writeJson(response, 200, runtime.selectModel(requireString(input.model, 'model')));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/ai/test') {
      writeJson(response, 200, await runtime.testAIConnection());
      return;
    }
    if (request.method === 'POST' && url.pathname === '/relations/suggest') {
      const input = await body(request);
      if (!Array.isArray(input.recordIds) || !input.recordIds.every((id) => typeof id === 'string')) {
        throw new Error('recordIds must be an array of strings.');
      }
      writeJson(response, 200, await runtime.suggestRelations(input.recordIds));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/relations/reflect') {
      const input = await body(request);
      const meaning = requireString(input.meaning, 'meaning');
      if (
        meaning !== 'connected' &&
        meaning !== 'different_understanding' &&
        meaning !== 'not_my_experience'
      ) {
        throw new Error('meaning is not a supported Observation stance.');
      }
      writeJson(
        response,
        200,
        await runtime.submitObservationReflection({
          suggestion: input.suggestion as never,
          meaning,
          ...(input.reflectionText === undefined
            ? {}
            : { reflectionText: requireString(input.reflectionText, 'reflectionText') }),
        }),
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/relations/admit') {
      throw new Error('Relation admission requires a user Reflection.');
    }
    if (request.method === 'GET' && url.pathname === '/discoveries') {
      writeJson(response, 200, await runtime.listDiscoveries());
      return;
    }
    if (request.method === 'GET' && url.pathname === '/reflection') {
      writeJson(
        response,
        200,
        await runtime.getReflectionTarget(requireString(url.searchParams.get('targetRef'), 'targetRef')),
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/reflection/invitation') {
      const input = await body(request);
      writeJson(
        response,
        200,
        await runtime.createReflectionInvitation(requireString(input.targetRef, 'targetRef')),
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/reflection/respond') {
      const input = await body(request);
      writeJson(
        response,
        200,
        await runtime.respondToReflection({
          targetRef: requireString(input.targetRef, 'targetRef'),
          ...(typeof input.freeText === 'string' ? { freeText: input.freeText } : {}),
          ...(typeof input.response === 'string' ? { response: input.response as never } : {}),
          ...(input.leaveForNow === true ? { leaveForNow: true } : {}),
        }),
      );
      return;
    }
    if (request.method === 'GET' && url.pathname === '/export') {
      writeJson(response, 200, { serialized: runtime.exportData() });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/restore') {
      const input = await body(request);
      runtime.restoreData(requireString(input.serialized, 'serialized'));
      writeJson(response, 200, { ok: true });
      return;
    }
    writeJson(response, 404, { error: 'Desktop runtime endpoint not found.' });
  } catch (error) {
    writeJson(response, 400, {
      error: error instanceof Error ? error.message : 'Desktop runtime request failed.',
    });
  }
});

let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  server.close(() => {
    runtime.close();
    process.exit(0);
  });
};

process.once('SIGINT', close);
process.once('SIGTERM', close);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (value) => {
  if (String(value).split(/\r?\n/u).includes('shutdown')) close();
});
process.stdin.resume();
server.listen(port, '127.0.0.1');
