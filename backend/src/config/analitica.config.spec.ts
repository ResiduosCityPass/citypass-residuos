import { validarEntorno } from './env.validation';
import { urlTableroAnalitica } from './analitica.config';

describe('Destino del tablero de Analitica', () => {
  it('queda desconectado sin impedir el arranque del resto de la aplicacion', () => {
    expect(urlTableroAnalitica(undefined, 'production')).toBeNull();
    expect(urlTableroAnalitica('  ', 'production')).toBeNull();
    expect(() =>
      validarEntorno({ DATABASE_URL: 'postgresql://localhost/residuos', JWT_SECRET: 'test' }),
    ).not.toThrow();
  });
  it('arma solo el tablero de residuos conservando el prefijo del proveedor', () => {
    expect(urlTableroAnalitica(' https://analitica.example/api/ ', 'production')?.href).toBe(
      'https://analitica.example/api/embed?dashboard=residuos',
    );
  });
  it.each([
    'no-es-url',
    'http://analitica.example',
    'https://user:password@analitica.example',
    'https://analitica.example?token=secreto',
    'https://analitica.example#token',
    'file:///tmp/tablero',
  ])('rechaza destinos inseguros: %s', (url) => {
    expect(() => urlTableroAnalitica(url, 'production')).toThrow('ANALITICA_URL');
  });
  it('solo admite HTTP en loopback de desarrollo y test', () => {
    expect(urlTableroAnalitica('http://localhost:8080', 'test')?.href).toContain(
      '/embed?dashboard=residuos',
    );
    expect(() => urlTableroAnalitica('http://localhost:8080', 'production')).toThrow('HTTPS');
    expect(() => urlTableroAnalitica('http://otro-host:8080', 'test')).toThrow('HTTPS');
  });
  it('valida la URL configurada al arrancar', () => {
    expect(() =>
      validarEntorno({
        DATABASE_URL: 'postgresql://localhost/residuos',
        JWT_SECRET: 'test',
        ANALITICA_URL: 'https://proveedor.example?token=no',
      }),
    ).toThrow('ANALITICA_URL');
  });
});
