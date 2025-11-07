/* eslint-disable */
function MESS_SERVER(type, result, data) {
    const messages = {
        type : type,
        success: result,
        data : data
    };
    return JSON.stringify(messages) || "Unknown status.";
}

module.exports = { MESS_SERVER };