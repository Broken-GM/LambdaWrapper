import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import Logger from "../logger";
import MetaData from "../metaData";

export class Ssm {
    ssmClient: SSMClient;
    logger: Logger;
    metaData: MetaData;

    constructor({ 
        logger, region = 'us-west-2', ssmClient = new SSMClient({ region }), metaData
    }: {
        logger: Logger; region?: string; ssmClient?: SSMClient, metaData: MetaData
    }) {
        // Logger
        this.logger = logger
        
        // Clients
        this.ssmClient = ssmClient;

        // MetaData
        this.metaData = metaData
    }

    async getSsmParameter({ name }: { name: string }) {
        this.metaData.startTimer({ name: `Get SSM Param: ${name}` })

        const command = new GetParameterCommand({ Name: name });
        const response = await this.ssmClient.send(command);
        this.logger.addToLog({ name: `SSM Param: ${name}`, body: response.Parameter?.Value ?? '' })
        
        this.metaData.endTimer({ name: `Get SSM Param: ${name}` })
        
        return response.Parameter?.Value ?? '';
    }
}

export default Ssm