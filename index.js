import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import fetch from 'node-fetch'
import util from 'util'
import { v4 as uuidv4 } from 'uuid';

class Lambda {
    constructor({ event, context, run, region, customPostExecution }) {
        this.event = event
        this.context = context
        this.response = {}
        this.log = {}
        this.secrets = {}
        this.metaData  = { timers: {} }
        this.dataToOmit = []
        this.customPostExecution = customPostExecution ? customPostExecution : () => {}
        this.run = run ? run : async (lambda) => {
            const fetchResponse = await fetch("http://checkip.amazonaws.com/", { method: 'GET' })
            const text = await fetchResponse.text()

            lambda.addToLog({ name: "IP Respponse", body: { response: text } })

            return lambda.success({ body: { ip: text }, message: "" })
        }
        this.client = new DynamoDBClient({ region: region ? region : 'us-west-2' })
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

    // MetaData
    startTimer({ name }) {
        this.metaData.timers[name] = {}
        this.metaData.timers[name].start = Date.now()
    }
    endTimer({ name }) {
        if (this.metaData.timers[name]) {
            this.metaData.timers[name].end = Date.now()
            this.metaData.timers[name].totalExecutionTime = this.metaData.timers[name].end - this.metaData.timers[name].start
        }
    }

    // Logging
    addToLog({ name, body }) {
        this.log[name] = body
    }
    addResponseToLog() {
        this.addToLog({ name: "responseObject", body: this.response })
    }
    addMetaDataToLog() {
        this.addToLog({ name: "Meta Data", body: this.metaData })
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

    // Dynamo
    async getDynamoEntry({ table, pk, sk }) {
        const getUserCommand = new GetCommand({
            TableName: table,
            Key: {
                PK: pk,
                SK: sk
            },
        })
        const getEntryResponse = await this.client.send(getUserCommand)
        const attributes = JSON.parse(getEntryResponse?.Item?.attributes ? getEntryResponse?.Item?.attributes : "{}")
        addToLog({ name: `get-${table}-${pk}-${sk}-${uuidv4()}`, getEntryResponse })

        return { response: getEntryResponse, attributes }
    }
    async putDynamoEntry({ table, pk, sk, items }) {
        const putEntryInput = {
			TableName: table,
			Item: {
				PK: pk,
				SK: sk,
				...items
			},
		}
		const putEntryCommand = new PutCommand(putEntryInput)

		const putEntryResponse = await this.client.send(putEntryCommand)
        addToLog({ name: `put-${table}-${pk}-${sk}-${uuidv4()}`, putEntryResponse })

        return { response: putEntryResponse }
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

    // Operations
    postExecution() {
        this.addResponseToLog()
        this.addMetaDataToLog()
        this.customPostExecution()
        this.printLog()
        this.omitDataFromResponse()
    }

    async main(timeout = 29000, timeoutOffset = 1000) {
        return new Promise(async (resolve) => {
            this.startTimer({ name: 'execution' })
            this.addToLog({ name: "Event Object", body: this.event })

            setTimeout(() => {
                this.endTimer({ name: 'execution' })
                this.response = this.timeoutError({ body: {} })
                this.postExecution()

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

            this.endTimer({ name: 'execution' })
            this.postExecution()

            resolve(this.response)
        })
    }
}

export default Lambda