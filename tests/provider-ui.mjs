import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
export async function configureProvider(terminal,provider) {
  let from=terminal.mark();
  terminal.write('/provider');await delay(300);terminal.write('\r');
  await terminal.until(/What do you want to do\?/,60000,from);
  from=terminal.mark();terminal.write('\r');await terminal.until(/Which kind of model provider/,60000,from);
  from=terminal.mark();terminal.write('\x1b[B');await delay(120);terminal.write('\r');await terminal.until(/Enter a route name/,60000,from);
  from=terminal.mark();await terminal.enter('devneya-ci');await terminal.until(/Enter the API key/,60000,from);
  from=terminal.mark();await terminal.enter(provider.apiKey);await terminal.until(/Enter the baseURL/,60000,from);
  from=terminal.mark();await terminal.enter(provider.baseURL);await terminal.until(/Choose the wire protocol/,60000,from);
  from=terminal.mark();terminal.write('\r');await terminal.until(/Select the models to enable|Enter model ids/,60000,from);
  from=terminal.mark();await terminal.enter('devneya-test');await terminal.until(/Write this provider configuration\?/,60000,from);
  from=terminal.mark();terminal.write('\r');await terminal.until(/Switch to the new provider now\?/,60000,from);
  terminal.write('\r');await delay(700);
  assert(provider.requests.some(r=>r.path==='/v1/models'),'Provider UI must discover models through loopback service');
}
