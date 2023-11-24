import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fetch from 'node-fetch'

class Lambda {
    constructor({ event, context, run }) {
        this.event = event
        this.context = context
        this.response = {}
        this.log = {}
        this.secrets = {}
        this.dataToOmit = []
        this.run = run ? run : async (lambda) => {
            const fetchResponse = await fetch("http://checkip.amazonaws.com/", { method: 'GET' })
            const text = await fetchResponse.text()

            this.addToDataToOmit({ data: "69" })

            lambda.addToLog({ name: "IP Respponse", body: { response: text } })

            return lambda.success({ body: { ip: text }, message: "" })
        }
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
        console.log(this.log)
    }

    // Secrets Manager
    async getSecret({ secretName }) {
        const client = new SecretsManagerClient();

        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
            }),
        );

        if (response.SecretString) {
            const stringifiedResponse = JSON.stringify(response.SecretString)
            const arrayOfSecrets = Object.keys(stringifiedResponse)

            this.secrets[secretName] = stringifiedResponse

            arrayOfSecrets.forEach((secretKey) => {
                this.dataToOmit.push(stringifiedResponse[secretKey])
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
        return internalServerError({
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

    async main() {
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

        this.addResponseToLog()
        this.printLog()
        this.omitDataFromResponse()
    }
}

export default Lambda