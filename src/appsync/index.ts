import Logger from "../logger";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";
import Ssm from "../ssm";
import MetaData from "../../metaData";

export class Appsync {
    logger: Logger
    appsyncUrl: string
    signer: SignatureV4
    ssm: Ssm
    metaData: MetaData

    constructor(
        { logger, signer, region = 'us-east-1', ssm, metaData }: 
        { logger: Logger, signer?: SignatureV4, region?: string, ssm: Ssm, metaData: MetaData  }
    ) {
        this.logger = logger

        this.metaData = metaData

        if (!signer) {
            this.signer = this.createBasicSigner({ region })
        } else {
            this.signer = signer
        }

        this.ssm = ssm
    }

    async getAppsyncUrl() {
        const { APPSYNC_URL } = process.env
        let returnedAppsyncUrl = APPSYNC_URL

        if (!APPSYNC_URL) {
            if (!this.ssm) {
                throw new Error("SSM not initialized: Add APPSYNC_URL to the env or enable ssm in Lambda construct")
            }

            returnedAppsyncUrl = await this.ssm.getSsmParameter({ name: 'apiGraphQLURL' })
        }

        this.logger.addToLog({ name: "Appsync Url", body: returnedAppsyncUrl ?? "" })

        this.appsyncUrl = returnedAppsyncUrl
    }

    createBasicSigner({ region }: { region?: string; }) {
        return new SignatureV4({
            credentials: defaultProvider(),
            region: region ?? 'us-east-1',
            service: 'appsync',
            sha256: Sha256
        });
    }

    async sendAppsyncRequest({ query, variables, operationName }: { query: string, variables?: any, operationName: string }) {
        this.metaData.startTimer({ name: `Appsync Query ${operationName}` })
        
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
            this.logger.addToLog({ name: `Appsync Query ${operationName}`, body: query })
            this.logger.addToLog({ name: `Appsync Variables ${operationName}`, body: variables })
            const signedRequest = await this.signer.sign(request);
            const fetchOptions = {
                method: signedRequest.method,
                headers: signedRequest.headers,
                body: signedRequest.body
            };
            const response = await fetch(endpoint, fetchOptions);
            const data: any = await response.json();
            this.logger.addToLog({ name: `Appsync Response ${operationName}`, body: JSON.stringify(data) })

            this.metaData.endTimer({ name: `Appsync Query ${operationName}` })
            return data?.data
        } catch (error) {
            this.metaData.endTimer({ name: `Appsync Query ${operationName}` })
            throw error
        }
    }
}

export default Appsync