export const basicResponseHeaders = () => {
    return {
        "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS, PUT, GET, DELETE"
    }
}

export const bodyObject = ({ body, type, message }) => {
    return JSON.stringify({ ...body, type, message })
}

export const internalServerError = ({ body, message }) => {
    return {
        statusCode: 500,
        headers: basicResponseHeaders(),
        body: bodyObject({ body, type: "Error", message })
    }
}
export const success = ({ body, message }) => {
    return {
        statusCode: 200,
        headers: basicResponseHeaders(),
        body: bodyObject({ body, type: "Response", message })
    }
}
export const preflight = () => {
    return {
        statusCode: 200,
        headers: basicResponseHeaders(),
        body: bodyObject({ body: {}, type: "Preflight", message: "" })
    }
}

export const genericInternalServerError = () => {
    return internalServerError({
        message: "An error has occured",
        body: {}
    })
}

const responseExportsObject = {
    genericInternalServerError,
    preflight,
    success,
    internalServerError,
    bodyObject,
    basicResponseHeaders
}

export default responseExportsObject