import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('loads and validates the public config from the server', async () => {
    const service = TestBed.inject(RuntimeConfigService);
    const loading = service.load();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/config')
      .flush({ supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'sb_publishable_x' });
    await loading;
    expect(service.config).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'sb_publishable_x',
    });
  });

  it('rejects an invalid config', async () => {
    const service = TestBed.inject(RuntimeConfigService);
    const loading = service.load();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/config')
      .flush({ supabaseUrl: 'http://insecure', supabaseAnonKey: '' });
    await expect(loading).rejects.toThrow(/config/i);
  });

  it('refuses to be read before it is loaded', () => {
    expect(() => TestBed.inject(RuntimeConfigService).config).toThrow(/not loaded/);
  });
});
