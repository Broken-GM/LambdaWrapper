import { Timers } from "./types";

export class MetaData {
    timers: Timers; 

    constructor({}: {}) {
        this.timers = {}
    }

    // Timers
    startTimer({ name }: { name: string }) {
        this.timers[name] = {}
        this.timers[name].start = Date.now()
    }
    endTimer({ name }: { name: string }) {
        if (this.timers[name]) {
            this.timers[name].end = Date.now()
            this.timers[name].totalExecutionTime = this.timers[name].end - this.timers[name].start!
        }
    }

    processMetaData() {
        // NOTE: Add any meta data processing logic
    }

    logMetadata() {
        const { totalLambdaExecution, ...timers } = this.timers

        return {
            timers,
            totalLambdaExecution
        }
    }
}

export default MetaData