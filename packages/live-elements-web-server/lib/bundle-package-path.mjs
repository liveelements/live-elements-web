import path from 'path'
import fs from 'fs'

export class BundlePackagePath {
    static find(bundlePath) {
        let d = path.dirname(bundlePath);
        while (d) {
            if (fs.existsSync(path.join(d, 'live.package.json')))
                return d;
            if (fs.existsSync(path.join(d, 'package.json')))
                return d;

            let next = path.dirname(d);
            if (next === d)
                return '';
            d = next;
        }
        return '';
    }
}
