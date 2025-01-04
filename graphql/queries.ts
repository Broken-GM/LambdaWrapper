export const getSubscriptionQuery = `
    query getSubscription($userId: String!) {
        getSubscription(userId: $userId) {
            userId
            subscriptionId
            tokenGeneratorEnabled
            mtgInventoryEnabled
        }
    }
`;