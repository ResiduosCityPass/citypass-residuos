import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { v5 as uuid } from 'uuid';
import { isUUID } from 'class-validator';
import { Zona } from '../../modules/zonas/domain/zona.entity';
import { Contenedor } from '../../modules/contenedores/domain/contenedor.entity';
import { Camion } from '../../modules/flota/domain/camion.entity';
import { Chofer } from '../../modules/choferes/domain/chofer.entity';
import { Ruta } from '../../modules/rutas/domain/ruta.entity';
import { Parada } from '../../modules/rutas/domain/parada.entity';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoParada,
  EstadoRuta,
  TipoResiduo,
} from '../domain/enums';
import { generarSubDeChofer, payloadDeCredencialChofer } from '../auth/credencial-chofer';
import { AUDIENCIA_TOKEN_DEFAULT, EMISOR_CHOFERES_DEFAULT } from '../../config/env.validation';

/** Identidades de demo; las zonas reciben UUID v4, como exige el contrato climático. */
export function planEscenarioInundacion(nombre: string) {
  const escenario = nombre.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(escenario))
    throw new Error('El escenario debe tener de 1 a 10 letras/numeros y empezar con una letra.');
  const prefijo = `DEMO-${escenario}`;
  const id = (recurso: string) =>
    uuid(`com.citypass.residuos.demo.${escenario}.${recurso}`, uuid.DNS);
  const zonas = {
    centro: { nombre: `${prefijo} Centro` },
    norte: { nombre: `${prefijo} Norte` },
  };
  return {
    escenario,
    zonas,
    contenedores: [
      {
        id: id('contenedor1'),
        codigo: `${prefijo}-01`,
        zona: 'centro' as const,
        lat: -34.6037,
        lng: -58.3816,
        nivelLlenadoPct: 90,
        estado: EstadoContenedor.CRITICO,
      },
      {
        id: id('contenedor2'),
        codigo: `${prefijo}-02`,
        zona: 'centro' as const,
        lat: -34.604,
        lng: -58.382,
        nivelLlenadoPct: 30,
        estado: EstadoContenedor.NORMAL,
      },
      {
        id: id('contenedor3'),
        codigo: `${prefijo}-03`,
        zona: 'norte' as const,
        lat: -34.5631,
        lng: -58.4584,
        nivelLlenadoPct: 85,
        estado: EstadoContenedor.CRITICO,
      },
    ],
    camion: { id: id('camion'), patente: prefijo },
    chofer: { id: id('chofer'), nombre: `SIMULACRO ${escenario}`, legajo: prefijo },
    rutaId: id('ruta-inicial'),
    paradaId: id('parada-inicial'),
  };
}

type Plan = ReturnType<typeof planEscenarioInundacion>;

async function leerEscenario(manager: EntityManager, plan: Plan) {
  const zonas = await manager.findBy(
    Zona,
    Object.values(plan.zonas).map(({ nombre }) => ({ nombre })),
  );
  const contenedores = await manager.findBy(
    Contenedor,
    plan.contenedores.map(({ id }) => ({ id })),
  );
  const camion = await manager.findOneBy(Camion, { id: plan.camion.id });
  const chofer = await manager.findOneBy(Chofer, { id: plan.chofer.id });
  const ruta = await manager.findOneBy(Ruta, { id: plan.rutaId });
  const parada = await manager.findOneBy(Parada, { id: plan.paradaId });
  return { zonas, contenedores, camion, chofer, ruta, parada };
}

/** Bootstrap transaccional, sin workers, login falso ni publicaciones al bus. */
export async function prepararEscenarioInundacion(dataSource: DataSource, nombre: string) {
  const plan = planEscenarioInundacion(nombre);
  return dataSource.transaction(async (manager) => {
    // Mismo lock que ruteo y contingencias: no insertar una parada a mitad de una suspensión.
    await manager.query('SELECT pg_advisory_xact_lock(734012, 1)');
    const actual = await leerEscenario(manager, plan);
    const encontrados =
      actual.zonas.length +
      actual.contenedores.length +
      Number(!!actual.camion) +
      Number(!!actual.chofer) +
      Number(!!actual.ruta) +
      Number(!!actual.parada);
    if (encontrados !== 0 && encontrados !== 9)
      throw new Error('Escenario incompleto: no se modificaron datos. Usa un nombre nuevo.');
    if (encontrados === 0) {
      const zonas = await manager.save(
        Zona,
        Object.values(plan.zonas).map((zona) => ({
          ...zona,
          umbralCriticoPct: 70,
          umbralTemperaturaC: 60,
          bloqueada: false,
        })),
      );
      await manager.save(
        Contenedor,
        plan.contenedores.map(({ zona, ...contenedor }) => ({
          ...contenedor,
          zonaId: zonas.find((z) => z.nombre === plan.zonas[zona].nombre)!.id,
          tipoResiduo: TipoResiduo.COMUN,
          capacidadLitros: 1100,
          temperaturaC: 20,
          ultimaLecturaEn: new Date(),
          activo: true,
        })),
      );
      await manager.save(Camion, {
        ...plan.camion,
        capacidadLitros: 10000,
        tipoResiduoHabilitado: TipoResiduo.COMUN,
        estado: EstadoCamion.EN_RUTA,
      });
      await manager.save(Chofer, {
        ...plan.chofer,
        usuarioSub: generarSubDeChofer(),
        activo: true,
      });
      await manager.save(Ruta, {
        id: plan.rutaId,
        camionId: plan.camion.id,
        choferId: plan.chofer.id,
        estado: EstadoRuta.ASIGNADA,
        distanciaEstimadaKm: 0,
        litrosEstimados: 990,
        asignadaEn: new Date(),
        completadaEn: null,
      });
      await manager.save(Parada, {
        id: plan.paradaId,
        rutaId: plan.rutaId,
        contenedorId: plan.contenedores[0].id,
        orden: 1,
        estado: EstadoParada.PENDIENTE,
      });
    } else if (
      actual.zonas.some((z) => !isUUID(z.id, '4')) ||
      actual.contenedores.some(
        (c) =>
          !plan.contenedores.some(
            (p) =>
              p.id === c.id &&
              p.codigo === c.codigo &&
              actual.zonas.some((z) => z.nombre === plan.zonas[p.zona].nombre && z.id === c.zonaId),
          ),
      ) ||
      actual.camion!.patente !== plan.camion.patente ||
      actual.chofer!.legajo !== plan.chofer.legajo ||
      actual.ruta!.camionId !== plan.camion.id ||
      actual.ruta!.choferId !== plan.chofer.id ||
      actual.parada!.rutaId !== plan.rutaId ||
      actual.parada!.contenedorId !== plan.contenedores[0].id
    ) {
      throw new Error('Los recursos del escenario fueron reasignados. Usa un nombre nuevo.');
    }
    const resultado = await leerEscenario(manager, plan);
    return {
      escenario: plan.escenario,
      creado: encontrados === 0,
      zonas: resultado.zonas.map(({ id, nombre, bloqueada }) => ({ id, nombre, bloqueada })),
      contenedores: resultado.contenedores
        .map(({ id, codigo, zonaId, estado, nivelLlenadoPct, lat, lng }) => ({
          id,
          codigo,
          zonaId,
          estado,
          nivelLlenadoPct,
          lat,
          lng,
        }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      camion: {
        id: resultado.camion!.id,
        patente: resultado.camion!.patente,
        estado: resultado.camion!.estado,
      },
      chofer: {
        id: resultado.chofer!.id,
        nombre: resultado.chofer!.nombre,
        legajo: resultado.chofer!.legajo,
        activo: resultado.chofer!.activo,
      },
      ruta: {
        id: resultado.ruta!.id,
        estado: resultado.ruta!.estado,
        paradaId: resultado.parada!.id,
        estadoParada: resultado.parada!.estado,
      },
    };
  });
}

export async function credencialChoferDemo(
  dataSource: DataSource,
  nombre: string,
  env: NodeJS.ProcessEnv,
) {
  if (!env.JWT_SECRET?.trim())
    throw new Error('Falta JWT_SECRET para emitir la credencial del chofer.');
  const plan = planEscenarioInundacion(nombre);
  const chofer = await dataSource.manager.findOneBy(Chofer, {
    id: plan.chofer.id,
    legajo: plan.chofer.legajo,
  });
  if (!chofer?.activo || !chofer.usuarioSub)
    throw new Error('El chofer del escenario no tiene una sesion activa.');
  return new JwtService({ secret: env.JWT_SECRET }).sign(
    payloadDeCredencialChofer(chofer.usuarioSub, chofer.legajo),
    {
      algorithm: 'HS256',
      issuer: env.JWT_ISSUER_CHOFERES || EMISOR_CHOFERES_DEFAULT,
      audience: [env.JWT_AUDIENCE || AUDIENCIA_TOKEN_DEFAULT],
      expiresIn: '2h',
    },
  );
}
