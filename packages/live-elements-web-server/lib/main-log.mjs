import { Environment } from "live-elements-web-server/lib/environment.mjs"
import Logger from "./logger.mjs"

const mainLog = Environment.defineLogger('main', { prefix: ['[', Logger.currentDateTimeToISO, ']', []], prefixDecorated: [], transports: [Logger.To.Console.create] })
export default mainLog