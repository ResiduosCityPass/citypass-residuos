import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EMISOR_TOKEN_DEFAULT } from '../../config/env.validation';
import { opcionesJwt } from './auth.module';

describe('opcionesJwt', () => {
  const firmarCon = (config: Record<string, string>) => {
    const opciones = opcionesJwt(new ConfigService(config));

    return new JwtService(opciones).sign({ sub: 'U000042' });
  };

  it('firma sin JWT_ISSUER en el entorno', () => {
    // El CI corre sin `.env`. Sin un valor por defecto, `jsonwebtoken` recibe
    // `issuer: undefined` y tira "issuer must be a string" al firmar el primer
    // token: la aplicacion arranca bien y falla en el primer request.
    expect(() => firmarCon({ JWT_SECRET: 'secreto' })).not.toThrow();
  });

  it('usa el emisor por defecto cuando no esta configurado', () => {
    const { signOptions } = opcionesJwt(new ConfigService({ JWT_SECRET: 'secreto' }));

    expect(signOptions?.issuer).toBe(EMISOR_TOKEN_DEFAULT);
  });

  it('respeta el emisor configurado', () => {
    const { signOptions } = opcionesJwt(
      new ConfigService({ JWT_SECRET: 'secreto', JWT_ISSUER: 'identidad.squad2' }),
    );

    expect(signOptions?.issuer).toBe('identidad.squad2');
  });

  it('vence en 8 horas si no se configura otra cosa', () => {
    const { signOptions } = opcionesJwt(new ConfigService({ JWT_SECRET: 'secreto' }));

    expect(signOptions?.expiresIn).toBe('8h');
  });
});
