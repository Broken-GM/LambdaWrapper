import responseExportsObject, { genericInternalServerError, preflight } from './app/responses.js'
import logsExportsObject, { printLog, addToLog, addResponseToLog, addErrorrToLog } from './app/logs.js'

const defaultFunctionToRun = ({ response, log }) => {
    // "http://checkip.amazonaws.com/"
    // return {

    // }
    throw new Error("This is a test error!")
}

const main = ({ event, context, functionToRun }) => {
    const run = functionToRun ? functionToRun : defaultFunctionToRun
    let response = {}
    let log = {}

    if (event?.httpMethod === "OPTIONS") {
        response = preflight()
    } else {
        try {
            response = run({ response, log, responseExportsObject, logsExportsObject })
        } catch (error) {
            addErrorrToLog({ log, error })
            response = genericInternalServerError()
        }
    }

    addResponseToLog({ log, response })
    printLog({ log })

    return response
}

export default main