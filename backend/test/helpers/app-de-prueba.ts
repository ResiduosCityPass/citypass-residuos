import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/shared/filters/http-exception.filter';
import { payloadDePrueba } from '../../src/shared/auth/payload-de-prueba';
import { Rol } from '../../src/shared/domain/enums';

export interface AppDePrueba {
  app: INestApplication;
  dataSource: DataSource;
  /** Token firmado localmente para el rol indicado. */
  /** `sub` propio para los casos donde importa que sean dos personas distintas. */
  token(rol?: Rol, sub?: string): string;
  /** Vacia todas las tablas de dominio respetando las claves foraneas. */
  limpiar(): Promise<void>;
  cerrar(): Promise<void>;
}

/**
 * Levanta la aplicacion completa contra la base de tests.
 *
 * Se arma con los mismos pipes y filtros que `main.ts` para que los tests vean
 * exactamente las mismas respuestas que un cliente real: si la validacion o el
 * formato de error cambian, estos tests lo notan.
 */
export async function crearAppDePrueba(): Promise<AppDePrueba> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = modulo.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const dataSource = app.get(DataSource);
  const jwt = app.get(JwtService);

  return {
    app,
    dataSource,
    token: (rol: Rol = Rol.ADMINISTRADOR, sub = `test-${rol}`) =>
      jwt.sign(payloadDePrueba(rol, sub)),
    limpiar: async () => {
      // El orden importa menos con CASCADE, pero se listan igual de la hoja a
      // la raiz para que el dia que se saque el CASCADE esto siga andando.
      await dataSource.query(
        'TRUNCATE TABLE "evento_pendiente", "alerta", "lectura", "sensor", "contenedor", "camion", "zona" RESTART IDENTITY CASCADE',
      );
    },
    cerrar: async () => {
      await app.close();
    },
  };
}
