# live-testspec

Live-elements components for authoring tests in `.lv` and running them with [Vitest](https://vitest.dev).

```sh
npm install --save-dev live-testspec vitest
```

A test file looks like this:

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
}
```

Each `Scenario` becomes a Vitest `test()`; assertions use Vitest's `expect`.

## Documentation

See [docs/usage.md](./docs/usage.md) for:

- Setting up `.lv` tests in a fresh package (Vite plugin, `vitest.config.mjs`)
- Authoring patterns for view-state, route handlers, and component bindings
- Stubbing `ApiRequest` and other module-level seams
- Helpers, fixtures, and recommended directory layout
- Full component reference

## Peer dependency

`vitest` is an optional peer dependency — your project provides the version it wants.
