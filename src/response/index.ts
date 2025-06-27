export class ResponseController {
    constructor({}: {}) {}

    basicResponseHeaders() {
        return {
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD"
        }
    }

    bodyObject({ body, type, message }: { body: any, type: string, message: string }) {
        return JSON.stringify({ ...body, type, message })
    }

    internalServerError({ body, message }: { body: any, message: string }) {
        return {
            statusCode: 500,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message })
        }
    }

    badRequestError({ body, message }: { body: any, message: string }) {
        return {
            statusCode: 400,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message })
        }
    }

    timeoutError({ body }: { body: any }) {
        return {
            statusCode: 504,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Error", message: "Request timed out" })
        }
    }

    success({ body, message }: { body: any, message: string }) {
        return {
            statusCode: 200,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type: "Response", message })
        }
    }

    preflight = () => {
        return {
            statusCode: 200,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body: {}, type: "Preflight", message: "" })
        }
    }

    genericInternalServerError() {
        return this.internalServerError({
            message: "An error has occurred",
            body: {}
        })
    }

    customRequest({ code, body, message, type }: { code: number, body: any, message: string, type: string }) {
        return {
            statusCode: code,
            headers: this.basicResponseHeaders(),
            body: this.bodyObject({ body, type, message })
        }
    }
}

export default ResponseController