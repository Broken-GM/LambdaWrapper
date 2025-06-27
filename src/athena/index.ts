import { AthenaClient, GetQueryExecutionCommand, StartQueryExecutionCommand, GetQueryResultsCommand } from '@aws-sdk/client-athena';
import Logger from "../logger";
import MetaData from "../metaData";
import { FieldToInsert } from './types';
const moment = require("moment");

export class Athena {
    athenaClient: AthenaClient;
    logger: Logger;
    metaData: MetaData;
    outputBucket: string;

    constructor({ 
        logger, region = 'us-west-2', athenaClient, metaData = {} as MetaData, outputBucket
    }: {
        logger: Logger; region?: string; athenaClient?: AthenaClient, outputBucket: string
        metaData: MetaData;
    }) {
        // Logger
        this.logger = logger
        
        // Client
        this.athenaClient = athenaClient ?? new AthenaClient({ region })

        // MetaData
        this.metaData = metaData

        this.outputBucket = outputBucket
    }

    async waitForQueryToComplete(
        { queryExecutionId, name, delay = 200, retries = 50 }: 
        { queryExecutionId: string, name?: string, delay?: number, retries?: number }
    ) {
        for (let i = 0; i < retries; i++) {
            const { QueryExecution } = await this.athenaClient.send(
                new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
            );
    
            const status = QueryExecution?.Status?.State;
            
            if (status === 'SUCCEEDED') {
                return {
                    queryName: name ?? 'Unknown',
                    waitTime: i * delay
                };
            }
            
            if (status === 'FAILED' || status === 'CANCELLED') {
                throw new Error(`Query ${status}: ${QueryExecution?.Status?.StateChangeReason}`);
            }
    
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    
        throw new Error('Query timeout');
    }

    async runAthenaQuery(
        { 
            query,
            executionParameters, 
            database = 'default', 
            nextToken, 
            pageSize = 11,
            workGroup,
            requestId,
            operationName,
        } : {
            query: string,
            executionParameters: any[],
            database: string,
            nextToken?: string,
            pageSize?: number,
            workGroup: string,
            requestId?: string,
            operationName: string,
    }) {
        this.metaData.startTimer({ name: operationName })
        this.logger.addToLog({
            name: `${operationName}-query`,
            body: query
        })
        this.logger.addToLog({
            name: `${operationName}-executionParameters`,
            body: executionParameters
        })
        try {
            let queryExecutionId = requestId

            if (!queryExecutionId) {
                const startQueryResponse = await this.athenaClient.send(
                    new StartQueryExecutionCommand({
                        QueryString: query,
                        QueryExecutionContext: {
                            Database: database,
                        },
                        WorkGroup: workGroup,
                        ResultConfiguration: {
                            OutputLocation: this.outputBucket
                        },
                        ExecutionParameters: executionParameters
                    })
                );
        
                queryExecutionId = startQueryResponse.QueryExecutionId;
            }
            this.logger.addToLog({
                name: `${operationName}-requestId`,
                body: queryExecutionId
            })

            if (!queryExecutionId) {
                throw new Error("Failed to start query execution");
            }
    
            await this.waitForQueryToComplete({ queryExecutionId });
    
            const results = await this.athenaClient.send(
                new GetQueryResultsCommand({
                    QueryExecutionId: queryExecutionId,
                    NextToken: nextToken,
                    MaxResults: pageSize
                })
            );

            this.logger.addToLog({
                name: `${operationName}-athenaResponse`,
                body: results
            })
    
            this.metaData.endTimer({ name: operationName })
            return { 
                requestId: queryExecutionId,
                results: results?.ResultSet?.Rows, 
                nextToken: results?.NextToken,
            };
        } catch (error) {
            this.metaData.endTimer({ name: operationName })
            throw error;
        }
    }

    createSelectQuery({
        fieldsToInsert,
        data,
        orderBy,
        tableName,
    }: {
        fieldsToInsert: FieldToInsert[];
        data: any;
        orderBy: {
            direction: string;
            field: string;
        };
        tableName: string;
    }) {
        let query = `
            SELECT * 
            FROM ${tableName} 
            WHERE 
        `;
        let parameters = []
        let conditions = []

        fieldsToInsert.forEach((fieldData) => {
            let valueManipulation = `CAST(? AS ${fieldData.type})`
            let fieldManipulation = `${fieldData.athenaName}`
            let parameterValue = data?.[fieldData.paramName] ?? ''

            if (fieldData.type === 'timestamp') {
                parameterValue = moment(parameterValue).format('YYYY-MM-DD HH:mm:ss')
            } else {
                parameterValue = parameterValue?.trim();
            }

            if (fieldData.toLower) {
                valueManipulation = `LOWER(${valueManipulation})`
                fieldManipulation = `LOWER(${fieldData.athenaName})`
            }

            conditions.push(`${fieldManipulation} ${fieldData?.compareOperation} ${valueManipulation}`)
            parameters.push(parameterValue);
        })
        query += `
            ${conditions.join(' AND ')}
            ORDER BY ${orderBy?.field} ${orderBy?.direction === 'ASC' ? 'ASC' : 'DESC'}
        `

        return {
            query: query,
            executionParameters: parameters
        }
    }

    createInsertQuery({
        fieldsToInsert,
        data
    }: {
        fieldsToInsert: FieldToInsert[]
        data: any
    }) {
        let query = `
            INSERT INTO events
            SELECT
        `;
        const parameters: any[] = [];

        fieldsToInsert.forEach((fieldData) => {
            let parameterValue = data?.[fieldData.paramName]
            
            if (parameterValue) {
                if (fieldData.toLower) {
                    query += `LOWER(CAST(? AS ${fieldData.type})) as ${fieldData.athenaName},\n`
                } else {
                    query += `CAST(? AS ${fieldData.type}) as ${fieldData.athenaName},\n`
                }
                if (fieldData.type === 'timestamp') {
                    parameterValue = moment(parameterValue).format('YYYY-MM-DD HH:mm:ss')
                    parameters.push(parameterValue);
                } else if (fieldData.stringify) {
                    if (typeof parameterValue === 'string') {
                        parameters.push(parameterValue.trim());
                    } else {
                        parameters.push(JSON.stringify(parameterValue));
                    }
                } else {
                    parameters.push(parameterValue.trim());
                }
            } else {
                query += `'' as ${fieldData.athenaName},\n`
            }
        })

        return query
    }
}

export default Athena