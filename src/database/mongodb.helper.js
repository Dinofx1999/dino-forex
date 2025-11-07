/* eslint-disable */
const { getCollection } = require('./mongodb');
const { log, colors } = require('../module/helper/text.format');

/**
 * Insert một document
 */
async function insertOne(collectionName, document) {
  try {
    const collection = getCollection(collectionName);
    const result = await collection.insertOne(document);
    return result;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} Insert error:`, error.message);
    throw error;
  }
}

/**
 * Insert nhiều documents
 */
async function insertMany(collectionName, documents) {
  try {
    const collection = getCollection(collectionName);
    const result = await collection.insertMany(documents, { ordered: false });
    return result;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} InsertMany error:`, error.message);
    throw error;
  }
}

/**
 * Tìm một document
 */
async function findOne(collectionName, query) {
  try {
    const collection = getCollection(collectionName);
    const result = await collection.findOne(query);
    return result;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} FindOne error:`, error.message);
    throw error;
  }
}

/**
 * Tìm nhiều documents
 */
async function find(collectionName, query = {}, options = {}) {
  try {
    const collection = getCollection(collectionName);
    const cursor = collection.find(query, options);
    const results = await cursor.toArray();
    return results;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} Find error:`, error.message);
    throw error;
  }
}

/**
 * Update một document
 */
async function updateOne(collectionName, filter, update, options = {}) {
  try {
    const collection = getCollection(collectionName);
    const result = await collection.updateOne(filter, update, options);
    return result;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} UpdateOne error:`, error.message);
    throw error;
  }
}

/**
 * Delete một document
 */
async function deleteOne(collectionName, filter) {
  try {
    const collection = getCollection(collectionName);
    const result = await collection.deleteOne(filter);
    return result;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} DeleteOne error:`, error.message);
    throw error;
  }
}

/**
 * Count documents
 */
async function count(collectionName, filter = {}) {
  try {
    const collection = getCollection(collectionName);
    const result = await collection.countDocuments(filter);
    return result;
  } catch (error) {
    log(colors.red, `${process.env.ICON_ERROR_LOG} Count error:`, error.message);
    throw error;
  }
}

module.exports = {
  insertOne,
  insertMany,
  findOne,
  find,
  updateOne,
  deleteOne,
  count,
};