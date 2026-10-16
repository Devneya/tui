import { createServer } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export const MOCK_PROVIDER = 'devneya-ci';
export const MOCK_MODEL = 'devneya-test';
export const MOCK_API_KEY = 'devneya-ci-key';
export const STREAM_MARKER = 'DEVNEYA_STREAM_COMPLETE';

const COMPLETION_ID = 'chatcmpl-devneya-ci';
const FIXTURE_PATH = resolve(tmpdir(), 'devneya-mock-provider', 'fixture.txt');
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

function errorPayload(message, type, code) {
  return { error: { message, type, code } };
}

function sendJson(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

function bearerMatches(header, expectedKey) {
  if (typeof header !== 'string') return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] === expectedKey;
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) {
      const error = new Error(`Request body exceeds ${MAX_REQUEST_BYTES} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function completionEnvelope(message, finishReason = 'stop') {
  return {
    id: COMPLETION_ID,
    object: 'chat.completion',
    created: 0,
    model: MOCK_MODEL,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function writeSse(response, chunks) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end('data: [DONE]\n\n');
}

function contentStreamChunks(content) {
  return [
    {
      id: COMPLETION_ID,
      object: 'chat.completion.chunk',
      created: 0,
      model: MOCK_MODEL,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    },
    {
      id: COMPLETION_ID,
      object: 'chat.completion.chunk',
      created: 0,
      model: MOCK_MODEL,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    },
    {
      id: COMPLETION_ID,
      object: 'chat.completion.chunk',
      created: 0,
      model: MOCK_MODEL,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  ];
}

function toolCallStreamChunks(toolCall) {
  const args = typeof toolCall.function.arguments === 'string'
    ? toolCall.function.arguments
    : JSON.stringify(toolCall.function.arguments);
  return [
    {
      id: COMPLETION_ID,
      object: 'chat.completion.chunk',
      created: 0,
      model: MOCK_MODEL,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    },
    {
      id: COMPLETION_ID,
      object: 'chat.completion.chunk',
      created: 0,
      model: MOCK_MODEL,
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: toolCall.id,
            type: 'function',
            function: { name: toolCall.function.name, arguments: args },
          }],
        },
        finish_reason: null,
      }],
    },
    {
      id: COMPLETION_ID,
      object: 'chat.completion.chunk',
      created: 0,
      model: MOCK_MODEL,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    },
  ];
}

function getToolSpecs(request) {
  const advertised = request.body?.tools;
  if (!Array.isArray(advertised)) return [];
  return advertised.flatMap((entry) => {
    const fn = entry?.function ?? entry;
    if (typeof fn?.name !== 'string' || !fn.name) return [];
    return [{
      name: fn.name,
      parameters: fn.parameters ?? { type: 'object', properties: {}, required: [] },
    }];
  });
}

function findTool(request, label, pattern) {
  const tool = getToolSpecs(request).find(({ name }) => pattern.test(name));
  if (!tool) {
    const names = getToolSpecs(request).map(({ name }) => name);
    throw new Error(`Expected advertised ${label} tool; found: ${names.join(', ') || '(none)'}`);
  }
  return tool;
}

function fallbackForSchema(schema = {}, key = '') {
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  const type = schema.type ?? (schema.properties ? 'object' : undefined);
  if (type === 'object') {
    const properties = schema.properties ?? {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    return Object.fromEntries(required
      .filter((name) => Object.hasOwn(properties, name))
      .map((name) => [name, fallbackForSchema(properties[name], name)]));
  }
  if (type === 'array') return [];
  if (type === 'boolean') return false;
  if (type === 'integer' || type === 'number') return 1;
  if (type === 'null') return null;

  if (/path|filename|file_path/i.test(key)) return FIXTURE_PATH;
  if (/description/i.test(key)) return 'Deterministic devneya mock-provider action';
  if (/task|prompt|instruction|goal|message|content|text/i.test(key)) {
    return 'Complete a deterministic mock-provider child turn.';
  }
  if (/command|script|cmd/i.test(key)) return 'printf DEVNEYA_MOCK_COMMAND_COMPLETE';
  return 'devneya mock value';
}

function schemaProperties(tool) {
  return tool.parameters?.properties ?? {};
}

function assignKnownProperty(args, properties, candidates, value) {
  for (const key of candidates) {
    if (Object.hasOwn(properties, key)) args[key] = value;
  }
}

function fillChildTurnArguments(args, schema) {
  const properties = schemaProperties({ parameters: schema });
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!Object.hasOwn(args, key)) continue;
    if (args[key] && typeof args[key] === 'object' && !Array.isArray(args[key])) {
      fillChildTurnArguments(args[key], propertySchema);
      continue;
    }
    if (/task|prompt|instruction|goal|message|description/i.test(key)
      && (propertySchema?.type === 'string' || !propertySchema?.type)) {
      args[key] = 'Complete a deterministic child turn and return exactly DEVNEYA_CHILD_TURN_COMPLETE.';
    } else if (/^(name|agent_name|label)$/i.test(key)
      && propertySchema?.type === 'string' && !Array.isArray(propertySchema.enum)) {
      args[key] = 'devneya-mock-child';
    }
  }
}

function buildToolArguments(tool, { kind, command } = {}) {
  const schema = tool.parameters ?? { type: 'object', properties: {}, required: [] };
  if (schema.type && schema.type !== 'object') {
    throw new Error(`Advertised tool ${tool.name} parameters must be an object schema`);
  }
  const properties = schemaProperties(tool);
  const required = Array.isArray(schema.required) ? schema.required : [];
  const args = Object.fromEntries(required
    .filter((name) => Object.hasOwn(properties, name))
    .map((name) => [name, fallbackForSchema(properties[name], name)]));

  // File and shell tools may make these fields optional in their schemas. Supply
  // them when advertised so a scenario remains useful without adding unknown keys.
  for (const key of Object.keys(properties)) {
    if (/^(file_?path|path|filename|file)$/i.test(key)) args[key] = FIXTURE_PATH;
  }

  if (kind === 'editor') {
    const commandKey = ['command', 'action', 'operation'].find((key) => Object.hasOwn(properties, key));
    if (!commandKey) throw new Error(`Advertised tool ${tool.name} has no command/action property`);
    const commandSchema = properties[commandKey];
    if (Array.isArray(commandSchema.enum) && !commandSchema.enum.includes(command)) {
      throw new Error(`Tool ${tool.name} does not advertise editor command ${command}`);
    }
    args[commandKey] = command;
    const textValues = {
      file_text: 'devneya mock file contents\n',
      content: 'devneya mock file contents\n',
      text: 'devneya mock file contents\n',
      old_str: 'before',
      old_text: 'before',
      new_str: 'after',
      new_text: 'after',
      insert_text: 'inserted by devneya mock provider\n',
      insert_line: 1,
    };
    for (const [key, value] of Object.entries(textValues)) {
      if (Object.hasOwn(properties, key)) args[key] = value;
    }
    assignKnownProperty(args, properties, ['description'], 'Inspect or edit a temporary mock fixture.');
  } else if (kind === 'bash' || kind === 'pwsh') {
    const commandText = kind === 'pwsh'
      ? 'Write-Output DEVNEYA_MOCK_COMMAND_COMPLETE'
      : 'printf DEVNEYA_MOCK_COMMAND_COMPLETE';
    for (const key of Object.keys(properties)) {
      if (/^(command|cmd|script)$/i.test(key)) args[key] = commandText;
      if (/^description$/i.test(key)) args[key] = 'Print a deterministic mock-provider marker.';
    }
  } else if (kind === 'subagent') {
    fillChildTurnArguments(args, schema);
  }

  for (const key of required) {
    if (!Object.hasOwn(args, key)) {
      throw new Error(`Could not construct required argument ${key} for advertised tool ${tool.name}`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (/^(file_?path|path|filename|file)$/i.test(key) && (!isAbsolute(value) || value !== FIXTURE_PATH)) {
      throw new Error(`Tool path argument ${key} must be an absolute mock path`);
    }
  }
  return args;
}

function makeToolCall(request, kind, command) {
  let label;
  let pattern;
  if (kind === 'editor') {
    label = 'str_replace_editor';
    pattern = /str[_-]?replace[_-]?editor/i;
  } else if (kind === 'bash') {
    label = 'bash';
    pattern = /(^|[-_.])bash($|[-_.])/i;
  } else if (kind === 'pwsh') {
    label = 'pwsh/powershell';
    pattern = /pwsh|powershell/i;
  } else {
    label = 'subagent';
    pattern = /subagent|spawn.*agent|agent.*spawn/i;
  }

  const tool = findTool(request, label, pattern);
  return {
    id: 'call_devneya_ci_1',
    type: 'function',
    function: {
      name: tool.name,
      arguments: JSON.stringify(buildToolArguments(tool, { kind, command })),
    },
  };
}

function parseToolScenario(scenario) {
  const [family, command] = scenario.split(':');
  if (family === 'str_replace_editor' || family === 'editor') {
    const selectedCommand = command ?? 'view';
    if (!['view', 'create', 'str_replace', 'insert'].includes(selectedCommand)) {
      throw new Error(`Unsupported str_replace_editor command: ${selectedCommand}`);
    }
    return { kind: 'editor', command: selectedCommand };
  }
  if (family === 'bash' || family === 'pwsh' || family === 'subagent') return { kind: family };
  return undefined;
}

function errorScenario(response, status, message, code) {
  sendJson(response, status, errorPayload(message, 'devneya_mock_error', code));
}

async function applyScenario(scenario, request, response) {
  if (scenario === undefined || scenario === null) return false;
  if (typeof scenario === 'function') {
    const result = await scenario(request);
    return applyScenario(result, request, response);
  }

  if (typeof scenario === 'string') {
    if (scenario === 'unauthorized') {
      errorScenario(response, 401, 'Mock provider rejected the credential.', 'invalid_api_key');
      return true;
    }
    if (scenario === 'unknown-model') {
      errorScenario(response, 404, `Model ${request.body?.model ?? '(missing)'} was not found.`, 'model_not_found');
      return true;
    }
    if (scenario === 'server-error' || scenario === 'error-500') {
      errorScenario(response, 500, 'Controlled mock provider failure.', 'devneya_mock_server_error');
      return true;
    }
    const toolScenario = parseToolScenario(scenario);
    if (toolScenario) {
      const toolCall = makeToolCall(request, toolScenario.kind, toolScenario.command);
      const envelope = completionEnvelope({ role: 'assistant', content: null, tool_calls: [toolCall] }, 'tool_calls');
      if (request.body?.stream === true) writeSse(response, toolCallStreamChunks(toolCall));
      else sendJson(response, 200, envelope);
      return true;
    }
    throw new Error(`Unknown mock-provider scenario: ${scenario}`);
  }

  if (typeof scenario === 'object' && scenario !== null) {
    if (typeof scenario.status === 'number') {
      const body = scenario.body ?? errorPayload(
        scenario.message ?? 'Controlled mock provider response.',
        scenario.type ?? 'devneya_mock_error',
        scenario.code ?? 'devneya_mock_response',
      );
      sendJson(response, scenario.status, body, scenario.headers);
      return true;
    }
    if (Array.isArray(scenario.choices)) {
      if (request.body?.stream === true) {
        const message = scenario.choices[0]?.message;
        if (message?.tool_calls?.[0]) writeSse(response, toolCallStreamChunks(message.tool_calls[0]));
        else writeSse(response, contentStreamChunks(message?.content ?? ''));
      } else {
        sendJson(response, 200, scenario);
      }
      return true;
    }
  }

  throw new Error('A queued response function must return a scenario name, HTTP response, or OpenAI completion object');
}

function sendDefaultCompletion(request, response) {
  const isStream = request.body?.stream === true;
  if (isStream) {
    writeSse(response, contentStreamChunks(STREAM_MARKER));
  } else {
    sendJson(response, 200, completionEnvelope({ role: 'assistant', content: 'DEVNEYA_MOCK_COMPLETE' }));
  }
}

export async function startMockProvider() {
  const apiKey = MOCK_API_KEY;
  const requests = [];
  const responseQueue = [];
  let requestNumber = 0;

  const server = createServer(async (incoming, outgoing) => {
    requestNumber += 1;
    let body;
    let record;
    try {
      body = incoming.method === 'GET' ? undefined : await readJsonBody(incoming);
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1');
      record = {
        id: requestNumber,
        method: incoming.method,
        path: url.pathname,
        query: url.search,
        headers: { ...incoming.headers },
        body,
      };
      requests.push(record);

      if (url.pathname !== '/v1/models' && url.pathname !== '/v1/chat/completions') {
        errorScenario(outgoing, 404, 'Mock provider route not found.', 'route_not_found');
        return;
      }
      if (!bearerMatches(incoming.headers.authorization, apiKey)) {
        errorScenario(outgoing, 401, 'Mock provider rejected the credential.', 'invalid_api_key');
        return;
      }

      if (incoming.method === 'GET' && url.pathname === '/v1/models') {
        sendJson(outgoing, 200, {
          object: 'list',
          data: [{ id: MOCK_MODEL, object: 'model', created: 0, owned_by: MOCK_PROVIDER }],
        });
        return;
      }
      if (incoming.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
        errorScenario(outgoing, 405, 'Method not allowed.', 'method_not_allowed');
        return;
      }
      if (body?.model !== MOCK_MODEL) {
        errorScenario(outgoing, 404, `Model ${body?.model ?? '(missing)'} was not found.`, 'model_not_found');
        return;
      }

      const scenario = responseQueue.shift();
      if (await applyScenario(scenario, record, outgoing)) return;
      sendDefaultCompletion(record, outgoing);
    } catch (error) {
      if (record && error instanceof Error) record.scenarioError = error.message;
      if (outgoing.headersSent) {
        outgoing.destroy(error);
        return;
      }
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      errorScenario(outgoing, status, error instanceof Error ? error.message : 'Mock provider failure.', 'mock_provider_error');
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise((resolveClose) => server.close(resolveClose));
    throw new Error('Mock provider did not bind an IPv4 loopback socket');
  }
  const url = `http://127.0.0.1:${address.port}`;
  const baseURL = `${url}/v1`;
  let closing;

  return {
    baseURL,
    url,
    apiKey,
    provider: MOCK_PROVIDER,
    model: MOCK_MODEL,
    requests,
    /** Queue a scenario or `(recordedRequest) => response` for the next valid completion. */
    setScenario(scenario) {
      if (typeof scenario !== 'function' && typeof scenario !== 'string'
        && (scenario === null || typeof scenario !== 'object')) {
        throw new TypeError('Scenario must be a string, object, or response function');
      }
      responseQueue.push(scenario);
      return responseQueue.length;
    },
    close() {
      if (!closing) {
        closing = new Promise((resolveClose, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClose());
        });
        server.closeIdleConnections?.();
      }
      return closing;
    },
  };
}
