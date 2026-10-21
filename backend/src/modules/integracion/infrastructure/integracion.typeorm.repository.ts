import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull, LessThanOrEqual, MoreThan } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { BloqueoPorIncidente } from '../domain/bloqueo-por-incidente.entity';
import {
  IntegracionRepository,
  ObstruccionRepository,
  RefuerzosVigentes,
} from '../domain/integracion.repository';
import { ObstruccionPorReclamo } from '../domain/obstruccion-por-reclamo.entity';
import { RefuerzoEvento } from '../domain/refuerzo-evento.entity';

@Injectable()
export class IntegracionTypeormRepository
  implements IntegracionRepository, RefuerzosVigentes, ObstruccionRepository
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly contexto: ContextoTransaccional,
  ) {}

  /** El manager de la transaccion en curso, para escribir junto con el cambio de negocio. */
  private manager(): EntityManager {
    return this.contexto.managerActual() ?? this.dataSource.manager;
  }

  async registrarEvento(eventId: string, eventType: string): Promise<boolean> {
    // ON CONFLICT DO NOTHING: una reentrega no inserta y no rompe la transaccion.
    // RETURNING devuelve la fila solo si de verdad se inserto.
    const filas: unknown[] = await this.manager().query(
      `INSERT INTO "evento_recibido" ("eventId", "eventType") VALUES ($1, $2)
       ON CONFLICT ("eventId") DO NOTHING RETURNING "eventId"`,
      [eventId, eventType],
    );

    return filas.length > 0;
  }

  guardarRefuerzo(refuerzo: Partial<RefuerzoEvento>): Promise<RefuerzoEvento> {
    const repo = this.manager().getRepository(RefuerzoEvento);
    return repo.save(repo.create(refuerzo));
  }

  async borrarRefuerzo(eventoId: string): Promise<void> {
    await this.manager().getRepository(RefuerzoEvento).delete({ eventoId });
  }

  guardarBloqueo(bloqueo: Partial<BloqueoPorIncidente>): Promise<BloqueoPorIncidente> {
    const repo = this.manager().getRepository(BloqueoPorIncidente);
    return repo.save(repo.create(bloqueo));
  }

  buscarBloqueo(emergenciaId: string): Promise<BloqueoPorIncidente | null> {
    return this.manager().getRepository(BloqueoPorIncidente).findOneBy({ emergenciaId });
  }

  bloqueosActivos(): Promise<BloqueoPorIncidente[]> {
    return this.manager().getRepository(BloqueoPorIncidente).findBy({ activo: true });
  }

  vigentes(momento: Date): Promise<RefuerzoEvento[]> {
    return this.manager()
      .getRepository(RefuerzoEvento)
      .findBy({ desde: LessThanOrEqual(momento), hasta: MoreThan(momento) });
  }

  async guardarObstrucciones(filas: Partial<ObstruccionPorReclamo>[]): Promise<void> {
    if (filas.length === 0) {
      return;
    }

    // ON CONFLICT DO NOTHING sobre (reclamoId, contenedorId): un reclamo que
    // llega de nuevo con otro eventId no rompe la transaccion ni extiende el
    // vencimiento de lo que ya estaba tapado.
    await this.manager()
      .getRepository(ObstruccionPorReclamo)
      .createQueryBuilder()
      .insert()
      .values(filas)
      .orIgnore()
      .execute();
  }

  async resolverReclamo(reclamoId: string, momento: Date): Promise<number> {
    const resultado = await this.manager()
      .getRepository(ObstruccionPorReclamo)
      .update({ reclamoId, resueltaEn: IsNull() }, { resueltaEn: momento });

    return resultado.affected ?? 0;
  }

  async contenedoresObstruidos(momento: Date): Promise<string[]> {
    const filas = await this.manager()
      .getRepository(ObstruccionPorReclamo)
      .find({
        select: { contenedorId: true },
        where: { resueltaEn: IsNull(), venceEn: MoreThan(momento) },
      });

    return [...new Set(filas.map((f) => f.contenedorId))];
  }
}
