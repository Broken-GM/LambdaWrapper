import responseExportsObject, { genericInternalServerError, preflight } from './app/responses.js'
import logsExportsObject, { printLog, addToLog, addResponseToLog, addErrorrToLog } from './app/logs.js'
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

            logsExportsObject.addToLog({ log: lambda.log, name: "IP Respponse", body: { response: text } })

            return responseExportsObject.success({ body: { ip: text }, message: "" })
        }
    }

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
                addErrorrToLog({ log: this.log, error })
                this.response = genericInternalServerError()
            }
        }

        addResponseToLog({ log: this.log, response: this.response })
        printLog({ log: this.log, dataToOmit: this.dataToOmit })
    }
}

export default Lambda