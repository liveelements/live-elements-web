export default class APIRoute {
    static wrap(route) {
        return async function wrappedRoute(req, res, next) {
            try {
                const context = route.context ? await route.context(req, route) : undefined

                const result = await route.handler({
                    params: req.params,
                    query: req.query,
                    body: req.body,
                    req: req
                }, context)

                if ( !result ) {
                    return next(new Error(`Handler returned null: ${route.handler.name}`))
                }

                if ( result.body?.error && route.error ) {
                    const hidden = result.internal && result.internal.error
                        ? result.internal.error
                        : result.internal
                    route.error(hidden || result.body.error, req)
                }

                for ( const [name, value] of Object.entries(result.headers || {}) ) {
                    res.setHeader(name, value)
                }
                for ( const cookie of result.cookies || [] ) {
                    res.cookie(cookie.name, cookie.value, cookie.options)
                }

                if ( result.contentType ) {
                    res.status(result.status).type(result.contentType).send(result.body)
                    return
                }
                if ( result.body === undefined ) {
                    res.status(result.status).end()
                    return
                }
                res.status(result.status).json(result.body)
            } catch ( error ) {
                next(error)
            }
        }
    }
}
