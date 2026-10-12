// Task 2 client: clear messages whether the service is missing, rejects a request or answers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { task2Api } from './task2Api';

const respond = (status: number, body: string, type: string) => vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } }));

afterEach(() => vi.unstubAllGlobals());

describe('task2Api', () => {
  it('says the service is not connected when a web host answers with its own page', async () => {
    vi.stubGlobal('fetch', respond(404, '<!doctype html><title>404</title>', 'text/html'));
    await expect(task2Api.stations()).rejects.toThrow('isn’t connected');
  });

  it('says the service is not connected when it cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(task2Api.stations()).rejects.toThrow('isn’t connected');
  });

  it('passes on the service’s own reason for a rejected request', async () => {
    vi.stubGlobal('fetch', respond(422, JSON.stringify({ detail: 'cutoff must be a whole IST hour' }), 'application/json'));
    await expect(task2Api.stations()).rejects.toThrow('cutoff must be a whole IST hour');
  });

  it('returns the service’s JSON', async () => {
    vi.stubGlobal('fetch', respond(200, JSON.stringify({ stations: [], live: false }), 'application/json'));
    await expect(task2Api.stations()).resolves.toEqual({ stations: [], live: false });
  });
});
