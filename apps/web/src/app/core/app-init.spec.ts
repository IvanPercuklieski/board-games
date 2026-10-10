import { TestBed } from '@angular/core/testing';
import { initializeApp } from './app-init';
import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';

describe('initializeApp', () => {
  it('loads the config first, then restores the session (works across awaits)', async () => {
    const order: string[] = [];
    let configLoaded = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RuntimeConfigService,
          useValue: {
            load: async () => {
              await Promise.resolve();
              configLoaded = true;
              order.push('config');
            },
          },
        },
        {
          provide: AuthService,
          // The real AuthService needs the loaded config when it is created.
          useFactory: () => {
            if (!configLoaded) throw new Error('AuthService created before config');
            return { ready: Promise.resolve().then(() => order.push('session')) };
          },
        },
      ],
    });
    await TestBed.runInInjectionContext(() => initializeApp());
    expect(order).toEqual(['config', 'session']);
  });
});
