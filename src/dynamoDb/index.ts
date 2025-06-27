import { DynamoDBClient, ReturnValue } from "@aws-sdk/client-dynamodb";
import { 
    DynamoDBDocumentClient, marshallOptions, 
    PutCommand, GetCommand, UpdateCommand, QueryCommandInput, QueryCommand
} from "@aws-sdk/lib-dynamodb";
import Logger from "../logger";
import MetaData from "../metaData";

export class DynamoDb {
    ddbClient: DynamoDBClient;
    ddbDocClient: DynamoDBDocumentClient;
    logger: Logger;
    metaData: MetaData;

    constructor({ 
        logger, region = 'us-east-1', ddbClient, ddbDocClient, metaData, marshallOptions = {}
    }: {
        logger: Logger; region?: string; ddbClient?: DynamoDBClient, 
        ddbDocClient: DynamoDBDocumentClient; metaData: MetaData; marshallOptions?: marshallOptions
    }) {
        // Logger
        this.logger = logger
        
        // Clients
        if (ddbClient) {
            this.ddbClient = ddbClient
        } else {
            if (ddbDocClient) {
                this.ddbClient = null
            } else {
                this.ddbClient = new DynamoDBClient({ region });
            }
        }

        if (ddbDocClient) {
            this.ddbDocClient = ddbDocClient
        } else {
            this.ddbDocClient = DynamoDBDocumentClient.from(this.ddbClient, {
                marshallOptions,
            });
        }

        // MetaData
        this.metaData = metaData
    }

    async put(
        { tableName, item, operationName }: 
        { tableName: string; item: any; operationName: string }
    ) {
        this.metaData.startTimer({ name: `ddbPut-${operationName}` })
        const putCommand = new PutCommand({
            TableName: tableName,
            Item: item,
        });
        const response = await this.ddbDocClient.send(putCommand);
        this.logger.addToLog({ name: `ddbPut-${operationName}`, body: response })
        this.metaData.endTimer({ name: `ddbPut-${operationName}` })
        return response
    }
    async get(
        { tableName, key, operationName }: 
        { tableName: string; key: any; operationName: string }
    ) {
        this.metaData.startTimer({ name: `ddbGet-${operationName}` })
        const getCommand = new GetCommand({
            TableName: tableName,
            Key: key,
        });
        const response = await this.ddbDocClient.send(getCommand);
        this.logger.addToLog({ name: `ddbGet-${operationName}`, body: response })
        this.metaData.endTimer({ name: `ddbGet-${operationName}` })
        return response
    }
    async update(
        { 
            tableName, key, operationName, expression, 
            expressionAttributeNames, expressionAttributeValues, 
            returnValues = "ALL_NEW"
        }: 
        { 
            tableName: string; key: any; operationName: string;
            expression: string; expressionAttributeNames: any;
            expressionAttributeValues: any; returnValues?: ReturnValue;
        }
    ) {
        this.metaData.startTimer({ name: `ddbUpdate-${operationName}` })
        const updateCommand = new UpdateCommand({
            TableName: tableName,
            Key: key,
            UpdateExpression: expression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: returnValues,
        });
        const response = await this.ddbDocClient.send(updateCommand);
        this.logger.addToLog({ name: `ddbUpdate-${operationName}`, body: response })
        this.metaData.endTimer({ name: `ddUpdate-${operationName}` })
        return response
    }
    async query(
        { 
            tableName, operationName, limit = 100, expression,
            expressionAttributeNames, expressionAttributeValues,
            scanIndexForward = null,
        }: 
        { 
            tableName: string; operationName: string;
            limit?: number; expression: string;
            expressionAttributeNames: { [key: string]: string };
            expressionAttributeValues: { [key: string]: any };
            scanIndexForward?: boolean;
        }
    ) {
        this.metaData.startTimer({ name: `ddbQuery-${operationName}` })

        const input: QueryCommandInput = {
            TableName: tableName,
            Limit: limit,
            KeyConditionExpression: expression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        }

        if (scanIndexForward !== null) {
            input.ScanIndexForward = scanIndexForward
        }

        const queryCommand = new QueryCommand(input);
        const response = await this.ddbDocClient.send(queryCommand);
        this.logger.addToLog({ name: `ddbQuery-${operationName}`, body: response })
        this.metaData.endTimer({ name: `ddbQuery-${operationName}` })

        return response
    }
}

export default DynamoDb