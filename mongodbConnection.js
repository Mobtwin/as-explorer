import mongoose from "mongoose";
import dotenv from "dotenv";
import logger from "./logger.js";

dotenv.config();

const uri = process.env.MONGODB_URI;
// establish connection with the db
export const connectToMongoDb = async (ready) => {
  mongoose
    .connect(uri)
    .then(async () => {
      logger.info("🎉 connection established successfully with mongo db");
      ready?ready():null
    })
    .catch((error) => logger.error(error));
};
