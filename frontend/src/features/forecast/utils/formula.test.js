import { describe, expect, it } from 'vitest';
import { compileForecastFormula } from './formula';

const fields = ['OCT_FORECAST', 'DEC_FORECAST', 'NOV_FORECAST'];

describe('forecast formulas', () => {
  it('evaluates numeric fields with arithmetic, precedence, parentheses and unary signs', () => {
    const calculate = compileForecastFormula('= (OCT_FORECAST + DEC_FORECAST) * -0.5', fields);
    expect(calculate({ OCT_FORECAST: '100', DEC_FORECAST: 20 })).toBe(-60);
    expect(calculate({ OCT_FORECAST: 40, DEC_FORECAST: 20 })).toBe(-30);
  });

  it('returns blank for missing, non-numeric or non-finite inputs and division by zero', () => {
    const calculate = compileForecastFormula('OCT_FORECAST / DEC_FORECAST', fields);
    for (const row of [{}, { OCT_FORECAST: 'x', DEC_FORECAST: 2 }, { OCT_FORECAST: 1, DEC_FORECAST: 0 }, { OCT_FORECAST: Infinity, DEC_FORECAST: 1 }]) {
      expect(calculate(row)).toBeNull();
    }
  });

  it('rejects unknown fields, circular references and executable expressions', () => {
    for (const expression of ['NOV_FORECAST + 1', 'BAD_FIELD + 1', 'OCT_FORECAST.constructor', 'alert(1)', 'OCT_FORECAST ** 2', '1;2', '']) {
      expect(() => compileForecastFormula(expression, fields)).toThrow();
    }
  });
});