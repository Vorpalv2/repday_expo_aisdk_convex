import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import React, { useEffect, useState } from 'react';
import ts from 'typescript';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (element: React.ReactNode) => string };

// Render the actual loading function without importing the account/data hooks.
const source = ts.createSourceFile('index.tsx', readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'LoadingScreen');
assert.ok(fn, 'LoadingScreen exists');
const compiled = ts.transpileModule(`${fn.getText(source)}\nmodule.exports = LoadingScreen;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

function render(width: number) {
  const container = ({ children, style, accessibilityLabel, accessibilityRole, testID }: any) => React.createElement('div', { style, 'aria-label': accessibilityLabel, role: accessibilityRole, 'data-testid': testID }, children);
  const module = { exports: null as any };
  vm.runInNewContext(compiled, {
    module, React, useEffect, useState,
    useWindowDimensions: () => ({ width, height: width === 0 ? 0 : 844 }),
    Dimensions: { get: () => ({ width }) },
    useWhiteLoadingChrome() {},
    View: container, SafeAreaView: container,
    Text: ({ children, style }: any) => React.createElement('span', { style }, children),
    StatusBar: () => null,
    ActivityIndicator: () => React.createElement('div', { role: 'progressbar' }),
    ExpoImage: ({ style, source }: any) => React.createElement('img', { style, src: source.uri, alt: '' }),
    require: () => ({ uri: '/test-loading-sprite.png' }),
    PLUS_GOLD: {},
  });
  return renderToStaticMarkup(React.createElement(module.exports, { status: null }));
}

test('zero-size static-render viewport still produces a visible positive-size loader and text', () => {
  const html = render(0);
  assert.match(html, /Loading Repday/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /width:257\.25px/);
  assert.doesNotMatch(html, /(?:width|height):-[\d.]+px/);
});

test('first client render matches the static loading markup at mobile and desktop widths', () => {
  const server = render(0);
  for (const width of [320, 375, 390, 430, 1024]) assert.equal(render(width), server, `hydration matches at width ${width}`);
});
