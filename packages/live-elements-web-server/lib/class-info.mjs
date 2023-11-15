export default class ClassInfo{
    static extends(subClass, superClass) {
        let prototype = Object.getPrototypeOf(subClass)
        while (prototype != null) {
            if (prototype === superClass){
                return true
            }
            prototype = Object.getPrototypeOf(prototype)
        }
        return false
    }
}