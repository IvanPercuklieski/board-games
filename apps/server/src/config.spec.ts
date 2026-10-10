import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres.ref:s3cret-pw@aws-0-eu.pooler.supabase.com:5432/postgres',
  PUBLIC_ORIGIN: 'http://localhost:4200',
  SUPABASE_URL: 'https://abc.supabase.co',
};

describe('loadConfig', () => {
  it('reads a valid environment and applies defaults', () => {
    expect(loadConfig(validEnv)).toEqual({
      port: 3000,
      publicOrigin: 'http://localhost:4200',
      databaseUrl: validEnv.DATABASE_URL,
      supabaseUrl: 'https://abc.supabase.co',
      webDistDir: undefined,
    });
  });

  it('parses PORT and WEB_DIST_DIR', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080', WEB_DIST_DIR: '/app/web' });
    expect(config.port).toBe(8080);
    expect(config.webDistDir).toBe('/app/web');
  });

  it('strips a trailing slash from PUBLIC_ORIGIN', () => {
    expect(loadConfig({ ...validEnv, PUBLIC_ORIGIN: 'https://example.com/' }).publicOrigin).toBe(
      'https://example.com',
    );
  });

  it.each(['0', '70000', 'abc'])('rejects an invalid PORT %s', (port) => {
    expect(() => loadConfig({ ...validEnv, PORT: port })).toThrow(/PORT/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ PUBLIC_ORIGIN: validEnv.PUBLIC_ORIGIN })).toThrow(/DATABASE_URL/);
  });

  it('requires SUPABASE_URL to be an https URL', () => {
    const { SUPABASE_URL: _omit, ...withoutUrl } = validEnv;
    expect(() => loadConfig(withoutUrl)).toThrow(/SUPABASE_URL/);
    expect(() => loadConfig({ ...validEnv, SUPABASE_URL: 'http://abc.supabase.co' })).toThrow(
      /SUPABASE_URL/,
    );
  });

  it('requires PUBLIC_ORIGIN to be a URL', () => {
    expect(() => loadConfig({ ...validEnv, PUBLIC_ORIGIN: 'not a url' })).toThrow(/PUBLIC_ORIGIN/);
  });

  it('never includes secret values in error messages', () => {
    const badUrl = 'mysql://user:TOP-SECRET@host/db';
    let message = '';
    try {
      loadConfig({ ...validEnv, DATABASE_URL: badUrl });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('TOP-SECRET');
  });
});
