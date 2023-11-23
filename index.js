import responseExportsObject, { genericInternalServerError, preflight } from './app/responses.js'
import logsExportsObject, { printLog, addToLog, addResponseToLog, addErrorrToLog } from './app/logs.js'
import fetch from 'node-fetch'

const defaultFunctionToRun = async ({ response, log, responseExportsObject, logsExportsObject }) => {
    const fetchResponse = await fetch("http://checkip.amazonaws.com/", { method: 'GET' })
    const text = await fetchResponse.text()

    logsExportsObject.addToLog({ log, name: "IP Respponse", body: { response: text } })

    return responseExportsObject.success({ body: { ip: text }, message: "" })
}

const main = async ({ event, context, functionToRun }) => {
    const run = functionToRun ? functionToRun : defaultFunctionToRun
    let response = {}
    let log = {}
    let secrets = {}
    let dataToOmit = {}

    if (event?.httpMethod === "OPTIONS") {
        response = preflight()
    } else {
        try {
            response = await run({ 
                secrets, response, log, 
                responseExportsObject, logsExportsObject, dataToOmit
            })
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