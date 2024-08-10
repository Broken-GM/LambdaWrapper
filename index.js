import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import fetch from 'node-fetch'
import util from 'util'
import { v4 as uuidv4 } from 'uuid';

class Lambda {
    constructor({ event, context, run, region, customPostExecution, omitDynamoResponses, requiredPayloadKeys }) {
        this.metaData  = { timers: {} }
        this.startTimer({ name: 'totalExecution' })

        this.event = event
        this.context = context
        this.response = {}
        this.log = {}
        this.secrets = {}
        this.dataToOmit = []
        this.customPostExecution = customPostExecution ? customPostExecution : () => {}
        this.omitDynamoResponses = omitDynamoResponses ? omitDynamoResponses : false
        this.run = run ? run : async (lambda) => {
            const fetchResponse = await fetch("http://checkip.amazonaws.com/", { method: 'GET' })
            const text = await fetchResponse.text()

            lambda.addToLog({ name: "IP Respponse", body: { response: text } })

            return lambda.success({ body: { ip: text }, message: "" })
        }
        this.client = new DynamoDBClient({ region: region ? region : 'us-west-2' })
        const body = this.isJson(event?.body)
        this.isBodyJson = body?.isJson
        if (body?.isJson) {
            this.body = body?.object
        } else {
            this.body = this.event?.body
        }
        this.requiredPayloadKeys = requiredPayloadKeys ? requiredPayloadKeys : []
        this.timeoutTriggered = false
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
    processMetaData() {
        this.metaData.lambdaWrapperExecutionTime = this.metaData?.timers?.totalExecution?.totalExecutionTime - this.metaData?.timers?.runExecution?.totalExecutionTime
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
        this.addToLog({ name: `get>${table}>${pk}>${sk}>${uuidv4()}`, body: this.omitDynamoResponses ? "get sent" : getEntryResponse })

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
        this.addToLog({ name: `put>${table}>${pk}>${sk}>${uuidv4()}`, body: this.omitDynamoResponses ? "put sent" : putEntryResponse })

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
        this.omitDataFromResponse()
        this.customPostExecution()
        this.endTimer({ name: 'totalExecution' })
        this.processMetaData()
        this.addMetaDataToLog()
        this.addResponseToLog()
        this.printLog()
    }
    checkForRequiredPayloadKeys() {
        if (this.isBodyJson) {
            let message = ''
            let isAllRequiredPayloadKeysPresent = true
            let payloadKeyErrorTriggered = false
            this.requiredPayloadKeys?.forEach((requiredPayloadKey) => {
                if (!payloadKeyErrorTriggered) {
                    if (requiredPayloadKey?.operator === 'or') {
                        let amountMissing = 0
                        let tempMessage = ''
                        requiredPayloadKey?.keys?.forEach((key, i) => {
                            if (i === requiredPayloadKey?.keys?.length - 1) {
                                tempMessage += `or ${key} `
                            } else if (i === requiredPayloadKey?.keys?.length - 2) {
                                tempMessage += `${key} `
                            } else {
                                tempMessage += `${key}, `
                            }
                            if (this.body?.[key] === undefined || this.body?.[key] === null) {
                                amountMissing += 1
                            }
                        })
                        if (amountMissing === requiredPayloadKey?.keys?.length) {
                            isAllRequiredPayloadKeysPresent = false
                            message += `${tempMessage}is required`
                            payloadKeyErrorTriggered = true
                        }
                    } else if (requiredPayloadKey?.operator === 'and') {
                        let amountMissing = 0
                        let tempMessage = ''
                        requiredPayloadKey?.keys?.forEach((key, i) => {
                            if (i === requiredPayloadKey?.keys?.length - 1) {
                                tempMessage += `and ${key} `
                            } else if (i === requiredPayloadKey?.keys?.length - 2) {
                                tempMessage += `${key} `
                            } else {
                                tempMessage += `${key}, `
                            }
                            if (this.body?.[key] === undefined || this.body?.[key] === null) {
                                amountMissing += 1
                            }
                        })
                        if (amountMissing > 0) {
                            isAllRequiredPayloadKeysPresent = false
                            message += `${tempMessage}are required`
                            payloadKeyErrorTriggered = true
                        }
                    } else {
                        if (this.body?.[requiredPayloadKey?.key] === undefined || this.body?.[requiredPayloadKey?.key] === null) {
                            isAllRequiredPayloadKeysPresent = false
                            message += `${requiredPayloadKey?.key} is required`
                            payloadKeyErrorTriggered = true
                        }
                    }
                }
            })
            
            return { isAllRequiredPayloadKeysPresent, message }
        } else {
            return { isAllRequiredPayloadKeysPresent: true, message: '' }
        }
    }

    async main(timeout = 29000, timeoutOffset = 1000) {
        return new Promise(async (resolve) => {
            this.addToLog({ name: "Event Object", body: this.event })
            this.addToLog({ name: "Body", body: this.body })
            const { isAllRequiredPayloadKeysPresent, message } = this.checkForRequiredPayloadKeys()
            if (!isAllRequiredPayloadKeysPresent) {
                this.response = this.badRequestError({ body: {}, message })
                this.postExecution()
                resolve(this.response)
                return
            }

            this.timeout = setTimeout(() => {
                this.timeoutTriggered = true
                this.response = this.timeoutError({ body: {} })
                this.endTimer({ name: 'runExecution' })
                this.postExecution()

                resolve(this.response)
            }, timeout - timeoutOffset)

            if (this.event?.httpMethod === "OPTIONS") {
                this.response = this.preflight()
            } else {
                try {
                    this.startTimer({ name: 'runExecution' })
                    this.response = await this.run(this)
                    this.endTimer({ name: 'runExecution' })
                } catch (error) {
                    this.addErrorToLog({ error })
                    this.response = this.genericInternalServerError()
                }
            }

            if (!this.timeoutTriggered) {
                clearTimeout(this.timeout)
                this.postExecution()
                resolve(this.response)
            }
        })
    }
}

export default Lambda