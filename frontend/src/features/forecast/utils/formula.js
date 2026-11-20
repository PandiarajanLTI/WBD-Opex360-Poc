import jsep from 'jsep';

// Interpret only arithmetic AST nodes; never execute user-provided JavaScript.
export function compileForecastFormula(input, allowedFields) {
  const source = input.trim().replace(/^=/, '').trim();
  if (!source || source.length > 500) {
    throw new Error('Enter a formula of up to 500 characters.');
  }
  let expression;
  try {
    expression = jsep(source);
  } catch {
    throw new Error('Invalid formula. Use numbers, field names and +, -, *, / or parentheses.');
  }
  const fields = new Set(allowedFields);
  function compile(node) {
    if (node.type === 'Literal' && typeof node.value === 'number' && Number.isFinite(node.value)) {
      return () => node.value;
    }
    if (node.type === 'Identifier') {
      if (!fields.has(node.name) || node.name === 'NOV_FORECAST') {
        throw new Error(`Unknown or unavailable numeric field: ${node.name}.`);
      }
      return (row) => {
        const value = row?.[node.name];
        if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      };
    }
    if (node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator)) {
      const operand = compile(node.argument);
      return (row) => {
        const value = operand(row);
        if (value === null) return null;
        return node.operator === '-' ? -value : value;
      };
    }
    if (node.type === 'BinaryExpression' && ['+', '-', '*', '/'].includes(node.operator)) {
      const left = compile(node.left);
      const right = compile(node.right);
      return (row) => {
        const a = left(row);
        const b = right(row);
        if (a === null || b === null || (node.operator === '/' && b === 0)) return null;
        let result;
        switch (node.operator) {
          case '+': result = a + b; break;
          case '-': result = a - b; break;
          case '*': result = a * b; break;
          default: result = a / b;
        }
        return Number.isFinite(result) ? result : null;
      };
    }
    throw new Error('Only numbers, numeric fields and +, -, *, / or parentheses are supported.');
  }
  return compile(expression);
}