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

    describe('raw', () => {
        // an unparsed fragment (Raw node) should be generated as is,
        // with no safe space insertion between the tokens inside the fragment
        it('rule prelude as raw', () => {
            const ast = parse('span#foo{color:red}', { parseRulePrelude: false });

            assert.strictEqual(ast.children.first.prelude.type, 'Raw');
            assert.strictEqual(generate(ast), 'span#foo{color:red}');
        });

        it('rule prelude as raw with class selector', () => {
            const ast = parse('li.item{color:red}', { parseRulePrelude: false });

            assert.strictEqual(generate(ast), 'li.item{color:red}');
        });

        it('rule prelude as raw with a combinator', () => {
            const ast = parse('div p{color:red}', { parseRulePrelude: false });

            assert.strictEqual(generate(ast), 'div p{color:red}');
        });

        it('custom property value', () => {
            const ast = parse('x{--a:1%var(--b)#ff0000}');

            assert.strictEqual(ast.children.first.block.children.first.value.type, 'Raw');
            assert.strictEqual(generate(ast), 'x{--a:1%var(--b)#ff0000}');
        });

        // a safe space is still required between a token emitted
        // for a parsed node and a token of an adjacent raw fragment
        it('should keep a safe space between a parsed token and a raw fragment', () => {
            const ast = parse('@media screen{a{color:red}}', { parseAtrulePrelude: false });

            assert.strictEqual(ast.children.first.prelude.type, 'Raw');
            assert.strictEqual(generate(ast), '@media screen{a{color:red}}');
        });

        it('should not change selector meaning on re-parse', () => {
            const ast = parse('span#foo{color:red}', { parseRulePrelude: false });
            const reparsed = parse(generate(ast));
            const selector = reparsed.children.first.prelude.children.first;

            assert.deepStrictEqual(
                selector.children.toArray().map(node => node.type),
                ['TypeSelector', 'IdSelector']
            );
        });
    });
});
