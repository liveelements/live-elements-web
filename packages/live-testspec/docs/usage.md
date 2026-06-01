# live-testspec — Usage Guide

`live-testspec` lets you author tests in `.lv` (the live-elements DSL) and run them with [Vitest](https://vitest.dev). Tests sit in the same language as the components and view code they exercise: a `.lv` test file declares an `instance` of `Spec`, which contains one or more `Scenario` children, and each `Scenario` becomes a Vitest `test()` at file load time.

This guide covers setup in any package, the basic test shape, and patterns for view-state, route, and component testing — including how to stub the `ApiRequest` module that the live-elements stack uses as its single network seam.

---

## Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Your first test](#your-first-test)
- [Scenario authoring](#scenario-authoring)
- [Pattern: testing view state and actions](#pattern-testing-view-state-and-actions)
- [Pattern: testing route handlers](#pattern-testing-route-handlers)
- [Pattern: testing components and bindings](#pattern-testing-components-and-bindings)
- [Stubbing `ApiRequest`](#stubbing-apirequest)
- [Helpers and fixtures](#helpers-and-fixtures)
- [Reference](#reference)

---

## Prerequisites

To run `.lv` tests, your repository needs:

- **Vitest** as the test runner.
- A **Vite plugin for `.lv` imports**, so Vitest can resolve `.lv` modules. The plugin compiles `.lv` via `live-elements-js-compiler` and re-exports the result. A reference implementation lives in `live-elements-studio-server/vite/vite-plugin-live-elements.mjs`; or you can write your own — it's ~30 lines.
- A **monorepo or installable workspace** that exposes `live-testspec` to your package.

`live-testspec` itself depends on:

- `live-elements-js-compiler`, `live-elements-core` (regular deps).
- `vitest` (optional peer dep — your project provides the version).

---

## Setup

Steps to add `.lv` tests to a fresh package.

### 1. Install dev dependencies

```sh
npm install --save-dev vitest live-testspec
```

If you're using a workspace setup, depend on `live-testspec` and the package that ships your Vite plugin (e.g. `live-elements-studio-server`) as workspace deps instead.

### 2. Configure Vitest

Create `vitest.config.mjs` at your package root:

```js
import { defineConfig } from 'vitest/config'
import liveElements from 'live-elements-studio-server/vite/vite-plugin-live-elements.mjs'

export default defineConfig({
    plugins: [liveElements()],
    test: {
        include: [
            '**/*.{test,spec}.?(c|m)[jt]s?(x)',
            '**/*.test.lv'
        ],
        setupFiles: ['./test/setup.mjs']  // optional, see "Stubbing"
    }
})
```

The `**/*.test.lv` entry is what makes Vitest pick up `.lv` test files. The `setupFiles` entry is only needed if you want global mocks — see [Stubbing `ApiRequest`](#stubbing-apirequest).

### 3. Add a test script

In `package.json`:

```json
{
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest"
    }
}
```

### 4. Write your first test

See the next section.

---

## Your first test

A `.lv` test file imports `live-testspec`, declares one `instance` of `Spec`, and lists its `Scenario` children. Each `Scenario.run` is an arrow function (sync or async) that receives Vitest's `expect`.

`test/example.test.lv`:

```
import live-testspec

instance example Spec{
    describe: 'arithmetic'

    Scenario{
        name: 'addition'
        run: (expect) => {
            expect(1 + 1).toBe(2)
        }
    }

    Scenario{
        name: 'async work'
        run: async (expect) => {
            const value = await Promise.resolve(42)
            expect(value).toBe(42)
        }
    }
}
```

Run it:

```sh
npx vitest run test/example.test.lv
```

You should see two passing tests grouped under `arithmetic`.

### File naming

Vitest discovers `.lv` tests via the `test.include` glob you set in `vitest.config.mjs`. The convention used here is `*.test.lv` (mirroring `*.test.js`). Pick whatever matches the glob.

### Top-level shape

A test file must contain exactly one `instance` declaration of `Spec`. Multiple `instance` declarations work too — each registers its own group of tests — but one per file is the common case.

---

## Scenario authoring

### `Spec`

```
component Spec{
    default children: []
    var describe: ''
    fn completed(){ /* registers Scenarios with Vitest */ }
}
```

| Property | Purpose |
|---|---|
| `describe` | Optional. If set, Scenarios register inside `describe(this.describe, ...)` for grouping in Vitest output. |
| `children` | The `Scenario` elements. Populated automatically by the `.lv` parser when you nest them inside the `instance` block. |

### `Scenario`

```
component Scenario{
    var name: ''
    var run: null
}
```

| Property | Purpose |
|---|---|
| `name` | The test name shown in Vitest output. |
| `run` | A function `(expect) => ... ` (sync or async). Receives Vitest's `expect` so you don't need to import it inside the scenario. |

### Assertion API

Scenarios use Vitest's full `expect` API directly:

```
Scenario{
    name: 'matchers'
    run: (expect) => {
        expect(value).toBe(42)
        expect(obj).toEqual({ a: 1 })
        expect(arr).toContain('x')
        expect(fn).toThrow()
        expect(promise).resolves.toBe('ok')
        expect(snapshot).toMatchSnapshot()
    }
}
```

All of [Vitest's `expect` matchers](https://vitest.dev/api/expect.html) are available — no wrapper layer.

### Importing other Vitest features

When you need `vi`, `beforeEach`, lifecycle hooks, etc., import them directly inside the `.lv` file:

```
import live-testspec
import { vi, beforeEach } from 'vitest'

instance example Spec{
    Scenario{
        name: 'with hook'
        run: async (expect) => {
            const fn = vi.fn().mockReturnValue('mocked')
            expect(fn()).toBe('mocked')
        }
    }
}
```

### Async scenarios

`Scenario.run` may be async. Vitest awaits the returned promise — the test passes when the promise resolves and fails if any `expect` throws or the promise rejects.

---

## Pattern: testing view state and actions

In live-elements, view code is split into:

- A `*ViewState` component holding observable state.
- A `*Actions` module of plain functions that mutate state and call `ApiRequest`.

This shape is unit-testable: construct the state, inject a stub `ApiRequest`, call an action, assert the state.

```
import live-testspec
import myapp/view/blocks/LoginViewState
import myapp/view/blocks/loginViewActions

instance loginViewTests Spec{
    describe: 'loginViewActions'

    Scenario{
        name: 'login.success transitions to verify step'
        run: async (expect) => {
            const state = LoginViewState{}
            await loginViewActions.login(state, 'a@b.com', 'pw')
            expect(state.loadingStatus).toBe('idle')
            expect(state.currentStep).toBe('verify')
            expect(state.error).toBe(null)
        }
    }

    Scenario{
        name: 'login.failure surfaces error message'
        run: async (expect) => {
            const state = LoginViewState{}
            await loginViewActions.login(state, 'bad@b.com', 'wrong')
            expect(state.loadingStatus).toBe('error')
            expect(state.error).toMatch(/invalid credentials/i)
        }
    }
}
```

For the action to behave deterministically without hitting a real backend, stub `ApiRequest` — see [Stubbing `ApiRequest`](#stubbing-apirequest).

### Asserting redirects

Actions that navigate (e.g. `ClientNavigation.goTo('/dashboard')`) can be tested by mocking the navigation module:

```
import { vi } from 'vitest'
vi.mock('live-elements-web/client/ClientNavigation.lv', () => ({
    default: { goTo: vi.fn() }
}))
```

Inside a scenario, after triggering the action, assert against `ClientNavigation.goTo.mock.calls`.

---

## Pattern: testing route handlers

Live-elements route handlers are plain functions: `(input, context) => APIResponse`. They're cleanly testable without booting a server.

```
import live-testspec
import myapp/routes/userApiRouteHandlers
import test/helpers/db
import test/helpers/factories

instance handlers Spec{
    describe: 'userApiRouteHandlers'

    Scenario{
        name: 'getUser returns 200 for existing id'
        run: async (expect) => {
            const ctx = await fakeContext()
            const user = await createTestUser({ name: 'Ada' })
            const res = await userApiRouteHandlers.getUser({ id: user.id }, ctx)
            expect(res.status).toBe(200)
            expect(res.value.name).toBe('Ada')
        }
    }

    Scenario{
        name: 'getUser returns 404 for missing id'
        run: async (expect) => {
            const ctx = await fakeContext()
            const res = await userApiRouteHandlers.getUser({ id: 'missing' }, ctx)
            expect(res.status).toBe(404)
        }
    }
}
```

The `ctx` object is a hand-rolled fake of whatever the handler reads (`context.user`, `context.db`, etc.). For tests that actually exercise the database, point `ctx.db` at a real test database (per-test transactional rollback is the typical pattern).

For **route wiring smoke tests** (does the URL resolve to the right handler?), boot the bundle and use `supertest`:

```
import live-testspec
import { createServer } from 'test/helpers/server'
import supertest from 'supertest'

instance routes Spec{
    describe: 'route wiring'

    Scenario{
        name: 'POST /api/users is reachable'
        run: async (expect) => {
            const app = await createServer()
            const res = await supertest(app).post('/api/users').send({})
            expect(res.status).not.toBe(404)
        }
    }
}
```

---

## Pattern: testing components and bindings

For tests that exercise live-elements' reactivity itself — bindings, events, computed properties — construct components inline and observe their behavior.

```
import live-testspec

instance bindings Spec{
    describe: 'BaseElement bindings'

    Scenario{
        name: 'derived property updates when source changes'
        run: (expect) => {
            const data = BaseElement{
                var x: 100
                var y: this.x * 2
            }
            expect(data.y).toBe(200)
            data.x = 50
            expect(data.y).toBe(100)
        }
    }

    Scenario{
        name: 'event handlers fire'
        run: (expect) => {
            const data = BaseElement{
                var x: 0
                var calls: 0
                on xChanged: () => { this.calls++ }
            }
            data.x = 1
            data.x = 2
            expect(data.calls).toBe(2)
        }
    }
}
```

This is the original use case `live-testspec` was built for.

---

## Stubbing `ApiRequest`

The live-elements stack centralizes network calls through a single `ApiRequest` module, so unit tests of view actions only need to stub one thing.

### Approach 1 — Setup file with `vi.mock`

The simplest pattern: a global mock in your setup file replaces `ApiRequest` for every test, and individual scenarios configure the mock's behavior.

`test/setup.mjs`:

```js
import { vi } from 'vitest'

vi.mock('live-elements-studio-server/client/api-request.mjs', () => ({
    default: {
        send: vi.fn()
    }
}))
```

Reference this file from `vitest.config.mjs`:

```js
test: {
    setupFiles: ['./test/setup.mjs']
}
```

Inside scenarios, drive the mock:

```
import { default as ApiRequest } from 'live-elements-studio-server/client/api-request.mjs'
import { vi } from 'vitest'

Scenario{
    name: 'login success'
    run: async (expect) => {
        ApiRequest.send.mockResolvedValueOnce({ ok: true, value: { token: 'abc' } })
        await loginViewActions.login(state, 'a@b.com', 'pw')
        expect(state.user).toEqual({ token: 'abc' })
    }
}
```

`vi.mock` is hoisted by Vitest, so doing it in a `.mjs` setup file (a format Vitest natively transforms) is reliable. Doing the same hoist inside a `.lv` file is unverified — prefer the setup-file pattern.

### Approach 2 — Per-scenario `vi.doMock`

If you need per-scenario control over what's mocked, use `vi.doMock` (which is *not* hoisted and runs where you call it):

```
import { vi } from 'vitest'

Scenario{
    name: 'with custom mock'
    run: async (expect) => {
        vi.doMock('live-elements-studio-server/client/api-request.mjs', () => ({
            default: { send: vi.fn().mockResolvedValue({ ok: false }) }
        }))
        const { default: actions } = await import('myapp/view/blocks/loginViewActions')
        // exercise actions
    }
}
```

This is more verbose but gives you per-scenario freedom.

### Approach 3 — Dependency injection

If your action signatures take their `ApiRequest` as an argument (`login(state, deps, email, pw)`), tests just pass a fake. No mocking framework needed. This is the cleanest pattern but requires designing for it from the start.

---

## Helpers and fixtures

A typical test directory layout:

```
test/
├── setup.mjs              # vi.mock calls run before any test file
├── helpers/
│   ├── db.mjs             # connect to test DB, transactional rollback
│   ├── factories.mjs      # createTestUser, createOrder, etc.
│   ├── server.mjs         # boot a bundle for supertest
│   └── fakes.mjs          # fakeContext, fake navigation, etc.
├── fixtures/
│   └── *.json             # static fixture data
└── ...your *.test.lv files
```

Helpers are plain `.mjs` files. Import them from `.lv` test files like any other module:

```
import test/helpers/factories
import test/helpers/db
```

Keep helpers small and explicit — `live-testspec` doesn't prescribe a fixture or factory library.

---

## Reference

### Components

- **`Spec`** — `{ children, describe, fn completed() }` — registers each `Scenario` child as a Vitest `test()` when the file is imported.
- **`Scenario`** — `{ name, run }` — one test case. `run` is `(expect) => ...` (sync or async).

### How registration works

When Vitest imports a `.lv` test file, the compiled module instantiates the `Spec`. The `fn completed()` lifecycle hook fires after children are bound and calls `vitest.test(name, () => scenario.run(expect))` for each child. This is a synchronous side effect of import — Vitest collects the tests during its discovery phase, the same as for `.mjs` test files.

### Limitations

- **Stack traces** point at compiled `.lv.mjs`, not `.lv` source, unless `live-elements-js-compiler` emits sourcemaps and the Vite plugin propagates them.
- **`vi.mock` hoisting** through `.lv` files is unverified — use a `.mjs` setup file for global mocks.
- **One `Spec` instance per file** is the common case; multiple work but make file-level grouping less clear.

### Further reading

- [Vitest documentation](https://vitest.dev) — full `expect`, `vi`, lifecycle, snapshot, and coverage reference.
- [live-elements language reference](https://liveelements.dev) — `.lv` syntax for components, instances, bindings, and events.
