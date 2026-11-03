import { readFileSync } from 'fs';
import { join } from 'path';
import { Type, Schema } from 'avsc';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CriticidadConfirmadaDto, CriticidadFinalizadaDto } from './dto/criticidad-climatica.dto';

// Snapshot literal del script de registro del productor; no ejecuta su código ni llama a EDA.
const fixture = JSON.parse(
  readFileSync(join(__dirname, '../../../../test/fixtures/espacios-publicos-clima.json'), 'utf8'),
) as {
  contracts: Array<{ name: string; fields: Array<{ name: string; type: unknown }> }>;
  publishedStart: CriticidadConfirmadaDto;
};

describe('Contrato real de Espacios Publicos, featuresDidi 6d2234b', () => {
  it('acepta la alerta publicada sin barrios bajo su schema anterior', () => {
    const contract = fixture.contracts[0];
    const schema = Type.forSchema({
      type: 'record',
      name: contract.name,
      fields: contract.fields.filter((f) => f.name !== 'barrios'),
    } as Schema);
    const payload = schema.fromBuffer(schema.toBuffer(fixture.publishedStart));
    expect(payload.fenomeno).toBe('OLA_DE_CALOR');
    expect(payload.alertaId).toBe('f6029e4f-e0ef-46b8-9f1a-66e814f1c90e');
    expect(
      validateSync(plainToInstance(CriticidadConfirmadaDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
  });
  it('acepta el schema actual con barrios, temperaturas y timestamps en milisegundos', () => {
    const contract = fixture.contracts[0];
    const schema = Type.forSchema({
      type: 'record',
      name: contract.name,
      fields: contract.fields,
    } as Schema);
    const payload = schema.fromBuffer(
      schema.toBuffer({
        ...fixture.publishedStart,
        fenomeno: 'LLUVIA_INTENSA',
        barrios: ['SAN NICOLAS'],
        ubicaciones: [{ latitud: -34.603666, longitud: -58.380515 }],
        temperaturaMinC: 0,
        temperaturaMaxC: 20,
      }),
    );
    expect(payload.vigenciaDesde).toBe(fixture.publishedStart.vigenciaDesde);
    expect(payload.temperaturaMinC).toBe(0);
    expect(
      validateSync(plainToInstance(CriticidadConfirmadaDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
  });
  it('acepta el cierre separado emitido por su scheduler con el mismo alertaId', () => {
    const contract = fixture.contracts[1];
    const schema = Type.forSchema({
      type: 'record',
      name: contract.name,
      fields: contract.fields,
    } as Schema);
    const payload = schema.fromBuffer(
      schema.toBuffer({
        alertaId: fixture.publishedStart.alertaId,
        finalizadaEn: fixture.publishedStart.vigenciaHasta,
        actorSub: 'system:weather-scheduler',
      }),
    );
    expect(payload.alertaId).toBe(fixture.publishedStart.alertaId);
    expect(
      validateSync(plainToInstance(CriticidadFinalizadaDto, payload), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0);
  });
});
