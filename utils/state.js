const states = {};

function getUserState(phone) {
    if (!states[phone]) states[phone] = {};
    return states[phone];
}

function updateUserState(phone, newState) {
    if (!states[phone]) states[phone] = {};
    Object.assign(states[phone], newState);
}

function resetUserState(phone) {
    states[phone] = {};
}

module.exports = { getUserState, updateUserState, resetUserState };