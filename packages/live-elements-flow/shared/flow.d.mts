export declare class Flow<T = any> {
    static Kind: {
        Flow: string
        Call: string
        Member: string
        Ref: string
        Ret: string
    }

    static isNode(value: any): boolean

    kind: string
    params: any[]
    type: any
    body: any[]

    constructor(params: any, type?: any, body?: any[])

    static create(params: any, typeOrBody?: any, body?: any[]): Flow
    static call(fnOrId: any, args?: any[], name?: string, after?: string[]): any
    static member(base: any, path: any[]): any
    static ref(name: string): any
    static ret(expr: any): any
    static nodeToJSON(value: any): any
    static nodeFromJSON(value: any, typeLookup?: any): any
    static fromJSON(json: any, declaredType?: any, typeLookup?: any): Flow

    toJSON(): any
}
