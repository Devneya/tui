import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAbsolute } from 'node:path';

import {
  MOCK_API_KEY,
  MOCK_MODEL,
  MOCK_PROVIDER,
  STREAM_MARKER,
  startMockProvider,
} from './mock-provider.mjs';

function jsonResponse(response) {
  return response.json();
}

function completionRequest(provider, body, apiKey = MOCK_API_KEY) {
  return fetch(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function advertisedTool(name, properties, required = Object.keys(properties)) {
  return {
    type: 'function',
    function: {
      name,
      parameters: { type: 'object', properties, required },
    },
  };
}

test('serves the configured model list and keeps request records in memory', async (t) => {
  const provider = await startMockProvider();
  t.after(() => provider.close());

  assert.equal(provider.provider, MOCK_PROVIDER);
  assert.equal(provider.model, MOCK_MODEL);
  assert.equal(provider.apiKey, MOCK_API_KEY);
  assert.match(provider.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(provider.baseURL, `${provider.url}/v1`);

  const response = await fetch(`${provider.baseURL}/models`, {
    headers: { authorization: `Bearer ${MOCK_API_KEY}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await jsonResponse(response), {
    object: 'list',
    data: [{ id: MOCK_MODEL, object: 'model', created: 0, owned_by: MOCK_PROVIDER }],
  });
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0].method, 'GET');
  assert.equal(provider.requests[0].path, '/v1/models');
  assert.equal(provider.requests[0].headers.authorization, `Bearer ${MOCK_API_KEY}`);
});

test('returns deterministic streaming and non-streaming chat completions', async (t) => {
  const provider = await startMockProvider();
  t.after(() => provider.close());

  const streamResponse = await completionRequest(provider, {
    model: MOCK_MODEL,
    messages: [{ role: 'user', content: 'stream marker' }],
    stream: true,
  });
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get('content-type'), /text\/event-stream/);
  const streamBody = await streamResponse.text();
  const events = streamBody
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .filter((data) => data !== '[DONE]')
    .map((data) => JSON.parse(data));
  const streamedText = events
    .flatMap((event) => event.choices ?? [])
    .map((choice) => choice.delta?.content ?? '')
    .join('');
  assert.equal(streamedText, STREAM_MARKER);
  assert.ok(streamBody.endsWith('data: [DONE]\n\n'));

  const completionResponse = await completionRequest(provider, {
    model: MOCK_MODEL,
    messages: [{ role: 'user', content: 'non-stream marker' }],
  });
  assert.equal(completionResponse.status, 200);
  const completion = await jsonResponse(completionResponse);
  assert.equal(completion.object, 'chat.completion');
  assert.equal(completion.choices[0].message.content, 'DEVNEYA_MOCK_COMPLETE');
  assert.equal(provider.requests.length, 2);
});

test('rejects bad credentials and unknown models, and supports controlled provider errors', async (t) => {
  const provider = await startMockProvider();
  t.after(() => provider.close());

  const badKey = await completionRequest(provider, { model: MOCK_MODEL, messages: [] }, 'wrong-key');
  assert.equal(badKey.status, 401);
  assert.equal((await jsonResponse(badKey)).error.code, 'invalid_api_key');

  const badModel = await completionRequest(provider, { model: 'not-advertised', messages: [] });
  assert.equal(badModel.status, 404);
  assert.equal((await jsonResponse(badModel)).error.code, 'model_not_found');

  provider.setScenario('unauthorized');
  const scenarioUnauthorized = await completionRequest(provider, { model: MOCK_MODEL, messages: [] });
  assert.equal(scenarioUnauthorized.status, 401);

  provider.setScenario('server-error');
  const serverError = await completionRequest(provider, { model: MOCK_MODEL, messages: [] });
  assert.equal(serverError.status, 500);
  assert.equal((await jsonResponse(serverError)).error.code, 'devneya_mock_server_error');
});

test('builds editor tool calls from advertised schemas for all supported commands', async (t) => {
  const provider = await startMockProvider();
  t.after(() => provider.close());
  const editor = advertisedTool('str_replace_editor', {
    command: { type: 'string', enum: ['view', 'create', 'str_replace', 'insert'] },
    file_path: { type: 'string' },
    file_text: { type: 'string' },
    old_str: { type: 'string' },
    new_str: { type: 'string' },
    insert_line: { type: 'integer' },
  }, ['command', 'file_path']);

  for (const command of ['view', 'create', 'str_replace', 'insert']) {
    provider.setScenario(`str_replace_editor:${command}`);
    const response = await completionRequest(provider, {
      model: MOCK_MODEL,
      messages: [{ role: 'user', content: `Run editor command ${command}` }],
      tools: [editor],
    });
    assert.equal(response.status, 200);
    const completion = await jsonResponse(response);
    const call = completion.choices[0].message.tool_calls[0];
    assert.equal(call.function.name, 'str_replace_editor');
    const args = JSON.parse(call.function.arguments);
    assert.equal(args.command, command);
    assert.ok(isAbsolute(args.file_path));
    if (command === 'str_replace') {
      assert.equal(args.old_str, 'before');
      assert.equal(args.new_str, 'after');
    }
    if (command === 'insert') assert.equal(args.insert_line, 1);
  }
});

test('builds bash, pwsh, and child-turn calls using only schema-defined required arguments', async (t) => {
  const provider = await startMockProvider();
  t.after(() => provider.close());

  const bash = advertisedTool('bash', {
    command: { type: 'string' },
    description: { type: 'string' },
    optional_cwd: { type: 'string' },
  }, ['command', 'description']);
  const pwsh = advertisedTool('pwsh', {
    script: { type: 'string' },
    description: { type: 'string' },
  }, ['script', 'description']);
  const subagent = advertisedTool('subagent', {
    task: { type: 'string' },
    child: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        mode: { type: 'string', enum: ['run', 'review'] },
        optional_note: { type: 'string' },
      },
      required: ['name', 'mode'],
    },
    optional_depth: { type: 'integer' },
  }, ['task', 'child']);

  for (const [scenario, tool, commandKey] of [
    ['bash', bash, 'command'],
    ['pwsh', pwsh, 'script'],
    ['subagent', subagent, undefined],
  ]) {
    provider.setScenario(scenario);
    const response = await completionRequest(provider, {
      model: MOCK_MODEL,
      messages: [{ role: 'user', content: `Exercise ${scenario}` }],
      tools: [tool],
    });
    assert.equal(response.status, 200);
    const call = (await jsonResponse(response)).choices[0].message.tool_calls[0];
    assert.equal(call.function.name, tool.function.name);
    const args = JSON.parse(call.function.arguments);
    assert.deepEqual(Object.keys(args).sort(), [...tool.function.parameters.required].sort());
    if (commandKey) {
      assert.match(args[commandKey], /DEVNEYA_MOCK_COMMAND_COMPLETE/);
      assert.match(args.description, /deterministic mock-provider marker/i);
    }
    if (scenario === 'subagent') {
      assert.match(args.task, /child turn/i);
      assert.deepEqual(Object.keys(args.child).sort(), ['mode', 'name']);
      assert.equal(args.child.name, 'devneya-mock-child');
      assert.equal(args.child.mode, 'run');
    }
  }
});

test('supports queued response functions and fails clearly when an expected tool is absent', async (t) => {
  const provider = await startMockProvider();
  t.after(() => provider.close());

  provider.setScenario((request) => {
    assert.equal(request.path, '/v1/chat/completions');
    assert.equal(request.body.metadata.case, 'custom');
    return {
      id: 'chatcmpl-custom',
      object: 'chat.completion',
      created: 0,
      model: MOCK_MODEL,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'DEVNEYA_CUSTOM_RESPONSE' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
  });
  const customResponse = await completionRequest(provider, {
    model: MOCK_MODEL,
    messages: [],
    metadata: { case: 'custom' },
  });
  assert.equal((await jsonResponse(customResponse)).choices[0].message.content, 'DEVNEYA_CUSTOM_RESPONSE');

  provider.setScenario('str_replace_editor:view');
  const missingTool = await completionRequest(provider, {
    model: MOCK_MODEL,
    messages: [],
    tools: [],
  });
  assert.equal(missingTool.status, 500);
  const failure = await jsonResponse(missingTool);
  assert.match(failure.error.message, /Expected advertised str_replace_editor tool/);
  assert.match(provider.requests.at(-1).scenarioError, /Expected advertised str_replace_editor tool/);
});
