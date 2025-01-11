import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import fetch from 'node-fetch'
import util from 'util'
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { HttpRequest } from "@aws-sdk/protocol-http";

class Lambda {
    metaData: { 
        timers: any; 
        lambdaWrapperExecutionTime: number; 
    }; 
    event: any;
    context: any
    response: any;
    log: any;
    secrets: any;
    dataToOmit: any;
    customPostExecution: any;
    omitDynamoResponses: any;
    run: any;
    isBodyJson: any;
    body: any;
    requiredPayloadKeys: any;
    timeoutTriggered: any;
    timeout: any;
    timeoutOffset: any;
    timeoutId: any;
    region: string;
    signer: SignatureV4;
    ssmClient: SSMClient;
    appsyncUrl: string;
    requiredSubscriptions: string[];
    userId?: string;
    enableAppsync?: boolean

    constructor({ 
        event, context, run, region, customPostExecution, 
        omitDynamoResponses, requiredPayloadKeys, timeout, 
        timeoutOffset, signerGenerator, requiredSubscriptions,
        enableAppsync
    }: {
        event: any; context: any; run?: any; region?: string; customPostExecution?: any;
        omitDynamoResponses?: any, requiredPayloadKeys?: any; timeout?: any; timeoutOffset?: any;
        signerGenerator?: Function; requiredSubscriptions?: string[], enableAppsync?: boolean
    }) {
        this.metaData  = { timers: {}, lambdaWrapperExecutionTime: 0 }
        this.startTimer({ name: 'totalExecution' })

        this.event = event
        this.context = context
        this.response = {}
        this.log = {}
        this.secrets = {}
        this.dataToOmit = []
        this.customPostExecution = customPostExecution ? customPostExecution : () => {}
        this.omitDynamoResponses = omitDynamoResponses ? omitDynamoResponses : false
        this.run = run ? run : async (lambda: Lambda) => {
            const fetchResponse = await fetch("http://checkip.amazonaws.com/", { method: 'GET' })
            const text = await fetchResponse.text()

            lambda.addToLog({ name: "IP Respponse", body: { response: text } })

            return lambda.success({ body: { ip: text }, message: "" })
        }
        const body = this.isJson(event?.body)
        this.isBodyJson = body?.isJson
        if (body?.isJson) {
            this.body = body?.object
        } else {
            this.body = this.event?.body
        }
        this.requiredPayloadKeys = requiredPayloadKeys ? requiredPayloadKeys : []
        this.timeoutTriggered = false
        this.timeout = timeout ? timeout : 29000
        this.timeoutOffset = timeoutOffset ? timeoutOffset : 1000
        this.region = region ?? 'us-east-1'
        this.signer = 
            signerGenerator ? 
                signerGenerator({ region: this.region }) : 
                this.createBasicSigner({ region: this.region })
        this.enableAppsync = enableAppsync ?? true
        this.ssmClient = new SSMClient({ region: this.region });
        this.appsyncUrl = process.env.APPSYNC_URL ?? ''
        this.requiredSubscriptions = requiredSubscriptions ?? []
        this.userId = event?.requestContext?.authorizer?.claims?.sub ?? null
    }

    // Helpers
    isJson(variable: any) {
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

    // SSM Params
    async getSsmParameter({ name }: { name: string }) {
        const command = new GetParameterCommand({ Name: name });
        const response = await this.ssmClient.send(command);
        
        this.addToLog({ name: `SSM Param: ${name}`, body: response.Parameter?.Value ?? '' })
        return response.Parameter?.Value ?? '';
    }

    // Appsync
    async getAppsyncUrl() {
        const { APPSYNC_URL } = process.env
        let returnedAppsyncUrl = APPSYNC_URL

        if (this.enableAppsync) {
            if (!APPSYNC_URL) {
                returnedAppsyncUrl = await this.getSsmParameter({ name: '/brokengm/appsync/api/url' })
            }
    
            this.addToLog({ name: "Appsync Url", body: returnedAppsyncUrl ?? "" })
        }

        return returnedAppsyncUrl ?? ""
    }
    createBasicSigner({ region }: { region?: string; }) {
        return new SignatureV4({
            credentials: defaultProvider(),
            region: region ?? 'us-east-1',
            service: 'appsync',
            sha256: Sha256
        });
    }
    async sendAppsyncRequest({ query, variables, operationName }: { query: string, variables?: any, operationName?: string }) {
        const endpoint = new URL(this.appsyncUrl);
        const request = new HttpRequest({
            hostname: endpoint.hostname,
            protocol: endpoint.protocol,
            path: endpoint.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'host': endpoint.hostname
            },
            body: JSON.stringify({
                query: query,
                variables
            })
        });
        try {
            this.addToLog({ name: `Appsync Query ${operationName}`, body: query })
            this.addToLog({ name: `Appsync Variables ${operationName}`, body: variables })
            const signedRequest = await this.signer.sign(request);
            const fetchOptions = {
                method: signedRequest.method,
                headers: signedRequest.headers,
                body: signedRequest.body
            };
            const response = await fetch(endpoint, fetchOptions);
            const data: any = await response.json();
            this.addToLog({ name: `Appsync Response ${operationName}`, body: data })

            return data?.data
        } catch (error) {
            this.addToLog({ name: `Appsync Error ${operationName}`, body: error })
            return error;
        }
    }

    // Data Ommition 
    addToDataToOmit({ data }: any) {
        this.dataToOmit.push(data)
    }

    // MetaData
    startTimer({ name }: { name: string }) {
        this.metaData.timers[name] = {}
        this.metaData.timers[name].start = Date.now()
    }
    endTimer({ name }: { name: string }) {
        if (this.metaData.timers[name]) {
            this.metaData.timers[name].end = Date.now()
            this.metaData.timers[name].totalExecutionTime = this.metaData.timers[name].end - this.metaData.timers[name].start
        }
    }
    processMetaData() {
        this.metaData.lambdaWrapperExecutionTime = this.metaData?.timers?.totalExecution?.totalExecutionTime - this.metaData?.timers?.runExecution?.totalExecutionTime
    }

    // Logging
    addToLog({ name, body }: { name: string, body: any}) {
        this.log[name] = body
    }
    addResponseToLog() {
        this.addToLog({ name: "responseObject", body: this.response })
    }
    addMetaDataToLog() {
        this.addToLog({ name: "Meta Data", body: this.metaData })
    }
    addErrorToLog({ error }: any) {
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

        this.dataToOmit.forEach((data: any) => {
            stringifiedLog = stringifiedLog.replaceAll(data, "****")
        });

        this.log = JSON.parse(stringifiedLog ?? '{}')
    }
    printLog() {
        this.omitDataFromLog()
        console.log(util.inspect(this.log, {showHidden: false, depth: null, colors: false}))
    }

    // Secrets Manager
    async getSecret({ secretName, shortName }: { secretName: string, shortName?: string }) {
        const client = new SecretsManagerClient();

        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
            }),
        );

        if (response.SecretString) {
            const parsedResponse = JSON.parse(response.SecretString ?? '{}')
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
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD"
        }
    }
    bodyObject({ body, type, message }: { body: any, type: string, message: string }) {
        return JSON.stringify({ ...body, type, message })
    }
    internalServerError({ body, message }: { body: any, message: string }) {
        return {
            statusCode: 500,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message })
        }
    }
    badRequestError({ body, message }: { body: any, message: string }) {
        return {
            statusCode: 400,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message })
        }
    }
    timeoutError({ body }: { body: any }) {
        return {
            statusCode: 504,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message: "Request timed out" })
        }
    }
    success({ body, message }: { body: any, message: string }) {
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

        this.dataToOmit.forEach((data: any) => {
            stringifiedResponse = stringifiedResponse.replaceAll(data, "****")
        });

        this.response = JSON.parse(stringifiedResponse ?? '{}')
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
            this.requiredPayloadKeys?.forEach((requiredPayloadKey: any) => {
                if (!payloadKeyErrorTriggered) {
                    if (requiredPayloadKey?.operator === 'or') {
                        let amountMissing = 0
                        let tempMessage = ''
                        requiredPayloadKey?.keys?.forEach((key: any, i: number) => {
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
                        requiredPayloadKey?.keys?.forEach((key: any, i: number) => {
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

    // Subscriptions
    async isValidSubscription() {
        this.addToLog({ name: "Required Subscriptions", body: this.requiredSubscriptions })
        if (this.requiredSubscriptions.length === 0) {
            return true
        }

        const data = await this.sendAppsyncRequest({
            query: `
                query getSubscription($userId: String!) {
                    getSubscription(userId: $userId) {
                        userId
                        subscriptionId
                        tokenGeneratorEnabled
                        mtgInventoryEnabled
                    }
                }
            `,
            variables: {
                userId: this.userId
            },
            operationName: "getSubscription"
        })

        let isValidSubscription = 0
        for (let i = 0; i < this.requiredSubscriptions.length; i += 1) {
            if (data?.getSubscription?.[this.requiredSubscriptions[i]] === true) {
                isValidSubscription = isValidSubscription + 1
            }
        }

        return this.requiredSubscriptions.length === isValidSubscription
    }

    async main() {
        return new Promise(async (resolve) => {
            this.addToLog({ name: "Event Object", body: this.event })
            this.addToLog({ name: "Body", body: this.body })
            this.appsyncUrl = await this.getAppsyncUrl()
            const { isAllRequiredPayloadKeysPresent, message } = this.checkForRequiredPayloadKeys()
            if (!isAllRequiredPayloadKeysPresent) {
                this.response = this.badRequestError({ body: {}, message })
                this.postExecution()
                resolve(this.response)
                return
            }

            this.timeoutId = setTimeout(() => {
                this.timeoutTriggered = true
                this.response = this.timeoutError({ body: {} })
                this.endTimer({ name: 'runExecution' })
                this.postExecution()

                resolve(this.response)
            }, this.timeout - this.timeoutOffset)

            if (this.event?.httpMethod === "OPTIONS") {
                this.response = this.preflight()
            } else {
                try {
                    this.startTimer({ name: 'runExecution' })
                    const isValidSubscription = await this.isValidSubscription()
                    if (isValidSubscription) {
                        this.response = await this.run(this)
                    } else {
                        this.response = this.badRequestError({
                            body: {},
                            message: "Invalid Subscription"
                        })
                    }
                    this.endTimer({ name: 'runExecution' })
                } catch (error) {
                    this.addErrorToLog({ error })
                    this.response = this.genericInternalServerError()
                }
            }

            if (!this.timeoutTriggered) {
                clearTimeout(this.timeoutId)
                this.postExecution()
                resolve(this.response)
            }
        })
    }
}

export default Lambda