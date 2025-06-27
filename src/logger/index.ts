import { inspect } from 'util'
import { Log } from "./types";
import Omitter from "../omitter";
import MetaData from "../metaData";

export class Logger {
    log: Log[];
    omitter: Omitter;
    skipDataOmission: boolean;

    constructor(
        { omitter, skipDataOmission = false }: 
        { omitter: Omitter, skipDataOmission?: boolean }
    ) {
        this.log = []
        this.omitter = omitter
        this.skipDataOmission = skipDataOmission
    }

    addToLog({ name, body }: { name: string, body: any}) {
        this.log.push({ name, body })
    }

    addResponseToLog({ response }: { response: Response }) {
        this.addToLog({ name: "responseObject", body: response })
    }

    addMetaDataToLog({ metaData }: { metaData: MetaData }) {
        this.addToLog({ name: "Meta Data", body: metaData.logMetadata() })
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

    printLog() {
        let internalLog = this.log

        if (!this.skipDataOmission) {
            internalLog = JSON.parse(
                this.omitter.omitDataFromString({ value: JSON.stringify(this.log) }) 
                    ?? '{}'
            )
        }
        console.log(inspect(internalLog, { showHidden: false, depth: null, colors: false }))
    }
}

export default Logger