export const addToLog = ({ log, name, body }) => {
    log[name] = body
}

export const addResponseToLog = ({ log, response }) => {
    addToLog({ log, name: "responseObject", body: response })
}

export const printLog = ({ log, dataToOmit }) => {
    console.log(omitData({ log, dataToOmit }))
}

export const addErrorrToLog = ({ error, log }) => {
    const { 
        lineNumber, fileName, message, 
        options, name, cause, 
        columnNumber, stack
    } = error

    addToLog({ 
        log, 
        name: "Error",
        body: { 
            lineNumber, fileName, message, 
            options, name, cause, 
            columnNumber, stack
        }
    })
}

export const omitData = ({ log, dataToOmit }) => {
    let stringifiedLog = JSON.stringify(log)

    dataToOmit.forEach((data) => {
        stringifiedLog.replaceAll(data, "****")
    });

    return JSON.parse(stringifiedLog)
}

const logsExportsObject = {
    addToLog,
    addResponseToLog,
    printLog,
    addErrorrToLog,
    omitData
}

export default logsExportsObject