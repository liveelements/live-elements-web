import ky from 'ky'
import ValueOrError from 'live-elements-web-server/shared/core/value-or-error.mjs'

export default class ApiRequest{
    
    static get(url){
        return ky.get(url).json()
            .then(response => { return ValueOrError.fromJSON(response) })
            .catch( e => {
                if ( e.response ){
                    return e.response.json().then(data => {
                        return ValueOrError.fromJSON(data)
                    })
                } else {
                    return ValueOrError.fromError(new Error(`Internal server error.`))
                }
            })
    }

    static post(url, data, timeout = 10000){
        return ky.post(url, { json: data, timeout } ).json()
            .then(response => { 
                return ValueOrError.fromJSON(response) 
            })
            .catch( e => {
                if ( e.response ){
                    return e.response.json().then(errData => {
                        return ValueOrError.fromJSON(errData)
                    })
                } else {
                    return ValueOrError.fromError(new Error(`Internal server error.`))
                }
            })
    }
}