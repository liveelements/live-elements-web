import ky from 'ky'

import {ValueOrError} from '../shared/core/value-or-error.mjs'

export class ApiRequest{
    static async get(url){
        try {
            return ValueOrError.fromJSON(await ky.get(url).json())
        } catch (error) {
            if ( error.response ){
                return ValueOrError.fromJSON(await error.response.json())
            }

            return ValueOrError.fromError(new Error(`Internal server error.`))
        }
    }

    static async post(url, data, timeout = 10000){
        try {
            return ValueOrError.fromJSON(await ky.post(url, { json: data, timeout }).json())
        } catch (error) {
            if ( error.response ){
                return ValueOrError.fromJSON(await error.response.json())
            }

            return ValueOrError.fromError(new Error(`Internal server error.`))
        }
    }
}
