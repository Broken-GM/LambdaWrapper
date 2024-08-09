import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fetch from 'node-fetch'
import util from 'util'

class Lambda {
    constructor({ event, context, run }) {
        this.event = event
        this.context = context
        this.response = {}
        this.log = {}
        this.secrets = {}
        this.metaData  = { time: {} }
        this.dataToOmit = []
        this.run = run ? run : async (lambda) => {
            const fetchResponse = await fetch("http://checkip.amazonaws.com/", { method: 'GET' })
            const text = await fetchResponse.text()

            lambda.addToLog({ name: "IP Respponse", body: { response: text } })

            return lambda.success({ body: { ip: text }, message: "" })
        }

        const body = this.isJson(event?.body)
        if (body?.isJson) {
            this.body = body?.object
        }
    }

    // Helpers
    isJson(variable) {
        const cleanedVariable = typeof variable !== "string" ? JSON.stringify(variable) : variable
        let isJson = true
        let object = null

        try {
            object = JSON.parse(cleanedVariable)
        } catch (error) {
            isJson = false
        }

        if (object === null || typeof object !== "object") {
            isJson = false
            object = variable
        }

        return { object, isJson }
    }

    // Data Ommition 
    addToDataToOmit({ data }) {
        this.dataToOmit.push(data)
    }

    // Logging
    addToLog({ name, body }) {
        this.log[name] = body
    }
    addResponseToLog() {
        this.addToLog({ name: "responseObject", body: this.response })
    }
    addErrorToLog({ error }) {
        const { 
            lineNumber, fileName, message, 
            options, name, cause, 
            columnNumber, stack
        } = error

        this.addToLog({
            name: "Error",
            body: { 
                lineNumber, fileName, message, 
                options, name, cause, 
                columnNumber, stack
            }
        })
    }
    omitDataFromLog() {
        let stringifiedLog = JSON.stringify(this.log)

        this.dataToOmit.forEach((data) => {
            stringifiedLog = stringifiedLog.replaceAll(data, "****")
        });

        this.log = JSON.parse(stringifiedLog)
    }
    printLog() {
        this.omitDataFromLog()
        console.log(util.inspect(this.log, {showHidden: false, depth: null, colors: false}))
    }

    // Secrets Manager
    async getSecret({ secretName, shortName }) {
        const client = new SecretsManagerClient();

        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
            }),
        );

        if (response.SecretString) {
            const parsedResponse = JSON.parse(response.SecretString)
            const arrayOfSecrets = Object.keys(parsedResponse)

            this.secrets[shortName ? shortName : secretName] = parsedResponse

            arrayOfSecrets.forEach((secretKey) => {
                this.dataToOmit.push(parsedResponse[secretKey])
            })
        }
    }

    // Response
    basicResponseHeaders() {
        return {
            "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS, PUT, GET, DELETE"
        }
    }
    bodyObject({ body, type, message }) {
        return JSON.stringify({ ...body, type, message })
    }
    internalServerError({ body, message }) {
        return {
            statusCode: 500,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message })
        }
    }
    badRequestError({ body, message }) {
        return {
            statusCode: 400,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message })
        }
    }
    timeoutError({ body }) {
        return {
            statusCode: 504,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message: "Request timed out" })
        }
    }
    success({ body, message }) {
        return {
            statusCode: 200,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Response", message })
        }
    }
    preflight = () => {
        return {
            statusCode: 200,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body: {}, type: "Preflight", message: "" })
        }
    }
    genericInternalServerError() {
        return this.internalServerError({
            message: "An error has occured",
            body: {}
        })
    }
    omitDataFromResponse() {
        let stringifiedResponse = JSON.stringify(this.response)

        this.dataToOmit.forEach((data) => {
            stringifiedResponse = stringifiedResponse.replaceAll(data, "****")
        });

        this.response = JSON.parse(stringifiedResponse)
    }

    async main(timeout = 29000, timeoutOffset = 1000) {
        return new Promise(async (resolve) => {
            this.metaData.time.start = Date.now();
            this.addToLog({ name: "Event Object", body: this.event })

            setTimeout(() => {
                this.metaData.time.end = Date.now();
                this.metaData.time.totalExecutionTime = this.metaData.time.end - this.metaData.time.start

                this.addToLog({ name: "Meta Data", body: this.metaData })
                this.response = this.timeoutError({ body: {} })

                this.addResponseToLog()
                this.printLog()
                this.omitDataFromResponse()

                resolve(this.response)
            }, timeout - timeoutOffset)

            if (this.event?.httpMethod === "OPTIONS") {
                this.response = this.preflight()
            } else {
                try {
                    this.response = await this.run(this)
                } catch (error) {
                    this.addErrorToLog({ error })
                    this.response = this.genericInternalServerError()
                }
            }

            this.metaData.time.end = Date.now();
            this.metaData.time.totalExecutionTime = this.metaData.time.end - this.metaData.time.start

            this.addToLog({ name: "Meta Data", body: this.metaData })

            this.addResponseToLog()
            this.printLog()
            this.omitDataFromResponse()

            resolve(this.response)
        })
    }
}

export default Lambda