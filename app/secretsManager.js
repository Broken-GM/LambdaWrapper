import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export const getSecret = async ({ secretName, secrets, dataToOmit }) => {
    const client = new SecretsManagerClient();

    const response = await client.send(
        new GetSecretValueCommand({
            SecretId: secretName,
        }),
    );

    if (response.SecretString) {
        secrets[secretName] = response.SecretString;
    }

    if (response.SecretBinary) {
        secrets[secretName] = response.SecretBinary;
    }
}

const secretsExportsObject = {
    getSecret
}

export default secretsExportsObject