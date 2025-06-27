export class Omitter {
    data: string[]

    constructor({}: {}) {
        this.data = []
    }

    addData({ data }: any) {
        this.data.push(data)
    }

    omitDataFromString({ value }: { value: string }) {
        let internalValue = value
        
        this.data.forEach((data: any) => {
            internalValue = value.replaceAll(data, "****")
        });

        return internalValue
    }
}

export default Omitter