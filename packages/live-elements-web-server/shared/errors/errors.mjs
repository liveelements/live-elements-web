import CSSError from "./css-error.mjs";
import PublicError from "./public-error.mjs";
import SourceError from "./source-error.mjs";
import StandardError from "./standard-error.mjs";
import TraceError from "./trace-error.mjs";
import Warning from "./warning.mjs";
import WorkerError from "./worker-error.mjs";

export default [
    StandardError,
    Warning,
    CSSError,
    SourceError,
    TraceError,
    WorkerError,
    PublicError
]