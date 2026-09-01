import path from 'node:path'

import { defineConfig } from 'vitest/config'

import liveElements from 'live-testspec/lib/vite-plugin-live-elements.mjs'

const includeFor = (dir) => [
    `test/${dir}/**/*.{test,spec}.?(c|m)[jt]s?(x)`,
    `test/${dir}/**/*.test.lv`,
    `test/${dir}/**/*Test.lv`
]

export default defineConfig({
    plugins: [liveElements()],
    resolve: {
        alias: [
            {
                find: 'live-testspec/build/Spec.lv.mjs',
                replacement: path.resolve(import.meta.dirname, '../live-testspec/build/Spec.lv.mjs')
            },
            {
                find: 'live-testspec/build/Scenario.lv.mjs',
                replacement: path.resolve(import.meta.dirname, '../live-testspec/build/Scenario.lv.mjs')
            }
        ]
    },
    test: {
        environment: 'node',
        projects: [
            {
                extends: true,
                test: {
                    name: 'client-bundler',
                    include: includeFor('bundler'),
                    testTimeout: 20000
                }
            }
        ]
    }
})
