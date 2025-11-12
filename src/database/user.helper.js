/* eslint-disable */
const { getCollection } = require('./mongodb');
const bcrypt = require('bcryptjs');
const { log, colors } = require('../module/helper/text.format');

/**
 * Hash password
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password
 */
async function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Create user
 */
async function createUser(userData) {
  try {
    const collection = getCollection('users');
    
    // Check if username exists
    const existingUser = await collection.findOne({ 
      username: userData.username 
    });
    
    if (existingUser) {
      throw new Error('Username already exists');
    }
    
    // Check if email exists
    const existingEmail = await collection.findOne({ 
      email: userData.email 
    });
    
    if (existingEmail) {
      throw new Error('Email already exists');
    }
    
    // Hash password
    const hashedPassword = await hashPassword(userData.password);
    
    // Create user document
    const user = {
      username: userData.username,
      email: userData.email,
      fullname: userData.fullname || '',
      password: hashedPassword,
      role: userData.role || 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await collection.insertOne(user);
    
    log(colors.green, `✅ User created: ${userData.username}`, colors.reset, '');
    
    return {
      _id: result.insertedId,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
  } catch (error) {
    log(colors.red, `❌ Create user error:`, error.message);
    throw error;
  }
}

/**
 * Find user by username
 */
async function findUserByUsername(username) {
  try {
    const collection = getCollection('users');
    return await collection.findOne({ username });
  } catch (error) {
    log(colors.red, `❌ Find user error:`, error.message);
    throw error;
  }
}

/**
 * Find user by email
 */
async function findUserByEmail(email) {
  try {
    const collection = getCollection('users');
    return await collection.findOne({ email });
  } catch (error) {
    log(colors.red, `❌ Find user error:`, error.message);
    throw error;
  }
}

/**
 * Find user by ID
 */
async function findUserById(userId) {
  try {
    const collection = getCollection('users');
    const { ObjectId } = require('mongodb');
    return await collection.findOne({ _id: new ObjectId(userId) });
  } catch (error) {
    log(colors.red, `❌ Find user error:`, error.message);
    throw error;
  }
}

/**
 * Update user refresh token
 */
async function updateRefreshToken(userId, refreshToken) {
  try {
    const collection = getCollection('users');
    const { ObjectId } = require('mongodb');
    
    await collection.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          refreshToken,
          updatedAt: new Date()
        } 
      }
    );
    
  } catch (error) {
    log(colors.red, `❌ Update refresh token error:`, error.message);
    throw error;
  }
}

/**
 * Update last login
 */
async function updateLastLogin(userId) {
  try {
    const collection = getCollection('users');
    const { ObjectId } = require('mongodb');
    
    await collection.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          lastLogin: new Date(),
          updatedAt: new Date()
        } 
      }
    );
    
  } catch (error) {
    log(colors.red, `❌ Update last login error:`, error.message);
    throw error;
  }
}

/**
 * Validate user credentials
 */
async function validateUser(username, password) {
  try {
    const user = await findUserByUsername(username);
    if (!user) {
      return null;
    }
    
    if (!user.isActive) {
      throw new Error('Account is inactive');
    }
    
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return null;
    }
    
    // Remove password from response
    const { password: _, ...result } = user;
    return result;
    
  } catch (error) {
    log(colors.red, `❌ Validate user error:`, error.message);
    throw error;
  }
}

module.exports = {
  hashPassword,
  comparePassword,
  createUser,
  findUserByUsername,
  findUserByEmail,
  findUserById,
  updateRefreshToken,
  updateLastLogin,
  validateUser
};