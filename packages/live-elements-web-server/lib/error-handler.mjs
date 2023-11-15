export default class ErrorHandler{}

ErrorHandler.forward = fn => (req, res, next) => {
    return Promise
        .resolve(fn(req, res, next))
        .catch(next);
}
