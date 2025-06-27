export interface FieldToInsert {
    athenaName: string;
    paramName: string;
    type: string;
    stringify?: boolean;
    toLower?: boolean;
    compareOperation?: string;
}