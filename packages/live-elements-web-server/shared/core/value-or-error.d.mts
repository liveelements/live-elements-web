export declare class ValueOrError<T = any> {
    constructor(value?: T, error?: any)

    get value(): T
    get error(): any
    get hasValue(): boolean
    get hasError(): boolean

    unwrapOrThrow(): T
    unwrapAnd(cb: (error: any) => void): T
    match<R>(valCb: (value: T) => R, errCb: (error: any) => R): R | undefined
    toJSON(valueCb?: (value: T) => any, errorCb?: (error: any) => any): any

    static errorObject(error: any): { error: any }
    static valueObject(value: any): { value: any }
    static eob(error: any): { error: any }
    static vob(value: any): { value: any }
    static fromError(error: any): ValueOrError
    static fromValue<V>(value: V): ValueOrError<V>
    static fromJSON(ob: any, valueCb?: (value: any) => any, errorCb?: (error: any) => any): ValueOrError
}

export { ValueOrError as VE }
