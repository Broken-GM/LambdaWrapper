import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SSMClient } from "@aws-sdk/client-ssm";
import MetaData from "../metaData";
import { isJson } from "../helpers";
import ResponseController from "../response";
import Logger from "../logger";
import Omitter from "../omitter";
import Ssm from "../ssm";
import Appsync from "../appsync";
import Subscription from "../supscription";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, marshallOptions } from "@aws-sdk/lib-dynamodb";
import DynamoDb from "../dynamoDb";
import Athena from "../athena";
import { AthenaClient } from "@aws-sdk/client-athena";

export class Lambda {
    event: any;
    context: any
    secrets: { [key: string]: any };
    customPostExecution: Function;
    run: Function;
    isBodyJson: boolean | undefined;
    body: any;
    requiredPayloadKeys: any;
    isTimeoutTriggered: boolean;
    timeout: number;
    timeoutOffset: number;
    timeoutId: NodeJS.Timeout | undefined;
    ssmClient: SSMClient | undefined;
    region: string | undefined;
    metaData: MetaData;
    responseController: ResponseController;
    response: any;
    logger: Logger;
    omitter: Omitter;
    ssm: Ssm | undefined;
    appsync: Appsync | undefined;
    enableAppsync: boolean;
    enableSsm: boolean;
    requiredSubscriptions: string[];
    subscription: Subscription;
    userAttributes: any;
    userId: string | undefined;
    isLambdaApiGatewayTarget: boolean;
    isLambdaEventBusTarget: boolean;
    isLambdaSqsTarget: boolean;
    secretsClient: SecretsManagerClient | undefined;
    enableSecretsManager: boolean;
    enableDynamoDb: boolean;
    ddbClient: DynamoDBClient | undefined;
    ddbDocClient: DynamoDBDocumentClient | undefined;
    dynamoDb: DynamoDb | undefined;
    sqsRecords: any[] | undefined;
    athena: Athena;
    enableAthena: boolean;
    athenaClient: AthenaClient

    constructor({ 
        event, context, run, customPostExecution = () => {}, 
        requiredPayloadKeys, timeout, timeoutOffset, region = 'us-east-1', 
        skipDataOmission = false, enableSsm = false, enableAppsync = false, requiredSubscriptions = [], 
        isLambdaApiGatewayTarget = true, isLambdaEventBusTarget = false, ssmClient, enableSecretsManager = false,
        secretsClient, enableDynamoDb = false, ddbClient, ddbDocClient, dynamoMarshalOptions = {},
        isLambdaSqsTarget = false, enableAthena, athenaClient, outputBucket
    }: {
        event: any; context: any; run?: any; customPostExecution?: Function;
        requiredPayloadKeys?: any; timeout?: number; timeoutOffset?: any; region?: string; 
        skipDataOmission?: boolean; enableSsm?: boolean; enableAppsync?: boolean; requiredSubscriptions?: string[];
        isLambdaApiGatewayTarget?: boolean; isLambdaEventBusTarget?: boolean; ssmClient?: SSMClient; enableSecretsManager?: boolean;
        secretsClient?: SecretsManagerClient; enableDynamoDb?: boolean;
        ddbClient?: DynamoDBClient; ddbDocClient?: DynamoDBDocumentClient; dynamoMarshalOptions?: marshallOptions;
        isLambdaSqsTarget?: boolean; enableAthena?: boolean; athenaClient?: AthenaClient; outputBucket?: string;
    }) {
        // MetaData
        this.metaData = new MetaData({})
        this.metaData.startTimer({ name: 'totalLambdaExecution' })

        // Omitter
        this.omitter = new Omitter({})

        // Logger
        this.logger = new Logger({ skipDataOmission, omitter: this.omitter })

        this.responseController = new ResponseController({})

        // Handler Params
        this.event = event
        this.isLambdaApiGatewayTarget = isLambdaApiGatewayTarget
        this.isLambdaEventBusTarget = isLambdaEventBusTarget
        this.isLambdaSqsTarget = isLambdaSqsTarget
        if (isLambdaApiGatewayTarget) {
            this.context = context
            const body = isJson(event?.body)
            this.isBodyJson = body?.isJson
            if (body?.isJson) {
                this.body = body?.object
            } else {
                this.body = this.event?.body
            }
        }
        if (isLambdaSqsTarget) {
            this.sqsRecords = this.event.Records
        }

        this.userAttributes = event?.requestContext?.authorizer?.claims
        if (this.userAttributes) {
            this.userId = this.userAttributes?.sub
        }

        // SSM
        this.enableSsm = enableSsm
        if (enableSsm) {
            this.metaData.startTimer({ name: 'initializeSsm' })
            this.ssmClient = ssmClient ?? new SSMClient({ region });
            this.ssm = new Ssm({ 
                logger: this.logger, region, ssmClient: this.ssmClient, metaData: this.metaData
            })
            this.metaData.endTimer({ name: 'initializeSsm' })
        }

        // DynamoDB
        this.enableDynamoDb = enableDynamoDb
        if (enableDynamoDb) {
            this.metaData.startTimer({ name: 'initializeDynamoDb' })
            this.ddbClient = ddbClient ?? new DynamoDBClient({ region });
            this.ddbDocClient = ddbDocClient ?? DynamoDBDocumentClient.from(this.ddbClient, {
                marshallOptions: dynamoMarshalOptions,
            });;
            this.dynamoDb = new DynamoDb({ 
                logger: this.logger, region, ddbClient: this.ddbClient, ddbDocClient: this.ddbDocClient, metaData: this.metaData
            })
            this.metaData.endTimer({ name: 'initializeDynamoDb' })
        }

        // Secrets Manager
        this.enableSecretsManager = enableSecretsManager
        if (enableSecretsManager) {
            this.metaData.startTimer({ name: 'initializeSecretsManager' })
            this.secretsClient = secretsClient ?? new SecretsManagerClient({ region });
            this.metaData.endTimer({ name: 'initializeSecretsManager' })
        }

        // Appsync
        this.enableAppsync = enableAppsync
        if (enableAppsync) {
            this.metaData.startTimer({ name: 'initializeAppsync' })
            this.appsync = new Appsync({
                logger: this.logger, region, ssm: this.ssm!, metaData: this.metaData
            })
            this.metaData.endTimer({ name: 'initializeAppsync' })
        }

        // Subscriptions
        this.requiredSubscriptions = requiredSubscriptions
        this.subscription = new Subscription({
            userId: this.userId!,
            logger: this.logger,
            requiredSubscriptions,
            appsync: this.appsync!
        })

        // Athena
        this.enableAthena = enableAthena
        if (enableAthena) {
            this.metaData.startTimer({ name: 'initializeAthena' })
            this.athenaClient = athenaClient ?? new AthenaClient({ region });
            this.athena = new Athena({ 
                logger: this.logger, region, athenaClient: this.athenaClient, 
                metaData: this.metaData, outputBucket: outputBucket
            })
            this.metaData.endTimer({ name: 'initializeAthena' })
        }

        // Executions
        this.run = run ? run : async (lambda: Lambda) => {
            return lambda.responseController.success({ body: {}, message: "Success" })
        }
        this.customPostExecution = customPostExecution

        this.secrets = {}
        this.requiredPayloadKeys = requiredPayloadKeys ? requiredPayloadKeys : []
        this.isTimeoutTriggered = false
        this.timeout = timeout ? timeout : 29000
        this.timeoutOffset = timeoutOffset ? timeoutOffset : 1000
    }

    // Secrets Manager
    async getSecret({ secretName, shortName }: { secretName: string, shortName?: string }) {
        this.metaData.startTimer({ name: `getSecret-${secretName}` })

        const response = await this.secretsClient!.send(
            new GetSecretValueCommand({
                SecretId: secretName,
            }),
        );

        if (response.SecretString) {
            const parsedResponse = JSON.parse(response.SecretString ?? '{}')
            const arrayOfSecrets = Object.keys(parsedResponse)

            this.secrets[shortName ? shortName : secretName] = parsedResponse

            arrayOfSecrets.forEach((secretKey) => {
                this.omitter.addData(parsedResponse[secretKey])
            })
        }
        this.metaData.endTimer({ name: `getSecret-${secretName}` })
    }

    // Operations
    postExecution() {
        this.response = JSON.parse(this.omitter.omitDataFromString({ value: JSON.stringify(this.response ?? {}) }))
        this.customPostExecution()
        this.metaData.endTimer({ name: 'totalLambdaExecution' })
        this.metaData.processMetaData()
        this.logger.addMetaDataToLog({ metaData: this.metaData })
        this.logger.addResponseToLog({ response: this.response })
        this.logger.printLog()
    }
    checkForRequiredPayloadKeys() {
        this.metaData.startTimer({ name: `checkForRequiredPayloadKeys` })
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
            
            this.metaData.endTimer({ name: `checkForRequiredPayloadKeys` })
            return { isAllRequiredPayloadKeysPresent, message }
        } else {
            this.metaData.endTimer({ name: `checkForRequiredPayloadKeys` })
            return { isAllRequiredPayloadKeysPresent: true, message: '' }
        }
    }

    async main() {
        return new Promise(async (resolve) => {
            this.logger.addToLog({ name: "Event Object", body: this.event })
            if (this.isLambdaApiGatewayTarget) {
                this.logger.addToLog({ name: "Body", body: this.body })
                const { isAllRequiredPayloadKeysPresent, message } = this.checkForRequiredPayloadKeys()
                if (!isAllRequiredPayloadKeysPresent) {
                    this.postExecution()
                    resolve(this.responseController.badRequestError({ body: {}, message }))
                }
            }

            this.timeoutId = setTimeout(() => {
                this.isTimeoutTriggered = true
                this.response = this.responseController.timeoutError({ body: {} })
                this.metaData.endTimer({ name: 'runExecution' })
                this.postExecution()

                resolve(this.response)
            }, this.timeout - this.timeoutOffset)

            if (this.event?.httpMethod === "OPTIONS") {
                this.response = this.responseController.preflight()
            } else {
                try {
                    if (this.enableAppsync) {
                        await this.appsync!.getAppsyncUrl()
                    }

                    let isSubscribed = true
                    if (this.requiredSubscriptions.length > 0) {
                        isSubscribed = await this.subscription.checkSubscription()
                    }

                    if (isSubscribed) {
                        this.metaData.startTimer({ name: 'runFunctionExecution' })
                        this.response = await this.run(this)
                        this.metaData.endTimer({ name: 'runFunctionExecution' })
                    } else {
                        this.response = this.responseController.badRequestError({ body: {}, message: "Account is not subscribed to required services" })
                    }
                } catch (error) {
                    if (`${error}` === 'Error: Unable to find account for subscription') {
                        this.response = this.responseController.badRequestError({ body: {}, message: "Account ID not passed to subscription" })
                    } else {
                        this.logger.addErrorToLog({ error })
                        this.response = this.responseController.genericInternalServerError()
                    }
                }
            }

            if (!this.isTimeoutTriggered) {
                clearTimeout(this.timeoutId)
                this.postExecution()
                resolve(this.response)
            }
        })
    }
}

export default Lambda