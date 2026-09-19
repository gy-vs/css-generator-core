import { tokenize, Delim, WhiteSpace } from '../tokenizer/index.js';
import { generateSourceMap } from './sourceMap.js';
import * as tokenBefore from './token-before.js';

const REVERSESOLIDUS = 0x005c; // U+005C REVERSE SOLIDUS (\)

function processChildren(node, delimeter) {
    if (typeof delimeter === 'function') {
        let prev = null;

        node.children.forEach(node => {
            if (prev !== null) {
                delimeter.call(this, prev);
            }

            this.node(node);
            prev = node;
        });

        return;
    }

    node.children.forEach(this.node, this);
}

export function createGenerator(config) {
    const types = new Map();

    for (let [name, item] of Object.entries(config.node)) {
        const fn = item.generate || item;

        if (typeof fn === 'function') {
            types.set(name, item.generate || item);
        }
    }

    return function(node, options) {
        let buffer = '';
        let prevCode = 0;
        let handlers = {
            node(node) {
                if (types.has(node.type)) {
                    types.get(node.type).call(publicApi, node);
                } else {
                    throw new Error('Unknown node type: ' + node.type);
                }
            },
            tokenBefore: tokenBefore.safe,
            token(type, value) {
                prevCode = this.tokenBefore(prevCode, type, value);
                emitToken(type, value);
            },
            tokenize(chunk) {
                let isFirstToken = true;

                tokenize(chunk, (type, start, end) => {
                    const value = chunk.slice(start, end);

                    if (isFirstToken) {
                        isFirstToken = false;
                        // a white space may be required before the first token
                        // of a chunk to separate it from a previous token
                        this.token(type, value);
                    } else {
                        // the rest of the tokens are emitted as is, with no white
                        // space insertion between them, since a chunk is a
                        // self-contained sequence of tokens that is already
                        // separated in a safe way
                        prevCode = tokenBefore.none(prevCode, type, value);
                        emitToken(type, value);
                    }
                });
            },
            emit(value) {
                buffer += value;
            },
            result() {
                return buffer;
            }
        };

        const emitToken = (type, value) => {
            handlers.emit(value, type, false);

            if (type === Delim && value.charCodeAt(0) === REVERSESOLIDUS) {
                handlers.emit('\n', WhiteSpace, true);
            }
        };

        if (options) {
            if (typeof options.decorator === 'function') {
                handlers = options.decorator(handlers);
            }

            if (options.sourceMap) {
                handlers = generateSourceMap(handlers);
            }

            if (options.mode in tokenBefore) {
                handlers.tokenBefore = tokenBefore[options.mode];
            }
        }

        const publicApi = {
            node: (node) => handlers.node(node),
            children: processChildren,
            token: (type, value) => handlers.token(type, value),
            tokenize: (chunk) => handlers.tokenize(chunk)
        };

        handlers.node(node);

        return handlers.result();
    };
};
