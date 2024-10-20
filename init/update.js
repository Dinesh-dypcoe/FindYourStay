const mongoose = require('mongoose');
const Listing = require('../models/listing'); // Assuming your listing model is in the models folder

async function updateOwner() {
    try {
        // Ensure you have your MongoDB connection established
        await mongoose.connect('mongodb+srv://dineshaher2505:Dinesh%402505@cluster0.9zukf.mongodb.net/findyourstay?retryWrites=true&w=majority&appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        const result = await Listing.updateMany(
            { owner: null },  // Match listings where owner is null
            { $set: { owner: new mongoose.Types.ObjectId('670d5ca585a86af7f4d519fc') } }  // Set owner to the new ObjectId
        );

        console.log(`${result.modifiedCount} listings updated successfully.`);
    } catch (error) {
        console.error("Error updating listings:", error);
    } finally {
        mongoose.connection.close();  // Close the connection
    }
}

updateOwner();
