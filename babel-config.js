module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    node: '16' // Mindest-Node.js-Version
                },
                modules: 'commonjs', // Wichtig für Jest
                useBuiltIns: 'entry',
                corejs: 3
            }
        ]
    ],
    plugins: [
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-proposal-optional-chaining',
        '@babel/plugin-proposal-nullish-coalescing-operator',
        '@babel/plugin-transform-async-to-generator'
    ],
    env: {
        test: {
            presets: [
                [
                    '@babel/preset-env',
                    {
                        targets: {
                            node: 'current' // Jest läuft in aktueller Node-Version
                        },
                        modules: 'commonjs'
                    }
                ]
            ],
            plugins: [
                '@babel/plugin-proposal-class-properties',
                '@babel/plugin-proposal-optional-chaining',
                '@babel/plugin-proposal-nullish-coalescing-operator',
                '@babel/plugin-transform-async-to-generator',
                // Test-spezifische Plugins
                'babel-plugin-transform-es2015-modules-commonjs'
            ]
        },
        development: {
            plugins: [
                // Development-spezifische Plugins
            ]
        },
        production: {
            plugins: [
                // Production-Optimierungen
                ['transform-remove-console', { exclude: ['error', 'warn'] }]
            ]
        }
    },
    ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        'test-results/**'
    ]
};