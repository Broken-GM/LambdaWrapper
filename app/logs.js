export const addToLog = ({ log, name, body }) => {
    log[name] = body
}

export const addResponseToLog = ({ log, response }) => {
    addToLog({ log, name: "responseObject", body: response })
}

export const printLog = ({ log }) => {
    console.log(log)
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

const logsExportsObject = {
    addToLog,
    addResponseToLog,
    printLog,
    addErrorrToLog
}

export default logsExportsObject