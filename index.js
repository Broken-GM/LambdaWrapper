import responseExportsObject, { genericInternalServerError, preflight } from './app/responses.js'
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

            lambda.addToLog({ name: "IP Respponse", body: { response: text } })

            return responseExportsObject.success({ body: { ip: text }, message: "" })
        }
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
            stringifiedLog.replaceAll(data, "****")
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

    async main() {
        if (this?.event?.httpMethod === "OPTIONS") {
            this.response = preflight()
        } else {
            try {
                this.response = await this.run(this)
            } catch (error) {
                this.addErrorToLog({ error })
                this.response = genericInternalServerError()
            }
        }

        this.addResponseToLog()
        this.printLog()
    }
}

export default Lambda

const test = new Lambda({})
test.main()