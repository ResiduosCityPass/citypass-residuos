import { canonicalJson } from './canonical-json';
describe('Comparacion canonica compatible con JSONB', () => {
  it('ignora propiedades opcionales undefined que JSONB no conserva', () => {
    const input = {
      alertaId: 'ABC',
      barrios: undefined,
      ubicaciones: [{ longitud: -58, latitud: -34 }],
    };
    expect(canonicalJson(input)).toBe(canonicalJson(JSON.parse(JSON.stringify(input))));
    expect(canonicalJson({ a: [undefined, null] })).toBe('{"a":[null,null]}');
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});
