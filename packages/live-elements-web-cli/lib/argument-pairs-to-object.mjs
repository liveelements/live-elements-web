
export default function argumentPairsToObject(args, excludeKeys = []) {
    const obj = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].substring(2)
            if (!excludeKeys.includes(key)) { 
                if (args[i + 1] && !args[i + 1].startsWith('--')) {
                    obj[key] = args[i + 1]
                    i++
                } else {
                    obj[key] = true;
                }
            }
        }
    }
    return obj;
}