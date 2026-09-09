import { ConfigService } from '@nestjs/config';
import { buildTypeOrmOptions } from './typeorm.config';

describe('buildTypeOrmOptions', () => {
  it('usa DATABASE_URL cuando esta definida', () => {
    const options = buildTypeOrmOptions(
      new ConfigService({
        DATABASE_URL: 'postgresql://citypass:citypass@db:5432/residuos',
        DB_SSL: 'false',
      }),
    );

    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgresql://citypass:citypass@db:5432/residuos',
      ssl: false,
    });
  });

  it('activa SSL para conexiones externas cuando DB_SSL=true', () => {
    const options = buildTypeOrmOptions(
      new ConfigService({
        DATABASE_URL: 'postgresql://citypass:citypass@external:5432/residuos',
        DB_SSL: 'true',
      }),
    );

    expect((options as Record<string, unknown>).ssl).toEqual({ rejectUnauthorized: false });
  });
});
