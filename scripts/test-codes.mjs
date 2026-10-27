import ts from 'typescript';

/** Static declaration coverage only: ignores comments, imports and describe titles. */
export function testCodes(source) {
  const result=[];
  const ast=ts.createSourceFile('test.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function rootName(expression) {
    if(ts.isIdentifier(expression)) return expression.text;
    if(ts.isPropertyAccessExpression(expression)) return rootName(expression.expression);
    if(ts.isCallExpression(expression)) return rootName(expression.expression);
    return '';
  }
  function visit(node) {
    if(ts.isCallExpression(node) && ['it','test'].includes(rootName(node.expression))) {
      const title=node.arguments[0];
      if(title && (ts.isStringLiteral(title)||ts.isNoSubstitutionTemplateLiteral(title))) {
        const code=/^(FR-\d{2,3}|HG[1-8])(?=[:\s-])/.exec(title.text)?.[1];
        if(code)result.push(code);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(ast); return [...new Set(result)];
}
