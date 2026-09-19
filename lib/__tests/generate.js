import assert, { strictEqual } from 'assert';
import { parse, generate, toPlainObject } from 'css-tree';
import { forEachTest as forEachAstTest } from './fixture/ast.js';
import { fixture as generateAutoWsFixture } from './fixture/generate-auto-emit-ws.js';

function createGenerateTests(name, test) {
    (test.skip ? it.skip : it)(name, () => {
        const ast = parse(test.source, test.options);
        const actual = generate(ast);
        const expected = 'generate' in test ? test.generate : test.source;

        // strings should be equal
        assert.strictEqual(actual, expected);
    });

    (test.skip ? it.skip : it)(name + ' (plain object)', () => {
        const ast = parse(test.source, test.options);
        const actual = generate(toPlainObject(ast));
        const expected = 'generate' in test ? test.generate : test.source;

        // strings should be equal
        assert.strictEqual(actual, expected);
    });

    (test.skip || test.skipRoundtrip ? it.skip : it)(name + ' (round-trip)', () => {
        const expected = parse(test.source, test.options);
        const actual = parse(generate(expected), test.options);

        // https://drafts.csswg.org/css-syntax/#serialization
        // The only requirement for serialization is that it must "round-trip" with parsing,
        // that is, parsing the stylesheet must produce the same data structures as parsing,
        // serializing, and parsing again, except for consecutive <whitespace-token>s,
        // which may be collapsed into a single token.
        assert.deepStrictEqual(actual, expected);
    });
}

function createGenerateWithSourceMapTest(name, test) {
    (test.skip ? it.skip : it)(name, () => {
        const ast = parse(test.source, {
            ...test.options,
            positions: true
        });

        // strings should be equal
        assert.strictEqual(
            generate(ast, { sourceMap: true }).css,
            'generate' in test ? test.generate : test.source
        );
    });
}

describe('generate', () => {
    forEachAstTest(createGenerateTests);

    it('should throws on unknown node type', () =>
        assert.throws(
            () => generate({ type: 'xxx' }),
            /Unknown node type/
        )
    );

    describe('raw chunks', () => {
        const valueOfRawChunks = (...chunks) => ({
            type: 'Value',
            children: chunks.map(value => ({ type: 'Raw', value }))
        });

        it('should emit tokens of a single chunk as is', () => {
            // the tokens of a chunk are already separated in a safe way,
            // so no white space should be inserted between them
            assert.strictEqual(generate(valueOfRawChunks('span#foo')), 'span#foo');
            assert.strictEqual(generate(valueOfRawChunks('li.item')), 'li.item');
            assert.strictEqual(generate(valueOfRawChunks('1%var(--b)#ff0000')), '1%var(--b)#ff0000');
        });

        it('should keep white space inside a chunk as is', () => {
            assert.strictEqual(generate(valueOfRawChunks('span  #foo')), 'span  #foo');
            assert.strictEqual(generate(valueOfRawChunks('1% var(--b)')), '1% var(--b)');
        });

        it('should insert a white space between chunks when needed', () => {
            // tokens of different chunks may merge into a single token
            // when concatenated with no white space in between
            assert.strictEqual(generate(valueOfRawChunks('1', '%')), '1 %');
            assert.strictEqual(generate(valueOfRawChunks('1px', '2px')), '1px 2px');
            assert.strictEqual(generate(valueOfRawChunks('solid', '#ff0000')), 'solid #ff0000');
        });

        it('should not insert a white space between chunks when not needed', () => {
            assert.strictEqual(generate(valueOfRawChunks('1px', '/2px')), '1px/2px');
            assert.strictEqual(generate(valueOfRawChunks('li', '.item')), 'li.item');
        });

        it('should insert a white space between a node and a chunk when needed', () => {
            assert.strictEqual(generate({
                type: 'Value',
                children: [
                    { type: 'Dimension', value: '1', unit: 'px' },
                    { type: 'Raw', value: '2px' }
                ]
            }), '1px 2px');

            assert.strictEqual(generate({
                type: 'Value',
                children: [
                    { type: 'Raw', value: '1px' },
                    { type: 'Dimension', value: '2', unit: 'px' }
                ]
            }), '1px 2px');
        });
    });

    describe('sourceMap', () => {
        forEachAstTest(createGenerateWithSourceMapTest);

        it('should generate a map', () => {
            const ast = parse('.a {\n  color: red;\n}\n', {
                filename: 'test.css',
                positions: true
            });
            const result = generate(ast, { sourceMap: true });

            assert.strictEqual(result.css, '.a{color:red}');
            assert.strictEqual(result.map.toString(), '{"version":3,"sources":["test.css"],"names":[],"mappings":"AAAA,E,CACE,S"}');
        });

        it('complex CSS', () => {
            const ast = parse('.a { color: #ff0000; } .b { display: block; float: left; } @media foo { .c { color: red } }', {
                filename: 'test.css',
                positions: true
            });
            const result = generate(ast, { sourceMap: true });

            assert.strictEqual(result.css, '.a{color:#ff0000}.b{display:block;float:left}@media foo{.c{color:red}}');
            assert.strictEqual(result.map.toString(), '{"version":3,"sources":["test.css"],"names":[],"mappings":"AAAA,E,CAAK,a,CAAkB,E,CAAK,a,CAAgB,U,CAAe,WAAa,E,CAAK,W"}');
        });
    });

    describe('spec mode', () => {
        for (const fixture of generateAutoWsFixture) {
            const {
                id,
                ws,
                left: { value: leftValue },
                right: { value: rightValue }
            } = fixture;
            const expectedNoWs = `${leftValue}${rightValue}`;
            const expectedWs = `${leftValue} ${rightValue}`;

            it(id, () => {
                const actual = generate({
                    type: 'Value',
                    children: [
                        { type: 'Raw', value: leftValue },
                        { type: 'Raw', value: rightValue }
                    ]
                }, { mode: 'spec' });

                if (ws) {
                    strictEqual(actual, expectedWs);
                } else {
                    if (actual !== expectedNoWs) {
                        strictEqual(actual, expectedWs);
                    }
                }
            });
        }
    });
});
