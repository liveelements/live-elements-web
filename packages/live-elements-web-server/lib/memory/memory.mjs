export default class Memory{
    static snapshot(){
        return new Memory.Snapshot(process.memoryUsage())
    }

    static gc(){
        if (global.gc) {
            global.gc()
        } else {
            console.warn('Garbage collection is not exposed. Start the process with --expose-gc')
        }
    }

    static gcAndSnapshot(){
        Memory.gc()
        return Memory.snapshot()
    }
}

Memory.Snapshot = class SnapShot{
    constructor(data){
        this._data = data
    }

    get rss(){ return this._rss }
    get heapTotal(){ return this._data.heapTotal }
    get heapUsed(){ return this._data.heapUsed }
    get external(){ return this._data.external }
    get arrayBuffers(){ return this._data.arrayBuffers }

    get rssMb(){ return this._rss / 1024 / 1024 }
    get heapTotalMb(){ return this._data.heapTotal / 1024 / 1024 }
    get heapUsedMb(){ return this._data.heapUsed / 1024 / 1024 }
    get externalMb(){ return this._data.external / 1024 / 1024 }
    get arrayBuffersMb(){ return this._data.arrayBuffers / 1024 / 1024 }

    toString(){
        return `
            RSS: ${Math.round(this.rssMb)} MB,
            Heap Total: ${Math.round(this.heapTotalMb)} MB,
            Heap Used: ${Math.round(this.heapUsedMb)} MB,
            External: ${Math.round(this.externalMb)} MB,
            ArrayBuffers: ${Math.round(this.externalMb)} MB,`
    }

}