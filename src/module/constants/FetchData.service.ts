/* eslint-disable */
import axios from 'axios';
export const FETCH_TIMEOUT = 5000; // in milliseconds

export const GET = async (url: string, retries = 3): Promise<any> => {
  try {
    const response = await axios.get(url, { timeout: FETCH_TIMEOUT });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch failed, retrying... (${retries} retries left)`);
      return GET(url, retries - 1);
    }
    console.error(`Fetch failed after ${retries} retries:`, error);
    throw error;
  }
};

export const POST = async (url: string, data: any, retries = 3): Promise<any> => {
  try {
    const response = await axios.post(url, data, { timeout: FETCH_TIMEOUT });
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch failed, retrying... (${retries} retries left)`);
      return POST(url, data, retries - 1);
    }
    console.error(`Fetch failed after ${retries} retries:`, error);
    throw error;
  }
};
