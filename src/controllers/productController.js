const productModel = require("../models/productModel")
const ObjectId = require("mongoose").Types.ObjectId
const aws = require("aws-sdk")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { AutoScaling } = require("aws-sdk")
const { uploadFile } = require("./aws")
let { isValid, isValidIncludes, validInstallment, validString, isValidRequestBody } = require("./validator")



///===============================Create Product API===================================================//

const createProduct = async function (req, res) {
    try {
        let file = req.files;
        let requestBody = req.body;
        console.log(requestBody)
        let productImage;

        //validating empty req body.
        if (!isValidRequestBody(requestBody)) {
            return res.status(400).send({ status: false, message: "Please provide valid request body" })
        }

        //extract params for request body.
        let {
            title,
            description,
            price,
            currencyId,
            currencyFormat,
            isFreeShipping,
            style,
            availableSizes,
            installments
        } = requestBody

        //validation for the params starts.=============================>>
        if (!isValid(title)) {
            return res.status(400).send({ status: false, message: "Title is required" })
        }

        //searching title in DB to maintain their uniqueness.
        const istitleAleadyUsed = await productModel.findOne({ title })
        if (istitleAleadyUsed) {
            return res.status(400).send({
                status: false,
                message: `${title} is alraedy in use. Please use another title.`
            })
        }

        //uploading product image to AWS.
        if (file && file.length > 0) {

            let uploadedFileURL = await uploadFile(file[0])

            requestBody["productImage"] = uploadedFileURL
        }
        else {
            return res.status(400).send({ status: false, message: "No file found" })
        }



        if (!isValid(description)) {
            return res.status(400).send({ status: false, message: "Description is required" })
        }

        if (!isValid(price)) {

            return res.status(400).send({ status: false, message: "Price is required" })
        }

        if (isNaN(price) || price < 0) {
            return res.status(400).send({ status: false, message: "Price can only be positive number" })
        }
        console.log(currencyId)

        if (!isValid(currencyId)) {
            return res.status(400).send({ status: false, message: "currencyId is required" })
        }


        if (currencyId != "INR") {
            return res.status(400).send({ status: false, message: "currencyId should be INR" })
        }

        if (!isValid(currencyFormat)) {
            return res.status(400).send({ status: false, message: "currencyFormat is required" })

        }
        if (currencyFormat != "₹") {
            return res.status(400).send({ status: false, message: "currencyFormat should be ₹" })
        }


        if (isValidIncludes("style", requestBody)) {
            if (!validString(style)) {
                return res.status(400).send({ status: false, message: "style is required" })
            }
        }
        if (isValidIncludes("installments", requestBody)) {


            if (!isValid(installments)) {
                return res.status(400).send({ status: false, message: "installments required" })

            }

            if (!validInstallment(installments)) {
                return res.status(400).send({ status: false, message: "installments must be number " })
            }

        }

        console.log(typeof isFreeShipping)
        console.log(Object.keys(requestBody).includes("isFreeShipping"))
        console.log(requestBody)
        if (isValidIncludes("isFreeShipping", requestBody)) {

            console.log(5)
            if (!isValid(isFreeShipping)) {
                return res.status(400).send({ status: false, message: "isFreeShipping must be present" })

            }
            if (!["true", "false"].includes(isFreeShipping)) {
                return res.status(400).send({ status: false, message: "isFreeShipping must be a boolean value" })
            }

        }


        console.log(6)

        productImage = requestBody["productImage"]


        //validating sizes to take multiple sizes at a single attempt.
        if (isValidIncludes("availableSizes", requestBody)) {
            let sizesArray = availableSizes.split(",").map(x => x.trim())
            console.log(sizesArray)
            console.log(typeof sizesArray)


            for (let i = 0; i < sizesArray.length; i++) {
                if (!(["S", "XS", "M", "X", "L", "XXL", "XL"].includes(sizesArray[i]))) {
                    console.log(sizesArray[i])
                    return res.status(400).send({ status: false, message: "AvailableSizes should be among ['S','XS','M','X','L','XXL','XL']" })
                }
                if (sizesArray.indexOf(sizesArray[i]) != i) {
                    return res.status(400).send({ status: false, message: "Duplicate size is present" })
                }
            }


            //using array.isArray function to check the value is array or not.
            if (Array.isArray(sizesArray)) {
                requestBody['availableSizes'] = [...sizesArray]
            }

        }
        const saveProductDetails = await productModel.create(requestBody)
        return res.status(201).send({ status: true, message: "Product added successfully.", data: saveProductDetails })

    } catch (err) {
        return res.status(500).send({
            status: false,
            message: "Error is : " + err
        })
    }
}






//===========================================Get API ===============================================================//

const getProducts = async function (req, res) {
    try {
        const getQuery = req.query;
        let query = { isDeleted: false };

        //=======validations =======//
        if (isValidRequestBody(getQuery)) {
            let { size, name, priceGreaterThan, priceLessThan } = getQuery;



            //filter by size,name,price greater than ,price less than key Only
            if (!(size || name || priceGreaterThan || priceLessThan)) {
                return res.status(400).send({ status: false, message: "You can only filter by size,name,price greater than ,price less than" })
            }


            if (isValid(priceGreaterThan)) {
                query.price = { $gt: priceGreaterThan }
            }

            if (isValid(priceLessThan)) {
                query.price = { $lt: priceLessThan }
            }

            if (priceGreaterThan && priceLessThan) {
                query.price = { $gt: priceGreaterThan, $lt: priceLessThan }
            }


            if (isValid(name)) {
                name = name.trim()
                query.title = { $regex: name, $options: "i" }
            }

            if (isValid(size)) {
                const sizeArr = size
                    .trim()
                    .split(",")
                    .map((x) => x.trim().toUpperCase());

                query.availableSizes = { $all: sizeArr }; //selects the documents where the value of a field is an array that contains all the specified elements
            }
        }


        ///save Product Detail to DB
        const getProduct = await productModel.find(query).sort({ price: 1 })
        if (getProduct.length === 0) {
            return res.status(404).send({ status: false, message: "No products found" });
        }
        return res.status(200).send({ status: true, data: getProduct })

    }
    catch (err) {
        return res.status(500).send({ status: false, message: err.message })
    }
}





///==========================================Get Products by ProductID API==============================================================//
const getProductById = async function (req, res) {
    try {
        let pathParams = req.params.productId


        //validations===================>>
        if (!ObjectId.isValid(pathParams)) {
            return res.status(400).send({ status: false, message: "Please enter valid productId" })
        }

        //get data from DB===>>
        let product = await productModel.findOne({ _id: pathParams, isDeleted: false })
        if (!product) {
            return res.status(404).send({ status: false, message: "No product found" })
        }


        return res.status(200).send({ status: true, message: "Product details", data: product })



    }
    catch (err) {
        return res.status(500).send({ status: false, message: err.message })
    }
}




//==========================================================Update API======================================================//
const updateProduct = async function (req, res) {
    try {
        let pathParams = req.params.productId
        let data = req.body
        let file = req.files
        console.log(file)


        //===========validations===========//
        if (!ObjectId.isValid(pathParams)) {
            return res.status(400).send({ status: false, message: "product id is not valid" })
        }


        //Find Protuct from DB
        let product = await productModel.findOne({ _id: pathParams, isDeleted: false })
        if (!product) {
            return res.status(404).send({ status: false, message: "No product found" })
        }


        if (!isValidRequestBody(data) && (file == undefined || file.length == 0)) {
            return res.status(400).send({ status: false, message: "plz enter valid data for updation" })

        }

        //Destructuring====>

        let { title, description, price, isFreeShipping, style, availableSizes, installments, currencyId, currencyFormat } = data



        //Title Validation
        if (isValidIncludes("title", data)) {
            if (!isValid(title)) {
                return res.status(400).send({ status: false, message: "Title is required" })
            }


            //searching title in DB to maintain their uniqueness.
            let titleAleadyUsed = await productModel.findOne({ title })
            if (titleAleadyUsed) {
                return res.status(400).send({ status: false, message: `${title} is alraedy in use. Please use another title.` })
            }

        }
        if (isValidIncludes("description", data)) {
            if (!isValid(description)) {
                return res.status(400).send({ status: false, message: "Description is required" })
            }

        }

        if (isValidIncludes("price", data)) {
            if (!isValid(price)) {
                return res.status(400).send({ status: false, message: "Price is required" })
            }

            //searching Price must Positive Number
            if (isNaN(price) || price < 0) {
                return res.status(400).send({ status: false, message: "Price can only be positive number" })
            }
        }


        if (isValidIncludes("installments", data)) {
            if (!isValid(installments)) {
                return res.status(400).send({ status: false, message: "installments required" })
            }


            if (!validInstallment(installments)) {
                return res.status(400).send({ status: false, message: "installments must be number " })
            }

        }
        if (isValidIncludes("style", data)) {
            if (!validString(style)) {
                return res.status(400).send({ status: false, message: "style is required" })
            }
        }

        if (isValidIncludes("isFreeShipping", data)) {

            console.log(data)
            if (!["true", "false"].includes(isFreeShipping)) {
                return res.status(400).send({ status: false, message: "isFreeShipping must be a boolean value" })
            }
        }

        if (file && file.length > 0) {
            let uploadedFileURL = await uploadFile(file[0])
            data["productImage"] = uploadedFileURL
        }

        if (isValidIncludes("availableSizes", data)) {
            let sizesArray = availableSizes.split(",").map(x => x.trim())


            for (let i = 0; i < sizesArray.length; i++) {
                if (!(["S", "XS", "M", "X", "L", "XXL", "XL"].includes(sizesArray[i]))) {
                    console.log(sizesArray[i])
                    return res.status(400).send({ status: false, message: "AvailableSizes should be among ['S','XS','M','X','L','XXL','XL']" })
                }
            }
        }
        if (isValidIncludes("currencyId", data)) {
            if (!isValid(currencyId)) {
                return res.status(400).send({ status: false, message: "CurrencyId required" })
            }
            if (currencyId != "INR") {
                return res.status(400).send({ status: false, message: "currencyId should be INR" })
            }


        }
        if (isValidIncludes("currencyFormat", data)) {
            if (!isValid(currencyFormat)) {
                return res.status(400).send({ status: false, message: "currencyFormat required" })
            }
            if (currencyFormat != "₹") {
                return res.status(400).send({ status: false, message: "currencyFormat should be ₹" })
            }


        }


        //Updating data in DB
        let updateProduct = await productModel.findByIdAndUpdate({ _id: pathParams }, data, { new: true })

        return res.status(200).send({ status: true, message: "success", data: updateProduct })



    } catch (error) {
        return res.status(500).send({ status: false, message: error.message })
    }
}






//===================================================Delete API===========================================================//

const deleteById = async function (req, res) {
    try {

        let pathParams = req.params.productId


        //=================validations======================//
        if (!ObjectId.isValid(pathParams)) {
            return res.status(400).send({ status: false, message: "Please enter valid productId" })
        }


        //searching Product in DB
        let product = await productModel.findOne({ _id: pathParams, isDeleted: false })
        if (!product) {
            return res.status(404).send({ status: false, message: "No product found" })
        }



        //Delete data From DB
        let deleteProduct = await productModel.findByIdAndUpdate(pathParams, { $set: { isDeleted: true, deletedAt: Date.now() } }, { new: true })
        return res.status(200).send({ status: true, message: "Product deleted successfully" })



    }
    catch (err) {
        return res.status(500).send({ status: false, message: err.message })
    }

}
module.exports = { createProduct, getProducts, getProductById, updateProduct, deleteById }

