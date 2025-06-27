export interface Timer {
    start?: number;
    end?: number;
    totalExecutionTime?: number;
}

export interface Timers {
    [key: string]: Timer;
}