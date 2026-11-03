import { ConfigService } from '@nestjs/config';
import { Type, Schema } from 'avsc';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CriticidadConfirmadaDto, CriticidadFinalizadaDto } from './dto/criticidad-climatica.dto';
import {
  ACTOR_SIMULACRO,
  crearFinSimulacro,
  crearInicioSimulacro,
  esTopicDe,
  PREFIJO_SIMULACRO,
  SIMULACROS_EDA,
  simulacroEdaHabilitado,
} from './simulacro-eda';

describe('Simulacros propios publicados por EDA', () => {
  it('se habilitan expresamente en desarrollo/test y nunca en produccion', () => {
    expect(simulacroEdaHabilitado(new ConfigService({}))).toBe(false);
    for (const NODE_ENV of ['development', 'test'])
      expect(
        simulacroEdaHabilitado(
          new ConfigService({ NODE_ENV, EDA_CLIMA_SIMULACRO_ENABLED: 'true' }),
        ),
      ).toBe(true);
    expect(
      simulacroEdaHabilitado(
        new ConfigService({ NODE_ENV: 'production', EDA_CLIMA_SIMULACRO_ENABLED: 'true' }),
      ),
    ).toBe(false);
    expect(
      simulacroEdaHabilitado(
        new ConfigService({ NODE_ENV: 'staging', EDA_CLIMA_SIMULACRO_ENABLED: 'true' }),
      ),
    ).toBe(false);
  });
  it('produce payloads Avro y DTO validos, con el mismo alertaId y marcas de prueba', () => {
    const now = 1793650000000;
    const start = crearInicioSimulacro(now);
    const end = crearFinSimulacro(start.alertaId, now + 1000);
    expect(start.alertaId).toMatch(new RegExp(`^${PREFIJO_SIMULACRO}`));
    expect(end.alertaId).toBe(start.alertaId);
    expect(start.actorSub).toBe(ACTOR_SIMULACRO);
    expect(start.vigenciaDesde).toBeLessThan(now);
    expect(end.finalizadaEn).toBeGreaterThan(start.vigenciaDesde);
    expect(validateSync(plainToInstance(CriticidadConfirmadaDto, start))).toHaveLength(0);
    expect(validateSync(plainToInstance(CriticidadFinalizadaDto, end))).toHaveLength(0);
    for (const [index, data] of [start, end].entries()) {
      const contract = SIMULACROS_EDA[index];
      expect(contract.fqn).toBe(`com.citypass.residuos.${contract.name}`);
      const schema = Type.forSchema({
        type: 'record',
        name: contract.name,
        fields: contract.fields,
      } as Schema);
      expect(schema.fromBuffer(schema.toBuffer(data))).toEqual(data);
    }
    expect(crearInicioSimulacro(now).alertaId).not.toBe(start.alertaId);
  });
  it('impide cerrar por esta herramienta una alerta ajena al simulacro', () => {
    expect(() => crearFinSimulacro('alerta-real')).toThrow(PREFIJO_SIMULACRO);
    expect(() => crearFinSimulacro(PREFIJO_SIMULACRO + 'a'.repeat(200))).toThrow(PREFIJO_SIMULACRO);
  });
  it('solo acepta el topico exacto o sus versiones, sin prefijos parecidos', () => {
    const fqn = SIMULACROS_EDA[0].fqn;
    expect(esTopicDe(fqn, fqn)).toBe(true);
    expect(esTopicDe(`${fqn}.v2`, fqn)).toBe(true);
    expect(esTopicDe(`${fqn}Otro`, fqn)).toBe(false);
    expect(esTopicDe(`${fqn}.v2.ajeno`, fqn)).toBe(false);
  });
  it.each(['a\nregistro-falso', 'a\r\nregistro-falso', 'a\u001b[31m', 'a\u2028otro'])(
    'rechaza controles de consola en el identificador: %j',
    (suffix) => {
      expect(() => crearFinSimulacro(PREFIJO_SIMULACRO + suffix)).toThrow(PREFIJO_SIMULACRO);
    },
  );
});
