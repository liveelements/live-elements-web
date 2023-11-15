import { Environment } from "live-elements-web-server/lib/environment.mjs"
import mainLog from "./main-log.mjs"
import chalk from "chalk"

const serverLog = Environment.defineLogger('server', { parent: mainLog, prefix: ['[Server', [], ']'], prefixDecorated: [chalk.cyan('[Server'), [], chalk.cyan(']')] })
export default serverLog