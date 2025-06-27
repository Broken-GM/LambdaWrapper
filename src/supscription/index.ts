import Appsync from "../appsync";
import Logger from "../logger";

export class Subscription {
    userId: string;
    logger: Logger
    requiredSubscriptions: string[]
    appsync: Appsync

    constructor(
        { userId, logger, requiredSubscriptions = [], appsync }: 
        { userId: string, logger: Logger, requiredSubscriptions?: string[], appsync: Appsync }
    ) {
        this.userId = userId;
        this.logger = logger
        this.requiredSubscriptions = requiredSubscriptions
        this.appsync = appsync
    }

    async checkSubscription() {
        if (!this.userId) {
            throw new Error("Unable to find account for subscription");
        }

        const results = await this.appsync.sendAppsyncRequest({
            query: `
                query GetSubscription($customerAWSAccountID: String!) {
                    getSubscription(customerAWSAccountID: $customerAWSAccountID) {
                        userId
                        subscriptionId
                        tokenGeneratorEnabled
                    }
                }
            `,
            variables: {
                userId: this.userId
            },
            operationName: 'GetSubscription'
        })
        const subscriptions = results.getSubscription
        let isSubscribed = true

        this.requiredSubscriptions.map((requiredSubscription) => {
            if (subscriptions?.[requiredSubscription]) {
                isSubscribed = isSubscribed && true
            } else {
                isSubscribed = isSubscribed && false
            }
        })

        return isSubscribed
    }
}

export default Subscription