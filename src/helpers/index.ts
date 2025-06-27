export function isJson(variable: any) {
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